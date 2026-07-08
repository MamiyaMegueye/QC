"""
core/ai_agent.py - Agent IA multi-API pour SISTA QC

Deux fournisseurs supportes :
  - api1 : Claude (Anthropic)
  - api2 : Groq (Llama 3.3 70B)

Strategies :
  - Decoupage automatique si le fichier a beaucoup de colonnes (>80)
  - Echantillonnage des lignes pour le profilage IA (200 lignes max)
  - Fusion des regles generees par lots
  - Gestion des rate limits avec pause automatique
  - Filtre post-generation des regles aberrantes (faux positifs typiques)

v2 : renforcement du prompt systeme (entites distinctes) + filtre
     anti-regles aberrantes (ex : deviner sexe a partir du nom enqueteur)
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

import pandas as pd

# ----------------------------------------------------------------------
#  Configuration des APIs
# ----------------------------------------------------------------------

MAX_COLS_PER_BATCH = 60
MAX_ROWS_FOR_SAMPLING = 200
TPM_LIMIT_GROQ = 11000

API_CONFIG = {
    "api1": {
        "model_fast":  "claude-haiku-4-5",
        "model_smart": "claude-opus-4-6",   # ← changé ici
        "key_prefix":  "sk-ant-",
    },
    "api2": {
        "model_fast":  "llama-3.1-8b-instant",
        "model_smart": "llama-3.3-70b-versatile",
        "key_prefix":  "gsk_",
    },
}


# ----------------------------------------------------------------------
#  Helpers
# ----------------------------------------------------------------------

def _extract_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = min((text.find(c) for c in "{[" if text.find(c) >= 0), default=-1)
    end = max(text.rfind("}"), text.rfind("]"))
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


def _estimate_tokens(text: str) -> int:
    return len(text) // 4


def _extract_columns_from_expression(expr: str) -> list:
    pattern = r"""df\[['"]([^'"]+)['"]\]"""
    return list(set(re.findall(pattern, expr)))


def _validate_key(api: str, api_key: str):
    if api not in API_CONFIG:
        raise ValueError("API inconnue")
    prefix = API_CONFIG[api]["key_prefix"]
    if not api_key or not api_key.startswith(prefix):
        raise ValueError("Cle API invalide")


# ----------------------------------------------------------------------
#  Appel unifie aux 2 APIs
# ----------------------------------------------------------------------

def _call_llm(api: str, api_key: str, model: str,
              system_prompt: str, user_prompt: str,
              max_tokens: int = 4096) -> dict:
    _validate_key(api, api_key)
    t0 = time.time()

    if api == "api1":
        from anthropic import Anthropic
        client = Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=[{
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"}
            }],
            messages=[{"role": "user", "content": user_prompt}]
        )
        text = resp.content[0].text
        in_tokens = resp.usage.input_tokens
        out_tokens = resp.usage.output_tokens

    elif api == "api2":
        from groq import Groq
        client = Groq(api_key=api_key)
        resp = client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        text = resp.choices[0].message.content
        in_tokens = resp.usage.prompt_tokens
        out_tokens = resp.usage.completion_tokens

    return {
        "text": text,
        "duration": round(time.time() - t0, 2),
        "input_tokens": in_tokens,
        "output_tokens": out_tokens,
    }


def _call_with_retry(api: str, api_key: str, model: str,
                     system_prompt: str, user_prompt: str,
                     max_tokens: int = 4096,
                     max_retries: int = 2) -> dict:
    for attempt in range(max_retries + 1):
        try:
            return _call_llm(api, api_key, model, system_prompt, user_prompt, max_tokens)
        except Exception as e:
            err = str(e).lower()
            if any(k in err for k in ["429", "rate", "tpm", "quota", "limit"]):
                if attempt < max_retries:
                    wait = 60
                    print(f"Rate limit atteint, pause {wait}s...")
                    time.sleep(wait)
                    continue
            raise


# ----------------------------------------------------------------------
#  Strategie de decoupage des variables
# ----------------------------------------------------------------------

def _filter_relevant_vars(variables: list, mp: dict = None,
                          max_vars: int = 120) -> list:
    """Filtre et plafonne les variables envoyees a l'IA pour le QC intelligent.

    Strategie (v2 - optimisation perf pour gros fichiers) :
      1. Exclure les metadonnees techniques (Kobo, ODK, identifiants systeme)
      2. Exclure les variables tres peu remplies (<10%) ou constantes
      3. Exclure les colonnes-cles techniques declarees (id, start, end, lat, lon)
         MAIS GARDER la colonne enqueteur (utile pour anomalies par agent)
      4. Plafonner a max_vars variables (les plus remplies en priorite)

    Pour un fichier de 375 colonnes, on passe typiquement de 375 -> ~100,
    soit 2 lots IA au lieu de 5+ (gain de ~60% sur le temps de generation).
    """
    # Patterns techniques a exclure (alignes sur analytical_report)
    SKIP_PREFIXES = ("__", "_")
    SKIP_PATTERNS = (
        # Metadonnees Kobo / ODK / XLSForm
        "_uuid", "_submission_time", "_validation_status",
        "_attachments", "_geolocation", "_tags", "_notes",
        "__version__", "formhub/", "_xform_id", "meta/", "_index",
        # Identifiants techniques
        "uuid", "guid", "session_id", "deviceid", "subscriberid",
        "simserial", "imei", "device_id", "serial_number",
        # GPS (deja filtres via mp si declares)
        "latitude", "longitude", "altitude", "geopoint", "geoshape",
        "_lat", "_lon", "_lng", "_coord",
        # Contacts personnels (donnees sensibles, pas exploitables)
        "telephone", "_phone", "tel_", "numero_tel", "mobile",
        "email", "courriel", "adresse_email",
        # Champs libres trop ouverts
        "commentaire", "comments", "remarque", "remark",
        "observation_libre", "autres_precise", "autre_precis",
        # Identite (RGPD)
        "nom_complet", "first_name", "last_name", "prenom",
        "nom_repondant", "nom_chef",
    )
    SKIP_EXACT = {"start", "end", "today", "starttime", "endtime",
                  "username", "audit"}

    # Colonnes-cles techniques declarees par l'utilisateur a EXCLURE
    # (sauf enqueteur qu'on garde car utile pour anomalies par agent)
    excluded_keys = set()
    if mp:
        for k in ("id", "start", "end", "lat", "lon"):
            v = mp.get(k)
            if v:
                excluded_keys.add(v)

    filtered = []
    for v in variables:
        name = v["name"]
        name_lower = name.lower()
        # Exclusions strictes
        if name in excluded_keys:
            continue
        if any(name_lower.startswith(p) for p in SKIP_PREFIXES):
            continue
        if any(p in name_lower for p in SKIP_PATTERNS):
            continue
        if name_lower in SKIP_EXACT:
            continue
        # Qualite minimale (relevee de 5% a 10%)
        if v["fill_rate"] < 10:
            continue
        if v["uniques"] <= 1:
            continue
        # Type non analysable
        if v.get("type") in ("identifiant", "date", "vide"):
            continue
        filtered.append(v)

    # Cap absolu : on garde les plus remplies en priorite
    if len(filtered) > max_vars:
        filtered = sorted(filtered, key=lambda v: -v["fill_rate"])[:max_vars]

    return filtered


def _split_variables_into_batches(variables: list, batch_size: int = MAX_COLS_PER_BATCH) -> list:
    if len(variables) <= batch_size:
        return [variables]
    sorted_vars = sorted(variables, key=lambda v: -v["fill_rate"])
    batches = []
    for i in range(0, len(sorted_vars), batch_size):
        batches.append(sorted_vars[i:i + batch_size])
    return batches


# ----------------------------------------------------------------------
#  TACHE PRINCIPALE - Generation des regles QC (avec decoupage)
# ----------------------------------------------------------------------

SYSTEM_RULES = """Tu es un expert senior en controle qualite d'enquetes (humanitaires, \
bancaires, marketing, sante, education, etc.). Tu connais les standards internationaux \
HCR/UNHCR, World Bank LSMS, Kobo/ODK, et les bonnes pratiques sectorielles.

