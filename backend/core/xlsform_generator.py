"""
Générateur de questionnaire .docx à partir d'une note de cadrage et d'un cadre de résultats.
L'IA analyse les documents d'entrée et produit un questionnaire structuré
au format standard SISTA (tables à 5 colonnes).
"""
import json
import io
import re
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
import openpyxl

from . import ai_agent


def extract_note_cadrage(file_bytes: bytes) -> str:
    """Extraire le contenu textuel d'une note de cadrage (.docx)."""
    doc = Document(io.BytesIO(file_bytes))
    lines = []
    for p in doc.paragraphs:
        txt = p.text.strip()
        if txt:
            style = p.style.name if p.style else ""
            if "Heading" in style:
                lines.append(f"\n## {txt}")
            else:
                lines.append(txt)
    for i, table in enumerate(doc.tables):
        lines.append(f"\n[Tableau {i+1}]")
        for row in table.rows:
            cells = [c.text.strip()[:100] for c in row.cells]
            lines.append(" | ".join(cells))
    return "\n".join(lines)


def extract_cadre_resultats(file_bytes: bytes, filename: str) -> str:
    """Extraire le contenu d'un cadre de résultats (.xlsx ou .docx)."""
    if filename.lower().endswith((".xlsx", ".xls")):
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        lines = []
        for ws in wb.worksheets:
            lines.append(f"\n=== Feuille: {ws.title} ===")
            for row in ws.iter_rows(values_only=True):
                vals = [str(v)[:80] if v else "" for v in row]
                if any(vals):
                    lines.append(" | ".join(vals))
        return "\n".join(lines)
    elif filename.lower().endswith((".docx", ".doc")):
        return extract_note_cadrage(file_bytes)
    else:
        return file_bytes.decode("utf-8", errors="replace")


