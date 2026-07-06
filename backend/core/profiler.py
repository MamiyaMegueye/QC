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
  - nombre d'observations

v3 (recommandations SISTA) :
  - Le typage "identifiant" est desormais STRICT : il exige un mot-cle
    explicite dans le nom (id, code, uuid, ref, identif). On ne classe
    plus en "identifiant" toute variable a 100% d'uniques (ex : commentaires
    texte libre etaient mal classes).
  - Ajout de apply_id_declaration() : permet a l'utilisateur de declarer
    explicitement la colonne identifiant unique (responsabilite SISTA).
    Toute autre colonne auto-detectee comme "identifiant" est alors
    retypee selon son contenu reel.
"""

import pandas as pd
import numpy as np
import re


VALID_TYPES = {"numérique", "catégorielle", "texte", "date", "identifiant", "vide"}

# Mots-cles strictement reconnus comme indicateurs d'identifiant.
# On utilise des separateurs explicites (debut, fin, _, -, espace) plutot
# que \b car en regex Python "_" est considere comme un caractere "word",
# ce qui empechait \buuid\b de matcher "uuid_kobo".
_ID_KEYWORDS = r"(?:id|ids|uuid|guid|ref|identif|identifier|identifiant|identifiants|code|codigo)"

# Pattern principal (insensible a la casse) : mot-cle entoure de separateurs
_ID_PATTERN_CI = re.compile(
    rf"(?:^|[_\-\s]){_ID_KEYWORDS}(?:$|[_\-\s])",
    re.IGNORECASE,
)
# Pattern CamelCase (sensible a la casse) :
#   - "IDmenage", "IDClient", "UUIDClient" -> matche ^ID + lettre suivante
#   - "menageID", "clientCode", "userRef"  -> matche minuscule + suffixe Pascal
# Note : ce pattern, combine au filtre d'unicite >=95%, evite les faux positifs
# comme "ideal" ou "identite" qui ne sont jamais 100% uniques en pratique.
_ID_PATTERN_CAMEL = re.compile(
    r"^(?:ID|UUID|GUID)[A-Za-z]"
    r"|[a-z](?:ID|UUID|GUID|Code|Ref)$"
)


def _is_id_name(name):
    """True si le nom de variable contient un mot-cle d'identifiant."""
    return bool(_ID_PATTERN_CI.search(name) or _ID_PATTERN_CAMEL.search(name))


# Expose ID_NAME_PATTERN pour la retrocompatibilite (utilise dans les tests)
ID_NAME_PATTERN = _ID_PATTERN_CI


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
    """
    Detecte le type d'une variable.

    Ordre des verifications :
      1. vide
      2. identifiant (STRICT : nom explicite + forte unicite)
      3. date
      4. numerique (vs categorielle si peu d'uniques)
      5. categorielle (peu d'uniques)
      6. texte (par defaut)
    """
    non_null = series.dropna()
    n = len(non_null)
    if n == 0:
        return "vide"

    uniques = non_null.astype(str).nunique()

    # Identifiant : on EXIGE le mot-cle explicite dans le nom
    # ET un taux d'unicite tres eleve (>=95%). On ne se fie plus a uniques==n seul
    # (un champ "commentaire" peut tres bien avoir 100% d'uniques sans etre un ID).
    # _is_id_name() couvre les deux conventions : "id_menage" (snake_case) ET
    # "IDmenage" (camelCase / PascalCase).
    if _is_id_name(str(name)) and uniques >= 0.95 * n:
        # Verifier que ce n'est pas un numerique pur (sinon, c'est plutot une mesure)
        _num, ratio = _try_numeric(non_null)
        if ratio < 0.95 or uniques == n:
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

    return _build_profile(variables, n_rows, df.shape[1])


def _build_profile(variables, n_rows, n_vars_raw):
    """Construit la structure {summary, variables} a partir d'une liste."""
    type_counts = {}
    for v in variables:
        type_counts[v["type"]] = type_counts.get(v["type"], 0) + 1

    total_cells = n_rows * n_vars_raw if n_vars_raw else 0
    filled_cells = sum(v["n_filled"] for v in variables)

    summary = {
        "n_rows": n_rows,
        "n_vars": len(variables),
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
#  Application des overrides utilisateur
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

    n_rows = profile["summary"]["n_rows"]
    return _build_profile(kept, n_rows, len(kept))


def apply_id_declaration(profile, declared_id_col):
    """
    Applique la declaration utilisateur de l'identifiant unique.

    Recommandation SISTA : la colonne identifiant doit etre choisie
    explicitement par l'equipe metier, jamais devinee aveuglement.

    Effets :
      - La (les) colonne(s) declaree(s) est/sont forcee(s) au type "identifiant"
      - Toute autre colonne auto-detectee comme "identifiant" est retypee
        selon son contenu (texte par defaut, numerique si pertinent)

    Args:
        profile          : profil {summary, variables}
        declared_id_col  : nom de la colonne identifiant (str)
                          OU liste de colonnes (list) pour un ID composite
                          OU "" / None si non declare

    Retourne le profil mis a jour.
    """
    if not declared_id_col:
        return profile

    # Normaliser : accepter str ou list
    if isinstance(declared_id_col, (list, tuple)):
        declared_cols = [str(c).strip() for c in declared_id_col if c and str(c).strip()]
    else:
        declared_cols = [str(declared_id_col).strip()]
    declared_cols = [c for c in declared_cols if c]

    if not declared_cols:
        return profile

    declared_set = set(declared_cols)
    found_count = 0

    for var in profile["variables"]:
        if var["name"] in declared_set:
            var["type"] = "identifiant"
            var["_id_declared"] = True
            # Marquer si l'ID est composite (info utile pour le rapport)
            if len(declared_cols) > 1:
                var["_id_composite"] = True
                var["_id_composite_cols"] = declared_cols
            var["stats"] = {}
            found_count += 1
        elif var["type"] == "identifiant":
            # Retyper : si les valeurs sont majoritairement numeriques -> "numerique"
            # sinon "texte" ou "categorielle" selon le nb d'uniques
            examples = var.get("examples", [])
            is_numeric_like = sum(
                1 for e in examples
                if str(e).replace(".", "").replace(",", "").replace("-", "").isdigit()
            ) >= max(1, len(examples) // 2)

            if is_numeric_like:
                var["type"] = "numérique"
            elif var["uniques"] <= max(20, 0.05 * max(var["n_filled"], 1)):
                var["type"] = "catégorielle"
            else:
                var["type"] = "texte"
            var["_id_retyped"] = True

    if found_count == 0:
        print(f"[apply_id_declaration] aucune des colonnes declarees {declared_cols} trouvee dans le profil")

    n_rows = profile["summary"]["n_rows"]
    return _build_profile(profile["variables"], n_rows, len(profile["variables"]))