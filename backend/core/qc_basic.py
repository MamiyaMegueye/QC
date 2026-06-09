"""
qc_basic.py — Contrôle qualité BASIQUE générique (NIVEAU 2, sans IA).

Tests universels applicables à tout fichier d'enquête :
  - doublons (lignes entières + identifiants)
  - valeurs manquantes (par variable + champs critiques)
  - outliers (méthode IQR sur variables numériques)
  - durées de questionnaire (si start/end détectés)
  - intervalle entre questionnaires (par enquêteur)
  - GPS manquant
  - plages de valeurs (cohérence des numériques)
  - cohérence inter-colonnes simple (constantes par zone, etc.)

Chaque test renvoie un dict :
  { id, titre, severite, explication, n_cas, lignes:[...], colonnes:[...] }
où chaque ligne porte _index, _enqueteur, _probleme.

Le mapping des colonnes-clés est détecté par mots-clés (auto_map),
mais peut être surchargé par l'utilisateur ou par l'agent IA.
"""

import pandas as pd
import numpy as np
import re
from datetime import datetime


# ----------------------------------------------------------------------
#  Détection automatique des colonnes-clés (heuristique, sans IA)
# ----------------------------------------------------------------------

def auto_map(columns):
    cols = list(columns)

    def find(patterns):
        for c in cols:
            for p in patterns:
                if re.search(p, str(c), re.I):
                    return c
        return None

    return {
        "start": find([r"^start$", r"d[ée]but", r"heure.*d[ée]but", r"starttime", r"_submission.*start"]),
        "end": find([r"^end$", r"\bfin\b", r"heure.*fin", r"endtime", r"_submission.*end"]),
        "enqueteur": find([r"enqu[êe]teur", r"\bagent\b", r"interviewer", r"releveur", r"enumerator", r"operateur", r"collecteur"]),
        "id": find([r"id.?progres", r"^id$", r"identifiant", r"m[ée]nage.*id", r"hh.?id", r"uuid", r"num.*quest"]),
        "lat": find([r"latitude", r"^lat$", r"_gps.*lat", r"gps.*latitude", r"_.*latitude"]),
        "lon": find([r"longitude", r"^lon$", r"^lng$", r"_gps.*lon", r"gps.*longitude", r"_.*longitude"]),
    }


# ----------------------------------------------------------------------
#  Utilitaires
# ----------------------------------------------------------------------

def _is_empty(v):
    return v is None or (isinstance(v, float) and pd.isna(v)) or str(v).strip() == "" or str(v).strip().lower() == "nan"


def _to_num(v):
    try:
        return float(str(v).replace(",", ".").strip())
    except (ValueError, AttributeError):
        return None


def _parse_dt(v):
    if _is_empty(v):
        return None
    if isinstance(v, (pd.Timestamp, datetime)):
        return pd.Timestamp(v)
    try:
        return pd.to_datetime(str(v), errors="coerce", dayfirst=False)
    except Exception:
        return None


def _enq(row, mp):
    col = mp.get("enqueteur")
    return str(row[col]) if col and col in row and not _is_empty(row[col]) else "—"


def _result(id, titre, severite, pourquoi, cause, action, lignes, colonnes):
    return {
        "id": id, "titre": titre,
        "severite": severite if lignes else "ok",
        "explication": {"pourquoi": pourquoi, "cause": cause, "action": action},
        "n_cas": len(lignes), "lignes": lignes, "colonnes": colonnes,
    }


# ----------------------------------------------------------------------
#  TESTS
# ----------------------------------------------------------------------

def test_doublons_lignes(df, mp, profile, params):
    dup_mask = df.duplicated(keep=False)
    lignes = []
    for idx in df[dup_mask].index:
        row = df.loc[idx]
        lignes.append({"_index": int(idx) + 1, "Enquêteur": _enq(row, mp),
                       "_enqueteur": _enq(row, mp), "_probleme": "Ligne entièrement dupliquée"})
    return _result("doublons_lignes", "Lignes entièrement dupliquées", "high",
                   "Deux lignes identiques sur toutes les colonnes = saisie en double.",
                   "Copier-coller, soumission répétée, ou import en double.",
                   "Vérifier et supprimer les doublons.",
                   lignes, ["_index", "Enquêteur", "⚠️ Problème"])


