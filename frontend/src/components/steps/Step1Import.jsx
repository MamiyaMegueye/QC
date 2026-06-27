import { useState, useEffect, useMemo } from "react"
import { useStore } from "../../store/useStore"
import { api } from "../../api/client"
import UploadZone from "../ui/UploadZone"
import {
  CheckCircle, XCircle, Loader2, Sparkles,
  KeyRound, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp,
} from "lucide-react"

const TYPES_ENQUETE = [
  "(Sélectionner ou saisir)",
  "PDM - Post-Distribution Monitoring",
  "EFSA - Sécurité alimentaire",
  "HEA - Household Economy Approach",
  "WASH - Eau, hygiène, assainissement",
  "MSNA - Besoins multi-sectoriels",
  "Éducation / scolarisation",
  "Protection / GBV",
  "Santé / nutrition",
  "Cash / transferts monétaires",
  "Livelihood / moyens de subsistance",
  "Recensement / RGPH",
  "Étude de marché / commerce",
  "Étude bancaire / microfinance",
  "Enquête satisfaction client",
  "Autre (préciser ci-dessous)",
]

// Colonnes-clés essentielles, TOUJOURS visibles
const KEY_COLUMNS_ESSENTIAL = [
  {
    key: "id",
    label: "Identifiant unique de l'observation",
    hint: "Colonne qui identifie de manière unique chaque ligne. À définir explicitement par l'équipe SISTA.",
    required: true,
  },
  {
    key: "enqueteur",
    label: "Enquêteur / agent de collecte",
    hint: "Nom ou code de la personne ayant collecté la donnée. Active le bilan par enquêteur.",
    required: false,
  },
]

// Métadonnées de collecte (Kobo/ODK) — section repliable.
// Si rien n'est auto-détecté, la section reste repliée pour ne pas polluer l'écran.
const KEY_COLUMNS_OPTIONAL = [
  {
    key: "start",
    label: "Date / heure de début",
    hint: "Horodatage du début. Active les tests de durée.",
  },
  {
    key: "end",
    label: "Date / heure de fin",
    hint: "Horodatage de fin. Doit aller de pair avec le début.",
  },
  {
    key: "lat",
    label: "Latitude (GPS)",
    hint: "Coordonnée GPS - latitude.",
  },
  {
    key: "lon",
    label: "Longitude (GPS)",
    hint: "Coordonnée GPS - longitude.",
  },
]

