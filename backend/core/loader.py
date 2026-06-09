"""
loader.py — Lecture UNIVERSELLE de fichiers d'enquête.

Formats supportés :
  - CSV / TSV / TXT
  - Excel (.xlsx, .xls)
  - SPSS (.sav, .zsav)  -> via pyreadstat (récupère libellés + value labels)
  - Stata (.dta)        -> via pyreadstat
  - SAS (.sas7bdat)     -> via pyreadstat
  - CSPro (.csv export + .dcf dictionnaire) -> lu comme CSV, dictionnaire en option

Renvoie un objet LoadedData contenant :
  - df : DataFrame pandas
  - var_labels : { colonne: libellé }          (libellés de variables)
  - value_labels : { colonne: {code: libellé} } (modalités codées)
  - meta : infos sur le fichier
"""

import os
import pandas as pd


class LoadedData:
    def __init__(self, df, var_labels=None, value_labels=None, meta=None):
        self.df = df
        self.var_labels = var_labels or {}
        self.value_labels = value_labels or {}
        self.meta = meta or {}


def _read_csv_smart(path):
    """Lit un CSV en détectant le séparateur et l'encodage automatiquement."""
    encodings = ["utf-8-sig", "utf-8", "latin-1", "cp1252"]
    seps = [None, ";", ",", "\t", "|"]  # None => détection auto par pandas
    last_err = None
    for enc in encodings:
        for sep in seps:
            try:
                df = pd.read_csv(
                    path, sep=sep, encoding=enc, engine="python",
                    on_bad_lines="skip", dtype=str, keep_default_na=True,
                )
                # un séparateur valide donne en général > 1 colonne
                if df.shape[1] > 1 or sep in (None, ","):
                    return df
            except Exception as e:
                last_err = e
                continue
    if last_err:
        raise last_err
    raise ValueError("Impossible de lire le CSV")


def load_file(path, dict_path=None):
    """
    Point d'entrée principal. Détecte le format par l'extension
    et renvoie un LoadedData.
    """
    ext = os.path.splitext(path)[1].lower()
    name = os.path.basename(path)

    var_labels, value_labels = {}, {}

    if ext in (".csv", ".tsv", ".txt"):
        df = _read_csv_smart(path)

    elif ext in (".xlsx", ".xls", ".xlsm"):
        df = pd.read_excel(path, dtype=object)

    elif ext in (".sav", ".zsav"):
        import pyreadstat
        df, meta = pyreadstat.read_sav(path, apply_value_formats=False)
        var_labels = dict(zip(meta.column_names, meta.column_labels or []))
        value_labels = _extract_value_labels(meta)

    elif ext == ".dta":
        import pyreadstat
        df, meta = pyreadstat.read_dta(path, apply_value_formats=False)
        var_labels = dict(zip(meta.column_names, meta.column_labels or []))
        value_labels = _extract_value_labels(meta)

    elif ext == ".sas7bdat":
        import pyreadstat
        df, meta = pyreadstat.read_sas7bdat(path)
        var_labels = dict(zip(meta.column_names, meta.column_labels or []))
        value_labels = _extract_value_labels(meta)

    else:
        # tentative en CSV par défaut
        df = _read_csv_smart(path)

    # nettoyage des libellés vides
    var_labels = {k: v for k, v in var_labels.items() if v and str(v).strip()}

    # Si un dictionnaire externe est fourni (ex : CSPro ou fichier libellés)
    if dict_path:
        ext_labels = _read_external_dictionary(dict_path)
        for k, v in ext_labels.items():
            if k not in var_labels:
                var_labels[k] = v

    meta = {
        "filename": name,
        "format": ext.lstrip("."),
        "n_rows": int(df.shape[0]),
        "n_cols": int(df.shape[1]),
    }
    return LoadedData(df, var_labels, value_labels, meta)


def _extract_value_labels(meta):
    """Récupère les modalités codées (value labels) depuis les métadonnées."""
    result = {}
    try:
        vvl = getattr(meta, "variable_value_labels", None) or {}
        for col, mapping in vvl.items():
            result[col] = {str(k): str(v) for k, v in mapping.items()}
    except Exception:
        pass
    return result


def _read_external_dictionary(dict_path):
    """
    Lit un dictionnaire externe (xlsx/csv) : 1re colonne = nom variable,
    2e colonne = libellé. Renvoie { variable: libellé }.
    """
    try:
        ext = os.path.splitext(dict_path)[1].lower()
        if ext in (".xlsx", ".xls"):
            d = pd.read_excel(dict_path, dtype=str)
        else:
            d = _read_csv_smart(dict_path)
        if d.shape[1] < 2:
            return {}
        key, lab = d.columns[0], d.columns[1]
        return {
            str(r[key]).strip(): str(r[lab]).strip()
            for _, r in d.iterrows()
            if pd.notna(r[key]) and str(r[key]).strip()
        }
    except Exception:
        return {}