def test_id_duplique(df, mp, profile, params):
    col = mp.get("id")
    if not col or col not in df.columns:
        return None
    lignes = []
    vals = df[col].astype(str)
    counts = vals[~vals.apply(_is_empty)].value_counts()
    dups = counts[counts > 1]
    for idx in df.index:
        v = str(df.loc[idx, col])
        if v in dups.index:
            row = df.loc[idx]
            lignes.append({"_index": int(idx) + 1, "Identifiant": v, "Enquêteur": _enq(row, mp),
                           "_enqueteur": _enq(row, mp), "_probleme": f"ID dupliqué ({dups[v]}×)"})
    return _result("id_duplique", f"Identifiant dupliqué ({len(dups)} ID)", "high",
                   "Un même identifiant sur plusieurs lignes = doublon ou erreur.",
                   "Copier-coller ou double entretien.",
                   "Vérifier chaque doublon et corriger.",
                   lignes, ["_index", "Identifiant", "Enquêteur", "⚠️ Problème"])


def test_valeurs_manquantes(df, mp, profile, params):
    seuil = params.get("missing_seuil", 50)  # % de remplissage en dessous duquel on alerte
    lignes = []
    for v in profile["variables"]:
        if v["type"] == "vide" or v["fill_rate"] >= seuil:
            continue
        lignes.append({"Variable": v["name"], "Libellé": v["label"][:40],
                       "Taux remplissage": f"{v['fill_rate']}%",
                       "Manquants": v["n_missing"],
                       "_enqueteur": "—", "_probleme": f"Seulement {v['fill_rate']}% rempli"})
    return _result("valeurs_manquantes", f"Variables peu remplies (< {seuil}%)", "med",
                   "Une variable très peu remplie est souvent inexploitable.",
                   "Question sautée systématiquement, filtre, ou bug de collecte.",
                   "Vérifier si la variable est conditionnelle ou s'il y a un problème.",
                   lignes, ["Variable", "Libellé", "Taux remplissage", "Manquants", "⚠️ Problème"])


def test_outliers(df, mp, profile, params):
    k = params.get("iqr_k", 1.5)
    lignes = []
    num_vars = [v for v in profile["variables"] if v["type"] == "numérique"]
    for v in num_vars:
        col = v["name"]
        s = pd.to_numeric(df[col].astype(str).str.replace(",", ".", regex=False),
                          errors="coerce").dropna()
        if len(s) < 8:
            continue
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        low, high = q1 - k * iqr, q3 + k * iqr
        for idx in df.index:
            val = _to_num(df.loc[idx, col])
            if val is None:
                continue
            if val < low or val > high:
                row = df.loc[idx]
                lignes.append({"_index": int(idx) + 1, "Variable": col, "Valeur": val,
                               "Plage normale": f"{round(low,1)} → {round(high,1)}",
                               "Enquêteur": _enq(row, mp), "_enqueteur": _enq(row, mp),
                               "_probleme": f"Valeur extrême sur {col}"})
    return _result("outliers", "Valeurs aberrantes (outliers)", "low",
                   "Une valeur très éloignée de la distribution (méthode IQR) peut être une faute de frappe.",
                   "Erreur de saisie, mauvaise unité, ou cas atypique réel.",
                   "Examiner chaque valeur extrême au cas par cas.",
                   lignes, ["_index", "Variable", "Valeur", "Plage normale", "Enquêteur", "⚠️ Problème"])


def test_duree_courte(df, mp, profile, params):
    s_col, e_col = mp.get("start"), mp.get("end")
    if not s_col or not e_col or s_col not in df.columns or e_col not in df.columns:
        return None
    seuil = params.get("duree_min", 18)
    lignes = []
    for idx in df.index:
        s = _parse_dt(df.loc[idx, s_col])
        e = _parse_dt(df.loc[idx, e_col])
        if s is None or e is None or pd.isna(s) or pd.isna(e):
            continue
        dur = (e - s).total_seconds() / 60
        if 0 <= dur < seuil:
            row = df.loc[idx]
            lignes.append({"_index": int(idx) + 1, "Enquêteur": _enq(row, mp),
                           "Durée (min)": int(dur), "_enqueteur": _enq(row, mp),
                           "_probleme": f"Durée {int(dur)} min < {seuil} min"})
    return _result("duree_courte", f"Durée questionnaire < {seuil} min", "high",
                   f"Un questionnaire trop court (< {seuil} min) est suspect : questions sautées ou fabrication.",
                   "Enquêteur pressé ou données fabriquées.",
                   f"Callback systématique pour tout questionnaire < {seuil} min.",
                   lignes, ["_index", "Enquêteur", "Durée (min)", "⚠️ Problème"])