def generate_questionnaire_data(
    note_cadrage_text: str,
    cadre_resultats_text: str,
    api_key: str,
    api: str = "api1",
) -> dict:
    """Appeler l'IA pour générer la structure du questionnaire en JSON."""

    system_prompt = """Tu es un expert senior en conception de questionnaires d'enquêtes quantitatives pour des projets de développement international (HCR, HCDH, UNICEF, Banque Mondiale, PNUD, PBF).

À partir de la note de cadrage et du cadre de résultats fournis, tu conçois un questionnaire quantitatif COMPLET, PROFESSIONNEL et PRÊT POUR LE TERRAIN, conforme aux standards des Nations Unies.

ARCHITECTURE OBLIGATOIRE DU QUESTIONNAIRE :

PARTIE 0 — IDENTIFICATION (administratif, non lu au répondant) : 8-11 questions
  ID unique, code enquêteur, sexe enquêteur, date, heure début/fin, ville, moughataa/commune, quartier/grappe, langue d'entretien, GPS.
  Adapter les listes (villes, moughataas) au contexte géographique du projet.

PARTIE 1 — CONSENTEMENT LIBRE ET ÉCLAIRÉ : 3-5 questions
  Script de consentement COMPLET à lire (qui mandate, objectif, durée, confidentialité, droit de refus, contact réclamation).
  Consentement obtenu, consentement mineur si applicable, résultat entretien (Complet/Refus/Absent/Interrompu/Remplacement), catégorie répondant, autorisation base de données.

PARTIE 2 — SOCIODÉMOGRAPHIQUES (tronc commun) : 8-11 questions
  Sexe (Femme/Homme/Autre), tranche d'âge (18-24, 25-34, 35-44, 45-54, 55-64, 65+), nationalité, statut/groupe, situation matrimoniale, chef de ménage, taille ménage, niveau instruction (Aucun/Coranique/Primaire/Secondaire/Supérieur/Formation pro), difficultés fonctionnelles Washington Group (voir/entendre/marcher/mémoire/soins/communication, échelle 1-4), occupation, source revenu.

PARTIES 3 à N-3 — THÉMATIQUES : 3-9 questions chacune
  Identifier les thèmes depuis la note de cadrage et les indicateurs. Pour CHAQUE partie :
  - Note "Indicateurs mesurés :" avec codes et intitulés
  - 3-9 questions mesurant ces indicateurs sous différents angles
  - Varier : échelles Likert 1-5 (AVEC libellé à chaque niveau), choix unique, choix multiples, questions ouvertes
  - Questions de perception ET de vécu concret
  - Pour l'éducation : DÉSAGRÉGER par sexe ET par niveau (primaire/secondaire). Créer des sous-sections 5.A (perceptions générales, posées à TOUS) et 5.B (situation scolaire par enfant, par sexe, par niveau)
  - Pour chaque service/institution à évaluer : lister les items individuellement

MODULES SPÉCIFIQUES PAR SOUS-POPULATION :
  Si le projet distingue des composantes (ex: A=migrants/réfugiés, B=communauté d'accueil), créer des MODULES SÉPARÉS :
  - Filtre d'entrée : "Administrer uniquement si Q1.x = valeur"
  - Questions adaptées au vécu spécifique (durée résidence, documents statut, procédures, satisfaction services)
  - Module acteurs locaux avec question filtre auto-portée

CLÔTURE : 2-3 questions
  Question ouverte priorité/besoin, orientation vers service si besoin (protection, VBG, MHPSS), script clôture.

ANNEXE : logique de passage + correspondance questions↔indicateurs.

RÈGLES DE QUALITÉ :

Colonne "Filtre / Instruction" — NE JAMAIS LAISSER VIDE :
  Sauts conditionnels ("Si Q3.6=2, passer à Q3.9"), instructions lecture ("Lire les options"), type réponse ("Une seule réponse", "Choix multiples"), sensibilité ("Question sensible — rappeler confidentialité"), vérification ("Doit correspondre à Q1.4"), éthique ("Ne jamais recueillir de récit d'incident — protocole OMS"), genre ("Enquêtrice femme pour répondante femme").

Colonne "Indicateur mesuré" :
  Parties 0,1,2 et Clôture : "—". Parties thématiques : code EXACT ("Produit 1 — P1.Ic (confiance institutionnelle)"). Contextuelle : "Contextuelle — appuie P2.Ic". Données TdR : "Donnée TdR — assiduité scolaire".

Modalités de réponse :
  TOUJOURS numérotées. Échelles Likert : 5 niveaux AVEC libellé complet (ex: "1=Aucune confiance 2=Faible 3=Moyenne 4=Plutôt confiance 5=Totale"). Inclure "9. NSP" et "8. Préfère ne pas répondre" pour questions sensibles. Numériques : "|___|___|". Texte libre : "Zone de texte libre".

Éthique :
  VBG jamais par question directe (protocole OMS). Détresse : interrompre et orienter. Mineurs : consentement adulte + assentiment. Revenus/détention : rappel confidentialité.

CONTRAINTES TECHNIQUES :
  - Viser 60-90 questions au total
  - Questions COURTES (max 2 lignes), modalités concises mais complètes
  - JSON total < 10000 mots
  - Questionnaire en français

FORMAT JSON — Réponds UNIQUEMENT avec un JSON valide :
{
  "header": {
    "organization": "Nom(s)",
    "project_title": "Titre complet",
    "questionnaire_type": "QUESTIONNAIRE QUANTITATIF INDIVIDUEL DE PERCEPTION",
    "target_population": "Population cible",
    "zones": "Zones",
    "version": "Version 1"
  },
  "instructions": ["instruction enquêteur 1", "instruction 2", "...au moins 5 instructions"],
  "parts": [
    {
      "number": 0,
      "title": "Identification de l'enquête",
      "description": "Administratif — non lu au répondant",
      "sub_sections": [
        {"title": "Sous-section optionnelle", "description": "", "questions": []}
      ],
      "questions": [
        {
          "number": "0.1",
          "question": "Texte de la question",
          "modalities": "1. Option A  2. Option B",
          "filter": "Instruction enquêteur obligatoire",
          "indicator": "— ou code indicateur"
        }
      ]
    }
  ],
  "closure_script": "Script complet de clôture",
  "passage_logic": [
    {"block": "Parties 0-4", "condition": "Tous les répondants", "description": "Tronc commun"}
  ],
  "indicator_mapping": [
    {"indicator_code": "Ind.1", "indicator_label": "Intitulé", "questions": ["3.1", "3.2"]}
  ]
}"""

    user_prompt = f"""Voici les documents pour concevoir le questionnaire :

=== NOTE DE CADRAGE ===
{note_cadrage_text[:14000]}

=== CADRE DE RÉSULTATS ===
{cadre_resultats_text[:8000]}

CONSIGNES FINALES :
- 60-90 questions au total, réparties selon l'architecture obligatoire
- Parties thématiques : 3-9 questions chacune, couvrant chaque indicateur du cadre de résultats
- Si le document mentionne des composantes/sous-populations distinctes, créer des modules séparés avec filtres d'entrée
- Éducation : désagréger garçons/filles × primaire/secondaire (sous-sections 5.A perceptions + 5.B situation scolaire)
- CHAQUE question a une instruction enquêteur (colonne Filtre) — jamais vide
- CHAQUE question thématique a un code indicateur (colonne Indicateur) — jamais vide
- Inclure la logique de passage et le mapping indicateurs en annexe
- JSON UNIQUEMENT, pas de texte autour."""


    api_config = ai_agent.API_CONFIG.get(api, ai_agent.API_CONFIG["api1"])
    model = api_config["model_smart"]

    response_raw = ai_agent._call_with_retry(
        api_key=api_key,
        api=api,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=16000,
    )

    response_text = response_raw["text"]
    # Extraire le JSON — avec réparation si tronqué
    data = ai_agent._extract_json(response_text)
    if not data:
        # Tenter de réparer un JSON tronqué (réponse coupée par max_tokens)
        data = _repair_truncated_json(response_text)
    if not data:
        raise ValueError("L'IA n'a pas retourné un JSON valide pour le questionnaire.")
    return data


