"""
appariement.py — Analyse d'appariement pre-test / post-test.

Recommandation SISTA v2 sur les enquetes longitudinales (VIH/SIDA, panel, etc.) :
"Chaque participant doit conserver le meme code unique lors des differentes
phases de collecte (pre-test et post-test)."

Ce module :
  - accepte deux fichiers (pre + post) avec une meme colonne code
  - identifie les paires completes / incompletes
  - detecte les codes en doublon dans chaque fichier
  - retourne un rapport detaille pour le frontend

Le code peut etre :
  - simple : une seule colonne (ex: "code_participant")
  - composite : liste de colonnes (ex: ["zone", "num_participant"])
"""

import pandas as pd
from .loader import load_file


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
    # Vider les codes vides
    s = s.where(~s.isin(["", "nan", "None", "NaN"]), None)
    return s, []


def compare_pre_post(
    pre_path: str,
    post_path: str,
    pre_code_cols,
    post_code_cols,
    pre_label: str = "Pré-test",
    post_label: str = "Post-test",
) -> dict:
    """Compare deux fichiers pre/post et identifie les participants sans paire.

    Args:
        pre_path, post_path : chemins vers les 2 fichiers
        pre_code_cols       : nom(s) de colonne(s) code dans le fichier pre
        post_code_cols      : nom(s) de colonne(s) code dans le fichier post
        pre_label, post_label : etiquettes affichables

    Returns:
        {
          "summary": {
            "n_pre":                nb total lignes pre
            "n_post":               nb total lignes post
            "n_pre_with_code":      nb lignes pre avec code non vide
            "n_post_with_code":     nb lignes post avec code non vide
            "n_pairs_complete":     paires completes (code dans les 2)
            "n_pre_only":           participants avec pre mais sans post
            "n_post_only":          participants avec post mais sans pre
            "n_dup_pre":            codes dupliques dans pre
            "n_dup_post":           codes dupliques dans post
            "completion_rate":      taux d'appariement en %
          },
          "pre_only":   [{code, row_index, ...}]   (limite 200)
          "post_only":  [{code, row_index, ...}]   (limite 200)
          "dup_pre":    [{code, count}]
          "dup_post":   [{code, count}]
          "pre_label":  str
          "post_label": str
        }
    """
    # Charger les 2 fichiers
    loaded_pre = load_file(pre_path, None)
    loaded_post = load_file(post_path, None)
    df_pre = loaded_pre.df.reset_index(drop=True)
    df_post = loaded_post.df.reset_index(drop=True)

    # Extraire les codes
    codes_pre, missing_pre = _get_code_series(df_pre, pre_code_cols)
    codes_post, missing_post = _get_code_series(df_post, post_code_cols)

    if missing_pre or missing_post:
        raise ValueError(
            f"Colonnes introuvables : "
            f"pré={missing_pre or 'OK'}, post={missing_post or 'OK'}"
        )

    # Statistiques generales
    n_pre = len(df_pre)
    n_post = len(df_post)
    n_pre_with_code = int(codes_pre.notna().sum())
    n_post_with_code = int(codes_post.notna().sum())

    # Codes valides (non vides)
    set_pre = set(codes_pre.dropna().tolist())
    set_post = set(codes_post.dropna().tolist())

    # Paires completes
    pairs = set_pre & set_post
    n_pairs = len(pairs)

    # Sans paire
    only_pre = set_pre - set_post
    only_post = set_post - set_pre

    # Doublons dans chaque fichier
    dup_pre_counts = codes_pre.dropna().value_counts()
    dup_pre_counts = dup_pre_counts[dup_pre_counts > 1]

    dup_post_counts = codes_post.dropna().value_counts()
    dup_post_counts = dup_post_counts[dup_post_counts > 1]

    # Extraire les lignes concernees (avec ligne du fichier pour retracer)
    def _extract_lines(df, codes_series, target_codes, extra_cols=None, limit=200):
        rows = []
        for idx in df.index:
            code = codes_series.loc[idx]
            if code is None or pd.isna(code):
                continue
            if code in target_codes:
                row = {"code": str(code).replace("||", " + "),
                       "row_index": int(idx) + 1}
                if extra_cols:
                    for c in extra_cols:
                        if c in df.columns:
                            v = df.loc[idx, c]
                            if not pd.isna(v):
                                row[c] = str(v)[:60]
                rows.append(row)
                if len(rows) >= limit:
                    break
        return rows

    # Prendre quelques colonnes contextuelles si dispo
    context_cols_pre = [c for c in df_pre.columns
                        if any(k in c.lower() for k in
                               ["nom", "name", "enqueteur", "date", "sexe", "age"])][:3]
    context_cols_post = [c for c in df_post.columns
                         if any(k in c.lower() for k in
                                ["nom", "name", "enqueteur", "date", "sexe", "age"])][:3]

    pre_only_details = _extract_lines(df_pre, codes_pre, only_pre, context_cols_pre)
    post_only_details = _extract_lines(df_post, codes_post, only_post, context_cols_post)

    dup_pre_details = [{"code": str(k).replace("||", " + "), "count": int(v)}
                       for k, v in dup_pre_counts.items()][:50]
    dup_post_details = [{"code": str(k).replace("||", " + "), "count": int(v)}
                        for k, v in dup_post_counts.items()][:50]

    # Taux d'appariement (base sur les codes distincts)
    total_participants = len(set_pre | set_post)
    completion_rate = round(100 * n_pairs / total_participants, 1) \
        if total_participants > 0 else 0

    return {
        "summary": {
            "n_pre":              n_pre,
            "n_post":             n_post,
            "n_pre_with_code":    n_pre_with_code,
            "n_post_with_code":   n_post_with_code,
            "n_distinct_pre":     len(set_pre),
            "n_distinct_post":    len(set_post),
            "n_pairs_complete":   n_pairs,
            "n_pre_only":         len(only_pre),
            "n_post_only":        len(only_post),
            "n_dup_pre":          len(dup_pre_counts),
            "n_dup_post":         len(dup_post_counts),
            "completion_rate":    completion_rate,
        },
        "pre_only":   pre_only_details,
        "post_only":  post_only_details,
        "dup_pre":    dup_pre_details,
        "dup_post":   dup_post_details,
        "pre_label":  pre_label,
        "post_label": post_label,
    }