"""
backcheck.py — Back check / Controle croise.

Compare les reponses d'une enquete principale a celles d'un back check
(re-interview courte par une equipe independante sur un sous-echantillon).
Calcule les taux de concordance par enqueteur / par variable / global.

Standard des enquetes rigoureuses (J-PAL, IPA, Banque Mondiale, DHS).
Un enqueteur avec un taux de concordance anormalement bas signale un risque
de fabrication ou de baclage des reponses.

Ce module remplace l'ancien appariement.py.
"""

import pandas as pd
import numpy as np
from .loader import load_file


# ============================================================
#  Helpers de comparaison
# ============================================================

def _normalize_categorical(val):
    """Normalise une valeur categorielle pour comparaison exacte
    (trim + lowercase). Retourne None si vide."""
    if val is None or pd.isna(val):
        return None
    s = str(val).strip().lower()
    return s if s else None


def _to_num(val):
    """Convertit en float, ou None si impossible."""
    if val is None or pd.isna(val):
        return None
    try:
        return float(str(val).replace(",", ".").strip())
    except (ValueError, TypeError):
        return None


def _compare_pair(val_main, val_bc, var_config):
    """Compare une paire (valeur enquete principale vs valeur back check).

    Renvoie :
      "concord"    : valeurs identiques ou dans la tolerance
      "diverg"     : valeurs differentes hors tolerance
      "missing"    : au moins une des deux est manquante (exclue de l'analyse)
    """
    # Si l'une des deux est manquante, on exclut la paire (option choisie)
    if val_main is None or pd.isna(val_main) or val_bc is None or pd.isna(val_bc):
        return "missing"

    var_type = var_config.get("type", "categorical")

    if var_type == "numeric":
        n_main = _to_num(val_main)
        n_bc = _to_num(val_bc)
        if n_main is None or n_bc is None:
            return "missing"
        tol = var_config.get("tolerance", 0)
        tol_type = var_config.get("tolerance_type", "absolute")
        if tol_type == "percent":
            if n_main == 0:
                return "concord" if n_bc == 0 else "diverg"
            ecart_pct = abs(n_bc - n_main) / abs(n_main) * 100
            return "concord" if ecart_pct <= tol else "diverg"
        else:
            return "concord" if abs(n_bc - n_main) <= tol else "diverg"
    else:
        # categoriel : match exact apres normalisation
        s_main = _normalize_categorical(val_main)
        s_bc = _normalize_categorical(val_bc)
        if s_main is None or s_bc is None:
            return "missing"
        return "concord" if s_main == s_bc else "diverg"


# ============================================================
#  Code participant (support code composite)
# ============================================================

def _get_code_series(df, code_cols):
    """Construit la serie de codes (simple ou composite)."""
    if isinstance(code_cols, str):
        code_cols = [code_cols]
    missing = [c for c in code_cols if c not in df.columns]
    if missing:
        return None, missing
    if len(code_cols) == 1:
        s = df[code_cols[0]].astype(str).str.strip()
    else:
        s = df[code_cols].astype(str).apply(
            lambda row: "||".join(v.strip() for v in row), axis=1
        )
    s = s.where(~s.isin(["", "nan", "None", "NaN"]), None)
    return s, []


# ============================================================
#  Detection des colonnes communes + auto-config
# ============================================================

