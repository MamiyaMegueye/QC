import { useState, useRef } from "react"
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, Loader2, Info, ChevronDown, ChevronUp } from "lucide-react"
import { useStore } from "../../store/useStore"
import { getToken } from "../../api/client"

const API_URL = import.meta.env.VITE_API_URL || ""

const SEV_STYLE = {
  critique: { bg: "bg-red-50 border-red-200", icon: "text-red-600", badge: "bg-red-100 text-red-700" },
  majeur:   { bg: "bg-amber-50 border-amber-200", icon: "text-amber-600", badge: "bg-amber-100 text-amber-700" },
  mineur:   { bg: "bg-blue-50 border-blue-200", icon: "text-blue-500", badge: "bg-blue-100 text-blue-700" },
}

export default function DiagnosticAudit() {
  const { apiKey1, apiKey2 } = useStore()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState(null)
  const [expanded, setExpanded] = useState({})
  const inputRef = useRef()

  const hasKey = !!(apiKey1 || apiKey2)

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 50 * 1024 * 1024) {
      setError("Fichier trop volumineux (max 50 Mo)")
      e.target.value = ""
      return
    }
    setFile(f)
    setError("")
    setResult(null)
  }

  const runDiagnostic = async () => {
    if (!file) return
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const fd = new FormData()
      fd.append("questionnaire", file)
      fd.append("api", apiKey1 ? "api1" : "api2")
      fd.append("api_key", apiKey1 || apiKey2)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 300_000)
      const res = await fetch(`${API_URL}/api/diagnostic-audit?token=${encodeURIComponent(getToken())}`, {
        method: "POST",
        body: fd,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Erreur ${res.status}`)
      }
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setError(err.name === "AbortError" ? "Délai dépassé (5 min)" : err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (i) => setExpanded((p) => ({ ...p, [i]: !p[i] }))

  const scoreColor = (s) => s >= 75 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-red-600"
  const scoreBg = (s) => s >= 75 ? "bg-emerald-50 border-emerald-200" : s >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-accent-violet" />
          Charger le questionnaire
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Formats acceptés : .xlsx, .xls, .docx, .csv — Le fichier sera analysé par l'IA.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-accent-violet/50 hover:bg-violet-50/30 transition-all"
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.docx,.csv" onChange={handleFile} className="hidden" />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-accent-violet" />
              <span className="font-medium text-navy">{file.name}</span>
              <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(0)} Ko)</span>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Cliquez pour sélectionner un fichier</p>
            </>
          )}
        </div>

        {!hasKey && (
          <div className="mt-3 flex items-center gap-2 text-amber-600 text-sm bg-amber-50 rounded-lg px-3 py-2">
            <Info className="w-4 h-4 shrink-0" />
            Configurez une clé API (Anthropic ou Groq) dans les paramètres pour lancer l'analyse.
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={runDiagnostic}
          disabled={!file || loading || !hasKey}
          className="mt-4 w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-accent-violet to-purple-600 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Analyse en cours…
            </>
          ) : (
            <>
              <AlertTriangle className="w-5 h-5" />
              Lancer le diagnostic
            </>
          )}
        </button>
      </div>

      {/* Résultats */}
      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Score global */}
          <div className={`rounded-2xl border p-5 ${scoreBg(result.score_global)}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Score global</p>
                <p className={`text-4xl font-bold ${scoreColor(result.score_global)}`}>
                  {result.score_global}<span className="text-lg">/100</span>
                </p>
              </div>
              <div className="text-right text-sm text-gray-600">
                <p>{result.nb_questions || "?"} questions</p>
                <p>{result.nb_sections || "?"} sections</p>
              </div>
            </div>
            {result.resume && <p className="mt-3 text-sm text-gray-700">{result.resume}</p>}
          </div>

          {/* Points forts */}
          {result.points_forts?.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <h4 className="font-semibold text-emerald-700 mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Points forts
              </h4>
              <ul className="space-y-1">
                {result.points_forts.map((p, i) => (
                  <li key={i} className="text-sm text-emerald-800 flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">•</span> {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Problèmes */}
          {result.problemes?.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-navy flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Problèmes détectés ({result.problemes.length})
              </h4>
              {result.problemes.map((pb, i) => {
                const sev = SEV_STYLE[pb.severite] || SEV_STYLE.mineur
                return (
                  <div key={i} className={`rounded-xl border p-4 ${sev.bg}`}>
                    <div className="flex items-start justify-between cursor-pointer" onClick={() => toggleExpand(i)}>
                      <div className="flex items-start gap-3 flex-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${sev.badge}`}>
                          {pb.severite}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">
                            {pb.question_code && <span className="text-gray-500 mr-1">[{pb.question_code}]</span>}
                            {pb.description}
                          </p>
                        </div>
                      </div>
                      {expanded[i] ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                    {expanded[i] && pb.recommandation && (
                      <div className="mt-2 ml-16 text-sm text-gray-600 bg-white/60 rounded-lg p-3">
                        💡 {pb.recommandation}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Recommandations générales */}
          {result.recommandations_generales?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <h4 className="font-semibold text-blue-700 mb-2">Recommandations générales</h4>
              <ul className="space-y-1">
                {result.recommandations_generales.map((r, i) => (
                  <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">•</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tokens */}
          {result.tokens && (
            <p className="text-xs text-gray-400 text-right">
              Tokens : {result.tokens.input} in / {result.tokens.output} out
            </p>
          )}
        </div>
      )}
    </div>
  )
}
