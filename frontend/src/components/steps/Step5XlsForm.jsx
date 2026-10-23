import { useState, useRef } from "react"
import { useStore } from "../../store/useStore"
import { api } from "../../api/client"
import {
  FileText,
  Upload,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Plus,
  X,
} from "lucide-react"

export default function Step5XlsForm() {
  const apiKey1 = useStore((s) => s.apiKey1)
  const apiKey2 = useStore((s) => s.apiKey2)
  const selectedApi = useStore((s) => s.selectedApi)

  const [noteCadrageFile, setNoteCadrageFile] = useState(null)
  const [cadreResultatsFile, setCadreResultatsFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [resultBlob, setResultBlob] = useState(null)
  const [resultFilename, setResultFilename] = useState("")

  const ncFileRef = useRef(null)
  const crFileRef = useRef(null)

  const currentApiKey = selectedApi === "api1" ? apiKey1 : apiKey2

  const handleGenerate = async () => {
    if (!noteCadrageFile) {
      setError("Veuillez charger la note de cadrage (.docx)")
      return
    }
    if (!currentApiKey) {
      setError("Veuillez configurer une cle API dans l'etape Importer")
      return
    }

    setLoading(true)
    setError("")
    setSuccess(false)
    setResultBlob(null)

    try {
      const { blob, filename } = await api.generateQuestionnaire(
        noteCadrageFile,
        currentApiKey,
        selectedApi,
        cadreResultatsFile
      )
      setResultBlob(blob)
      setResultFilename(filename)
      setSuccess(true)
    } catch (e) {
      setError(e.message || "Erreur lors de la generation")
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!resultBlob) return
    const url = URL.createObjectURL(resultBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = resultFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5 slide-up">
      <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-purple-700" />
          </div>
          <div>
            <h2 className="text-lg font-sora font-bold text-navy">
              Generateur de questionnaire
            </h2>
            <p className="text-sm text-gray-500">
              L'IA elabore un questionnaire structure a partir de la note de cadrage et du cadre de resultats
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
        <h3 className="font-sora font-semibold text-navy mb-4">
          1. Note de cadrage (obligatoire)
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Document de methodologie de l'enquete (.docx)
        </p>

        {!noteCadrageFile ? (
          <button
            onClick={() => ncFileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center gap-3 hover:border-purple-400 hover:bg-purple-50/30 transition-colors cursor-pointer"
          >
            <Upload className="w-8 h-8 text-gray-400" />
            <span className="text-sm text-gray-500">
              Cliquez pour charger la note de cadrage{" "}
              <span className="font-semibold text-purple-600">.docx</span>
            </span>
          </button>
        ) : (
          <div className="flex items-center justify-between bg-purple-50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-900">
                {noteCadrageFile.name}
              </span>
              <span className="text-xs text-gray-400">
                ({(noteCadrageFile.size / 1024).toFixed(0)} Ko)
              </span>
            </div>
            <button
              onClick={() => {
                setNoteCadrageFile(null)
                setSuccess(false)
                setResultBlob(null)
              }}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <input
          ref={ncFileRef}
          type="file"
          accept=".docx,.doc"
          className="hidden"
          onChange={(e) => {
            setNoteCadrageFile(e.target.files[0] || null)
            setSuccess(false)
            setResultBlob(null)
            setError("")
          }}
        />

        <h3 className="font-sora font-semibold text-navy mt-6 mb-3">
          2. Cadre de resultats / cadre logique (optionnel)
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Matrice des indicateurs — ameliore la couverture des indicateurs dans le questionnaire
        </p>

        {!cadreResultatsFile ? (
          <button
            onClick={() => crFileRef.current?.click()}
            className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ajouter le cadre de resultats
          </button>
        ) : (
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">
                {cadreResultatsFile.name}
              </span>
            </div>
            <button
              onClick={() => setCadreResultatsFile(null)}
              className="text-gray-400 hover:text-red-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <input
          ref={crFileRef}
          type="file"
          accept=".docx,.doc,.xlsx,.xls,.txt"
          className="hidden"
          onChange={(e) => setCadreResultatsFile(e.target.files[0] || null)}
        />
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && resultBlob && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-green-800">
                  Questionnaire genere avec succes !
                </p>
                <p className="text-xs text-green-600">{resultFilename}</p>
              </div>
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              Telecharger .docx
            </button>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || !noteCadrageFile || !currentApiKey}
          className={`w-full py-3 rounded-xl font-sora font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
            loading || !noteCadrageFile || !currentApiKey
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-navy hover:bg-navy/90 text-white shadow-lg"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generation en cours... (peut prendre 30-60s)
            </>
          ) : (
            <>
              <FileSpreadsheet className="w-5 h-5" />
              Generer le questionnaire
            </>
          )}
        </button>

        {!currentApiKey && (
          <p className="text-xs text-amber-600 mt-2 text-center">
            Configurez une cle API dans l'etape "Importer" pour utiliser cette fonctionnalite
          </p>
        )}
      </div>
    </div>
  )
}
