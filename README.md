# SISTA QC — Architecture Fullstack (FastAPI + React)

Plateforme de Contrôle Qualité automatisé des enquêtes, refondue en architecture moderne **React + API Python**.

```
┌────────────────────────────────────────────────────────────┐
│  Frontend React + Tailwind (Vercel)                        │
│  - UI moderne, charte SISTA navy + doré                    │
│  - Upload, profilage, QC, rapports                         │
└────────────────────┬───────────────────────────────────────┘
                     │ HTTPS + CORS
                     ▼
┌────────────────────────────────────────────────────────────┐
│  Backend FastAPI (Render)                                  │
│  - API REST                                                │
│  - Réutilise les modules core/ existants                   │
└────────────────────────────────────────────────────────────┘
```

## 📁 Structure

```
sista-qc-fullstack/
├── backend/                     ← API Python (déployer sur Render)
│   ├── main.py                  ← FastAPI app
│   ├── core/                    ← Modules métier (inchangés)
│   │   ├── ai_agent.py
│   │   ├── loader.py
│   │   ├── profiler.py
│   │   └── qc_basic.py
│   ├── requirements.txt
│   ├── .env.example
│   └── render.yaml
│
├── frontend/                    ← App React (déployer sur Vercel)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api/client.js
│   │   ├── store/useStore.js
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── Stepper.jsx
│   │   │   ├── InfoBanner.jsx
│   │   │   ├── steps/
│   │   │   ├── tabs/
│   │   │   ├── cards/
│   │   │   └── ui/
│   │   └── styles/index.css
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.js
│   ├── vercel.json
│   └── .env.example
│
└── README.md
```

---

## 🚀 Installation locale (développement)

### 1. Backend FastAPI

```bash
cd backend
python -m venv venv
# Windows : venv\Scripts\activate
# Linux/Mac : source venv/bin/activate
pip install -r requirements.txt

# Configurer les clés
cp .env.example .env
# Éditer .env avec vos vraies clés API

# Lancer
uvicorn main:app --reload --port 8000
```

Ouvrir : http://localhost:8000/docs (documentation interactive de l'API)

### 2. Frontend React

Dans un autre terminal :

```bash
cd frontend
npm install

# Configurer l'URL du backend
cp .env.example .env
# Par défaut : http://localhost:8000

# Lancer
npm run dev
```

Ouvrir : http://localhost:5173

---

## 🌐 Déploiement Production

### A. Déployer le Backend sur Render

| # | Étape |
|---|---|
| 1 | Pousser le code sur GitHub (repo public) |
| 2 | Aller sur https://render.com et créer un compte |
| 3 | **New +** → **Web Service** → connecter votre repo |
| 4 | Sélectionner le dossier `backend` comme racine |
| 5 | Build Command : `pip install -r requirements.txt` |
| 6 | Start Command : `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| 7 | Plan : **Free** |
| 8 | Dans **Environment** → ajouter : `ANTHROPIC_API_KEY`, `GROQ_API_KEY` |
| 9 | Une fois déployé : votre URL ressemble à `https://sista-qc-api.onrender.com` |
| 10 | Ajouter `ALLOWED_ORIGINS` avec l'URL Vercel (étape suivante) |

### B. Déployer le Frontend sur Vercel

| # | Étape |
|---|---|
| 1 | Aller sur https://vercel.com et créer un compte |
| 2 | **Add New** → **Project** → connecter votre repo GitHub |
| 3 | Root Directory : `frontend` |
| 4 | Framework Preset : **Vite** (détecté auto) |
| 5 | Dans **Environment Variables** : ajouter `VITE_API_URL` avec l'URL Render |
| 6 | Cliquer **Deploy** |
| 7 | URL finale : `https://votre-projet.vercel.app` |
| 8 | Retourner sur Render → ajouter cette URL dans `ALLOWED_ORIGINS` |

---

## ⚠️ Points importants

| Sujet | Détail |
|---|---|
| **Free tier Render** | L'app "dort" après 15 min sans usage → ~50s pour redémarrer |
| **Sessions en mémoire** | Si le backend redémarre, les sessions sont perdues. Pour production, utiliser Redis |
| **Fichiers volumineux** | Render free a 512 MB RAM → fichiers max ~50 MB |
| **CORS** | Le backend autorise déjà `*.vercel.app` par défaut |

---

## 🎨 Charte graphique SISTA

| Couleur | Hex | Usage |
|---|---|---|
| Navy | `#13263D` | Header, boutons primaires, titres |
| Navy deep | `#0D1B2C` | Hover des boutons |
| Gold | `#EFC71A` | Accents, badges, séparateurs |
| Gold deep | `#D4AC0D` | Détails dorés |
| Beige | `#F4F7FA` | Arrière-plan global |

Polices : **Sora** (titres), **Spline Sans** (corps), **JetBrains Mono** (code)

---

## 🧪 Tester

3 fichiers Excel de test disponibles dans la version Streamlit :
- PDM HCR (humanitaire)
- Banque (satisfaction client)
- Éducation (UNICEF)

---

## 📝 Licence

Propriétaire — SISTA Consult Mauritanie © 2026
