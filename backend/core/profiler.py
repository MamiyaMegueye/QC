"""
profiler.py — Profilage automatique du fichier (NIVEAU 1, sans IA).

Produit pour chaque variable :
  - type détecté (numérique / catégorielle / texte / date / identifiant)
  - taux de remplissage
  - nombre de valeurs uniques
  - statistiques (min, max, moyenne, médiane pour numériques)
  - exemples de valeurs

Et un résumé global :
  - nombre total de variables
  - nombre de variables numériques, catégorielles, texte, date
  - nombre de lignes
"""

import pandas as pd
import numpy as np
import re


def _try_numeric(series):
    """Tente de convertir en numérique. Renvoie (série_num, ratio_succès)."""
    s = series.dropna().astype(str).str.replace(",", ".", regex=False).str.strip()
    if len(s) == 0:
        return None, 0.0
    num = pd.to_numeric(s, errors="coerce")
    ratio = num.notna().sum() / len(s)
    return num, ratio


def _try_datetime(series):
    """Tente de détecter des dates. Renvoie ratio de succès."""
    s = series.dropna().astype(str).str.strip()
    if len(s) == 0:
        return 0.0
    sample = s.head(50)
    # motifs de date courants
    pat = re.compile(r"\d{1,4}[-/]\d{1,2}[-/]\d{1,4}|\d{4}-\d{2}-\d{2}")
    hits = sample.apply(lambda x: bool(pat.search(x))).sum()
    return hits / len(sample) if len(sample) else 0.0


def detect_type(series, name="", n_rows=0):
    """Détecte le type d'une variable."""
    non_null = series.dropna()
    n = len(non_null)
    if n == 0:
        return "vide"

    uniques = non_null.astype(str).nunique()

    # identifiant : presque toutes les valeurs uniques + nom évocateur
    if uniques >= 0.9 * n and (re.search(r"id|code|num|uuid|ref", str(name), re.I) or uniques == n):
        # mais si c'est numérique continu, on le traite comme numérique plus bas
        num, ratio = _try_numeric(non_null)
        if ratio < 0.95:
            return "identifiant"

    # date
    if _try_datetime(non_null) > 0.7:
        return "date"

    # numérique
    num, ratio = _try_numeric(non_null)
    if ratio > 0.85:
        # si peu de valeurs uniques -> catégorielle codée (ex: 1,2,3)
        if uniques <= 10 and uniques < 0.05 * max(n, 1):
            return "catégorielle"
        return "numérique"

    # catégorielle : peu de modalités
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
    Profile tout le jeu de données.
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

    # résumé global
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
