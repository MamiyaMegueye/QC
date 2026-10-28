"""
SISTA QC — Backend FastAPI

Endpoints :
  GET  /                                                  -> healthcheck
  GET  /api/health                                        -> statut + config
  POST /api/test-key                                      -> tester une cle API
  POST /api/preview-columns                               -> colonnes + auto-mapping + profil complet
  POST /api/analyze                                       -> upload + analyse QC basique (avec overrides)
  POST /api/generate-rules                                -> generer regles IA + executer
  GET  /api/session/{id}/enqueteur-summary                -> bilan enqueteurs
  GET  /api/session/{id}/export-excel                     -> export Excel
  POST /api/session/{id}/recompute-basic                  -> recalcul QC basique
  POST /api/session/{id}/generate-report-preview          -> apercu du rapport analytique (JSON)
  POST /api/session/{id}/download-report                  -> telecharge le .docx
  DELETE /api/session/{id}                                -> libere session

v1.4.0 (recommandations SISTA) :
  - column_mapping inclut maintenant explicitement l'identifiant unique
  - apply_id_declaration() est appele pour forcer le type "identifiant"
    sur la colonne declaree et retyper les autres
"""
from __future__ import annotations

import io
import os
import json
import uuid
import time
import hmac
import base64
import hashlib
import tempfile
import pickle
import gzip
from typing import Optional

import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from core.loader import load_file
from core.profiler import profile_dataset, apply_overrides, apply_id_declaration
from core.qc_basic import (
    run_basic_qc,
    build_enqueteur_summary,
    global_stats,
    auto_map,
    compute_duration_stats,
)
from core import ai_agent
from core import analytical_report
from core import qc_report
from core import backcheck
from core import spotcheck, spotcheck_report

APP_VERSION = "1.9.0"

# La documentation interactive (/docs, /openapi.json) n'est plus publique
app = FastAPI(
    title="SISTA QC API",
    description="API REST pour le moteur de Controle Qualite SISTA",
    version=APP_VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# ----------------------------------------------------------------------
#  Authentification (jeton signe HMAC)
#  A definir dans les variables d'environnement Render :
#     APP_USERNAME, APP_PASSWORD  (et idealement APP_SECRET)
#  Si elles ne sont pas definies, les anciens identifiants par defaut
#  restent valables (a changer impérativement en production).
# ----------------------------------------------------------------------
APP_USERNAME = os.environ.get("APP_USERNAME", "")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
TOKEN_TTL_SECONDS = 12 * 3600
PUBLIC_PATHS = {"/", "/api/login"}
_LOGIN_FAILURES: dict = {}   # ip -> [timestamps]

if not APP_USERNAME or not APP_PASSWORD:
    print("[SECURITE] APP_USERNAME ou APP_PASSWORD non defini. "
                    "Definissez APP_USERNAME / APP_PASSWORD (et APP_SECRET) dans les variables d'environnement.")


def _auth_secret() -> bytes:
    explicit = os.environ.get("APP_SECRET", "")
    if explicit:
        return explicit.encode()
    return hashlib.sha256(
        f"{APP_USERNAME}:{APP_PASSWORD}:sista-qc".encode()
    ).hexdigest().encode()


def _make_token(username: str) -> str:
    exp = int(time.time()) + TOKEN_TTL_SECONDS
    payload = f"{username}|{exp}"
    sig = hmac.new(_auth_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|{sig}".encode()).decode()


def _check_token(token: str) -> bool:
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        username, exp, sig = raw.rsplit("|", 2)
        expected = hmac.new(_auth_secret(), f"{username}|{exp}".encode(),
                            hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected) and int(exp) > time.time()
    except Exception:
        return False


@app.middleware("http")
async def require_auth(request: Request, call_next):
    # Doit etre declare AVANT le middleware CORS pour que les reponses 401
    # portent aussi les en-tetes CORS (le navigateur affiche alors le vrai statut).
    if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    auth = request.headers.get("authorization", "")
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not token:
        token = request.query_params.get("token", "")   # liens de telechargement
    if not token or not _check_token(token):
        return JSONResponse({"detail": "Non authentifie"}, status_code=401)
    return await call_next(request)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]
extra_origins = os.environ.get("ALLOWED_ORIGINS", "")
if extra_origins:
    ALLOWED_ORIGINS.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# ----------------------------------------------------------------------
#  Sessions en memoire
#
#  Une session conserve le DataFrame complet, le profil, les resultats QC,
#  les resultats IA et le contenu du rapport (graphiques en base64). Sur une
#  instance de 512 Mo, laisser ces objets s'accumuler finit par faire tuer le
#  service pour depassement memoire. On purge donc :
#    - les sessions inactives depuis plus de SESSION_TTL_SECONDS
#    - les plus anciennes des que le nombre depasse MAX_SESSIONS
#  Chaque acces a une session rafraichit son horodatage.
# ----------------------------------------------------------------------
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", 2 * 3600))
MAX_SESSIONS = int(os.environ.get("MAX_SESSIONS", 10))

SESSIONS: dict = {}

# Repertoire /tmp pour persister les sessions entre invocations serverless
SESSION_DIR = os.path.join(tempfile.gettempdir(), "sista_sessions")
os.makedirs(SESSION_DIR, exist_ok=True)


def _purge_sessions():
    """Supprime les sessions expirees, puis plafonne leur nombre."""
    now = time.time()
    expirees = [sid for sid, s in SESSIONS.items()
                if now - s.get("_last_seen", now) > SESSION_TTL_SECONDS]
    for sid in expirees:
        SESSIONS.pop(sid, None)
        try:
            os.remove(os.path.join(SESSION_DIR, f"{sid}.pkl.gz"))
        except OSError:
            pass

    surplus = len(SESSIONS) - MAX_SESSIONS
    evincees = []
    if surplus > 0:
        anciennes = sorted(SESSIONS.items(),
                           key=lambda kv: kv[1].get("_last_seen", 0))[:surplus]
        for sid, _ in anciennes:
            SESSIONS.pop(sid, None)
            evincees.append(sid)
            try:
                os.remove(os.path.join(SESSION_DIR, f"{sid}.pkl.gz"))
            except OSError:
                pass

    if expirees or evincees:
        print(f"[sessions] purge : {len(expirees)} expiree(s), "
              f"{len(evincees)} evincee(s), {len(SESSIONS)} active(s)")


def _save_session(session_id: str, data: dict):
    data["_last_seen"] = time.time()
    SESSIONS[session_id] = data
    # Persister dans /tmp pour reutilisation entre invocations warm
    try:
        path = os.path.join(SESSION_DIR, f"{session_id}.pkl.gz")
        with gzip.open(path, "wb") as f:
            pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
    except Exception as e:
        print(f"[sessions] erreur sauvegarde /tmp : {e}")
    _purge_sessions()


def _get_session(session_id: str) -> dict:
    # 1. Memoire (meme instance)
    s = SESSIONS.get(session_id)
    if s:
        s["_last_seen"] = time.time()
        return s
    # 2. /tmp (instance warm reutilisee)
    try:
        path = os.path.join(SESSION_DIR, f"{session_id}.pkl.gz")
        if os.path.exists(path):
            with gzip.open(path, "rb") as f:
                s = pickle.load(f)
            s["_last_seen"] = time.time()
            SESSIONS[session_id] = s
            return s
    except Exception as e:
        print(f"[sessions] erreur lecture /tmp : {e}")
    raise HTTPException(404, "Session introuvable ou expiree. Veuillez recharger votre fichier.")


class LoginRequest(BaseModel):
    username: str
    password: str


class TestKeyRequest(BaseModel):
    api: str
    api_key: str


class GenerateRulesRequest(BaseModel):
    session_id: str
    api: str
    api_key: str
    survey_type: str = ""
    survey_description: str = ""
    survey_population: str = ""
    survey_eligibility: str = ""
    form_content: str = ""


class GenerateReportPreviewRequest(BaseModel):
    api: str
    api_key: str = ""
    survey_type: str = ""
    survey_description: str = ""
    survey_population: str = ""
    survey_eligibility: str = ""


class DownloadReportRequest(BaseModel):
    report_content: Optional[dict] = None


class ValidationItem(BaseModel):
    """Decision de validation pour une regle QC (basique ou IA)."""
    status: str   # 'confirmed' | 'false_positive' | 'corrected' | 'pending'
    comment: str = ""


class SaveValidationsRequest(BaseModel):
    """Sauvegarde en masse des decisions de validation."""
    validations: dict   # { 'basic:doublons_lignes': {status, comment}, 'ai:0': {...} }
    metadata: Optional[dict] = None   # { responsable_qc, fonction, date_validation, ... }


class GenerateQcReportRequest(BaseModel):
    """Genere le rapport de controle qualite formel."""
    metadata: dict = {}   # { responsable_qc, fonction, date_validation, organisation,
                          #   observations_generales }


_TEMP_FILES: list = []   # [(chemin, horodatage)]


def _purge_old_temp_files(max_age_seconds: int = 900):
    """Supprime les fichiers temporaires d'upload de plus de 15 minutes."""
    now = time.time()
    keep = []
    for path, ts in _TEMP_FILES:
        if now - ts > max_age_seconds:
            try:
                os.remove(path)
            except OSError:
                pass
        else:
            keep.append((path, ts))
    _TEMP_FILES[:] = keep


def _save_upload(file: UploadFile) -> str:
    _purge_old_temp_files()
    suffix = os.path.splitext(file.filename or "")[1]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    content = file.file.read()
    tmp.write(content)
    tmp.close()
    file.file.seek(0)
    _TEMP_FILES.append((tmp.name, time.time()))
    return tmp.name


def _clean_error_msg(e: Exception) -> str:
    msg = str(e)
    for term in ["Anthropic", "anthropic", "Claude", "claude",
                 "Groq", "groq", "sk-ant", "gsk_"]:
        msg = msg.replace(term, "API")
    return msg[:300]


def _resolve_api_key(api: str, key_from_request: str) -> str:
    if key_from_request:
        return key_from_request
    if api == "api1":
        return os.environ.get("ANTHROPIC_API_KEY", "")
    elif api == "api2":
        return os.environ.get("GROQ_API_KEY", "")
    return ""


@app.get("/")
def root():
    return {"name": "SISTA QC API", "status": "online", "version": APP_VERSION}


@app.post("/api/login")
def login(req: LoginRequest, request: Request):
    ip = request.client.host if request.client else "?"
    now = time.time()
    recent = [t for t in _LOGIN_FAILURES.get(ip, []) if now - t < 300]
    if len(recent) >= 10:
        raise HTTPException(429, "Trop de tentatives. Reessayez dans quelques minutes.")
    # L'identifiant est insensible a la casse (sista26 == Sista26) ;
    # le mot de passe reste, lui, sensible a la casse.
    ok_user = hmac.compare_digest(req.username.strip().lower().encode(),
                                  APP_USERNAME.strip().lower().encode())
    ok_pwd = hmac.compare_digest(req.password.encode(), APP_PASSWORD.encode())
    if not (ok_user and ok_pwd):
        recent.append(now)
        _LOGIN_FAILURES[ip] = recent
        raise HTTPException(401, "Nom d'utilisateur ou mot de passe incorrect")
    _LOGIN_FAILURES.pop(ip, None)
    return {"ok": True, "token": _make_token(APP_USERNAME),
            "expires_in": TOKEN_TTL_SECONDS}


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "api1_configured": bool(os.environ.get("ANTHROPIC_API_KEY", "")),
        "api2_configured": bool(os.environ.get("GROQ_API_KEY", "")),
        "active_sessions": len(SESSIONS),
        "max_sessions": MAX_SESSIONS,
        "session_ttl_minutes": SESSION_TTL_SECONDS // 60,
    }