// ====================================================================
//  Carte colonnes-clés
// ====================================================================
function ColumnMappingCard() {
  const store = useStore()

  // La section "Métadonnées de collecte" est dépliée automatiquement
  // si au moins une auto-détection a trouvé quelque chose dedans
  const hasMetadataDetected = useMemo(() => {
    const m = store.previewAutoMapping || {}
    return !!(m.start || m.end || m.lat || m.lon)
  }, [store.previewAutoMapping])
  const [metadataExpanded, setMetadataExpanded] = useState(false)

  // Auto-déplier quand on découvre des métadonnées (au upload)
  useEffect(() => {
    if (hasMetadataDetected) setMetadataExpanded(true)
  }, [hasMetadataDetected])

  if (!store.dataFile) return null

  if (store.previewLoading) {
    return (
      <div className="card">
        <h3 className="card-title flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-gold" />
          Colonnes-clés du fichier
        </h3>
        <div className="flex items-center gap-3 text-gray-600 text-sm py-4">
          <Loader2 className="w-5 h-5 animate-spin text-navy" />
          Lecture rapide du fichier...
        </div>
      </div>
    )
  }

  if (store.previewError) {
    return (
      <div className="card">
        <h3 className="card-title flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-gold" />
          Colonnes-clés du fichier
        </h3>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold m-0">Impossible de lire le fichier</p>
            <p className="m-0 mt-1">{store.previewError}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!store.previewColumns || store.previewColumns.length === 0) {
    return null
  }

  // Compteur "X / 4" pour le badge de la section repliable
  const nbMetadataFilled = KEY_COLUMNS_OPTIONAL.reduce(
    (n, kc) => n + (store.columnMapping[kc.key] ? 1 : 0),
    0
  )

  const idMissing = !store.columnMapping.id

  const renderSelect = (kc) => {
    const value = store.columnMapping[kc.key] || ""
    const isMissing = kc.required && !value
    return (
      <div key={kc.key}>
        <label className="label-text flex items-center gap-1">
          {kc.label}
          {kc.required && (
            <span className="text-red-600 text-xs font-bold" title="Champ obligatoire">
              *
            </span>
          )}
        </label>
        <select
          className={`input-field ${isMissing ? "border-red-400 bg-red-50" : ""}`}
          value={value}
          onChange={(e) => store.setColumnMappingField(kc.key, e.target.value)}
        >
          <option value="">— Aucune —</option>
          {store.previewColumns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1 m-0">{kc.hint}</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="card-title flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-gold" />
        Colonnes-clés du fichier
      </h3>
      <p className="card-desc">
        Identifiez les colonnes essentielles avant l'analyse. Les valeurs proposées
        sont auto-détectées et peuvent être corrigées. <strong>L'identifiant unique
        est obligatoire</strong> et doit être validé par l'équipe SISTA.
      </p>

      <div className="bg-gray-50 rounded-lg px-3 py-2 mb-4 text-xs text-gray-600 flex items-center justify-between flex-wrap gap-2">
        <span>
          <strong>{store.previewColumns.length}</strong> colonne(s) détectée(s)
          {store.previewProfile?.summary?.n_rows
            ? ` · ${store.previewProfile.summary.n_rows} observation(s)`
            : ""}
        </span>
        <button
          onClick={() => store.resetColumnMapping()}
          className="text-xs text-navy hover:underline flex items-center gap-1"
          title="Restaurer l'auto-détection"
        >
          <RefreshCw className="w-3 h-3" />
          Restaurer l'auto-détection
        </button>
      </div>

      {/* ---- Colonnes essentielles, TOUJOURS visibles ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {KEY_COLUMNS_ESSENTIAL.map(renderSelect)}
      </div>

      {/* ---- Section repliable : metadonnees de collecte ---- */}
      <div className="mt-4 border-t border-gray-200 pt-3">
        <button
          type="button"
          onClick={() => setMetadataExpanded(!metadataExpanded)}
          className="w-full flex items-center justify-between text-left text-sm font-semibold text-navy hover:bg-gray-50 rounded-lg px-2 py-2 transition-colors"
        >
          <span className="flex items-center gap-2 flex-wrap">
            Métadonnées de collecte
            <span className="text-xs font-normal text-gray-500">
              (optionnel — utile pour les enquêtes terrain Kobo / ODK)
            </span>
            {nbMetadataFilled > 0 && (
              <span className="bg-gold/20 text-navy text-xs px-2 py-0.5 rounded-full font-bold">
                {nbMetadataFilled} / 4
              </span>
            )}
          </span>
          {metadataExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {metadataExpanded && (
          <div className="slide-up mt-3">
            <p className="text-xs text-gray-500 mb-3 italic">
              Renseignez ces colonnes uniquement si votre fichier contient des
              horodatages de collecte (start/end) ou des coordonnées GPS. Elles
              activent les tests automatiques de durée, d'intervalle entre
              observations et de couverture GPS.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {KEY_COLUMNS_OPTIONAL.map(renderSelect)}
            </div>
          </div>
        )}
      </div>

      {idMissing && (
        <div className="mt-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl p-3 px-4 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-amber-900 m-0">
              Identifiant unique requis
            </p>
            <p className="text-amber-800 m-0 mt-1 text-xs">
              Choisissez la colonne qui sert d'identifiant unique des observations.
              Cette information est sous la responsabilité de l'équipe SISTA et doit
              être définie avant tout traitement.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ====================================================================
//  Composant principal
// ====================================================================

export default function Step1Import() {
  const store = useStore()
  const [typeChoice, setTypeChoice] = useState(TYPES_ENQUETE[0])
  const [typeCustom, setTypeCustom] = useState(store.surveyType || "")
  const [testing, setTesting] = useState(false)

  // ---- Auto-charger les colonnes dès qu'un fichier est uploadé ----
  useEffect(() => {
    if (!store.dataFile) return
    let cancelled = false
    store.setPreviewLoading(true)
    store.setPreviewError(null)
    api
      .previewColumns(store.dataFile, store.dictFile)
      .then((data) => {
        if (cancelled) return
        store.setPreviewData(data)
      })
      .catch((e) => {
        if (cancelled) return
        store.setPreviewError(e.message || "Erreur de lecture")
      })
      .finally(() => {
        if (cancelled) return
        store.setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [store.dataFile, store.dictFile])

  const handleTestKey = async () => {
    const apiName = store.selectedApi
    const key = apiName === "api1" ? store.apiKey1 : store.apiKey2
    setTesting(true)
    try {
      const res = await api.testKey(apiName, key)
      store.setApiStatus(apiName, { ok: res.ok, message: res.message })
    } catch (e) {
      store.setApiStatus(apiName, { ok: false, message: e.message })
    } finally {
      setTesting(false)
    }
  }

  const handleTypeChoiceChange = (v) => {
    setTypeChoice(v)
    if (v !== "(Sélectionner ou saisir)" && v !== "Autre (préciser ci-dessous)") {
      store.setSurveyType(v)
      setTypeCustom("")
    }
  }

  const handleTypeCustomChange = (v) => {
    setTypeCustom(v)
    if (v) store.setSurveyType(v)
  }

  // L'ID est obligatoire (recommandation SISTA)
  const idDefined = !!(store.columnMapping?.id || "").trim()
  const canAnalyze = !!store.dataFile && idDefined && !store.previewLoading

  const handleAnalyze = async () => {
    if (!store.dataFile) {
      store.setApiError("Veuillez d'abord importer une base de données.")
      return
    }
    if (!idDefined) {
      store.setApiError(
        "Veuillez définir la colonne identifiant unique avant de lancer l'analyse."
      )
      return
    }
    store.setIsAnalyzing(true)
    store.setApiError(null)
    try {
      const mappingToSend = Object.fromEntries(
        Object.entries(store.columnMapping).filter(([_, v]) => v && v.trim())
      )
      const data = await api.analyze(
        store.dataFile,
        store.dictFile,
        store.formFile,
        store.params,
        mappingToSend
      )
      store.setAnalysisData(data)
      store.setStep(2)
    } catch (e) {
      store.setApiError(e.message)
    } finally {
      store.setIsAnalyzing(false)
    }
  }

  const currentStatus =
    store.selectedApi === "api1" ? store.api1Status : store.api2Status
  const currentKey =
    store.selectedApi === "api1" ? store.apiKey1 : store.apiKey2
  const currentConfigured =
    store.selectedApi === "api1" ? store.api1Configured : store.api2Configured
  const canTest = (currentKey && currentKey.length > 0) || currentConfigured

  return (
    <div className="space-y-5 slide-up">
      {/* Carte upload */}
      <div className="card">
        <h3 className="card-title">Importer les fichiers</h3>
        <p className="card-desc">
          La base est obligatoire. Le dictionnaire et le questionnaire améliorent
          fortement la qualité des règles générées par l'IA.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UploadZone
            label="Base de données"
            hint=".xlsx, .csv, .sav, .dta"
            required
            iconColor="green"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.sav,.dta,.sas7bdat"
            file={store.dataFile}
            onChange={(f) => store.setDataFile(f)}
          />
          <UploadZone
            label="Dictionnaire"
            hint=".xlsx, .csv"
            accept=".csv,.xlsx,.xls"
            file={store.dictFile}
            onChange={(f) => store.setDictFile(f)}
          />
          <UploadZone
            label="Questionnaire"
            hint="XLSForm Kobo / PDF"
            accept=".xlsx,.xls,.pdf,.txt,.docx"
            file={store.formFile}
            onChange={(f) => store.setFormFile(f)}
          />
        </div>
      </div>

      {/* Carte colonnes-cles (apparait apres upload) */}
      <ColumnMappingCard />

      {/* Divider */}
      <div className="divider-fancy">
        <div className="text-gold-deep font-bold text-base bg-white px-3 py-1 rounded-full border-2 border-gold shadow-sm">
          ◆
        </div>
      </div>

      {/* Configuration IA */}
      <div className="card">
        <h3 className="card-title">Configuration de l'IA</h3>
        <p className="card-desc"></p>

        {/* Radio API */}
        <div className="flex gap-3 mb-4">
          {["api1", "api2"].map((apiName) => {
            const configured =
              apiName === "api1" ? store.api1Configured : store.api2Configured
            return (
              <button
                key={apiName}
                onClick={() => store.setSelectedApi(apiName)}
                className={`flex-1 py-3 rounded-xl font-sora font-semibold transition-all relative ${
                  store.selectedApi === apiName
                    ? "bg-navy text-white shadow-md"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {apiName === "api1" ? "API 1 (Plus efficace)" : "API 2"}
                {configured && (
                  <span
                    className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-400"
                    title="Clé chargée"
                  />
                )}
              </button>
            )
          })}
        </div>

        {currentConfigured && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-800 font-medium">
              Clé {store.selectedApi === "api1" ? "API 1" : "API 2"}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-3 items-end">
          <div>
            <label className="label-text">
              Clé {store.selectedApi === "api1" ? "API 1" : "API 2"}
            </label>
            <input
              type="password"
              className="input-field"
              value={currentKey}
              onChange={(e) =>
                store.selectedApi === "api1"
                  ? store.setApiKey1(e.target.value)
                  : store.setApiKey2(e.target.value)
              }
              placeholder=""
            />
          </div>
          <button
            onClick={handleTestKey}
            disabled={testing || !canTest}
            className="btn-primary whitespace-nowrap"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin inline" />
            ) : (
              "Tester la connexion"
            )}
          </button>
        </div>

        {currentStatus && (
          <div
            className={`mt-3 p-3 rounded-xl flex items-center gap-2 ${
              currentStatus.ok
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-800"
            }`}
          >
            {currentStatus.ok ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
            <span className="text-sm font-medium">{currentStatus.message}</span>
          </div>
        )}

        {/* Contexte enquête */}
        <div className="mt-6 bg-gradient-to-r from-purple-50 to-blue-50 border-l-4 border-purple-500 rounded-r-xl px-4 py-3 mb-4">
          <p className="font-sora font-bold text-navy text-sm m-0 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Contexte de l'enquête
          </p>
          <p className="text-gray-600 text-xs mt-1 m-0">
            Plus les informations sont riches, meilleures sont les règles générées par l'IA.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label-text">Type d'enquête</label>
            <select
              className="input-field"
              value={typeChoice}
              onChange={(e) => handleTypeChoiceChange(e.target.value)}
            >
              {TYPES_ENQUETE.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Ou saisie libre</label>
            <input
              type="text"
              className="input-field"
              value={typeCustom}
              onChange={(e) => handleTypeCustomChange(e.target.value)}
              placeholder=""
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="label-text">Description et objectifs</label>
          <textarea
            className="input-field min-h-[100px] resize-y"
            value={store.surveyDescription}
            onChange={(e) => store.setSurveyDescription(e.target.value)}
            placeholder=""
          />
        </div>

        <div className="mb-3">
          <label className="label-text">Population cible</label>
          <textarea
            className="input-field min-h-[70px] resize-y"
            value={store.surveyPopulation}
            onChange={(e) => store.setSurveyPopulation(e.target.value)}
            placeholder=""
          />
        </div>
      </div>

      {/* Divider */}
      <div className="divider-fancy">
        <div className="text-gold-deep font-bold text-base bg-white px-3 py-1 rounded-full border-2 border-gold shadow-sm">
          ▼
        </div>
      </div>

      {/* Bouton Analyser */}
      <div className="flex flex-col items-center">
        <button
          onClick={handleAnalyze}
          disabled={!canAnalyze || store.isAnalyzing}
          className="btn-primary px-12 py-4 text-base"
        >
          {store.isAnalyzing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              Analyse en cours...
            </>
          ) : (
            "Analyser le fichier"
          )}
        </button>
        {!canAnalyze && store.dataFile && !idDefined && (
          <p className="text-xs text-amber-700 mt-2 text-center">
            Définissez la colonne identifiant unique pour activer l'analyse.
          </p>
        )}
      </div>
    </div>
  )
}