## TA MISSION
Generer des regles de coherence logique EXHAUSTIVES en Python pandas, executables \
sur un DataFrame `df`. Cible : detecter le MAXIMUM d'incoherences plausibles, \
SANS produire de faux positifs.

## REGLE D'OR
Si l'utilisateur fournit des CRITERES D'ELIGIBILITE, tu DOIS generer une regle pandas \
pour CHAQUE critere mentionne. Ne saute aucun critere. Si 10 criteres sont listes, \
tu generes au minimum 10 regles correspondantes.

## ENTITES DISTINCTES - REGLE CAPITALE
Dans un fichier d'enquete, il y a TOUJOURS plusieurs entites distinctes :
  - L'ENQUETEUR (la personne qui collecte la donnee) : colonnes comme \
    EnuName, Enqueteur, Interviewer, Agent_Name, Surveyor, etc.
  - Le REPONDANT ou MENAGE (la personne interviewee) : age, sexe, education, \
    revenu, satisfaction, etc.
  - Eventuellement : APPELANT/RECEVEUR, EMPLOYE/CLIENT, MERE/ENFANT, etc.

**INTERDICTIONS ABSOLUES** :
- Tu ne dois JAMAIS creer une regle qui compare un attribut de l'ENQUETEUR \
  (nom, ID, code) avec un attribut du REPONDANT (sexe, age, revenu, etc.).
  Ce sont deux personnes differentes. Une enquetrice femme peut interviewer un \
  homme, c'est NORMAL et MASSIVEMENT le cas reel.