@app.post("/api/test-key")
def test_key(req: TestKeyRequest):
    try:
        key_to_test = _resolve_api_key(req.api, req.api_key)
        if not key_to_test:
            return {"ok": False,
                    "message": "Aucune cle disponible (ni dans le champ ni dans .env)"}
        ok, msg = ai_agent.test_api_key(req.api, key_to_test)
        if not req.api_key:
            msg += " — cle du serveur utilisee (aucune cle saisie)"
        return {"ok": ok, "message": msg}
    except Exception as e:
        return {"ok": False, "message": _clean_error_msg(e)}


@app.post("/api/preview-columns")
async def preview_columns(
    data_file: UploadFile = File(...),
    dict_file: Optional[UploadFile] = File(None),
):
    """
    Lecture rapide du fichier pour la revue dans Step1.
    Renvoie :
      - columns        : liste des colonnes (dans l'ordre du fichier)
      - auto_mapping   : { enqueteur, id, start, end, lat, lon }
      - profile        : profil complet (variables auto-detectees) pour la revue
    N'effectue PAS le QC complet.
    """
    try:
        data_path = _save_upload(data_file)
        dict_path = _save_upload(dict_file) if dict_file else None
        loaded = load_file(data_path, dict_path)
        profile = profile_dataset(loaded)
        cols = [str(c) for c in loaded.df.columns]
        mp = auto_map(loaded.df.columns)
        mp_clean = {k: (v if v else "") for k, v in mp.items()}
        return {
            "columns": cols,
            "auto_mapping": mp_clean,
            "n_columns": len(cols),
            "n_rows": int(loaded.df.shape[0]),
            "profile": profile,
        }
    except Exception as e:
        raise HTTPException(500, f"Erreur de lecture du fichier : {e}")


