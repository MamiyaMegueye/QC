"""
profiler.py - Profilage automatique du fichier (NIVEAU 1, sans IA).

Produit pour chaque variable :
  - type detecte (numerique / categorielle / texte / date / identifiant)
  - taux de remplissage
  - nombre de valeurs uniques
  - statistiques (min, max, moyenne, mediane pour numeriques)
  - exemples de valeurs

Et un resume global :
  - nombre total de variables
  - nombre de variables numeriques, categorielles, texte, date
  - nombre de lignes

v2 : ajout de apply_overrides() pour permettre la correction utilisateur
     du type / label / ignore avant le QC.
"""

import pandas as pd
import numpy as np
import re


VALID_TYPES = {"numérique", "catégorielle", "texte", "date", "identifiant", "vide"}


def _try_numeric(series):
    """Tente de convertir en numerique. Renvoie (serie_num, ratio_succes)."""
    s = series.dropna().astype(str).str.replace(",", ".", regex=False).str.strip()
    if len(s) == 0:
        return None, 0.0
    num = pd.to_numeric(s, errors="coerce")
    ratio = num.notna().sum() / len(s)
    return num, ratio


def _try_datetime(series):
    """Tente de detecter des dates. Renvoie ratio de succes."""
    s = series.dropna().astype(str).str.strip()
    if len(s) == 0:
        return 0.0
    sample = s.head(50)
    pat = re.compile(r"\d{1,4}[-/]\d{1,2}[-/]\d{1,4}|\d{4}-\d{2}-\d{2}")
    hits = sample.apply(lambda x: bool(pat.search(x))).sum()
    return hits / len(sample) if len(sample) else 0.0


def detect_type(series, name="", n_rows=0):
    """Detecte le type d'une variable."""
    non_null = series.dropna()
    n = len(non_null)
    if n == 0:
        return "vide"

    uniques = non_null.astype(str).nunique()

    if uniques >= 0.9 * n and (re.search(r"id|code|num|uuid|ref", str(name), re.I) or uniques == n):
        num, ratio = _try_numeric(non_null)
        if ratio < 0.95:
            return "identifiant"

    if _try_datetime(non_null) > 0.7:
        return "date"

    num, ratio = _try_numeric(non_null)
    if ratio > 0.85:
        if uniques <= 10 and uniques < 0.05 * max(n, 1):
            return "catégorielle"
        return "numérique"

    if uniques <= max(20, 0.05 * n):
        return "catégorielle"

    return "texte"


def profile_variable(series, name="", var_label="", value_labels=None, n_rows=0):
    """Profile une seule variable."""
    non_null = series.dropna()
    non_null = non_null[non_null.astype(str).str.strip() != ""]
    n_total = len(series)
    n_filled = len(non_null)

    vtype = detect_type(series, name, n_rows)
    uniques = int(non_null.astype(str).nunique()) if n_filled else 0

    info = {
        "name": name,
        "label": var_label or "",
        "type": vtype,
        "n_filled": n_filled,
        "fill_rate": round(100 * n_filled / n_total, 1) if n_total else 0,
        "n_missing": n_total - n_filled,
        "uniques": uniques,
        "examples": [str(x) for x in non_null.astype(str).unique()[:5]],
        "stats": {},
        "has_value_labels": bool(value_labels and name in (value_labels or {})),
    }

    if vtype == "numérique" and n_filled:
        num, _ = _try_numeric(non_null)
        num = num.dropna()
        if len(num):
            info["stats"] = {
                "min": round(float(num.min()), 2),
                "max": round(float(num.max()), 2),
                "mean": round(float(num.mean()), 2),
                "median": round(float(num.median()), 2),
                "std": round(float(num.std()), 2) if len(num) > 1 else 0,
            }

    return info


def profile_dataset(loaded):
    """
    Profile tout le jeu de donnees.
    Renvoie { summary, variables }.
    """
    df = loaded.df
    var_labels = loaded.var_labels
    value_labels = loaded.value_labels
    n_rows = df.shape[0]

    variables = []
    for col in df.columns:
        variables.append(profile_variable(
            df[col], name=str(col),
            var_label=var_labels.get(col, ""),
            value_labels=value_labels,
            n_rows=n_rows,
        ))

    type_counts = {}
    for v in variables:
        type_counts[v["type"]] = type_counts.get(v["type"], 0) + 1

    total_cells = n_rows * df.shape[1] if df.shape[1] else 0
    filled_cells = sum(v["n_filled"] for v in variables)

    summary = {
        "n_rows": n_rows,
        "n_vars": df.shape[1],
        "n_numeric": type_counts.get("numérique", 0),
        "n_categorical": type_counts.get("catégorielle", 0),
        "n_text": type_counts.get("texte", 0),
        "n_date": type_counts.get("date", 0),
        "n_id": type_counts.get("identifiant", 0),
        "n_empty": type_counts.get("vide", 0),
        "global_fill_rate": round(100 * filled_cells / total_cells, 1) if total_cells else 0,
        "type_counts": type_counts,
    }

    return {"summary": summary, "variables": variables}


# ----------------------------------------------------------------------
#  Application des overrides utilisateur (laissee en place pour
#  compatibilite backend, meme si l'UI ne les envoie plus)
# ----------------------------------------------------------------------

def apply_overrides(profile, overrides):
    """
    Applique les corrections utilisateur au profil auto-detecte.
    overrides : dict { nom_variable: { type, label, ignore } }
    """
    if not overrides:
        return profile

    kept = []
    for var in profile["variables"]:
        ov = overrides.get(var["name"])
        if not ov:
            kept.append(var)
            continue

        new_type = ov.get("type")
        if new_type and new_type in VALID_TYPES and new_type != var["type"]:
            var["type"] = new_type
            var["_overridden_type"] = True
            if new_type != "numérique":
                var["stats"] = {}

        new_label = ov.get("label")
        if new_label is not None:
            new_label = str(new_label).strip()
            if new_label != var.get("label", ""):
                var["label"] = new_label
                var["_overridden_label"] = True

        if not ov.get("ignore"):
            kept.append(var)

    profile["variables"] = kept

    type_counts = {}
    for v in kept:
        type_counts[v["type"]] = type_counts.get(v["type"], 0) + 1

    s = profile["summary"]
    profile["summary"] = {
        **s,
        "n_vars": len(kept),
        "n_numeric": type_counts.get("numérique", 0),
        "n_categorical": type_counts.get("catégorielle", 0),
        "n_text": type_counts.get("texte", 0),
        "n_date": type_counts.get("date", 0),
        "n_id": type_counts.get("identifiant", 0),
        "n_empty": type_counts.get("vide", 0),
        "type_counts": type_counts,
    }

    return profile