- Tu ne dois JAMAIS deviner le sexe ou l'origine d'une personne a partir de son \
  nom (ex : "Ould", "Mint", "Ben", "Mme", "M.") - c'est biaise et peu fiable.
- Tu ne dois JAMAIS comparer le nom du repondant avec son sexe / son age.

Si tu identifies une colonne comme etant le NOM D'ENQUETEUR, tu peux SEULEMENT :
- L'utiliser pour identifier qui a saisi la ligne (sortie informationnelle)
- Detecter des anomalies SUR son travail (ex : meme enqueteur >30 observations/jour, \
  ses durees toutes identiques, doublons dans ses GPS)
Mais JAMAIS de croisement avec les attributs personnels du repondant.

## CHAQUE REGLE DOIT AVOIR
1. Description courte en francais (precise, pas vague)
2. Expression pandas qui retourne une Series booleenne (True = probleme detecte)
3. Pourquoi / Cause / Action (1 phrase chacune)

## TYPES D'INCOHERENCES A CHERCHER SYSTEMATIQUEMENT
A. **Valeurs hors plages** : age > 120, age < 18 si critere, NPS > 10, scores > max
B. **Croisements logiques INTRA-REPONDANT** : NPS=10 mais "ne recommanderait pas", \
   satisfaction=1 mais NPS=10
C. **Dates impossibles** : date dans le futur, fin < debut, naissance > aujourd'hui
D. **Mathematiques impossibles** : anciennete > age, nb_enfants > nb_personnes
E. **Doublons** : id_client en double via df.duplicated()
F. **Durees anormales** : entretien < 10 min ou > 90 min
G. **Logique metier** : compte premium avec revenu < seuil, mineur avec compte seul
H. **Skip patterns** : si reponse X='Non', alors Y doit etre vide ; si X='Oui', \
   alors Y doit etre rempli