@app.post("/api/analyze")
async def analyze(
    data_file: UploadFile = File(...),
    dict_file: Optional[UploadFile] = File(None),
    form_file: Optional[UploadFile] = File(None),
    duree_min: int = Form(18),
    iqr_k: float = Form(1.5),
    missing_seuil: int = Form(50),
    column_mapping: str = Form(""),
    variable_overrides: str = Form(""),
):
    try:
        data_path = _save_upload(data_file)
        dict_path = _save_upload(dict_file) if dict_file else None

        form_content = ""
        if form_file is not None:
            try:
                form_path = _save_upload(form_file)
                fname_lower = form_file.filename.lower()
                if fname_lower.endswith((".xlsx", ".xls")):
                    try:
                        df_form = pd.read_excel(form_path, sheet_name="survey")
                    except Exception:
                        df_form = pd.read_excel(form_path)
                    keep_cols = [c for c in df_form.columns
                                 if any(k in str(c).lower() for k in
                                        ["type", "name", "label", "constraint",
                                         "relevant", "calculation", "required"])]
                    if keep_cols:
                        form_content = df_form[keep_cols].head(150).to_string(
                            max_colwidth=80, index=False)[:4000]
                elif fname_lower.endswith(".txt"):
                    with open(form_path, "r", encoding="utf-8", errors="ignore") as f:
                        form_content = f.read()[:4000]
            except Exception as fe:
                form_content = f"(Formulaire non lisible : {fe})"

        loaded = load_file(data_path, dict_path)
        profile = profile_dataset(loaded)

        # ───────────────────────────────────────────────────────────────
        # Appliquer les overrides utilisateur sur le profil
        # ───────────────────────────────────────────────────────────────
        if variable_overrides:
            try:
                ov = json.loads(variable_overrides)
                if isinstance(ov, dict) and ov:
                    profile = apply_overrides(profile, ov)
            except Exception as e:
                print(f"[analyze] variable_overrides invalides, ignores : {e}")

        params = {"duree_min": duree_min, "iqr_k": iqr_k, "missing_seuil": missing_seuil}

        # ───────────────────────────────────────────────────────────────
        # Fusion mapping utilisateur + auto-detection
        # ───────────────────────────────────────────────────────────────
        user_mp = {}
        if column_mapping:
            try:
                parsed = json.loads(column_mapping)
                # Un champ (typiquement 'id') peut etre une chaine OU une liste
                # (identifiant composite : recommandation SISTA v2).
                # On garde le format tel quel si liste non vide, sinon on nettoie.
                user_mp = {}
                for k, v in parsed.items():
                    if isinstance(v, (list, tuple)):
                        cleaned = [str(x).strip() for x in v if x and str(x).strip()]
                        if len(cleaned) == 1:
                            user_mp[k] = cleaned[0]  # 1 seul element -> string
                        elif len(cleaned) > 1:
                            user_mp[k] = cleaned      # >=2 -> liste (composite)
                    elif v and str(v).strip():
                        user_mp[k] = str(v).strip()
            except Exception:
                user_mp = {}
        auto_mp = auto_map(loaded.df.columns)
        final_mp = {**auto_mp, **user_mp}

        # ───────────────────────────────────────────────────────────────
        # Recommandation SISTA : si l'utilisateur a declare l'ID,
        # on force ce type et on retype les autres "identifiants" auto.
        # (declared_id peut etre str OU list pour l'ID composite)
        # ───────────────────────────────────────────────────────────────
        declared_id = user_mp.get("id", "")
        if declared_id:
            profile = apply_id_declaration(profile, declared_id)

        results, mp = run_basic_qc(loaded, profile, mp=final_mp, params=params)
        stats = global_stats(profile, results)

        # Detection auto Spotcheck (silencieuse)
        spotcheck_info = spotcheck.analyze_spotcheck(loaded.df)

        session_id = str(uuid.uuid4())
        _save_session(session_id, {
            "loaded": loaded,
            "df": loaded.df,
            "profile": profile,
            "results": results,
            "mp": mp,
            "params": params,
            "form_content": form_content,
            "filename": data_file.filename,
            "declared_id_col": declared_id,
            "ai_results": None,
            "ai_rules": None,
            "ai_comment": None,
            "ai_metrics": None,
            "report_content": None,
            "spotcheck_info": spotcheck_info,
            # Point 5 SISTA : workflow de validation + rapport QC
            "validations": {},      # { 'basic:doublons_lignes': {status, comment}, ... }
            "qc_metadata": {},      # { responsable_qc, fonction, date_validation, ... }
        })

        preview = loaded.df.head(20).fillna("").astype(str).to_dict(orient="records")

        return {
            "session_id": session_id,
            "filename": data_file.filename,
            "profile": {
                "summary": profile["summary"],
                "variables": profile["variables"],
            },
            "qc_basic": {
                "results": [
                    {
                        "id": r.get("id", r.get("titre", "")),
                        "titre": r["titre"],
                        "severite": r["severite"],
                        "n_cas": r["n_cas"],
                        "explication": r["explication"],
                        "lignes": [
                            {k: (v if not isinstance(v, (pd.Timestamp,))
                                 else str(v)) for k, v in row.items()}
                            for row in r["lignes"][:200]
                        ],
                    }
                    for r in results
                ],
                "stats": stats,
            },
            "mp": mp,
            "preview": preview,
            "spotcheck_info": spotcheck_info,
        }
    except Exception as e:
        raise HTTPException(500, f"Erreur d'analyse : {e}")


@app.post("/api/generate-rules")
def generate_rules(req: GenerateRulesRequest):
    sess = _get_session(req.session_id)
    progress_log = []

    def progress_cb(msg):
        progress_log.append(msg)

    key_to_use = _resolve_api_key(req.api, req.api_key)
    if not key_to_use:
        raise HTTPException(400, "Aucune cle API disponible (ni dans l'interface ni dans .env)")

    # Memorise le contexte d'enquete pour le rapport QC (type d'enquete)
    sess["survey_context"] = {
        "type": req.survey_type,
        "description": req.survey_description,
        "population": req.survey_population,
        "eligibility": req.survey_eligibility,
    }

    try:
        rules, comment, metrics = ai_agent.generate_rules(
            req.api, key_to_use, sess["profile"],
            sess["loaded"].var_labels, sess["loaded"].value_labels,
            survey_type=req.survey_type,
            survey_description=req.survey_description,
            survey_population=req.survey_population,
            survey_eligibility=req.survey_eligibility,
            form_content=req.form_content or sess["form_content"],
            df=sess["loaded"].df,
            progress_callback=progress_cb,
            mp=sess["mp"],
        )
        ai_res = ai_agent.run_rules(sess["loaded"].df, rules, sess["mp"])

        sess["ai_rules"] = rules
        sess["ai_results"] = ai_res
        sess["ai_comment"] = comment
        sess["ai_metrics"] = metrics

        return {
            "ok": True,
            "rules": rules,
            "result": {
                "titre": ai_res["titre"],
                "severite": ai_res["severite"],
                "n_cas": ai_res["n_cas"],
                "cas_par_regle": ai_res["cas_par_regle"],
                "lignes": [
                    {k: (str(v) if isinstance(v, (pd.Timestamp,)) else v)
                     for k, v in row.items() if k != "_valeurs_dict" or True}
                    for row in ai_res["lignes"]
                ],
                "explication": ai_res["explication"],
            },
            "comment": comment,
            "metrics": metrics,
            "progress": progress_log,
        }
    except Exception as e:
        raise HTTPException(500, f"Erreur du moteur IA : {_clean_error_msg(e)}")


