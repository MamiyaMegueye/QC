"""
core/xlsform_generator.py — Generateur XLSForm a partir d'un questionnaire Word.

Workflow :
  1. Extraction du contenu du fichier .docx (paragraphes + tables)
  2. Envoi a l'IA (Claude ou Groq) pour structurer en XLSForm
  3. Construction du fichier .xlsx (3 feuilles : survey, choices, settings)

Le fichier genere est compatible KoboToolbox / ODK Collect.
"""

from __future__ import annotations

import io
import json
import re
from typing import Any

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from docx import Document

from core import ai_agent


# ------------------------------------------------------------------
#  Extraction du contenu Word
# ------------------------------------------------------------------

def extract_questionnaire_content(file_bytes: bytes) -> str:
    """Extrait le texte structure d'un fichier .docx (paragraphes + tables)."""
    doc = Document(io.BytesIO(file_bytes))
    parts = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style = para.style.name or ""
        if "Heading 1" in style:
            parts.append(f"\n## {text}")
        elif "Heading 2" in style:
            parts.append(f"\n### {text}")
        elif "Heading" in style:
            parts.append(f"\n#### {text}")
        else:
            parts.append(text)

    for i, table in enumerate(doc.tables):
        parts.append(f"\n--- TABLEAU {i + 1} ---")
        for row_idx, row in enumerate(table.rows):
            cells = [c.text.strip().replace("\n", " | ") for c in row.cells]
            parts.append("\t".join(cells))

    return "\n".join(parts)


# ------------------------------------------------------------------
#  Prompt systeme pour la generation XLSForm
# ------------------------------------------------------------------

SYSTEM_PROMPT = """Tu es un expert en conception de formulaires XLSForm pour KoboToolbox et ODK.

A partir du contenu d'un questionnaire d'enquete, tu dois generer un fichier XLSForm structure en JSON.

REGLES STRICTES :
1. Chaque question doit avoir un "name" unique (snake_case, sans accents, max 30 caracteres)
2. Les types XLSForm valides : text, integer, decimal, date, time, datetime, select_one [list_name], select_multiple [list_name], note, begin_group, end_group, begin_repeat, end_repeat, calculate, geopoint, image, audio, barcode
3. Pour les questions a choix : utilise "select_one nom_liste" ou "select_multiple nom_liste"
4. Les filtres/sauts deviennent des "relevant" (syntaxe XPath ODK)
5. Genere aussi la feuille "choices" avec toutes les listes de choix
6. Groupe les questions par section (begin_group / end_group)
7. Mets les labels en francais
8. Ajoute des "hint" quand les instructions enqueteur le justifient
9. Ajoute des "constraint" quand des validations sont necessaires

SORTIE ATTENDUE — un JSON avec cette structure exacte :
{
  "survey": [
    {"type": "begin_group", "name": "section_id", "label": "Titre section"},
    {"type": "select_one liste_x", "name": "q1", "label": "Question ?", "hint": "", "relevant": "", "constraint": "", "constraint_message": "", "required": "yes"},
    {"type": "end_group", "name": "", "label": ""},
    ...
  ],
  "choices": [
    {"list_name": "liste_x", "name": "1", "label": "Option 1"},
    {"list_name": "liste_x", "name": "2", "label": "Option 2"},
    ...
  ],
  "settings": {
    "form_title": "Titre du formulaire",
    "form_id": "form_id_unique"
  }
}

Reponds UNIQUEMENT avec le JSON, sans texte avant ni apres.
"""


# ------------------------------------------------------------------
#  Generation via IA
# ------------------------------------------------------------------

def _build_user_prompt(questionnaire_text: str, context: str = "") -> str:
    prompt = f"Voici le contenu du questionnaire a convertir en XLSForm :\n\n{questionnaire_text}"
    if context:
        prompt += f"\n\nContexte supplementaire (note de cadrage / cadre de resultats) :\n{context}"
    return prompt


