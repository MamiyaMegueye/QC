import { useState } from "react"
import { useStore } from "../store/useStore"
import { api } from "../api/client"
import MetricCard from "./cards/MetricCard"
import {
  Users, GitCompare, FileText, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, AlertTriangle, Download, RefreshCw,
  ArrowRight, X,
} from "lucide-react"
import UploadZone from "./ui/UploadZone"

// ====================================================================
//  Panneau d'appariement pré/post (Recommandation SISTA v2 - VIH/SIDA)
// ====================================================================

export default function PrePostPanel({ onClose }) {
  const [preFile, setPreFile] = useState(null)
  const [postFile, setPostFile] = useState(null)
  const [preLabel, setPreLabel] = useState("Pré-test")
  const [postLabel, setPostLabel] = useState("Post-test")

  const [preColumns, setPreColumns] = useState([])
  const [postColumns, setPostColumns] = useState([])
  const [preCodeCol, setPreCodeCol] = useState("")
  const [postCodeCol, setPostCodeCol] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const [expandedSection, setExpandedSection] = useState(null)

  // Auto-charge les colonnes quand un fichier est upload
  const handlePreFile = async (f) => {
    setPreFile(f)
    setPreCodeCol("")
    setPreColumns([])
    setResult(null)
    if (f) {
      try {
        const d = await api.previewColumnsOnly(f)
        setPreColumns(d.columns || [])
        // Auto-selection : chercher une colonne qui ressemble a un code
        const guess = (d.columns || []).find((c) => /code|id|uuid|numero/i.test(c))
        if (guess) setPreCodeCol(guess)
      } catch (e) {
        setError("Impossible de lire le fichier pré-test : " + e.message)
      }
    }
  }

  const handlePostFile = async (f) => {
    setPostFile(f)
    setPostCodeCol("")
    setPostColumns([])
    setResult(null)
    if (f) {
      try {
        const d = await api.previewColumnsOnly(f)
        setPostColumns(d.columns || [])
        const guess = (d.columns || []).find((c) => /code|id|uuid|numero/i.test(c))
        if (guess) setPostCodeCol(guess)
      } catch (e) {
        setError("Impossible de lire le fichier post-test : " + e.message)
      }
    }
  }

  const canCompare = preFile && postFile && preCodeCol && postCodeCol

  const handleCompare = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const d = await api.comparePrePost({
        preFile, postFile,
        preCodeCols: preCodeCol,
        postCodeCols: postCodeCol,
        preLabel, postLabel,
      })
      setResult(d)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = () => {
    if (!result) return
    // Génère un CSV avec les 4 sections
    const rows = []
    rows.push(["=== SYNTHÈSE ==="])
    rows.push(["Métrique", "Valeur"])
    Object.entries(result.summary).forEach(([k, v]) => rows.push([k, v]))
    rows.push([])
    rows.push([`=== PARTICIPANTS EN ${preLabel.toUpperCase()} SEULEMENT (${result.pre_only.length}) ===`])
    if (result.pre_only.length > 0) {
      rows.push(Object.keys(result.pre_only[0]))
      result.pre_only.forEach((r) => rows.push(Object.values(r)))
    }
    rows.push([])
    rows.push([`=== PARTICIPANTS EN ${postLabel.toUpperCase()} SEULEMENT (${result.post_only.length}) ===`])
    if (result.post_only.length > 0) {
      rows.push(Object.keys(result.post_only[0]))
      result.post_only.forEach((r) => rows.push(Object.values(r)))
    }
    rows.push([])
    rows.push([`=== DOUBLONS DANS ${preLabel.toUpperCase()} ===`])
    result.dup_pre.forEach((r) => rows.push([r.code, r.count]))
    rows.push([])
    rows.push([`=== DOUBLONS DANS ${postLabel.toUpperCase()} ===`])
    result.dup_post.forEach((r) => rows.push([r.code, r.count]))

    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `appariement_${preLabel}_${postLabel}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-6xl w-full my-4 shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-navy to-navy-deep text-white p-5 rounded-t-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gold rounded-full w-12 h-12 flex items-center justify-center">
              <GitCompare className="w-6 h-6 text-navy" />
            </div>
            <div>
              <h2 className="font-sora font-bold text-xl m-0">Appariement pré/post</h2>
              <p className="text-sm text-gold m-0 mt-0.5">
                Enquêtes longitudinales — vérification des paires code participant
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/10 rounded-lg p-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Explication */}
          <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-xl p-3 px-4 text-sm">
            <p className="text-blue-900 m-0">
              <strong>Cas d'usage :</strong> vérifier que chaque participant a bien
              été enregistré dans les deux phases de collecte (ex : enquête VIH/SIDA
              pré-test / post-test, panel, cohorte suivie dans le temps).
              Chaque participant est identifié par un <strong>code unique commun</strong> aux deux fichiers.
            </p>
          </div>

          {/* Upload des 2 fichiers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="mb-2">
                <label className="label-text">Libellé du fichier 1</label>
                <input
                  type="text"
                  className="input-field text-sm"
                  value={preLabel}
                  onChange={(e) => setPreLabel(e.target.value)}
                  placeholder="Pré-test"
                />
              </div>
              <UploadZone
                label={`Fichier 1 (${preLabel})`}
                hint=".xlsx, .csv, .sav, .dta"
                required
                iconColor="green"
                accept=".csv,.tsv,.txt,.xlsx,.xls,.sav,.dta,.sas7bdat"
                file={preFile}
                onChange={handlePreFile}
              />
              {preColumns.length > 0 && (
                <div className="mt-2 slide-up">
                  <label className="label-text text-xs">Colonne code dans {preLabel}</label>
                  <select
                    className="input-field text-sm"
                    value={preCodeCol}
                    onChange={(e) => setPreCodeCol(e.target.value)}
                  >
                    <option value="">— Sélectionner —</option>
                    {preColumns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2">
                <label className="label-text">Libellé du fichier 2</label>
                <input
                  type="text"
                  className="input-field text-sm"
                  value={postLabel}
                  onChange={(e) => setPostLabel(e.target.value)}
                  placeholder="Post-test"
                />
              </div>
              <UploadZone
                label={`Fichier 2 (${postLabel})`}
                hint=".xlsx, .csv, .sav, .dta"
                required
                iconColor="blue"
                accept=".csv,.tsv,.txt,.xlsx,.xls,.sav,.dta,.sas7bdat"
                file={postFile}
                onChange={handlePostFile}
              />
              {postColumns.length > 0 && (
                <div className="mt-2 slide-up">
                  <label className="label-text text-xs">Colonne code dans {postLabel}</label>
                  <select
                    className="input-field text-sm"
                    value={postCodeCol}
                    onChange={(e) => setPostCodeCol(e.target.value)}
                  >
                    <option value="">— Sélectionner —</option>
                    {postColumns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Bouton comparer */}
          <div className="flex justify-center">
            <button
              onClick={handleCompare}
              disabled={!canCompare || loading}
              className="btn-primary px-8 py-3 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Comparaison en cours...
                </>
              ) : (
                <>
                  <GitCompare className="w-4 h-4" />
                  Lancer la comparaison
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-3 px-4 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-900 m-0">{error}</p>
            </div>
          )}

          {/* Résultats */}
          {result && (
            <div className="slide-up space-y-4">
              <hr className="border-gray-200" />

              {/* Métriques */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard variant="navy" value={result.summary.n_pairs_complete} label="Paires complètes" />
                <MetricCard variant="red" value={result.summary.n_pre_only} label={`Sans ${result.post_label}`} />
                <MetricCard variant="orange" value={result.summary.n_post_only} label={`Sans ${result.pre_label}`} />
                <MetricCard
                  variant={
                    result.summary.completion_rate >= 90 ? "green" :
                    result.summary.completion_rate >= 70 ? "gold" : "red"
                  }
                  value={`${result.summary.completion_rate}%`}
                  label="Taux d'appariement"
                />
              </div>

              {/* Info fichiers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-bold text-navy m-0">{result.pre_label}</p>
                  <p className="text-gray-600 m-0 mt-1">
                    {result.summary.n_pre} lignes · {result.summary.n_distinct_pre} codes distincts
                    {result.summary.n_dup_pre > 0 && (
                      <span className="text-red-700 font-bold"> · {result.summary.n_dup_pre} doublon(s)</span>
                    )}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-bold text-navy m-0">{result.post_label}</p>
                  <p className="text-gray-600 m-0 mt-1">
                    {result.summary.n_post} lignes · {result.summary.n_distinct_post} codes distincts
                    {result.summary.n_dup_post > 0 && (
                      <span className="text-red-700 font-bold"> · {result.summary.n_dup_post} doublon(s)</span>
                    )}
                  </p>
                </div>
              </div>

              <button
                onClick={handleExport}
                className="w-full md:w-auto btn-secondary flex items-center gap-2 justify-center"
              >
                <Download className="w-4 h-4" />
                Exporter le rapport d'appariement (CSV)
              </button>

              {/* Sections détaillées */}
              <DetailSection
                title={`Participants en ${result.pre_label} SANS ${result.post_label}`}
                subtitle="Aucune réponse post-test trouvée pour ces codes"
                items={result.pre_only}
                color="red"
                isExpanded={expandedSection === "pre_only"}
                onToggle={() => setExpandedSection(expandedSection === "pre_only" ? null : "pre_only")}
              />

              <DetailSection
                title={`Participants en ${result.post_label} SANS ${result.pre_label}`}
                subtitle="Ces codes n'existent pas dans le fichier pré-test"
                items={result.post_only}
                color="orange"
                isExpanded={expandedSection === "post_only"}
                onToggle={() => setExpandedSection(expandedSection === "post_only" ? null : "post_only")}
              />

              {result.dup_pre.length > 0 && (
                <DetailSection
                  title={`Codes dupliqués dans ${result.pre_label}`}
                  subtitle="Un même code apparaît plusieurs fois — problème d'unicité"
                  items={result.dup_pre.map((d) => ({ code: d.code, "Nb occurrences": d.count }))}
                  color="red"
                  isExpanded={expandedSection === "dup_pre"}
                  onToggle={() => setExpandedSection(expandedSection === "dup_pre" ? null : "dup_pre")}
                />
              )}

              {result.dup_post.length > 0 && (
                <DetailSection
                  title={`Codes dupliqués dans ${result.post_label}`}
                  subtitle="Un même code apparaît plusieurs fois"
                  items={result.dup_post.map((d) => ({ code: d.code, "Nb occurrences": d.count }))}
                  color="red"
                  isExpanded={expandedSection === "dup_post"}
                  onToggle={() => setExpandedSection(expandedSection === "dup_post" ? null : "dup_post")}
                />
              )}

              {result.summary.n_pre_only === 0 && result.summary.n_post_only === 0 && (
                <div className="bg-green-50 border-l-4 border-green-500 rounded-r-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-green-900 m-0">
                      Appariement parfait
                    </p>
                    <p className="text-sm text-green-800 m-0 mt-1">
                      Tous les participants sont présents dans les deux fichiers.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailSection({ title, subtitle, items, color, isExpanded, onToggle }) {
  const colorClass = {
    red: "border-red-500 bg-red-50",
    orange: "border-orange-500 bg-orange-50",
  }[color] || "border-gray-300 bg-gray-50"

  const badge = {
    red: "bg-red-600 text-white",
    orange: "bg-orange-500 text-white",
  }[color] || "bg-gray-500 text-white"

  if (items.length === 0) return null

  const columns = items.length > 0 ? Object.keys(items[0]) : []

  return (
    <div className={`border-l-4 ${colorClass} rounded-r-xl overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 px-4 text-left hover:bg-black/5"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={`${badge} font-mono font-bold text-sm px-3 py-1 rounded-md flex-shrink-0`}>
            {items.length}
          </span>
          <div className="min-w-0">
            <p className="font-sora font-bold text-navy text-sm m-0">{title}</p>
            <p className="text-xs text-gray-600 m-0 mt-0.5">{subtitle}</p>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-navy" /> : <ChevronDown className="w-4 h-4 text-navy" />}
      </button>

      {isExpanded && (
        <div className="bg-white p-3 border-t border-gray-200 max-h-96 overflow-y-auto slide-up">
          <table className="w-full text-xs">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-bold text-navy whitespace-nowrap">
                    {c === "row_index" ? "Ligne" : c === "code" ? "Code" : c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 200).map((row, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-1.5 whitespace-nowrap">
                      {c === "code" ? (
                        <span className="font-mono font-bold text-navy">{row[c]}</span>
                      ) : (
                        String(row[c] ?? "")
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > 200 && (
            <p className="text-xs text-gray-500 italic mt-2 m-0 text-center">
              Affichage limité aux 200 premiers cas — exportez en CSV pour la liste complète.
            </p>
          )}
        </div>
      )}
    </div>
  )
}