def find_common_columns(main_path, bc_path):
    """Retourne la liste des colonnes communes aux 2 fichiers avec
    detection heuristique du type (numeric/categorical) et suggestion
    de tolerance par defaut."""
    loaded_main = load_file(main_path, None)
    loaded_bc = load_file(bc_path, None)
    df_main = loaded_main.df
    df_bc = loaded_bc.df

    common = [c for c in df_main.columns if c in df_bc.columns]
    result = []

    for c in common:
        s_main = df_main[c].dropna()
        s_bc = df_bc[c].dropna()
        if len(s_main) == 0 or len(s_bc) == 0:
            continue

        # Detection du type : si >80% des valeurs sont numeriques dans les 2 -> numeric
        main_num_ratio = pd.to_numeric(s_main, errors="coerce").notna().mean()
        bc_num_ratio = pd.to_numeric(s_bc, errors="coerce").notna().mean()
        auto_type = "numeric" if (main_num_ratio > 0.8 and bc_num_ratio > 0.8) else "categorical"

        # Tolerance suggeree pour les numeriques (heuristique)
        if auto_type == "numeric":
            nums = pd.to_numeric(s_main, errors="coerce").dropna()
            if len(nums) > 0:
                mag = nums.abs().median()
                if mag < 20:
                    default_tol, default_tol_type = 1, "absolute"
                elif mag < 100:
                    default_tol, default_tol_type = 5, "absolute"
                else:
                    default_tol, default_tol_type = 10, "percent"
            else:
                default_tol, default_tol_type = 0, "absolute"
        else:
            default_tol, default_tol_type = 0, "absolute"

        examples_main = s_main.astype(str).head(3).tolist()

        result.append({
            "name": c,
            "type_auto": auto_type,
            "tolerance_auto": default_tol,
            "tolerance_type_auto": default_tol_type,
            "examples_main": examples_main,
            "n_main": int(len(s_main)),
            "n_bc": int(len(s_bc)),
        })

    return {
        "n_main_rows": int(len(df_main)),
        "n_bc_rows": int(len(df_bc)),
        "common_columns": result,
        "main_columns": list(df_main.columns),
        "bc_columns": list(df_bc.columns),
    }


# ============================================================
#  Analyse principale
# ============================================================

def _severity(rate):
    """Palier de severite standard J-PAL / Banque Mondiale."""
    if rate >= 90:
        return "green"
    if rate >= 80:
        return "yellow"
    if rate >= 70:
        return "orange"
    return "red"


