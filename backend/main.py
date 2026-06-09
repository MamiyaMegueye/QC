"""
SISTA QC — Backend FastAPI
Expose les fonctionnalites du moteur QC via une API REST consommable par React.

Endpoints :
  GET  /                            -> healthcheck
  GET  /api/health                  -> statut + config
  POST /api/test-key                -> tester une cle API
  POST /api/analyze                 -> upload fichier + analyse QC basique
  POST /api/generate-rules          -> generer regles IA + executer
  GET  /api/session/{id}/enqueteur-summary -> bilan enqueteurs
  GET  /api/session/{id}/export-excel      -> export Excel
"""

from __future__ import annotations

import io
import os
import uuid
import tempfile
from typing import Optional

import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

# Charger le .env si present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from core.loader import load_file
from core.profiler import profile_dataset
from core.qc_basic import run_basic_qc, build_enqueteur_summary, global_stats
from core import ai_agent

# ----------------------------------------------------------------------
#  App + CORS
# ----------------------------------------------------------------------

app = FastAPI(
    title="SISTA QC API",
    description="API REST pour le moteur de Controle Qualite SISTA",
    version="1.0.0",
)

# CORS : autorise React (Vercel + localhost)
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
)

# ----------------------------------------------------------------------
#  Stockage en memoire des sessions (en prod : Redis)
# ----------------------------------------------------------------------

SESSIONS: dict = {}


def _save_session(session_id: str, data: dict):
    SESSIONS[session_id] = data


def _get_session(session_id: str) -> dict:
    s = SESSIONS.get(session_id)
    if not s:
        raise HTTPException(404, "Session introuvable ou expiree")
    return s


# ----------------------------------------------------------------------
#  Models
# ----------------------------------------------------------------------

class TestKeyRequest(BaseModel):
    api: str  # "api1" ou "api2"
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


# ----------------------------------------------------------------------
#  Helpers
# ----------------------------------------------------------------------

def _save_upload(file: UploadFile) -> str:
    """Sauvegarde un UploadFile dans un fichier temporaire."""
    suffix = os.path.splitext(file.filename)[1]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    content = file.file.read()
    tmp.write(content)
    tmp.close()
    file.file.seek(0)
    return tmp.name


def _clean_error_msg(e: Exception) -> str:
    """Retire les mentions des providers dans les messages d'erreur."""
    msg = str(e)
    for term in ["Anthropic", "anthropic", "Claude", "claude",
                 "Groq", "groq", "sk-ant", "gsk_"]:
        msg = msg.replace(term, "API")
    return msg[:300]


# ----------------------------------------------------------------------
#  ENDPOINTS
# ----------------------------------------------------------------------

@app.get("/")
def root():
    return {
        "name": "SISTA QC API",
        "status": "online",
        "version": "1.0.0",
    }


@app.get("/api/health")
def health():
    """Indique l'etat du backend et la presence des cles dans .env."""
    return {
        "status": "ok",
        "api1_configured": bool(os.environ.get("ANTHROPIC_API_KEY", "")),
        "api2_configured": bool(os.environ.get("GROQ_API_KEY", "")),
        "active_sessions": len(SESSIONS),
    }


@app.post("/api/test-key")
def test_key(req: TestKeyRequest):
    """Teste si une cle API est valide.
    Si req.api_key est vide, utilise la cle du .env."""
    try:
        # Fallback : utiliser la cle du .env si le champ est vide
        key_to_test = req.api_key
        if not key_to_test:
            if req.api == "api1":
                key_to_test = os.environ.get("ANTHROPIC_API_KEY", "")
            elif req.api == "api2":
                key_to_test = os.environ.get("GROQ_API_KEY", "")

        if not key_to_test:
            return {"ok": False,
                    "message": "Aucune cle disponible (ni dans le champ ni dans .env)"}

        ok, msg = ai_agent.test_api_key(req.api, key_to_test)
        return {"ok": ok, "message": msg}
    except Exception as e:
        return {"ok": False, "message": _clean_error_msg(e)}