def generate_xlsform_data(
    questionnaire_bytes: bytes,
    api_key: str,
    api: str = "api1",
    context_text: str = "",
) -> dict:
    """Parse le questionnaire et genere la structure XLSForm via l'IA."""
    # 1. Extraire le contenu
    content = extract_questionnaire_content(questionnaire_bytes)

    # 2. Tronquer si trop long (garder ~15000 chars pour rester dans les limites)
    if len(content) > 50000:
        content = content[:50000] + "\n\n[... contenu tronque ...]"

    user_prompt = _build_user_prompt(content, context_text)

    # 3. Appeler l'IA
    model_cfg = ai_agent.API_CONFIG[api]
    model = model_cfg.get("model_smart", model_cfg.get("model_fast"))
    result = ai_agent._call_with_retry(
        api=api,
        api_key=api_key,
        model=model,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=8000,
    )
    response_text = result["text"]

    # 4. Parser le JSON
    data = ai_agent._extract_json(response_text)

    if "survey" not in data or "choices" not in data:
        raise ValueError("L'IA n'a pas retourne un XLSForm valide (survey/choices manquants)")

    return data


# ------------------------------------------------------------------
#  Construction du fichier Excel (.xlsx)
# ------------------------------------------------------------------

HEADER_FILL = PatternFill(start_color="1B2A4A", end_color="1B2A4A", fill_type="solid")
HEADER_FONT = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
CELL_FONT = Font(name="Calibri", size=10)
THIN_BORDER = Border(
    left=Side(style="thin", color="CCCCCC"),
    right=Side(style="thin", color="CCCCCC"),
    top=Side(style="thin", color="CCCCCC"),
    bottom=Side(style="thin", color="CCCCCC"),
)

SURVEY_COLS = ["type", "name", "label", "hint", "relevant", "constraint", "constraint_message", "required", "appearance", "calculation", "default"]
CHOICES_COLS = ["list_name", "name", "label"]


def build_xlsform_excel(data: dict) -> bytes:
    """Construit le fichier .xlsx XLSForm a partir de la structure JSON."""
    wb = openpyxl.Workbook()

    # --- Feuille survey ---
    ws_survey = wb.active
    ws_survey.title = "survey"
    _write_sheet(ws_survey, SURVEY_COLS, data.get("survey", []))

    # --- Feuille choices ---
    ws_choices = wb.create_sheet("choices")
    _write_sheet(ws_choices, CHOICES_COLS, data.get("choices", []))

    # --- Feuille settings ---
    ws_settings = wb.create_sheet("settings")
    settings = data.get("settings", {})
    settings_cols = ["form_title", "form_id", "version", "default_language"]
    ws_settings.append(settings_cols)
    for ci, col in enumerate(settings_cols, 1):
        cell = ws_settings.cell(row=1, column=ci)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.border = THIN_BORDER
        cell.alignment = Alignment(horizontal="center")

    row_data = [
        settings.get("form_title", "Formulaire"),
        settings.get("form_id", "form_001"),
        settings.get("version", "1"),
        settings.get("default_language", "French (fr)"),
    ]
    ws_settings.append(row_data)
    for ci in range(1, len(settings_cols) + 1):
        cell = ws_settings.cell(row=2, column=ci)
        cell.font = CELL_FONT
        cell.border = THIN_BORDER

    # Ajuster largeurs
    for ws in [ws_survey, ws_choices, ws_settings]:
        for col_cells in ws.columns:
            max_len = 0
            col_letter = col_cells[0].column_letter
            for cell in col_cells:
                if cell.value:
                    max_len = max(max_len, len(str(cell.value)))
            ws.column_dimensions[col_letter].width = min(max_len + 4, 60)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _write_sheet(ws, columns: list, rows: list):
    """Ecrit l'en-tete + les lignes sur une feuille."""
    ws.append(columns)
    for ci, col in enumerate(columns, 1):
        cell = ws.cell(row=1, column=ci)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.border = THIN_BORDER
        cell.alignment = Alignment(horizontal="center")

    for row_data in rows:
        values = []
        for col in columns:
            values.append(str(row_data.get(col, "") or ""))
        ws.append(values)
        row_num = ws.max_row
        for ci in range(1, len(columns) + 1):
            cell = ws.cell(row=row_num, column=ci)
            cell.font = CELL_FONT
            cell.border = THIN_BORDER
            cell.alignment = Alignment(wrap_text=True, vertical="top")

    ws.freeze_panes = "A2"