@app.get("/api/session/{session_id}/enqueteur-summary")
def enqueteur_summary(session_id: str):
    sess = _get_session(session_id)
    all_results = list(sess["results"])
    if sess.get("ai_results"):
        all_results.append(sess["ai_results"])
    summary = build_enqueteur_summary(all_results, sess["mp"])

    n_high = sum(1 for e in summary if e["niveau"] == "high")
    n_med = sum(1 for e in summary if e["niveau"] == "med")
    n_low = sum(1 for e in summary if e["niveau"] == "low")

    return {
        "summary": summary,
        "counts": {"total": len(summary), "high": n_high, "med": n_med, "low": n_low},
    }


@app.get("/api/session/{session_id}/export-excel")
def export_excel(session_id: str):
    sess = _get_session(session_id)
    ai_res = sess.get("ai_results")
    rules = sess.get("ai_rules") or []

    if not ai_res or not ai_res.get("lignes"):
        raise HTTPException(404, "Aucun resultat IA a exporter")

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        cas_list = ai_res["lignes"]
        df_cas = pd.DataFrame([{
            "Cas N": i + 1,
            "Ligne": c["_index"],
            "Gravite": {"high": "Haute", "med": "Moyenne",
                        "low": "Faible"}.get(c["_severite"], ""),
            "Enqueteur": c["Enqueteur"],
            "Regle": c["Regle"],
            "Colonnes concernees": c["Colonnes_concernees"],
            "Valeurs en cause": c["Valeurs"],
            "Pourquoi": c.get("_pourquoi", ""),
            "Cause probable": c.get("_cause", ""),
            "Action recommandee": c.get("_action", ""),
        } for i, c in enumerate(cas_list)])
        df_cas.to_excel(writer, sheet_name="Cas detectes", index=False)

        df_enq = pd.DataFrame(cas_list)
        if "Enqueteur" in df_enq.columns:
            synth = df_enq.groupby("Enqueteur").agg(
                Nb_anomalies=("_index", "count"),
                Regles_distinctes=("Regle", "nunique"),
            ).reset_index().sort_values("Nb_anomalies", ascending=False)
            synth.to_excel(writer, sheet_name="Synthese enqueteurs", index=False)

        if rules:
            df_rules = pd.DataFrame([{
                "N": i + 1,
                "Description": r.get("description", ""),
                "Expression": r.get("expression", ""),
                "Pourquoi": r.get("pourquoi", ""),
                "Cause": r.get("cause", ""),
                "Action": r.get("action", ""),
            } for i, r in enumerate(rules)])
            df_rules.to_excel(writer, sheet_name="Regles IA", index=False)

    output.seek(0)
    filename = sess["filename"].rsplit(".", 1)[0] + "_sista_qc.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.post("/api/session/{session_id}/recompute-basic")
def recompute_basic(session_id: str, duree_min: int = Form(18),
                    iqr_k: float = Form(1.5),
                    missing_seuil: int = Form(50)):
    sess = _get_session(session_id)
    params = {"duree_min": duree_min, "iqr_k": iqr_k, "missing_seuil": missing_seuil}
    existing_mp = sess.get("mp")
    results, mp = run_basic_qc(sess["loaded"], sess["profile"],
                                mp=existing_mp, params=params)
    sess["results"] = results
    sess["mp"] = mp
    sess["params"] = params
    stats = global_stats(sess["profile"], results)
    return {"ok": True, "results": results, "stats": stats, "mp": mp}


@app.post("/api/preview-columns-only")
async def preview_columns_only(data_file: UploadFile = File(...)):
    """Retourne juste la liste des colonnes d'un fichier (leger).

    Utile pour le back check : l'utilisateur charge un fichier
    et on affiche les colonnes disponibles pour choisir le code participant.
    """
    try:
        data_path = _save_upload(data_file)
        loaded = load_file(data_path, None)
        cols = [str(c) for c in loaded.df.columns]
        return {
            "ok": True,
            "columns": cols,
            "n_columns": len(cols),
            "n_rows": int(loaded.df.shape[0]),
        }
    except Exception as e:
        raise HTTPException(500, f"Erreur de lecture : {_clean_error_msg(e)}")


@app.post("/api/backcheck/common-columns")
async def backcheck_common_columns(
    main_file: UploadFile = File(...),
    bc_file: UploadFile = File(...),
):
    """Retourne les colonnes communes aux 2 fichiers avec detection du type
    (numeric/categorical) et suggestion de tolerance par defaut.

    Etape prealable a la config des variables a comparer.
    """
    try:
        main_path = _save_upload(main_file)
        bc_path = _save_upload(bc_file)
        result = backcheck.find_common_columns(main_path, bc_path)
        return {"ok": True, **result}
    except Exception as e:
        raise HTTPException(500, f"Erreur de lecture : {_clean_error_msg(e)}")


@app.post("/api/backcheck/run")
async def backcheck_run_endpoint(
    main_file: UploadFile = File(...),
    bc_file: UploadFile = File(...),
    main_code_cols: str = Form(...),     # JSON: string ou liste
    bc_code_cols: str = Form(...),       # JSON: string ou liste
    variables_config: str = Form(...),   # JSON: [{name, type, tolerance, tolerance_type}, ...]
    main_enqueteur_col: str = Form(""),  # optionnel
    main_label: str = Form("Enquete principale"),
    bc_label: str = Form("Back check"),
    sample_size: int = Form(None),         # optionnel : taille echantillon aleatoire
):
    """Execute la comparaison back check (controle croise).

    Compare les reponses de l'enquete principale a celles d'un back check
    (re-interview courte par une equipe independante). Calcule les taux
    de concordance par enqueteur, par variable et global.

    Standard J-PAL / IPA / Banque Mondiale / DHS pour detecter la fraude
    et le baclage d'enquete.
    """
    try:
        main_path = _save_upload(main_file)
        bc_path = _save_upload(bc_file)

        # Parser les codes (peut etre str ou list)
        try:
            m_cols = json.loads(main_code_cols)
        except Exception:
            m_cols = main_code_cols
        try:
            b_cols = json.loads(bc_code_cols)
        except Exception:
            b_cols = bc_code_cols

        # Parser la config des variables
        try:
            vars_cfg = json.loads(variables_config)
            if not isinstance(vars_cfg, list) or len(vars_cfg) == 0:
                raise ValueError("Aucune variable a comparer.")
        except json.JSONDecodeError:
            raise ValueError("Configuration des variables invalide (JSON malforme).")

        result = backcheck.run_backcheck(
            main_path=main_path,
            bc_path=bc_path,
            main_code_cols=m_cols,
            bc_code_cols=b_cols,
            main_enqueteur_col=main_enqueteur_col.strip() or None,
            variables_config=vars_cfg,
            main_label=main_label,
            bc_label=bc_label,
            sample_size=sample_size,
        )
        result["main_filename"] = main_file.filename
        result["bc_filename"] = bc_file.filename
        return {"ok": True, **result}
    except ValueError as ve:
        raise HTTPException(400, str(ve))
    except Exception as e:
        raise HTTPException(500, f"Erreur back check : {_clean_error_msg(e)}")