def run_backcheck(
    main_path,
    bc_path,
    main_code_cols,
    bc_code_cols,
    main_enqueteur_col,
    variables_config,
    main_label="Enquete principale",
    bc_label="Back check",
):
    """Execute la comparaison back check.

    Args:
        main_path, bc_path : chemins des fichiers
        main_code_cols, bc_code_cols : colonne(s) du code participant
            (string ou liste pour code composite)
        main_enqueteur_col : nom de la colonne enqueteur dans l'enquete principale
            (utilisee pour l'agregation ; peut etre None ou "")
        variables_config : liste de dicts, chaque variable a comparer :
            [{name, type, tolerance, tolerance_type}, ...]
                - type : "numeric" ou "categorical"
                - tolerance : nombre (0 = comparaison exacte)
                - tolerance_type : "absolute" ou "percent" (numeric seulement)
        main_label, bc_label : etiquettes affichables

    Returns:
        dict complet, voir schema en bas du fichier.
    """
    loaded_main = load_file(main_path, None)
    loaded_bc = load_file(bc_path, None)
    df_main = loaded_main.df.reset_index(drop=True)
    df_bc = loaded_bc.df.reset_index(drop=True)

    # Series de codes
    codes_main, missing_main = _get_code_series(df_main, main_code_cols)
    codes_bc, missing_bc = _get_code_series(df_bc, bc_code_cols)
    if missing_main or missing_bc:
        raise ValueError(
            f"Colonnes code introuvables : "
            f"principale={missing_main or 'OK'}, back check={missing_bc or 'OK'}"
        )

    df_main = df_main.copy()
    df_bc = df_bc.copy()
    df_main["_code"] = codes_main
    df_bc["_code"] = codes_bc

    # Filtrer les lignes avec code non vide
    df_main_ok = df_main[df_main["_code"].notna()].copy()
    df_bc_ok = df_bc[df_bc["_code"].notna()].copy()

    codes_main_set = set(df_main_ok["_code"].tolist())
    codes_bc_set = set(df_bc_ok["_code"].tolist())
    matched_codes = codes_main_set & codes_bc_set
    orphan_main = codes_main_set - codes_bc_set
    orphan_bc = codes_bc_set - codes_main_set

    # Index par code (premiere occurrence en cas de doublons)
    main_by_code = df_main_ok.drop_duplicates(subset=["_code"], keep="first").set_index("_code")
    bc_by_code = df_bc_ok.drop_duplicates(subset=["_code"], keep="first").set_index("_code")

    # Accumulateurs
    n_concord_total = 0
    n_diverg_total = 0
    n_missing_total = 0
    enq_stats = {}
    var_stats = {v["name"]: {"n_concord": 0, "n_diverg": 0, "n_missing": 0,
                             "type": v.get("type", "categorical")}
                 for v in variables_config}
    divergences = []
    max_divergences = 500

    # Parcours des codes apparies
    for code in matched_codes:
        row_main = main_by_code.loc[code]
        row_bc = bc_by_code.loc[code]

        # Identifier l'enqueteur principal
        enq = "Inconnu"
        if main_enqueteur_col and main_enqueteur_col in row_main.index:
            v = row_main[main_enqueteur_col]
            if v is not None and not pd.isna(v):
                enq = str(v).strip() or "Inconnu"

        if enq not in enq_stats:
            enq_stats[enq] = {
                "n_concord": 0, "n_diverg": 0, "n_missing": 0,
                "n_participants": set(),
                "worst_vars": {},
            }
        enq_stats[enq]["n_participants"].add(code)

        # Comparer chaque variable configuree
        for var_cfg in variables_config:
            var_name = var_cfg["name"]
            if var_name not in row_main.index or var_name not in row_bc.index:
                continue
            v_main = row_main[var_name]
            v_bc = row_bc[var_name]

            outcome = _compare_pair(v_main, v_bc, var_cfg)

            if outcome == "concord":
                n_concord_total += 1
                enq_stats[enq]["n_concord"] += 1
                var_stats[var_name]["n_concord"] += 1
            elif outcome == "diverg":
                n_diverg_total += 1
                enq_stats[enq]["n_diverg"] += 1
                var_stats[var_name]["n_diverg"] += 1
                enq_stats[enq]["worst_vars"][var_name] = \
                    enq_stats[enq]["worst_vars"].get(var_name, 0) + 1
                if len(divergences) < max_divergences:
                    divergences.append({
                        "code": str(code).replace("||", " + "),
                        "enqueteur": enq,
                        "variable": var_name,
                        "val_main": str(v_main) if not pd.isna(v_main) else "(vide)",
                        "val_bc": str(v_bc) if not pd.isna(v_bc) else "(vide)",
                    })
            else:  # missing
                n_missing_total += 1
                enq_stats[enq]["n_missing"] += 1
                var_stats[var_name]["n_missing"] += 1

    # Taux global (base : paires comparables uniquement)
    n_pairs_comparable = n_concord_total + n_diverg_total
    global_rate = (n_concord_total * 100.0 / n_pairs_comparable) if n_pairs_comparable > 0 else 0

    # Par enqueteur
    by_enqueteur = []
    for enq, stats in enq_stats.items():
        n_comp = stats["n_concord"] + stats["n_diverg"]
        rate = (stats["n_concord"] * 100.0 / n_comp) if n_comp > 0 else 0
        # Top 5 variables les plus problematiques pour cet enqueteur
        worst = sorted(stats["worst_vars"].items(), key=lambda x: -x[1])[:5]
        worst_list = [{"name": n, "n_diverg": c} for n, c in worst]
        by_enqueteur.append({
            "enqueteur": enq,
            "n_participants": len(stats["n_participants"]),
            "n_concord": stats["n_concord"],
            "n_diverg": stats["n_diverg"],
            "n_missing": stats["n_missing"],
            "concord_rate": round(rate, 1),
            "severity": _severity(rate),
            "worst_variables": worst_list,
        })
    by_enqueteur.sort(key=lambda x: x["concord_rate"])

    # Par variable
    by_variable = []
    for name, s in var_stats.items():
        n_comp = s["n_concord"] + s["n_diverg"]
        rate = (s["n_concord"] * 100.0 / n_comp) if n_comp > 0 else 0
        by_variable.append({
            "name": name,
            "type": s["type"],
            "n_comparable": n_comp,
            "n_concord": s["n_concord"],
            "n_diverg": s["n_diverg"],
            "n_missing": s["n_missing"],
            "concord_rate": round(rate, 1),
        })
    by_variable.sort(key=lambda x: x["concord_rate"])

    return {
        "summary": {
            "n_main_rows": len(df_main),
            "n_bc_rows": len(df_bc),
            "n_matched": len(matched_codes),
            "n_orphan_main": len(orphan_main),
            "n_orphan_bc": len(orphan_bc),
            "n_variables_compared": len(variables_config),
            "n_pairs_compared": n_pairs_comparable,
            "n_concord": n_concord_total,
            "n_diverg": n_diverg_total,
            "n_missing": n_missing_total,
            "global_rate": round(global_rate, 1),
            "global_severity": _severity(global_rate),
        },
        "by_enqueteur": by_enqueteur,
        "by_variable": by_variable,
        "divergences": divergences,
        "main_label": main_label,
        "bc_label": bc_label,
    }