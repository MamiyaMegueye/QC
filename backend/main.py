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
from typing import Optional

import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
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
APP_USERNAME = os.environ.get("APP_USERNAME", "sista26")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "1234")
TOKEN_TTL_SECONDS = 12 * 3600
PUBLIC_PATHS = {"/", "/api/login"}
_LOGIN_FAILURES: dict = {}   # ip -> [timestamps]

if "APP_PASSWORD" not in os.environ:
    print("[SECURITE] APP_PASSWORD non defini : identifiants par defaut actifs. "
          "Definissez APP_USERNAME / APP_PASSWORD (et APP_SECRET) sur Render.")


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


def _purge_sessions():
    """Supprime les sessions expirees, puis plafonne leur nombre."""
    now = time.time()
    expirees = [sid for sid, s in SESSIONS.items()
                if now - s.get("_last_seen", now) > SESSION_TTL_SECONDS]
    for sid in expirees:
        SESSIONS.pop(sid, None)

    surplus = len(SESSIONS) - MAX_SESSIONS
    evincees = []
    if surplus > 0:
        anciennes = sorted(SESSIONS.items(),
                           key=lambda kv: kv[1].get("_last_seen", 0))[:surplus]
        for sid, _ in anciennes:
            SESSIONS.pop(sid, None)
            evincees.append(sid)

    if expirees or evincees:
        print(f"[sessions] purge : {len(expirees)} expiree(s), "
              f"{len(evincees)} evincee(s), {len(SESSIONS)} active(s)")


def _save_session(session_id: str, data: dict):
    data["_last_seen"] = time.time()
    SESSIONS[session_id] = data
    _purge_sessions()


def _get_session(session_id: str) -> dict:
    s = SESSIONS.get(session_id)
    if not s:
        raise HTTPException(404, "Session introuvable ou expiree")
    s["_last_seen"] = time.time()
    return s


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