@app.post("/api/compute-duration-stats")
async def compute_duration_stats_endpoint(
    data_file: UploadFile = File(...),
    start_col: str = Form(...),
    end_col: str = Form(...),
):
    """Calcule les stats de duree d'observation a partir d'un fichier + colonnes.

    Utilise dans Step1 pour permettre a l'utilisateur d'avoir un seuil suggere
    base sur sa propre distribution (recommandation SISTA v2).

    Retourne None (204) si aucune duree calculable.
    """
    try:
        data_path = _save_upload(data_file)
        loaded = load_file(data_path, None)
        mp = {"start": start_col, "end": end_col}
        stats = compute_duration_stats(loaded.df, mp)
        if not stats:
            return JSONResponse(
                {"ok": False, "message": "Impossible de calculer les durees "
                                          "(start/end absents ou dates invalides)"},
                status_code=200,
            )
        return {"ok": True, **stats}
    except Exception as e:
        raise HTTPException(500, f"Erreur : {_clean_error_msg(e)}")


@app.get("/api/session/{session_id}/analysis-scope")
def get_analysis_scope(session_id: str):
    """Retourne le perimetre d'analyse du rapport client (variables retenues
    vs exclues, avec raisons). Endpoint leger sans appel IA, sert a afficher
    le perimetre AVANT de lancer la generation du rapport analytique.
    """
    sess = _get_session(session_id)
    try:
        scope = analytical_report.compute_analysis_scope(
            sess["profile"], sess.get("mp")
        )
        return {"ok": True, **scope}
    except Exception as e:
        raise HTTPException(500, f"Erreur de calcul du perimetre : {_clean_error_msg(e)}")


@app.post("/api/session/{session_id}/generate-report-preview")
def generate_report_preview(session_id: str, req: GenerateReportPreviewRequest):
    sess = _get_session(session_id)

    key_to_use = _resolve_api_key(req.api, req.api_key)
    if not key_to_use:
        raise HTTPException(400, "Aucune cle API disponible (ni dans l'interface ni dans .env)")

    progress_log = []

    def progress_cb(msg):
        progress_log.append(msg)
        print(f"[REPORT] {msg}")

    try:
        survey_context = {
            "type": req.survey_type,
            "description": req.survey_description,
            "population": req.survey_population,
            "eligibility": req.survey_eligibility,
        }
        sess["survey_context"] = survey_context

        qc_stats = None
        try:
            qc_stats = global_stats(sess["profile"], sess["results"])
        except Exception:
            pass

        content = analytical_report.build_report_content(
            api=req.api,
            api_key=key_to_use,
            df=sess["loaded"].df,
            profile=sess["profile"],
            survey_context=survey_context,
            filename=sess["filename"],
            qc_results=sess.get("results", []),
            qc_stats=qc_stats,
            progress_cb=progress_cb,
            # Mapping des colonnes-cles : exclut les variables techniques
            # (identifiant, enqueteur, GPS, horodatages) du rapport client
            mp=sess.get("mp"),
        )

        sess["report_content"] = content

        return {
            "ok": True,
            "content": content,
            "progress": progress_log,
        }
    except Exception as e:
        raise HTTPException(500, f"Erreur de generation du rapport : {_clean_error_msg(e)}")


@app.post("/api/session/{session_id}/download-report")
def download_report(session_id: str, req: DownloadReportRequest):
    sess = _get_session(session_id)

    content = req.report_content or sess.get("report_content")
    if not content:
        raise HTTPException(404, "Aucun rapport en session. Generez d'abord l'apercu.")

    try:
        docx_bytes = analytical_report.compose_word_from_content(content)
        base = sess["filename"].rsplit(".", 1)[0]
        out_filename = f"{base}_rapport_analytique.docx"

        return StreamingResponse(
            io.BytesIO(docx_bytes),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{out_filename}"'}
        )
    except Exception as e:
        raise HTTPException(500, f"Erreur de composition du Word : {_clean_error_msg(e)}")


@app.get("/api/session/{session_id}/validations")
def get_validations(session_id: str):
    """Recupere les decisions de validation actuelles + metadonnees QC."""
    sess = _get_session(session_id)
    return {
        "validations": sess.get("validations", {}),
        "metadata":    sess.get("qc_metadata", {}),
    }


@app.post("/api/session/{session_id}/validations")
def save_validations(session_id: str, req: SaveValidationsRequest):
    """Sauvegarde les decisions de validation et les metadonnees du responsable QC.

    Cet endpoint est appele depuis le frontend a chaque modification ou en bloc
    lors du clic sur 'Enregistrer mes validations'.
    """
    sess = _get_session(session_id)

    # Validation legere du contenu
    valid_statuses = {"confirmed", "false_positive", "corrected", "pending"}
    cleaned = {}
    for item_id, val in (req.validations or {}).items():
        if not isinstance(val, dict):
            continue
        status = val.get("status", "pending")
        if status not in valid_statuses:
            status = "pending"
        cleaned[str(item_id)] = {
            "status":  status,
            "comment": str(val.get("comment", "") or "")[:1000],
        }

    sess["validations"] = cleaned
    if req.metadata is not None:
        # Fusion avec l'existant pour ne pas tout perdre si on envoie partiel
        existing = sess.get("qc_metadata", {})
        existing.update({k: v for k, v in req.metadata.items() if v is not None})
        sess["qc_metadata"] = existing

    return {
        "ok": True,
        "n_validations": len(cleaned),
        "metadata": sess.get("qc_metadata", {}),
    }


