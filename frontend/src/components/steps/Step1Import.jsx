import { useState } from "react"
import { useStore } from "../../store/useStore"
import { api } from "../../api/client"
import UploadZone from "../ui/UploadZone"
import { CheckCircle, XCircle, Loader2, Sparkles } from "lucide-react"

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

export default function Step1Import() {
  const store = useStore()
  const [typeChoice, setTypeChoice] = useState(TYPES_ENQUETE[0])
  const [typeCustom, setTypeCustom] = useState(store.surveyType || "")
  const [testing, setTesting] = useState(false)

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

  const handleAnalyze = async () => {
    if (!store.dataFile) {
      store.setApiError("Veuillez d'abord importer une base de données.")
      return
    }
    store.setIsAnalyzing(true)
    store.setApiError(null)
    try {
      const data = await api.analyze(
        store.dataFile,
        store.dictFile,
        store.formFile,
        store.params
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
                    title="Clé chargée depuis .env"
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

        {!currentConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex items-start gap-2">
            <XCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium m-0">
                Aucune clé {store.selectedApi === "api1" ? "API 1" : "API 2"} trouvée dans le fichier .env
              </p>
              <p className="text-xs mt-1 m-0">
                Saisissez manuellement la clé ci-dessous, ou ajoutez{" "}
                <code className="bg-amber-100 px-1 rounded font-mono">
                  {store.selectedApi === "api1" ? "ANTHROPIC_API_KEY" : "GROQ_API_KEY"}
                </code>{" "}
                dans backend/.env puis redémarrez le backend.
              </p>
            </div>
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
      <div className="flex justify-center">
        <button
          onClick={handleAnalyze}
          disabled={!store.dataFile || store.isAnalyzing}
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
      </div>
    </div>
  )
}