@app.post("/api/analyze")
async def analyze(
    data_file: UploadFile = File(...),
    dict_file: Optional[UploadFile] = File(None),
    form_file: Optional[UploadFile] = File(None),
    duree_min: int = Form(18),
    iqr_k: float = Form(1.5),
    missing_seuil: int = Form(50),
):
    """
    Upload + profilage + QC basique.
    Retourne session_id pour les operations suivantes.
    """
    try:
        # Sauvegarder les fichiers
        data_path = _save_upload(data_file)
        dict_path = _save_upload(dict_file) if dict_file else None

        # Form Kobo (lecture brute pour transmettre a l'IA)
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

        # Charger + profiler + QC basique
        loaded = load_file(data_path, dict_path)
        profile = profile_dataset(loaded)
        params = {"duree_min": duree_min, "iqr_k": iqr_k, "missing_seuil": missing_seuil}
        results, mp = run_basic_qc(loaded, profile, params=params)

        # Stats globales
        stats = global_stats(profile, results)

        # Creer la session
        session_id = str(uuid.uuid4())
        _save_session(session_id, {
            "loaded": loaded,
            "profile": profile,
            "results": results,
            "mp": mp,
            "params": params,
            "form_content": form_content,
            "filename": data_file.filename,
            "ai_results": None,
            "ai_rules": None,
            "ai_comment": None,
            "ai_metrics": None,
        })

        # Preview des donnees (20 lignes)
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
                        "titre": r["titre"],
                        "severite": r["severite"],
                        "n_cas": r["n_cas"],
                        "explication": r["explication"],
                        "lignes": [
                            {k: (v if not isinstance(v, (pd.Timestamp,))
                                 else str(v)) for k, v in row.items()}
                            for row in r["lignes"][:200]  # limite pour reponse JSON
                        ],
                    }
                    for r in results
                ],
                "stats": stats,
            },
            "mp": mp,
            "preview": preview,
        }
    except Exception as e:
        raise HTTPException(500, f"Erreur d'analyse : {e}")


@app.post("/api/generate-rules")
def generate_rules(req: GenerateRulesRequest):
    """
    Genere les regles QC via IA puis les execute sur le DataFrame.
    Si req.api_key est vide, utilise la cle du .env.
    """
    sess = _get_session(req.session_id)
    progress_log = []

    def progress_cb(msg):
        progress_log.append(msg)

    # Fallback sur .env si la cle du champ est vide
    key_to_use = req.api_key
    if not key_to_use:
        if req.api == "api1":
            key_to_use = os.environ.get("ANTHROPIC_API_KEY", "")
        elif req.api == "api2":
            key_to_use = os.environ.get("GROQ_API_KEY", "")

    if not key_to_use:
        raise HTTPException(400, "Aucune cle API disponible (ni dans l'interface ni dans .env)")

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
        )
        ai_res = ai_agent.run_rules(sess["loaded"].df, rules, sess["mp"])

        # Stocker en session
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
    """Bilan par enqueteur (combine QC basique + IA si dispo)."""
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
    """Export Excel multi-feuilles : cas detectes + synthese enqueteurs + regles."""
    sess = _get_session(session_id)
    ai_res = sess.get("ai_results")
    rules = sess.get("ai_rules") or []

    if not ai_res or not ai_res.get("lignes"):
        raise HTTPException(404, "Aucun resultat IA a exporter")

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        # Feuille 1 : cas detectes
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

        # Feuille 2 : synthese enqueteurs
        df_enq = pd.DataFrame(cas_list)
        if "Enqueteur" in df_enq.columns:
            synth = df_enq.groupby("Enqueteur").agg(
                Nb_anomalies=("_index", "count"),
                Regles_distinctes=("Regle", "nunique"),
            ).reset_index().sort_values("Nb_anomalies", ascending=False)
            synth.to_excel(writer, sheet_name="Synthese enqueteurs", index=False)

        # Feuille 3 : regles IA
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
    """Recalcule les tests QC basique avec de nouveaux parametres."""
    sess = _get_session(session_id)
    params = {"duree_min": duree_min, "iqr_k": iqr_k, "missing_seuil": missing_seuil}
    results, mp = run_basic_qc(sess["loaded"], sess["profile"], params=params)
    sess["results"] = results
    sess["mp"] = mp
    sess["params"] = params
    stats = global_stats(sess["profile"], results)
    return {"ok": True, "results": results, "stats": stats, "mp": mp}


@app.delete("/api/session/{session_id}")
def delete_session(session_id: str):
    """Libere la memoire d'une session."""
    if session_id in SESSIONS:
        del SESSIONS[session_id]
        return {"ok": True}
    raise HTTPException(404, "Session introuvable")


# ----------------------------------------------------------------------
#  Lancement local
# ----------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)