@app.post("/api/session/{session_id}/qc-report")
def generate_qc_report_endpoint(session_id: str, req: GenerateQcReportRequest):
    """Genere le rapport de Controle Qualite formel (.docx).

    Le rapport inclut :
      - synthese executive avec compteurs et taux de qualite
      - detail des regles QC basiques avec leur statut de validation
      - detail des regles QC IA avec leur statut de validation
      - bilan par enqueteur (filtre sur anomalies confirmees)
      - recommandations / actions a mener
      - page de signature

    Les validations utilisees sont celles deja sauvegardees en session
    via POST /api/session/{id}/validations.
    """
    sess = _get_session(session_id)

    # On fusionne les metadonnees envoyees dans la requete avec celles
    # deja stockees (la requete a la priorite)
    metadata = dict(sess.get("qc_metadata", {}))
    for k, v in (req.metadata or {}).items():
        if v is not None:
            metadata[k] = v
    sess["qc_metadata"] = metadata

    try:
        n_observations = sess["profile"]["summary"]["n_rows"]
    except Exception:
        n_observations = 0

    # Survey type s'il est disponible (passe a /api/analyze ou /preview-columns)
    survey_type = ""
    try:
        survey_type = sess.get("survey_context", {}).get("type", "")
    except Exception:
        pass

    try:
        docx_bytes = qc_report.build_qc_report(
            filename       = sess["filename"],
            n_observations = n_observations,
            qc_results     = sess.get("results", []),
            ai_rules       = sess.get("ai_rules"),
            ai_result      = sess.get("ai_results"),
            validations    = sess.get("validations", {}),
            metadata       = metadata,
            survey_type    = survey_type,
        )

        base = sess["filename"].rsplit(".", 1)[0]
        out_filename = f"{base}_rapport_qc.docx"

        return StreamingResponse(
            io.BytesIO(docx_bytes),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{out_filename}"'}
        )
    except Exception as e:
        raise HTTPException(500, f"Erreur de generation du rapport QC : {_clean_error_msg(e)}")


@app.get("/api/session/{session_id}/spotcheck-report")
async def get_spotcheck_report(session_id: str):
    """Genere le rapport analytique Spotcheck (avec IA)."""
    sess = _get_session(session_id)

    df = sess.get("df")
    if df is None:
        raise HTTPException(400, "Aucune donnee dans la session")

    try:
        import tempfile
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
        tmp.close()

        metadata = sess.get("qc_metadata", {})
        report_meta = {
            "programme": "Tekavoul",
            "projet": "PASyFiS II",
            "bureau": "SISTA Consult",
            "zone": metadata.get("zone", "Nouakchott"),
            "periode": metadata.get("periode", ""),
        }

        spotcheck_report.generate_spotcheck_report(
            df=df,
            output_path=tmp.name,
            metadata=report_meta,
        )
        return FileResponse(
            tmp.name,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename="Rapport_Spotcheck.docx",
            background=BackgroundTask(os.remove, tmp.name),
        )
    except ValueError as ve:
        raise HTTPException(400, str(ve))
    except Exception as e:
        raise HTTPException(500, f"Erreur generation : {_clean_error_msg(e)}")


@app.delete("/api/session/{session_id}")
def delete_session(session_id: str):
    """Libere la memoire d'une session. Idempotent : supprimer une session
    deja disparue n'est pas une erreur (le frontend appelle cette route en
    'au cas ou', sans attendre la reponse)."""
    existait = SESSIONS.pop(session_id, None) is not None
    return {"ok": True, "existait": existait, "active_sessions": len(SESSIONS)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)

# ===================================================================
#  ENDPOINT : Generation XLSForm a partir d'un questionnaire Word
# ===================================================================

@app.post("/api/generate-xlsform")
async def generate_questionnaire(
    note_cadrage: UploadFile = File(...),
    cadre_resultats: UploadFile = File(None),
    api: str = Form("api1"),
    api_key: str = Form(""),
):
    """
    Recoit une note de cadrage (.docx) et un cadre de resultats (.xlsx/.docx),
    et genere un questionnaire structure (.docx) au format standard SISTA.
    """
    from core.xlsform_generator import (
        extract_note_cadrage,
        extract_cadre_resultats,
        generate_questionnaire_data,
        build_questionnaire_docx,
    )

    # Validation
    if not note_cadrage.filename.lower().endswith((".docx", ".doc")):
        raise HTTPException(400, "La note de cadrage doit etre un document Word (.docx)")

    nc_bytes = await note_cadrage.read()
    note_text = extract_note_cadrage(nc_bytes)

    # Cadre de resultats optionnel
    cadre_text = ""
    if cadre_resultats and cadre_resultats.filename:
        cr_bytes = await cadre_resultats.read()
        cadre_text = extract_cadre_resultats(cr_bytes, cadre_resultats.filename)

    # Generation par IA
    try:
        questionnaire_data = generate_questionnaire_data(
            note_cadrage_text=note_text[:12000],
            cadre_resultats_text=cadre_text[:8000],
            api_key=_resolve_api_key(api, api_key),
            api=api,
        )
    except Exception as e:
        raise HTTPException(500, f"Erreur lors de la generation : {str(e)}")

    # Construction du .docx
    try:
        docx_bytes = build_questionnaire_docx(questionnaire_data)
    except Exception as e:
        raise HTTPException(500, f"Erreur construction docx : {str(e)}")

    base_name = note_cadrage.filename.rsplit(".", 1)[0]
    output_name = f"Questionnaire_{base_name}.docx"

    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{output_name}"'},
    )


# ======================================================================
#  Diagnostic Audit — Analyse IA d'un questionnaire d'enquête
# ======================================================================