## EXEMPLES D'EXPRESSIONS PANDAS CORRECTES
- Age hors plage : `(df['age'] < 18) | (df['age'] > 120)`
- NPS incoherent avec recommandation : `(df['nps_score'] >= 9) & (df['recommanderait_banque'] == 'Non')`
- Anciennete vs age : `df['anciennete_annees'] > (df['age'] - 18)`
- Doublons id : `df.duplicated(subset=['id_client'], keep=False)`
- Date dans le futur : `pd.to_datetime(df['date_entretien'], errors='coerce') > pd.Timestamp.now()`
- Fin avant debut : `pd.to_datetime(df['heure_fin'], errors='coerce') < pd.to_datetime(df['heure_debut'], errors='coerce')`
- Compte premium revenu faible : `(df['type_compte'] == 'Compte premium') & (df['revenu_mensuel_MRU'] < 100000)`
- Skip pattern : `(df['a_des_enfants'] == 'Non') & df['nombre_enfants'].notna() & (df['nombre_enfants'] > 0)`

## EXEMPLES DE REGLES A NE JAMAIS GENERER (anti-patterns)
- `df['EnuName'].str.contains('Fatima') & (df['sexe'] == 'M')` => INTERDIT (croise enqueteur/repondant)
- `df['nom'].str.contains('Ould') & (df['sexe'] == 'F')` => INTERDIT (devine sexe via nom)
- `df['Enqueteur'] & df['age_repondant']` => INTERDIT (croise enqueteur/age repondant)

## IMPORTANT - REGLES STRICTES
1. Utilise UNIQUEMENT les noms de colonnes EXACTS fournis (sensible a la casse)
2. JAMAIS de regle triviale (vide / non vide simple) - SAUF si la colonne est requise
3. Privilegie les CROISEMENTS entre variables DU MEME REPONDANT (pas enqueteur x repondant)
4. Pas d'import - juste `df` et `pd` (pandas)
5. Genere ENTRE 10 ET 20 regles (objectif : couvrir tous les criteres)
6. Reponds UNIQUEMENT en JSON valide, sans markdown autour."""


def _build_user_prompt(variables_batch: list,
                        survey_type: str,
                        survey_description: str,
                        dict_extract: str,
                        survey_population: str = "",
                        survey_eligibility: str = "",
                        form_content: str = "",
                        sample_rows: list = None,
                        batch_info: str = "",
                        enqueteur_col_hint: str = "") -> str:
    """Construit le prompt utilisateur avec le contexte enrichi."""
    context_parts = []

    if survey_type:
        context_parts.append(f"### Type d'enquete\n{survey_type}")
    if survey_description:
        context_parts.append(f"### Description et objectifs\n{survey_description[:800]}")
    if survey_population:
        context_parts.append(f"### Population cible\n{survey_population[:500]}")
    if survey_eligibility:
        context_parts.append(
            f"### Criteres d'eligibilite (a faire respecter par les regles)\n"
            f"{survey_eligibility[:800]}"
        )
    if dict_extract:
        context_parts.append(f"### Dictionnaire des variables (extrait)\n{dict_extract[:2000]}")
    if form_content:
        context_parts.append(
            f"### Questionnaire / Formulaire Kobo (extrait)\n"
            f"Utilise les contraintes et skip patterns de ce formulaire pour generer les regles.\n"
            f"{form_content[:3000]}"
        )
    if enqueteur_col_hint:
        context_parts.append(
            f"### ATTENTION - Colonne identifiee comme NOM ENQUETEUR\n"
            f"La colonne `{enqueteur_col_hint}` contient le nom de l'enqueteur (la personne qui\n"
            f"COLLECTE la donnee, PAS le repondant interviewe).\n"
            f"INTERDICTION : tu ne dois generer AUCUNE regle qui compare `{enqueteur_col_hint}`\n"
            f"avec un attribut personnel du repondant (sexe, age, revenu, education, etc.).\n"
            f"Une enquetrice peut tres bien interviewer un homme, c'est NORMAL."
        )
    if batch_info:
        context_parts.append(batch_info)

    context = "\n\n".join(context_parts) if context_parts else "Enquete generique sans contexte fourni."

    vars_compact = []
    for v in variables_batch:
        entry = {
            "name": v["name"],
            "label": v["label"][:100],
            "type": v["type"],
            "fill_rate": v["fill_rate"],
            "uniques": v["uniques"],
            "examples": [str(e)[:30] for e in v["examples"][:3]],
        }
        vars_compact.append(entry)

    prompt = f"""{context}

