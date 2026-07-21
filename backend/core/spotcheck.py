"""
spotcheck.py — Module specialise Spotcheck (Tekavoul, verifications ponctuelles).

Detecte automatiquement le format Spotcheck et fournit :
  - Bornes min/max par section (metier Tekavoul)
  - Fonction d'analyse a integrer dans qc_basic
  - Contexte enrichi pour ai_agent (regles metier fournies a Claude)
"""

import pandas as pd
import numpy as np
from datetime import datetime


# ============================================================
#  Constantes structurelles
# ============================================================

CORE_COLS_SPOTCHECK = {
    "id":          ["CODE"],
    "wilaya":      ["WILAYA"],
    "moughataa":   ["MOUGHATAA"],
    "commune":     ["COMMUNE"],
    "localite":    ["LOCALITE"],
    "superviseur": ["SUPERVISEUR", "SUPERVISOR"],
    "enqueteur":   ["ENQUETEUR", "ENUMERATOR", "AGENT"],
}

SECTION_TIMESTAMP_COLS = {
    "start": [f"DS{i}" for i in range(1, 6)],
    "end":   [f"FS{i}" for i in range(1, 6)],
}
SECTION_DURATION_COLS = [f"DUREES{i}" for i in range(1, 6)]

SECTION_LABELS = {
    1: "Identification & sociodemographie",
    2: "Paiement & transferts",
    3: "Utilisation du cash",
    4: "Inscription & connaissance du programme",
    5: "Reclamations & satisfaction",
}

# ============================================================
#  Bornes min/max par section (metier Tekavoul)
# En secondes. Bornes issues des percentiles P5/P95 observes.
# Une section HORS bornes signale un baclage OU une deviation.
# ============================================================
SECTION_DUREE_BORNES = {
    1: {"min": 20,  "max": 180, "cible": 60},   # Sociodemo : nom, sexe, tel
    2: {"min": 40,  "max": 360, "cible": 150},  # Paiement : le plus long
    3: {"min": 10,  "max": 180, "cible": 45},   # Cash : peut etre court (skip)
    4: {"min": 20,  "max": 240, "cible": 70},   # Inscription
    5: {"min": 15,  "max": 180, "cible": 55},   # Reclamations (souvent skip)
}


# ============================================================
#  Detection auto Spotcheck
# ============================================================

def is_spotcheck_format(columns):
    cols_upper = {str(c).upper().strip(): c for c in columns}

    matched_core = {}
    for key, candidates in CORE_COLS_SPOTCHECK.items():
        for cand in candidates:
            if cand in cols_upper:
                matched_core[key] = cols_upper[cand]
                break

    core_score = len(matched_core) / len(CORE_COLS_SPOTCHECK)

    n_ds = sum(1 for c in SECTION_TIMESTAMP_COLS["start"] if c in cols_upper)
    n_fs = sum(1 for c in SECTION_TIMESTAMP_COLS["end"] if c in cols_upper)
    n_dur = sum(1 for c in SECTION_DURATION_COLS if c in cols_upper)
    n_sections = min(n_ds, n_fs, n_dur)

    section_score = min(1.0, n_sections / 3)

    minimum_ok = (
        "id" in matched_core
        and "enqueteur" in matched_core
        and n_sections >= 2
    )

    confidence = core_score * 0.5 + section_score * 0.5

    return {
        "is_spotcheck": minimum_ok and confidence >= 0.5,
        "confidence": round(confidence, 2),
        "matched_core": matched_core,
        "n_sections": n_sections,
        "sections_available": list(range(1, n_sections + 1)),
    }


# ============================================================
#  Parsers
# ============================================================

def parse_duree_string(s):
    """Parse '00H 00M 43S' -> 43 secondes."""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return None
    try:
        s = str(s).strip()
        if "H" not in s or "M" not in s or "S" not in s:
            return None
        h = int(s.split("H")[0])
        m = int(s.split("H")[1].split("M")[0])
        sec = int(s.split("M")[1].split("S")[0])
        return h * 3600 + m * 60 + sec
    except (ValueError, IndexError):
        return None


