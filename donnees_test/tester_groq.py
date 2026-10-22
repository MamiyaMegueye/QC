# -*- coding: utf-8 -*-
"""
Test du moteur IA n°2 (Groq) — a lancer depuis le dossier backend :

    cd "C:\\Users\\P C\\Desktop\\sistatest\\QC-main\\QC-main\\backend"
    ..\\venv\\Scripts\\python.exe ..\\donnees_test\\tester_groq.py

Le script plante 8 anomalies logiques connues dans le fichier de demonstration,
demande a Groq de generer les regles, puis compte celles qui sont retrouvees.
Compare le resultat a celui de Claude (8/8, 18 regles, ~50 s).
"""
import os, sys, time, csv, io, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../backend")
from dotenv import load_dotenv
load_dotenv(os.path.dirname(os.path.abspath(__file__)) + "/../backend/.env")
from core.loader import load_file
from core.profiler import profile_dataset
from core import ai_agent

CSV = os.path.dirname(os.path.abspath(__file__)) + "/enquete_principale.csv"
PLANTEES = {
    5:  ("age_chef", "16", "chef de menage mineur"),
    12: ("nb_enfants", "15", "plus d'enfants que de personnes"),
    20: ("montant_transfert", "7500", "montant alors que transfert = Non"),
    31: ("date_entretien", "2027-11-30", "date dans le futur"),
    44: ("end", "2026-09-07 06:00:00", "fin avant le debut"),
    58: ("age_chef", "131", "age impossible"),
    66: ("taille_menage", "0", "menage de zero personne"),
    77: ("montant_transfert", "990000", "montant hors plage"),
}

rows = list(csv.DictReader(open(CSV, encoding="utf-8-sig"), delimiter=";"))
for i, (col, val, _) in PLANTEES.items():
    rows[i][col] = val
    if i == 20:
        rows[i]["a_recu_transfert"] = "Non"
tmp = os.path.join(os.environ.get("TEMP", "."), "piege_groq.csv")
with open(tmp, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]), delimiter=";"); w.writeheader(); w.writerows(rows)

loaded = load_file(tmp, None)
profile = profile_dataset(loaded)
mp = {"id": "code_menage", "enqueteur": "enqueteur", "superviseur": "superviseur",
      "start": "start", "end": "end", "lat": "latitude", "lon": "longitude"}

cle = os.environ.get("GROQ_API_KEY", "")
print("Cle Groq presente :", bool(cle))
ok, msg = ai_agent.test_api_key("api2", cle)
print("Test de la cle :", ok, "-", msg[:150])
if not ok:
    sys.exit(1)

t0 = time.time()
regles, commentaire, metriques = ai_agent.generate_rules(
    "api2", cle, profile, loaded.var_labels, loaded.value_labels,
    survey_type="Cash / transferts monetaires",
    survey_description="Suivi post-distribution du programme de transferts monetaires Tekavoul.",
    survey_population="Menages beneficiaires, chef de menage age de 18 ans ou plus.",
    survey_eligibility=("Age du chef de menage entre 18 et 99 ans. Taille du menage entre 1 et 20. "
                        "Le nombre d'enfants ne peut pas depasser la taille du menage. "
                        "Le montant doit etre vide si aucun transfert recu. Montant attendu 3000-15000 MRU."),
    df=loaded.df, mp=mp, progress_callback=lambda m: print("   ", m))
res = ai_agent.run_rules(loaded.df, regles, mp)

print(f"\nGroq : {metriques['n_rules']} regles en {round(time.time()-t0)} s "
      f"({metriques['model']}, {metriques['n_batches']} lot(s), "
      f"{metriques['input_tokens']}/{metriques['output_tokens']} tokens)")
print("Regles filtrees comme aberrantes :", metriques["n_rules_filtered"])
trouvees = 0
for i, (col, val, desc) in sorted(PLANTEES.items()):
    hit = [l["Regle"] for l in res["lignes"] if l["_index"] == i + 1]
    trouvees += bool(hit)
    print(f"  ligne {i+1:>3}  {desc:<40} {'TROUVE : ' + hit[0][:45] if hit else '>>> MANQUE'}")
print(f"\nSCORE GROQ : {trouvees}/8 anomalies retrouvees   (Claude : 8/8)")