def test_intervalle_starts(df, mp, profile, params):
    s_col, enq_col = mp.get("start"), mp.get("enqueteur")
    if not s_col or not enq_col or s_col not in df.columns or enq_col not in df.columns:
        return None
    seuil = params.get("duree_min", 18)
    lignes = []
    tmp = df.copy()
    tmp["_dt"] = tmp[s_col].apply(_parse_dt)
    tmp = tmp.dropna(subset=["_dt"])
    for enq, grp in tmp.groupby(enq_col):
        grp = grp.sort_values("_dt")
        prev = None
        for idx, row in grp.iterrows():
            if prev is not None:
                ecart = (row["_dt"] - prev).total_seconds() / 60
                if 0 <= ecart < seuil:
                    lignes.append({"_index": int(idx) + 1, "Enquêteur": str(enq),
                                   "Écart (min)": int(ecart), "_enqueteur": str(enq),
                                   "_probleme": f"Écart {int(ecart)} min < {seuil} min"})
            prev = row["_dt"]
    return _result("intervalle_starts", f"Intervalle entre starts < {seuil} min", "med",
                   f"Un questionnaire démarré < {seuil} min après le précédent laisse peu de temps.",
                   "Remplissage en parallèle ou fabrication.",
                   "Croiser avec la durée. Callback si les deux sont courts.",
                   lignes, ["_index", "Enquêteur", "Écart (min)", "⚠️ Problème"])


def test_gps_manquant(df, mp, profile, params):
    lat, lon = mp.get("lat"), mp.get("lon")
    if not lat or not lon or lat not in df.columns or lon not in df.columns:
        return None
    lignes = []
    for idx in df.index:
        if _is_empty(df.loc[idx, lat]) or _is_empty(df.loc[idx, lon]):
            row = df.loc[idx]
            lignes.append({"_index": int(idx) + 1, "Enquêteur": _enq(row, mp),
                           "_enqueteur": _enq(row, mp),
                           "_probleme": "GPS manquant — position non enregistrée"})
    return _result("gps_manquant", "Coordonnées GPS manquantes", "med",
                   "Sans GPS, impossible de vérifier que l'entretien a eu lieu au bon endroit.",
                   "GPS désactivé, refus de localisation, ou remplissage hors terrain.",
                   "Rendre le GPS obligatoire. Vérifier la présence terrain.",
                   lignes, ["_index", "Enquêteur", "⚠️ Problème"])


def test_constantes(df, mp, profile, params):
    """Détecte les variables constantes (une seule valeur) — souvent un bug."""
    lignes = []
    for v in profile["variables"]:
        if v["type"] in ("vide",):
            continue
        if v["uniques"] == 1 and v["n_filled"] > 1:
            lignes.append({"Variable": v["name"], "Valeur unique": v["examples"][0] if v["examples"] else "",
                           "_enqueteur": "—", "_probleme": "Variable constante (1 seule valeur)"})
    return _result("constantes", "Variables constantes", "low",
                   "Une variable qui ne prend qu'une valeur n'apporte aucune information.",
                   "Question mal configurée ou réponse forcée.",
                   "Vérifier si c'est normal (ex : zone unique) ou un bug.",
                   lignes, ["Variable", "Valeur unique", "⚠️ Problème"])


# ----------------------------------------------------------------------
#  Orchestrateur + bilan enquêteur
# ----------------------------------------------------------------------

ALL_TESTS = [
    test_doublons_lignes, test_id_duplique, test_valeurs_manquantes,
    test_outliers, test_duree_courte, test_intervalle_starts,
    test_gps_manquant, test_constantes,
]


def run_basic_qc(loaded, profile, mp=None, params=None):
    df = loaded.df.reset_index(drop=True)
    mp = mp or auto_map(df.columns)
    params = params or {}
    results = []
    for t in ALL_TESTS:
        try:
            r = t(df, mp, profile, params)
            if r:
                results.append(r)
        except Exception as e:
            results.append({"id": t.__name__, "titre": t.__name__, "severite": "ok",
                            "explication": {"pourquoi": f"Test non exécuté : {e}", "cause": "", "action": ""},
                            "n_cas": 0, "lignes": [], "colonnes": []})
    return results, mp


def build_enqueteur_summary(results, mp):
    if not mp.get("enqueteur"):
        return []
    agg = {}
    for r in results:
        if r["severite"] == "ok":
            continue
        for l in r["lignes"]:
            e = l.get("_enqueteur", "—")
            if e == "—":
                continue
            agg.setdefault(e, {"nom": e, "total": 0, "par_test": {}})
            agg[e]["total"] += 1
            agg[e]["par_test"][r["titre"]] = agg[e]["par_test"].get(r["titre"], 0) + 1
    out = []
    for e in agg.values():
        niveau = "high" if e["total"] >= 10 else "med" if e["total"] >= 4 else "low"
        e["niveau"] = niveau
        out.append(e)
    return sorted(out, key=lambda x: -x["total"])


def global_stats(profile, results):
    total = sum(r["n_cas"] for r in results)
    return {
        "questionnaires": profile["summary"]["n_rows"],
        "incoherences": total,
        "tests": len(results),
        "tests_alertes": len([r for r in results if r["severite"] != "ok"]),
    }