def _repair_truncated_json(text: str) -> dict:
    """Tenter de réparer un JSON tronqué par la limite de tokens."""
    import json
    # Trouver le début du JSON
    start = text.find("{")
    if start < 0:
        return None
    
    fragment = text[start:]
    
    # Essayer tel quel
    try:
        return json.loads(fragment)
    except json.JSONDecodeError:
        pass
    
    # Couper au dernier } ou ] valide, puis fermer les structures
    # On cherche en reculant depuis la fin
    best = None
    for end_pos in range(len(fragment), max(0, len(fragment) - 5000), -1):
        sub = fragment[:end_pos].rstrip()
        # Retirer virgule ou deux-points trailing
        while sub and sub[-1] in (",", ":", "\x22"):
            sub = sub[:-1].rstrip()
        
        ob = sub.count("{") - sub.count("}")
        oq = sub.count("[") - sub.count("]")
        
        if ob < 0 or oq < 0:
            continue
        
        closing = "]" * oq + "}" * ob
        try:
            candidate = json.loads(sub + closing)
            if isinstance(candidate, dict) and "parts" in candidate:
                return candidate
            if best is None:
                best = candidate
        except json.JSONDecodeError:
            continue
    
    return best


def build_questionnaire_docx(data: dict) -> bytes:
    """Construire le fichier .docx du questionnaire à partir du JSON structuré."""
    doc = Document()

    # -- Format paysage pour plus de largeur --
    for section in doc.sections:
        section.orientation = 1  # WD_ORIENT.LANDSCAPE
        new_width, new_height = section.page_height, section.page_width
        section.page_width = new_width
        section.page_height = new_height
        section.left_margin = Cm(1.5)
        section.right_margin = Cm(1.5)

    # -- Styles de base --
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    style.paragraph_format.space_after = Pt(4)

    navy = RGBColor(0x0B, 0x1F, 0x3F)
    white = RGBColor(0xFF, 0xFF, 0xFF)

    # -- En-tête --
    header = data.get("header", {})
    org = header.get("organization", "")
    if org:
        p = doc.add_paragraph(org)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            run.font.size = Pt(12)
            run.font.bold = True

    title = header.get("project_title", "")
    if title:
        p = doc.add_paragraph(title)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            run.font.size = Pt(10)

    qtype = header.get("questionnaire_type", "QUESTIONNAIRE")
    p = doc.add_paragraph(qtype.upper())
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in p.runs:
        run.font.size = Pt(14)
        run.font.bold = True
        run.font.color.rgb = navy

    target = header.get("target_population", "")
    zones = header.get("zones", "")
    version = header.get("version", "")
    meta_line = " — ".join(filter(None, [target, zones, version]))
    if meta_line:
        p = doc.add_paragraph(meta_line)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            run.font.size = Pt(10)
            run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    doc.add_paragraph("")

    # -- Instructions --
    instructions = data.get("instructions", [])
    if instructions:
        doc.add_heading("Instructions générales pour les enquêteurs/trices", level=1)
        for instr in instructions:
            p = doc.add_paragraph(instr, style="List Bullet")
            p.paragraph_format.space_after = Pt(2)
        doc.add_paragraph("")

    # -- Parties --
    for part in data.get("parts", []):
        part_num = part.get("number", "")
        part_title = part.get("title", "")
        doc.add_heading(f"Partie {part_num} — {part_title}", level=1)

        desc = part.get("description", "")
        if desc:
            p = doc.add_paragraph(desc)
            p.runs[0].font.italic = True if p.runs else None

        # Sous-sections
        for sub in part.get("sub_sections", []):
            sub_title = sub.get("title", "")
            if sub_title:
                doc.add_heading(sub_title, level=2)
            sub_desc = sub.get("description", "")
            if sub_desc:
                doc.add_paragraph(sub_desc)
            _add_questions_table(doc, sub.get("questions", []), navy, white)

        # Questions directes
        questions = part.get("questions", [])
        if questions:
            _add_questions_table(doc, questions, navy, white)

        doc.add_paragraph("")

    # -- Clôture --
    closure = data.get("closure_script", "")
    if closure:
        doc.add_heading("Clôture de l'entretien", level=1)
        p = doc.add_paragraph(closure)
        p.runs[0].font.italic = True if p.runs else None

    # -- Mapping indicateurs --
    mapping = data.get("indicator_mapping", [])
    if mapping:
        doc.add_heading("Correspondance questions ↔ indicateurs", level=2)
        table = doc.add_table(rows=1, cols=2)
        table.style = "Table Grid"
        hdr = table.rows[0].cells
        hdr[0].text = "Indicateur"
        hdr[1].text = "Question(s)"
        for cell in hdr:
            _shade_cell(cell, navy)
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.color.rgb = white
                    run.font.bold = True
                    run.font.size = Pt(10)
        for m in mapping:
            row = table.add_row().cells
            row[0].text = str(m.get("indicator_code", ""))
            qs = m.get("questions", [])
            row[1].text = ", ".join(str(q) for q in qs) if isinstance(qs, list) else str(qs)

    # Sauvegarder
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _add_questions_table(doc, questions, navy, white):
    """Ajouter un tableau de questions au document."""
    if not questions:
        return
    table = doc.add_table(rows=1, cols=5)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # En-tête
    headers = ["N°", "Question", "Modalités de réponse", "Filtre / Instruction", "Indicateur mesuré"]
    hdr_cells = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr_cells[i].text = h
        _shade_cell(hdr_cells[i], navy)
        for p in hdr_cells[i].paragraphs:
            for run in p.runs:
                run.font.color.rgb = white
                run.font.bold = True
                run.font.size = Pt(9)

    # Lignes
    for q in questions:
        row_cells = table.add_row().cells
        row_cells[0].text = str(q.get("number", ""))
        row_cells[1].text = str(q.get("question", ""))
        row_cells[2].text = str(q.get("modalities", ""))
        row_cells[3].text = str(q.get("filter", "—"))
        row_cells[4].text = str(q.get("indicator", "—"))

        for cell in row_cells:
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.size = Pt(9)

    # Largeurs approximatives
    widths = [Cm(1.5), Cm(7.0), Cm(6.5), Cm(5.5), Cm(3.0)]
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            cell.width = widths[i]


def _shade_cell(cell, color: RGBColor):
    """Appliquer une couleur de fond à une cellule."""
    shading = cell._element.get_or_add_tcPr()
    shd = shading.makeelement(qn("w:shd"), {
        qn("w:val"): "clear",
        qn("w:color"): "auto",
        qn("w:fill"): str(color).replace("#", ""),
    })
    # Supprimer l'ancien shading s'il existe
    for old in shading.findall(qn("w:shd")):
        shading.remove(old)
    shading.append(shd)
