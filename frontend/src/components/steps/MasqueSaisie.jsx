import { useState, useRef } from "react"
import { Upload, FileSpreadsheet, Download, Loader2, XCircle, CheckCircle2, Table2, List } from "lucide-react"
import { getToken } from "../../api/client"

const API_URL = import.meta.env.VITE_API_URL || ""

export default function MasqueSaisie() {
  const [file, setFile] = useState(null)
  const [format, setFormat] = useState("kobo")
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState(null)
  const [viewTab, setViewTab] = useState("survey")
  const inputRef = useRef()

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 50 * 1024 * 1024) { setError("Fichier trop volumineux (max 50 Mo)"); e.target.value = ""; return }
    setFile(f); setError(""); setResult(null)
  }

  const runGenerate = async () => {
    if (!file) return
    setLoading(true); setError(""); setResult(null)
    try {
      const fd = new FormData()
      fd.append("questionnaire", file)
      fd.append("format_cible", format)
      fd.append("api", "api1")
      fd.append("api_key", "")

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 300_000)
      const res = await fetch(`${API_URL}/api/masque-saisie?token=${encodeURIComponent(getToken())}`, {
        method: "POST", body: fd, signal: controller.signal,
      })
      clearTimeout(timeout)
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.detail || `Erreur ${res.status}`) }
      setResult(await res.json())
    } catch (err) {
      setError(err.name === "AbortError" ? "Délai dépassé (5 min)" : err.message)
    } finally { setLoading(false) }
  }

  const downloadXlsx = async () => {
    if (!result) return
    setDownloading(true)
    try {
      const res = await fetch(`${API_URL}/api/masque-saisie/download?token=${encodeURIComponent(getToken())}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey: result.survey, choices: result.choices, settings: result.settings }),
      })
      if (!res.ok) throw new Error("Erreur téléchargement")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url
      a.download = `masque_${result.settings?.form_id || "saisie"}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } catch (err) { setError(err.message) }
    finally { setDownloading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-accent-teal" />
          Charger le questionnaire source
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          L'IA convertira votre questionnaire en masque de saisie XLSForm (compatible KoboToolbox / ODK).
        </p>
        <div onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-accent-teal/50 hover:bg-teal-50/30 transition-all">
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.docx,.csv" onChange={handleFile} className="hidden" />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-accent-teal" />
              <span className="font-medium text-navy">{file.name}</span>
              <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(0)} Ko)</span>
            </div>
          ) : (
            <><Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Cliquez pour sélectionner un fichier</p></>
          )}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-gray-600 font-medium">Format cible :</span>
          {["kobo", "cspro"].map((f) => (
            <button key={f} onClick={() => setFormat(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${format === f ? "bg-accent-teal text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {f === "kobo" ? "KoboToolbox" : "CSPro"}
            </button>
          ))}
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
            <XCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}
        <button onClick={runGenerate} disabled={!file || loading}
          className="mt-4 w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-accent-teal to-emerald-600 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
          {loading ? (<><Loader2 className="w-5 h-5 animate-spin" />Génération en cours…</>) : (<><Table2 className="w-5 h-5" />Générer le masque</>)}
        </button>
      </div>

      {result && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Masque généré</h4>
              <button onClick={downloadXlsx} disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50">
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Télécharger .xlsx
              </button>
            </div>
            <p className="text-sm text-emerald-800">{result.resume}</p>
            <div className="mt-2 flex gap-4 text-xs text-emerald-600">
              <span>{result.nb_questions || result.survey?.length || "?"} questions</span>
              <span>{result.choices?.length || 0} choix</span>
              <span>Format : {result.format || format}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-200">
              {[{id: "survey", label: "Survey", icon: List}, {id: "choices", label: "Choices", icon: Table2}].map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.id} onClick={() => setViewTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${viewTab === t.id ? "text-accent-teal border-b-2 border-accent-teal bg-teal-50/30" : "text-gray-500 hover:text-gray-700"}`}>
                    <Icon className="w-4 h-4" />{t.label}
                  </button>
                )
              })}
            </div>
            <div className="max-h-96 overflow-auto p-3">
              {viewTab === "survey" && (
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-gray-500 border-b">
                    <th className="p-2">type</th><th className="p-2">name</th><th className="p-2">label</th><th className="p-2">required</th><th className="p-2">relevant</th>
                  </tr></thead>
                  <tbody>
                    {(result.survey || []).map((r, i) => (
                      <tr key={i} className={`border-b border-gray-100 ${r.type?.startsWith("begin_") || r.type?.startsWith("end_") ? "bg-gray-50 font-semibold" : ""}`}>
                        <td className="p-2 text-accent-teal font-mono">{r.type}</td>
                        <td className="p-2 font-mono">{r.name}</td>
                        <td className="p-2">{r.label}</td>
                        <td className="p-2">{r.required}</td>
                        <td className="p-2 text-gray-500 font-mono text-[10px]">{r.relevant}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {viewTab === "choices" && (
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-gray-500 border-b">
                    <th className="p-2">list_name</th><th className="p-2">name</th><th className="p-2">label</th>
                  </tr></thead>
                  <tbody>
                    {(result.choices || []).map((r, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="p-2 font-mono text-accent-teal">{r.list_name}</td>
                        <td className="p-2 font-mono">{r.name}</td>
                        <td className="p-2">{r.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {result.notes_conception?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <h4 className="font-semibold text-blue-700 mb-2">Notes de conception</h4>
              <ul className="space-y-1">
                {result.notes_conception.map((n, i) => (
                  <li key={i} className="text-sm text-blue-800 flex items-start gap-2"><span className="text-blue-400 mt-0.5">•</span> {n}</li>
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