def parse_ts_unix(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        n = float(v)
        if 1_577_836_800 <= n <= 1_893_456_000:
            return datetime.fromtimestamp(n)
    except (ValueError, TypeError):
        pass
    return None


# ============================================================
#  Fonctions helpers pour qc_basic et ai_agent
# ============================================================

def get_section_durations_series(df, n_sections):
    """Retourne un dict {section_num: Series de durees en secondes}."""
    result = {}
    for i in range(1, n_sections + 1):
        col = f"DUREES{i}"
        if col in df.columns:
            result[i] = df[col].apply(parse_duree_string)
    return result


def get_bornes(section_num):
    """Retourne (min_sec, max_sec, cible_sec) pour une section."""
    b = SECTION_DUREE_BORNES.get(section_num, {"min": 10, "max": 300, "cible": 60})
    return b["min"], b["max"], b["cible"]


def analyze_section_durations(df, detection_info):
    """Stats par section : moyennes, medianes, cas hors bornes."""
    sections = []
    if not detection_info.get("is_spotcheck"):
        return {"available": False, "sections": [], "total": None}

    n_sections = detection_info["n_sections"]
    duration_series = get_section_durations_series(df, n_sections)

    for i in range(1, n_sections + 1):
        if i not in duration_series:
            continue
        s = duration_series[i].dropna()
        n_manquants = duration_series[i].isna().sum()
        b_min, b_max, cible = get_bornes(i)

        if len(s) == 0:
            sections.append({
                "num": i,
                "label": SECTION_LABELS.get(i, f"Section {i}"),
                "n_valides": 0, "n_manquants": int(n_manquants),
                "moy_sec": 0, "med_sec": 0, "min_sec": 0, "max_sec": 0,
                "p25_sec": 0, "p75_sec": 0,
                "n_court": 0, "pct_court": 0.0,
                "n_long": 0, "pct_long": 0.0,
                "borne_min": b_min, "borne_max": b_max, "cible": cible,
            })
            continue

        n_court = int((s < b_min).sum())
        n_long = int((s > b_max).sum())

        sections.append({
            "num": i,
            "label": SECTION_LABELS.get(i, f"Section {i}"),
            "n_valides": int(len(s)),
            "n_manquants": int(n_manquants),
            "moy_sec": round(float(s.mean()), 1),
            "med_sec": round(float(s.median()), 1),
            "min_sec": round(float(s.min()), 1),
            "max_sec": round(float(s.max()), 1),
            "p25_sec": round(float(s.quantile(0.25)), 1),
            "p75_sec": round(float(s.quantile(0.75)), 1),
            "n_court": n_court, "pct_court": round(n_court / len(s) * 100, 1),
            "n_long": n_long, "pct_long": round(n_long / len(s) * 100, 1),
            "borne_min": b_min, "borne_max": b_max, "cible": cible,
        })

    # Duree totale = somme des sections
    total_series = pd.DataFrame(duration_series).sum(axis=1, min_count=1)
    valid = total_series.dropna()
    total_stats = None
    if len(valid) > 0:
        total_stats = {
            "n_valides": int(len(valid)),
            "moy_sec": round(float(valid.mean()), 1),
            "med_sec": round(float(valid.median()), 1),
            "min_sec": round(float(valid.min()), 1),
            "max_sec": round(float(valid.max()), 1),
            "moy_min": round(float(valid.mean()) / 60, 1),
            "med_min": round(float(valid.median()) / 60, 1),
        }

    return {"available": True, "sections": sections, "total": total_stats}


def check_section_coherence(df, detection_info):
    """Verifie DS_i < FS_i, chevauchements et pauses longues."""
    if not detection_info.get("is_spotcheck"):
        return {"available": False, "issues": []}

    n_sections = detection_info["n_sections"]
    counts = {"fin_avant_debut": 0, "chevauchement": 0, "pause_longue": 0}
    issues = []

    for idx in df.index:
        for i in range(1, n_sections + 1):
            ds = parse_ts_unix(df.at[idx, f"DS{i}"]) if f"DS{i}" in df.columns else None
            fs = parse_ts_unix(df.at[idx, f"FS{i}"]) if f"FS{i}" in df.columns else None

            if ds and fs and fs < ds:
                counts["fin_avant_debut"] += 1
                if len(issues) < 100:
                    issues.append({
                        "_index": int(idx) + 1, "type": "fin_avant_debut",
                        "section": i,
                        "_probleme": f"Section {i} : fin avant debut",
                    })

            if i < n_sections and f"DS{i+1}" in df.columns:
                ds_next = parse_ts_unix(df.at[idx, f"DS{i+1}"])
                if fs and ds_next and ds_next < fs:
                    counts["chevauchement"] += 1
                    if len(issues) < 100:
                        issues.append({
                            "_index": int(idx) + 1, "type": "chevauchement",
                            "section": i,
                            "_probleme": f"Chevauchement entre sections {i} et {i+1}",
                        })
                elif fs and ds_next:
                    pause_sec = (ds_next - fs).total_seconds()
                    if pause_sec > 300:
                        counts["pause_longue"] += 1
                        if len(issues) < 100:
                            issues.append({
                                "_index": int(idx) + 1, "type": "pause_longue",
                                "section": i,
                                "_probleme": f"Pause de {pause_sec/60:.1f} min entre {i} et {i+1}",
                            })

    return {"available": True, "counts": counts, "issues": issues}


def analyze_sections_by_enqueteur(df, detection_info):
    """Stats section par enqueteur : identifie qui bacle/deborde sur quelle section."""
    if not detection_info.get("is_spotcheck"):
        return []

    matched = detection_info.get("matched_core", {})
    enq_col = matched.get("enqueteur")
    if not enq_col or enq_col not in df.columns:
        return []

    n_sections = detection_info["n_sections"]
    df_work = df.copy()
    for i in range(1, n_sections + 1):
        col = f"DUREES{i}"
        if col in df.columns:
            df_work[f"_dur{i}_sec"] = df[col].apply(parse_duree_string)

    result = []
    for enq, grp in df_work.groupby(enq_col):
        row = {"enqueteur": str(enq), "n_interviews": len(grp), "sections": []}
        for i in range(1, n_sections + 1):
            col = f"_dur{i}_sec"
            if col not in grp.columns:
                continue
            s = grp[col].dropna()
            b_min, b_max, cible = get_bornes(i)
            if len(s) == 0:
                row["sections"].append({
                    "num": i, "label": SECTION_LABELS.get(i, f"Section {i}"),
                    "moy_sec": 0, "med_sec": 0,
                    "n_court": 0, "pct_court": 0,
                    "n_long": 0, "pct_long": 0,
                })
                continue
            n_court = int((s < b_min).sum())
            n_long = int((s > b_max).sum())
            row["sections"].append({
                "num": i, "label": SECTION_LABELS.get(i, f"Section {i}"),
                "moy_sec": round(float(s.mean()), 1),
                "med_sec": round(float(s.median()), 1),
                "n_court": n_court,
                "pct_court": round(n_court / len(s) * 100, 1),
                "n_long": n_long,
                "pct_long": round(n_long / len(s) * 100, 1),
            })
        result.append(row)

    result.sort(key=lambda r: -r["n_interviews"])
    return result


def extract_geography(df, detection_info):
    """Hierarchie Wilaya/Moughataa/Commune."""
    matched = detection_info.get("matched_core", {})
    n_total = len(df)
    if "wilaya" not in matched:
        return {"available": False}

    wcol = matched["wilaya"]
    mcol = matched.get("moughataa")
    ccol = matched.get("commune")

    wilayas = []
    for w_name, w_grp in df.groupby(wcol):
        if pd.isna(w_name):
            continue
        w_data = {
            "name": str(w_name),
            "n_menages": len(w_grp),
            "pct": round(len(w_grp) / n_total * 100, 1),
            "moughataas": [],
        }
        if mcol and mcol in df.columns:
            for m_name, m_grp in w_grp.groupby(mcol):
                if pd.isna(m_name):
                    continue
                m_data = {
                    "name": str(m_name),
                    "n_menages": len(m_grp),
                    "pct": round(len(m_grp) / n_total * 100, 1),
                    "communes": [],
                }
                if ccol and ccol in df.columns:
                    for c_name, c_grp in m_grp.groupby(ccol):
                        if pd.isna(c_name):
                            continue
                        m_data["communes"].append({
                            "name": str(c_name),
                            "n_menages": len(c_grp),
                            "pct": round(len(c_grp) / n_total * 100, 1),
                        })
                w_data["moughataas"].append(m_data)
        wilayas.append(w_data)

    return {"available": True, "wilayas": wilayas}


def analyze_spotcheck(df, columns=None):
    """Point d'entree principal."""
    if columns is None:
        columns = list(df.columns)

    detection = is_spotcheck_format(columns)
    if not detection["is_spotcheck"]:
        return {"available": False, "detection": detection}

    return {
        "available": True,
        "detection": detection,
        "durations": analyze_section_durations(df, detection),
        "coherence": check_section_coherence(df, detection),
        "by_enqueteur": analyze_sections_by_enqueteur(df, detection),
        "geography": extract_geography(df, detection),
    }


# ============================================================
#  Tests QC specifiques Spotcheck (a integrer dans qc_basic)
# ============================================================

def _get_enq_sup(row, mp):
    """Extrait enqueteur et superviseur d'une ligne."""
    enq_col = mp.get("enqueteur")
    sup_col = mp.get("superviseur")
    enq = "—"
    sup = "—"
    if enq_col and enq_col in row and pd.notna(row[enq_col]):
        enq = str(row[enq_col])
    if sup_col and sup_col in row and pd.notna(row[sup_col]):
        sup = str(row[sup_col])
    return enq, sup


def _make_test_result(test_id, titre, severite, pourquoi, cause, action, lignes, cols):
    """Construit un dict au meme format que qc_basic."""
    return {
        "test_id": test_id,
        "titre": titre,
        "severite": severite,
        "n_cas": len(lignes),
        "explication": {"pourquoi": pourquoi, "cause": cause, "action": action},
        "lignes": lignes[:200],
        "colonnes_display": cols,
    }


def run_spotcheck_tests(df, mp, detection_info=None):
    """Genere des tests QC specifiques Spotcheck au format qc_basic.

    A appeler depuis qc_basic.run_tests() apres les tests standards.
    Retourne [] si le fichier n'est pas un Spotcheck.
    """
    if detection_info is None:
        detection_info = is_spotcheck_format(df.columns)
    if not detection_info.get("is_spotcheck"):
        return []

    results = []
    n_sections = detection_info["n_sections"]
    duration_series = get_section_durations_series(df, n_sections)

    # Test 1 : sections trop COURTES (baclage possible)
    for i in range(1, n_sections + 1):
        if i not in duration_series:
            continue
        b_min, _, cible = get_bornes(i)
        label = SECTION_LABELS.get(i, f"Section {i}")
        s = duration_series[i]
        lignes = []
        for idx in df.index:
            dur = s.at[idx] if idx in s.index else None
            if dur is not None and dur < b_min:
                row = df.loc[idx]
                enq, sup = _get_enq_sup(row, mp)
                lignes.append({
                    "_index": int(idx) + 1,
                    "Section": f"S{i} - {label[:30]}",
                    "Duree (s)": int(dur),
                    "Seuil min (s)": b_min,
                    "Enqueteur": enq,
                    "_enqueteur": enq,
                    "_superviseur": sup,
                    "_probleme": f"Section {i} bacle : {int(dur)}s < {b_min}s",
                })
        if lignes:
            pct = len(lignes) / len(df) * 100
            sev = "high" if pct > 20 else "med" if pct > 10 else "low"
            results.append(_make_test_result(
                test_id=f"spotcheck_section{i}_court",
                titre=f"Section {i} bacle ({label})",
                severite=sev,
                pourquoi=f"Une section '{label}' de moins de {b_min}s est trop courte pour un vrai spotcheck.",
                cause="Enqueteur presse, questions sautees, ou reponses fabriquees.",
                action=f"Back check terrain pour ces {len(lignes)} interviews.",
                lignes=lignes,
                cols=["_index", "Section", "Duree (s)", "Seuil min (s)", "Enqueteur", "Probleme"],
            ))

    # Test 2 : sections trop LONGUES (deviation)
    for i in range(1, n_sections + 1):
        if i not in duration_series:
            continue
        _, b_max, cible = get_bornes(i)
        label = SECTION_LABELS.get(i, f"Section {i}")
        s = duration_series[i]
        lignes = []
        for idx in df.index:
            dur = s.at[idx] if idx in s.index else None
            if dur is not None and dur > b_max:
                row = df.loc[idx]
                enq, sup = _get_enq_sup(row, mp)
                lignes.append({
                    "_index": int(idx) + 1,
                    "Section": f"S{i} - {label[:30]}",
                    "Duree (s)": int(dur),
                    "Seuil max (s)": b_max,
                    "Enqueteur": enq,
                    "_enqueteur": enq,
                    "_superviseur": sup,
                    "_probleme": f"Section {i} anormalement longue : {int(dur)}s > {b_max}s",
                })
        if lignes:
            pct = len(lignes) / len(df) * 100
            sev = "high" if pct > 15 else "med" if pct > 5 else "low"
            results.append(_make_test_result(
                test_id=f"spotcheck_section{i}_long",
                titre=f"Section {i} anormalement longue ({label})",
                severite=sev,
                pourquoi=f"Une section '{label}' de plus de {b_max}s peut signaler un remplissage manuel apres coup.",
                cause="Enqueteur bavarde hors sujet, prend des notes manuellement, ou remplit apres l'entretien.",
                action="Verifier avec le superviseur si l'enqueteur a un comportement anormal.",
                lignes=lignes,
                cols=["_index", "Section", "Duree (s)", "Seuil max (s)", "Enqueteur", "Probleme"],
            ))

    # Test 3 : coherence chronologique
    coh_result = check_section_coherence(df, detection_info)
    if coh_result["available"] and coh_result["issues"]:
        for type_key, titre_test in [
            ("fin_avant_debut", "Fin de section avant son debut"),
            ("chevauchement", "Chevauchement entre 2 sections"),
            ("pause_longue", "Pause de plus de 5 min entre sections"),
        ]:
            filtered = [i for i in coh_result["issues"] if i["type"] == type_key]
            if not filtered:
                continue
            lignes = []
            for issue in filtered:
                idx = issue["_index"] - 1
                if idx in df.index:
                    row = df.loc[idx]
                    enq, sup = _get_enq_sup(row, mp)
                else:
                    enq, sup = "—", "—"
                lignes.append({
                    "_index": issue["_index"],
                    "Section": issue["section"],
                    "Enqueteur": enq,
                    "_enqueteur": enq,
                    "_superviseur": sup,
                    "_probleme": issue["_probleme"],
                })
            sev = "high" if type_key == "fin_avant_debut" else "med"
            results.append(_make_test_result(
                test_id=f"spotcheck_coherence_{type_key}",
                titre=titre_test,
                severite=sev,
                pourquoi="Les timestamps DS/FS des sections doivent respecter l'ordre chronologique.",
                cause="Bug de collecte, saisie manuelle apres coup, ou manipulation des donnees.",
                action="Verifier avec l'equipe technique et repasser les questionnaires concernes.",
                lignes=lignes,
                cols=["_index", "Section", "Enqueteur", "Probleme"],
            ))

    return results


def build_ai_context_from_spotcheck(spotcheck_info):
    """Genere un texte de contexte pour Claude quand le fichier est Spotcheck.

    Ce texte est ajoute au system prompt de generation de regles.
    Il donne a l'IA :
      - Le contexte metier (Tekavoul, PASyFiS II, sections attendues)
      - Les bornes min/max par section (regles deterministes)
      - Des exemples de patterns a chercher au-dela des bornes
    """
    if not spotcheck_info.get("available"):
        return None

    n_sec = spotcheck_info["detection"]["n_sections"]

    bornes_txt = "\n".join([
        f"  - Section {i} ({SECTION_LABELS.get(i, f'Section {i}')}) : "
        f"duree attendue entre {SECTION_DUREE_BORNES[i]['min']}s et "
        f"{SECTION_DUREE_BORNES[i]['max']}s (cible ~{SECTION_DUREE_BORNES[i]['cible']}s)"
        for i in range(1, n_sec + 1)
    ])

    context = f"""
==========================================================
CONTEXTE METIER : ENQUETE SPOTCHECK TEKAVOUL DETECTEE
==========================================================

Ce fichier est un Spotcheck du programme Tekavoul (transferts sociaux
monetaires Mauritanie, PASyFiS II, Banque Mondiale / Taazour). Le
questionnaire est structure en {n_sec} sections :

{bornes_txt}

Les colonnes DUREES1 a DUREES{n_sec} donnent la duree de chaque section
au format "00H 00M 43S". Les colonnes DS1..DS{n_sec} et FS1..FS{n_sec}
sont les timestamps Unix de debut et fin de chaque section.

REGLES DETERMINISTES DEJA APPLIQUEES (dans qc_basic) :
  - Duree section < borne_min = interview baclee ou fabriquee
  - Duree section > borne_max = enqueteur devie du questionnaire
  - FS_i < DS_i = erreur de saisie chronologique
  - DS_{{i+1}} < FS_i = chevauchement suspect

TES REGLES DOIVENT ALLER PLUS LOIN :
1. Reperer les PATTERNS d'un enqueteur qui bacle une section precise
   (ex : ENQ 097 systematiquement court sur DUREES2 = risque de fraude
   sur la verification du paiement cash).
2. Croiser les incoherences ENTRE sections (ex : Section 2 dit oui au
   paiement mais Section 3 dit rien recu = incoherence de reponses).
3. Croiser durees et zones geographiques (ex : durees anormalement
   courtes dans une Wilaya specifique).
4. Detecter les valeurs manquantes non-legitimes dans une section
   (ex : questions II.1 manquantes alors que la section a bien ete
   parcourue).
5. Reperer les enqueteurs qui depassent la borne max sur plusieurs
   sections = risque de remplissage manuel apres coup.

Genere des regles CROISEES et EXPLICATIVES, pas juste des bornes de
duree (qui sont deja couvertes par qc_basic).
==========================================================
"""
    return context