### Variables a analyser ({len(vars_compact)})
{json.dumps(vars_compact, ensure_ascii=False, indent=2)}
"""

    if sample_rows is not None and len(sample_rows) > 0:
        prompt += f"\n### Echantillon de {len(sample_rows)} lignes (valeurs reelles)\n"
        prompt += json.dumps(sample_rows[:5], ensure_ascii=False, default=str)[:1500]

    prompt += """

### TA MISSION (lis attentivement)

Genere ENTRE 10 ET 20 regles de coherence logique TRES PRECISES.

**Etapes obligatoires** :
1. Si des CRITERES D'ELIGIBILITE sont listes ci-dessus, transforme CHACUN en une regle pandas.
   Exemple : critere "Age minimum 18 ans" devient `df['age'] < 18`.
2. Ajoute des regles supplementaires pour les types d'incoherences A a H du systeme.
3. Croise les variables entre elles autant que possible, MAIS UNIQUEMENT au sein
   d'une meme entite (le repondant). JAMAIS enqueteur x repondant.
4. Verifie que CHAQUE expression utilise des noms de colonnes EXACTS de la liste fournie.

**Format de reponse strict (JSON uniquement, sans markdown)** :
{
  "commentaire": "Synthese de 2 phrases : ce que tu observes + nombre de regles generees.",
  "regles": [
    {
      "description": "Description courte et precise en francais",
      "expression": "Expression pandas Series booleenne ou True=PROBLEME detecte",
      "pourquoi": "Pourquoi c'est un probleme (1 phrase)",
      "cause": "Cause probable sur le terrain (1 phrase)",
      "action": "Action corrective recommandee (1 phrase)"
    }
  ]
}

