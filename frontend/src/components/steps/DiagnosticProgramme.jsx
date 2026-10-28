import { useState, useRef } from "react"
import { Upload, FileSpreadsheet, Loader2, Info, XCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react"
import { useStore } from "../../store/useStore"
import { getToken } from "../../api/client"

const API_URL = import.meta.env.VITE_API_URL || ""

const SEV_COLORS = {
  critique: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700" },
  majeur:   { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  mineur:   { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700" },
}

const CAT_LABELS = {
  listes: "Listes de choix",
  logique: "Logique de saut",
  contraintes: "Contraintes",
  structure: "Structure",
  nommage: "Nommage",
  orphelins: "Éléments orphelins",
  bonnes_pratiques: "Bonnes pratiques",
}

export default function DiagnosticProgramme() {
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
    if (f.size > 50 * 1024 * 1024) { setError("Fichier trop volumineux (max 50 Mo)"); e.target.value = ""; return }
    setFile(f); setError(""); setResult(null)
  }

  const runDiag = async () => {
    if (!file) return
    setLoading(true); setError(""); setResult(null)
    try {
      const fd = new FormData()
      fd.append("programme", file)
      fd.append("api", apiKey1 ? "api1" : "api2")
      fd.append("api_key", apiKey1 || apiKey2)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 300_000)
      const res = await fetch(`${API_URL}/api/diagnostic-programme?token=${encodeURIComponent(getToken())}`, {
        method: "POST", body: fd, signal: controller.signal,
      })
      clearTimeout(timeout)
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.detail || `Erreur ${res.status}`) }
      setResult(await res.json())
    } catch (err) {
      setError(err.name === "AbortError" ? "Délai dépassé (5 min)" : err.message)
    } finally { setLoading(false) }
  }

  const toggle = (cat) => setExpanded((p) => ({ ...p, [cat]: !p[cat] }))

  const scoreColor = (s) => s >= 80 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-red-600"
  const scoreBg = (s) => s >= 80 ? "bg-emerald-50 border-emerald-200" : s >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"

  return (
    <div className="space-y-5">
      {/* Upload */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-accent-violet" />
          Charger le programme de collecte (XLSForm)
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Chargez un fichier XLSForm (.xlsx) contenant les feuilles survey, choices et settings pour un diagnostic complet.
        </p>

        <div onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-accent-violet/50 hover:bg-violet-50/30 transition-all">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-accent-violet" />
              <span className="font-medium text-navy">{file.name}</span>
              <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(0)} Ko)</span>
            </div>
          ) : (
            <><Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Cliquez pour sélectionner un fichier XLSForm</p></>
          )}
        </div>

        {!hasKey && (
          <div className="mt-3 flex items-center gap-2 text-amber-600 text-sm bg-amber-50 rounded-lg px-3 py-2">
            <Info className="w-4 h-4 shrink-0" />
            Configurez une clé API dans les paramètres.
          </div>
        )}
        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
            <XCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        <button onClick={runDiag} disabled={!file || loading || !hasKey}
          className="mt-4 w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-accent-violet to-purple-600 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
          {loading ? (<><Loader2 className="w-5 h-5 animate-spin" />Analyse en cours…</>) : (<><AlertTriangle className="w-5 h-5" />Lancer le diagnostic</>)}
        </button>
      </div>

      {/* Résultats */}
      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Score */}
          <div className={`rounded-2xl border p-5 ${scoreBg(result.score)}`}>
            <div className="flex items-center justify-between">
              <h4 className="font-semibold flex items-center gap-2">
                {result.score >= 80 ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
                Score du programme
              </h4>
              <span className={`text-3xl font-bold ${scoreColor(result.score)}`}>{result.score}<span className="text-lg">/100</span></span>
            </div>
            <p className="text-sm mt-2 text-gray-700">{result.resume}</p>
          </div>

          {/* Points forts */}
          {result.points_forts?.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <h4 className="font-semibold text-emerald-700 mb-2">Points forts</h4>
              <ul className="space-y-1">
                {result.points_forts.map((p, i) => (
                  <li key={i} className="text-sm text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />{p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Problèmes par catégorie */}
          {result.problemes && Object.entries(result.problemes).filter(([,v]) => v?.length > 0).map(([cat, items]) => (
            <div key={cat} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button onClick={() => toggle(cat)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-navy">{CAT_LABELS[cat] || cat}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{items.length}</span>
                </div>
                {expanded[cat] ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {expanded[cat] && (
                <div className="border-t border-gray-100 p-4 space-y-2">
                  {items.map((item, i) => {
                    const sev = item.severite || "mineur"
                    const c = SEV_COLORS[sev] || SEV_COLORS.mineur
                    return (
                      <div key={i} className={`${c.bg} ${c.border} border rounded-xl p-3`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>{sev.toUpperCase()}</span>
                          {item.element && <span className="text-xs font-mono text-gray-500">{item.element}</span>}
                        </div>
                        <p className={`text-sm ${c.text}`}>{item.description}</p>
                        {item.suggestion && <p className="text-xs text-gray-600 mt-1 italic">💡 {item.suggestion}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Recommandations */}
          {result.recommandations?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <h4 className="font-semibold text-blue-700 mb-2">Recommandations</h4>
              <ul className="space-y-1">
                {result.recommandations.map((r, i) => (
                  <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">•</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.tokens && <p className="text-xs text-gray-400 text-right">Tokens : {result.tokens.input} in / {result.tokens.output} out</p>}
        </div>
      )}
    </div>
  )
}