@app.post("/api/diagnostic-audit")
async def diagnostic_audit(
    questionnaire: UploadFile = File(...),
    api: str = Form("api1"),
    api_key: str = Form(""),
):
    """Charge un questionnaire (.xlsx/.docx) et produit un diagnostic IA."""
    import traceback

    try:
        q_path = _save_upload(questionnaire)
        fname = questionnaire.filename.lower()

        # --- Extraction du contenu ---
        q_text = ""
        if fname.endswith((".xlsx", ".xls")):
            try:
                df = pd.read_excel(q_path, sheet_name=0)
                q_text = df.to_string(max_colwidth=120, index=False)[:12000]
            except Exception as e:
                q_text = f"(Erreur lecture Excel : {e})"
        elif fname.endswith(".docx"):
            try:
                from docx import Document as DocxDocument
                doc = DocxDocument(q_path)
                paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
                tables_text = []
                for table in doc.tables:
                    for row in table.rows:
                        tables_text.append(" | ".join(c.text.strip() for c in row.cells))
                q_text = "\n".join(paragraphs + tables_text)[:12000]
            except Exception as e:
                q_text = f"(Erreur lecture DOCX : {e})"
        elif fname.endswith((".csv", ".txt")):
            with open(q_path, "r", encoding="utf-8", errors="ignore") as f:
                q_text = f.read()[:12000]
        else:
            raise HTTPException(400, "Format non supporté. Utilisez .xlsx, .docx ou .csv")

        if not q_text.strip():
            raise HTTPException(400, "Le fichier semble vide ou illisible.")

        # --- Prompt IA ---
        system_prompt = """Tu es un expert en méthodologie d'enquêtes statistiques et contrôle qualité.
On te fournit le contenu d'un questionnaire d'enquête. Tu dois produire un diagnostic complet en JSON.

Analyse les points suivants :
1. **Structure** : sections bien organisées ? questions numérotées ? codes uniques ?
2. **Formulation** : questions claires, non biaisées, non ambiguës ?
3. **Modalités de réponse** : complètes ? mutuellement exclusives ? exhaustives ?
4. **Sauts conditionnels** : logiques cohérentes ? références existantes ?
5. **Types de variables** : adaptés (texte, entier, choix unique/multiple, GPS…) ?
6. **Doublons** : codes ou questions dupliqués ?
7. **Bonnes pratiques** : question de consentement ? identifiants enquêteur/date ? note de clôture ?

Réponds UNIQUEMENT en JSON valide avec cette structure :
{
  "score_global": <int 0-100>,
  "resume": "<résumé en 2-3 phrases>",
  "nb_questions": <int>,
  "nb_sections": <int>,
  "problemes": [
    {
      "severite": "critique|majeur|mineur",
      "categorie": "structure|formulation|modalites|sauts|types|doublons|bonnes_pratiques",
      "question_code": "<code ou N° de la question concernée>",
      "description": "<description du problème>",
      "recommandation": "<suggestion de correction>"
    }
  ],
  "points_forts": ["<point fort 1>", "<point fort 2>"],
  "recommandations_generales": ["<reco 1>", "<reco 2>"]
}"""

        user_prompt = f"Voici le contenu du questionnaire à auditer :\n\n{q_text}"

        key = _resolve_api_key(api, api_key)
        if not key:
            raise HTTPException(400, "Clé API manquante. Configurez une clé dans les paramètres.")

        from core.ai_agent import _call_llm
        result = _call_llm(
            api=api,
            api_key=key,
            model="claude-sonnet-4-20250514" if api == "api1" else "llama-3.1-70b-versatile",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=4096,
        )

        # --- Parse JSON ---
        import re
        raw = result.get("text", "")
        # Extraire le JSON du texte (peut être entouré de ```json ... ```)
        json_match = re.search(r'\{[\s\S]*\}', raw)
        if json_match:
            diagnostic = json.loads(json_match.group())
        else:
            diagnostic = {"resume": raw, "problemes": [], "score_global": 0}

        diagnostic["tokens"] = {
            "input": result.get("in_tokens", 0),
            "output": result.get("out_tokens", 0),
        }

        return JSONResponse(diagnostic)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Erreur diagnostic : {_clean_error_msg(e)}")


# ======================================================================
#  Confection du masque de saisie — Génère un XLSForm à partir d'un questionnaire
# ======================================================================

@app.post("/api/masque-saisie")
async def masque_saisie(
    questionnaire: UploadFile = File(...),
    format_cible: str = Form("kobo"),
    api: str = Form("api1"),
    api_key: str = Form(""),
):
    """Charge un questionnaire et génère un masque de saisie XLSForm."""
    import traceback

    try:
        q_path = _save_upload(questionnaire)
        fname = questionnaire.filename.lower()

        # --- Extraction du contenu ---
        q_text = ""
        if fname.endswith((".xlsx", ".xls")):
            try:
                df = pd.read_excel(q_path, sheet_name=0)
                q_text = df.to_string(max_colwidth=120, index=False)[:12000]
            except Exception as e:
                q_text = f"(Erreur lecture Excel : {e})"
        elif fname.endswith(".docx"):
            try:
                from docx import Document as DocxDocument
                doc = DocxDocument(q_path)
                paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
                tables_text = []
                for table in doc.tables:
                    for row in table.rows:
                        tables_text.append(" | ".join(c.text.strip() for c in row.cells))
                q_text = "\n".join(paragraphs + tables_text)[:12000]
            except Exception as e:
                q_text = f"(Erreur lecture DOCX : {e})"
        elif fname.endswith((".csv", ".txt")):
            with open(q_path, "r", encoding="utf-8", errors="ignore") as f:
                q_text = f.read()[:12000]
        else:
            raise HTTPException(400, "Format non supporté. Utilisez .xlsx, .docx ou .csv")

        if not q_text.strip():
            raise HTTPException(400, "Le fichier semble vide ou illisible.")

        format_label = "KoboToolbox (XLSForm)" if format_cible == "kobo" else "CSPro"

        system_prompt = f"""Tu es un expert en conception de formulaires de collecte de données pour les enquêtes statistiques.
On te fournit un questionnaire d'enquête. Tu dois générer un masque de saisie au format {format_label}.

Produis un JSON avec cette structure :
{{
  "form_title": "<titre du formulaire>",
  "form_id": "<identifiant court>",
  "format": "{format_cible}",
  "resume": "<résumé de ce qui a été généré, 2-3 phrases>",
  "nb_questions": <int>,
  "survey": [
    {{
      "type": "<type XLSForm: text|integer|decimal|select_one <list>|select_multiple <list>|date|geopoint|note|begin_group|end_group|begin_repeat|end_repeat|calculate>",
      "name": "<nom de variable>",
      "label": "<libellé de la question>",
      "required": "yes|no",
      "constraint": "<contrainte XLSForm ou vide>",
      "constraint_message": "<message d'erreur ou vide>",
      "relevant": "<condition d'affichage ou vide>",
      "appearance": "<apparence: minimal|field-list|likert ou vide>",
      "calculation": "<formule ou vide>",
      "repeat_count": "<expression ou vide>"
    }}
  ],
  "choices": [
    {{
      "list_name": "<nom de la liste>",
      "name": "<valeur>",
      "label": "<libellé>"
    }}
  ],
  "settings": {{
    "form_title": "<titre>",
    "form_id": "<id>",
    "version": "<version>",
    "default_language": "French (fr)"
  }},
  "notes_conception": ["<note 1>", "<note 2>"]
}}

Règles :
- Chaque question du questionnaire source doit avoir son équivalent dans survey
- Ajoute les groupes logiques (begin_group/end_group)
- Traduis les sauts conditionnels en expressions "relevant" XLSForm
- Crée les listes de choix correspondantes dans "choices"
- Ajoute les contraintes de validation (min, max, regex…)
- Ajoute une question de consentement si absente
- Ajoute des métadonnées enquêteur (nom, date, GPS) si absentes"""

        user_prompt = f"Voici le questionnaire source à convertir en masque de saisie :\n\n{q_text}"

        key = _resolve_api_key(api, api_key)
        if not key:
            raise HTTPException(400, "Clé API manquante.")

        from core.ai_agent import _call_llm
        result = _call_llm(
            api=api, api_key=key,
            model="claude-sonnet-4-20250514" if api == "api1" else "llama-3.1-70b-versatile",
            system_prompt=system_prompt, user_prompt=user_prompt,
            max_tokens=8192,
        )

        import re
        raw = result.get("text", "")
        json_match = re.search(r'\{[\s\S]*\}', raw)
        if json_match:
            masque = json.loads(json_match.group())
        else:
            masque = {"resume": raw, "survey": [], "choices": []}

        masque["tokens"] = {"input": result.get("in_tokens", 0), "output": result.get("out_tokens", 0)}
        return JSONResponse(masque)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Erreur génération masque : {_clean_error_msg(e)}")