**Rappel** : moins de 10 regles = mission non remplie. Vise 12 a 18 regles."""
    return prompt


# ----------------------------------------------------------------------
#  Filtre post-generation : anti-regles aberrantes
# ----------------------------------------------------------------------

def _is_bad_rule(rule: dict, mp: dict) -> tuple:
    """
    Detecte les regles aberrantes (faux positifs typiques).
    Conservateur : ne filtre que les cas clairement problematiques.
    Renvoie (is_bad, raison_de_filtrage).
    """
    expr = rule.get("expression", "")
    expr_low = expr.lower()
    desc_low = rule.get("description", "").lower()
    enq_col = (mp.get("enqueteur") or "") if mp else ""
    cols_in_rule = _extract_columns_from_expression(expr)

    # 1. Croisement enqueteur x sexe/genre du repondant (le cas observe)
    sex_keywords = ("sexe", "genre", "gender", " sex")
    if enq_col and enq_col in cols_in_rule:
        if any(k in expr_low for k in sex_keywords):
            return True, f"Croise nom enqueteur ({enq_col}) avec sexe/genre du repondant"
        if any(k in desc_low for k in ("nom", "name", "prenom")) and \
           any(k in desc_low for k in sex_keywords):
            return True, "Description suggere croisement nom/sexe"

    # 2. Pattern explicite : devine le sexe via particules de nom
    name_particles = ("ould", "mint", "bint", " ben ", " bin ", "mme.", "mr.", "m.")
    if "str.contains" in expr_low:
        if any(p in expr_low for p in name_particles):
            if any(k in expr_low for k in sex_keywords):
                return True, "Devine sexe via particule de nom (Ould/Mint/Ben...)"

    # 3. Croisement enqueteur x attribut personnel du repondant
    if enq_col and enq_col in cols_in_rule:
        personal_attrs = ("age", "education", "_edu", "marital", "marit_",
                          "revenu", "income", "naissance", "birth",
                          "scolar", "diplome")
        for col in cols_in_rule:
            if col == enq_col:
                continue
            col_low = col.lower()
            if any(a in col_low for a in personal_attrs):
                return True, f"Croise enqueteur avec attribut perso repondant ({col})"

    return False, None


def _validate_rules(rules: list, mp: dict, progress_callback=None) -> tuple:
    """
    Filtre les regles aberrantes. Renvoie (regles_valides, regles_filtrees).
    """
    valid = []
    filtered = []
    for rule in rules:
        is_bad, reason = _is_bad_rule(rule, mp)
        if is_bad:
            rule_filtered = dict(rule)
            rule_filtered["_filtered_reason"] = reason
            filtered.append(rule_filtered)
            if progress_callback:
                progress_callback(
                    f"Regle filtree : {rule.get('description', '?')[:60]} -> {reason}"
                )
        else:
            valid.append(rule)
    return valid, filtered


# ----------------------------------------------------------------------
#  Generation des regles (orchestrateur)
# ----------------------------------------------------------------------

def generate_rules(api: str,
                   api_key: str,
                   profile: dict,
                   var_labels: dict,
                   value_labels: dict,
                   survey_type: str = "",
                   survey_description: str = "",
                   survey_population: str = "",
                   survey_eligibility: str = "",
                   form_content: str = "",
                   df: pd.DataFrame = None,
                   progress_callback=None,
                   mp: dict = None) -> tuple:
    """
    Genere les regles QC avec decoupage automatique si necessaire.

    Args:
        api : 'api1' (Claude) ou 'api2' (Groq)
        api_key : cle d'acces
        profile : profil du dataset
        var_labels, value_labels : libelles
        survey_* : contexte enquete
        form_content : questionnaire Kobo
        df : DataFrame pour echantillonnage
        progress_callback : feedback de progression
        mp : mapping des colonnes-cles (pour le hint enqueteur + filtre)

    Retourne (regles_fusionnees, commentaire_global, metriques).
    """
    # 1. Filtrer les variables pertinentes (avec mp pour exclure les techniques)
    all_vars = _filter_relevant_vars(profile["variables"], mp=mp, max_vars=120)
    n_initial = len(profile["variables"])
    n_filtered = len(all_vars)
    if progress_callback:
        progress_callback(
            f"Variables pertinentes : {n_filtered} retenues sur {n_initial} "
            f"({n_initial - n_filtered} ecartees : metadonnees techniques / "
            f"variables trop peu remplies)"
        )

    # 2. Construire l'extrait du dictionnaire si disponible
    dict_extract = ""
    if value_labels:
        lines = []
        for col, modalities in list(value_labels.items())[:20]:
            mod_str = ", ".join(f"{k}={v}" for k, v in list(modalities.items())[:5])
            lines.append(f"  {col} : {mod_str}")
        dict_extract = "\n".join(lines)

    # Hint sur la colonne enqueteur
    enqueteur_col_hint = (mp or {}).get("enqueteur") or ""

    # 3. Echantillonner des lignes pour donner du contexte
    sample_rows = None
    if df is not None and len(df) > 0:
        sample_size = min(MAX_ROWS_FOR_SAMPLING, len(df))
        sample_df = df.sample(n=sample_size, random_state=42) if len(df) > sample_size else df
        sample_rows = sample_df.head(5).to_dict(orient="records")

    # 4. Decouper en lots
    batches = _split_variables_into_batches(all_vars)
    n_batches = len(batches)

    if progress_callback:
        # Estimation : ~30-60s par lot selon le modele et la taille
        est_min = max(1, n_batches // 2)
        est_max = n_batches * 2
        progress_callback(
            f"Decoupage en {n_batches} lot(s) de regles a generer "
            f"(duree estimee : {est_min}-{est_max} minutes)"
        )

    # 5. Appeler l'IA pour chaque lot
    all_rules = []
    all_comments = []
    total_in_tokens = 0
    total_out_tokens = 0
    total_duration = 0.0
    model = API_CONFIG[api]["model_smart"]

    for idx, batch in enumerate(batches, 1):
        if progress_callback:
            progress_callback(f"Generation regles - lot {idx}/{n_batches} ({len(batch)} variables)")

        batch_info = (f"Lot {idx}/{n_batches} de variables. "
                      f"Concentre-toi sur les variables de ce lot uniquement.") if n_batches > 1 else ""

        user_prompt = _build_user_prompt(
            batch, survey_type, survey_description, dict_extract,
            survey_population=survey_population,
            survey_eligibility=survey_eligibility,
            form_content=form_content,
            sample_rows=sample_rows if idx == 1 else None,
            batch_info=batch_info,
            enqueteur_col_hint=enqueteur_col_hint,
        )

        estimated = _estimate_tokens(SYSTEM_RULES + user_prompt)
        if api == "api2" and estimated > TPM_LIMIT_GROQ:
            user_prompt = _build_user_prompt(
                batch, survey_type, survey_description, dict_extract,
                survey_population=survey_population,
                survey_eligibility=survey_eligibility,
                form_content=form_content,
                sample_rows=None,
                batch_info=batch_info,
                enqueteur_col_hint=enqueteur_col_hint,
            )
            estimated = _estimate_tokens(SYSTEM_RULES + user_prompt)

        if api == "api2" and estimated > TPM_LIMIT_GROQ:
            user_prompt = _build_user_prompt(
                batch, survey_type, survey_description, dict_extract,
                survey_population=survey_population,
                survey_eligibility=survey_eligibility,
                form_content="",
                sample_rows=None,
                batch_info=batch_info,
                enqueteur_col_hint=enqueteur_col_hint,
            )

        try:
            result = _call_with_retry(api, api_key, model,
                                       SYSTEM_RULES, user_prompt, max_tokens=6000)
            data = _extract_json(result["text"])
            batch_rules = data.get("regles", [])
            batch_comment = data.get("commentaire", "")

            all_rules.extend(batch_rules)
            if batch_comment:
                all_comments.append(batch_comment)

            total_in_tokens += result["input_tokens"]
            total_out_tokens += result["output_tokens"]
            total_duration += result["duration"]

            if api == "api2" and idx < n_batches:
                time.sleep(2)

        except Exception as e:
            if progress_callback:
                progress_callback(f"Lot {idx} echoue : {e}")
            continue

    # 6. Dedupliquer les regles
    seen_descs = set()
    unique_rules = []
    for r in all_rules:
        desc = r.get("description", "").strip().lower()
        if desc and desc not in seen_descs:
            seen_descs.add(desc)
            unique_rules.append(r)

    # 7. FILTRE POST-GENERATION : retirer les regles aberrantes
    valid_rules, filtered_rules = _validate_rules(unique_rules, mp, progress_callback)
    if filtered_rules and progress_callback:
        progress_callback(
            f"{len(filtered_rules)} regle(s) filtree(s) automatiquement "
            f"(faux positifs evites)"
        )

    global_comment = " ".join(all_comments)[:600] if all_comments else ""

    metrics = {
        "model": model,
        "duration": round(total_duration, 2),
        "input_tokens": total_in_tokens,
        "output_tokens": total_out_tokens,
        "n_rules": len(valid_rules),
        "n_rules_filtered": len(filtered_rules),
        "n_batches": n_batches,
        "n_vars_analysed": len(all_vars),
        "filtered_rules": [
            {"description": r.get("description", ""),
             "reason": r.get("_filtered_reason", "")}
            for r in filtered_rules
        ],
    }

    return valid_rules, global_comment, metrics


# ----------------------------------------------------------------------
#  Execution des regles (Pandas pur, sur 100% du fichier)
# ----------------------------------------------------------------------

def run_rules(df: pd.DataFrame, rules: list, mp: dict) -> dict:
    """Execute les regles sur le DataFrame complet."""
    rows_out = []
    enqueteur_col = mp.get("enqueteur")
    cas_par_regle = {}

    for rule_idx, rule in enumerate(rules):
        try:
            mask = eval(rule["expression"], {"df": df, "pd": pd}, {})
            if not isinstance(mask, pd.Series):
                continue

            problem_idx = df.index[mask.fillna(False)].tolist()
            cols_in_rule = _extract_columns_from_expression(rule["expression"])
            n_cas = len(problem_idx)
            cas_par_regle[rule_idx] = n_cas

            if n_cas > 10:
                severite = "high"
            elif n_cas > 3:
                severite = "med"
            else:
                severite = "low"

            for idx in problem_idx:
                valeurs = {}
                for col in cols_in_rule:
                    if col in df.columns:
                        val = df.loc[idx, col]
                        valeurs[col] = (str(val) if pd.notna(val) else "(vide)")

                row = {
                    "_index": int(idx),
                    "_severite": severite,
                    "_rule_idx": rule_idx,
                    "Enqueteur": (str(df.loc[idx, enqueteur_col])
                                  if enqueteur_col and enqueteur_col in df.columns
                                  else "Inconnu"),
                    "Regle": rule["description"],
                    "Colonnes_concernees": ", ".join(cols_in_rule),
                    "Valeurs": " | ".join(f"{k}={v}" for k, v in valeurs.items()),
                    "_valeurs_dict": valeurs,
                    "_pourquoi": rule.get("pourquoi", ""),
                    "_cause": rule.get("cause", ""),
                    "_action": rule.get("action", ""),
                    "_probleme": rule["description"],
                }
                rows_out.append(row)
        except Exception as e:
            print(f"Regle ignoree ({rule.get('description', '?')}) : {e}")
            continue

    order = {"high": 0, "med": 1, "low": 2}
    rows_out.sort(key=lambda r: (order.get(r["_severite"], 9), r["Enqueteur"]))

    severite_globale = "high" if len(rows_out) > 10 else ("med" if len(rows_out) > 0 else "ok")

    return {
        "titre": "Incoherences logiques detectees par IA",
        "severite": severite_globale,
        "n_cas": len(rows_out),
        "lignes": rows_out,
        "cas_par_regle": cas_par_regle,
        "explication": {
            "pourquoi": "Croisements logiques entre variables generes par l'IA.",
            "cause": "Erreurs de saisie, ordre logique non respecte, ou fabrication.",
            "action": "Verifier chaque cas et confirmer avec l'enqueteur concerne.",
        },
    }


# ----------------------------------------------------------------------
#  Test de cle API
# ----------------------------------------------------------------------

def test_api_key(api: str, api_key: str) -> tuple:
    try:
        _validate_key(api, api_key)
        t0 = time.time()
        model = API_CONFIG[api]["model_fast"]
        _call_llm(api, api_key, model,
                  "Tu reponds OK.", "Reponds OK.",
                  max_tokens=20)
        return True, f"OK - Cle valide ({round(time.time()-t0, 2)}s)"
    except ValueError as e:
        return False, f"KO - {e}"
    except Exception as e:
        err = str(e)
        for term in ["Anthropic", "anthropic", "Claude", "claude",
                     "Groq", "groq", "sk-ant", "gsk_"]:
            err = err.replace(term, "API")
        return False, f"KO - {err[:200]}"