@app.post("/api/masque-saisie/download")
async def masque_saisie_download(req: dict = Body(...)):
    """Génère le fichier .xlsx XLSForm à partir du JSON masque."""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        wb = Workbook()
        header_fill = PatternFill("solid", fgColor="1B3A5C")
        header_font = Font(name="Arial", bold=True, color="FFFFFF", size=10)
        body_font = Font(name="Arial", size=10)
        thin = Side(style="thin", color="CCCCCC")
        border = Border(top=thin, bottom=thin, left=thin, right=thin)

        # --- survey sheet ---
        ws = wb.active
        ws.title = "survey"
        sv_cols = ["type", "name", "label", "required", "constraint", "constraint_message", "relevant", "appearance", "calculation", "repeat_count"]
        for i, h in enumerate(sv_cols, 1):
            c = ws.cell(row=1, column=i, value=h)
            c.font = header_font
            c.fill = header_fill
            c.border = border
            ws.column_dimensions[chr(64 + i) if i <= 26 else "A" + chr(64 + i - 26)].width = 22

        for r, row_data in enumerate(req.get("survey", []), 2):
            for ci, col in enumerate(sv_cols, 1):
                cell = ws.cell(row=r, column=ci, value=row_data.get(col, ""))
                cell.font = body_font
                cell.border = border

        # --- choices sheet ---
        ch = wb.create_sheet("choices")
        ch_cols = ["list_name", "name", "label"]
        for i, h in enumerate(ch_cols, 1):
            c = ch.cell(row=1, column=i, value=h)
            c.font = header_font
            c.fill = header_fill
            c.border = border
            ch.column_dimensions[chr(64 + i)].width = 22

        for r, row_data in enumerate(req.get("choices", []), 2):
            for ci, col in enumerate(ch_cols, 1):
                cell = ch.cell(row=r, column=ci, value=row_data.get(col, ""))
                cell.font = body_font
                cell.border = border

        # --- settings sheet ---
        st = wb.create_sheet("settings")
        settings = req.get("settings", {})
        st_cols = ["form_title", "form_id", "version", "default_language"]
        for i, h in enumerate(st_cols, 1):
            c = st.cell(row=1, column=i, value=h)
            c.font = header_font
            c.fill = header_fill
            c.border = border
            st.column_dimensions[chr(64 + i)].width = 22
            st.cell(row=2, column=i, value=settings.get(h, "")).font = body_font

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        form_id = settings.get("form_id", "masque")
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="masque_{form_id}.xlsx"'},
        )

    except Exception as e:
        raise HTTPException(500, f"Erreur export : {str(e)}")


# ======================================================================
#  Diagnostic Programme de collecte — Analyse un XLSForm existant
# ======================================================================

@app.post("/api/diagnostic-programme")
async def diagnostic_programme(
    programme: UploadFile = File(...),
    api: str = Form("api1"),
    api_key: str = Form(""),
):
    """Charge un programme de collecte (XLSForm) et produit un diagnostic IA."""
    import traceback

    try:
        p_path = _save_upload(programme)
        fname = programme.filename.lower()

        # --- Extraction multi-sheets ---
        content_parts = []
        if fname.endswith((".xlsx", ".xls")):
            try:
                xls = pd.ExcelFile(p_path)
                for sheet in xls.sheet_names:
                    df = pd.read_excel(xls, sheet_name=sheet)
                    content_parts.append(f"=== Sheet: {sheet} ===\n{df.to_string(max_colwidth=100, index=False)[:5000]}")
            except Exception as e:
                content_parts.append(f"(Erreur lecture : {e})")
        elif fname.endswith((".csv", ".txt")):
            with open(p_path, "r", encoding="utf-8", errors="ignore") as f:
                content_parts.append(f.read()[:12000])
        else:
            raise HTTPException(400, "Format non supporté. Utilisez .xlsx ou .csv")

        q_text = "\n\n".join(content_parts)[:14000]
        if not q_text.strip():
            raise HTTPException(400, "Le fichier semble vide ou illisible.")

        system_prompt = """Tu es un expert en programmes de collecte de données (KoboToolbox, ODK, CSPro).
On te fournit le contenu d'un programme de collecte (XLSForm ou similaire). Tu dois produire un diagnostic complet en JSON.

Analyse les points suivants :
1. **Listes de choix** : toutes les listes référencées dans survey existent-elles dans choices ? Y a-t-il des listes non utilisées ?
2. **Logique conditionnelle (relevant)** : les expressions sont-elles valides ? Les variables référencées existent-elles ? Les valeurs comparées correspondent-elles aux choix ?
3. **Contraintes** : les validations sont-elles présentes pour les champs numériques ? Les regex sont-elles correctes ?
4. **Structure** : les groupes et repeat sont-ils correctement ouverts/fermés ? Le repeat_count est-il cohérent ?
5. **Nommage** : les noms de variables sont-ils valides (pas d'espaces, pas de caractères spéciaux) ?
6. **Variables orphelines** : des variables calculées ou questions qui ne sont jamais référencées ailleurs ?
7. **Bonnes pratiques** : métadonnées présentes ? consentement ? GPS ?

Réponds UNIQUEMENT en JSON valide :
{
  "score_global": <int 0-100>,
  "resume": "<résumé 2-3 phrases>",
  "nb_questions": <int>,
  "nb_listes": <int>,
  "nb_groupes": <int>,
  "problemes": [
    {
      "severite": "critique|majeur|mineur",
      "categorie": "listes|logique|contraintes|structure|nommage|orphelins|bonnes_pratiques",
      "element": "<nom variable ou liste concernée>",
      "description": "<description du problème>",
      "recommandation": "<suggestion de correction>"
    }
  ],
  "points_forts": ["<point fort 1>", "<point fort 2>"],
  "recommandations_generales": ["<reco 1>", "<reco 2>"]
}"""

        user_prompt = f"Voici le programme de collecte à diagnostiquer :\n\n{q_text}"

        key = _resolve_api_key(api, api_key)
        if not key:
            raise HTTPException(400, "Clé API manquante.")

        from core.ai_agent import _call_llm
        result = _call_llm(
            api=api, api_key=key,
            model="claude-sonnet-4-20250514" if api == "api1" else "llama-3.1-70b-versatile",
            system_prompt=system_prompt, user_prompt=user_prompt,
            max_tokens=4096,
        )

        import re
        raw = result.get("text", "")
        json_match = re.search(r'\{[\s\S]*\}', raw)
        if json_match:
            diagnostic = json.loads(json_match.group())
        else:
            diagnostic = {"resume": raw, "problemes": [], "score_global": 0}

        diagnostic["tokens"] = {"input": result.get("in_tokens", 0), "output": result.get("out_tokens", 0)}
        return JSONResponse(diagnostic)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Erreur diagnostic programme : {_clean_error_msg(e)}")
