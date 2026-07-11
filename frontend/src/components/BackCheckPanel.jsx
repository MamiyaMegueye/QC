import { useState, useEffect, useMemo } from "react"
import {
  X, Upload, FileSpreadsheet, GitCompare, Loader2, ArrowLeft, ArrowRight,
  CheckCircle2, AlertTriangle, AlertCircle, TrendingDown, TrendingUp,
  Users, Sliders, Search, Download, Info, ChevronDown, ChevronUp,
} from "lucide-react"
import { api } from "../api/client"

// ============================================================
//  Constantes
// ============================================================

const SEVERITY_COLORS = {
  green:  { bg: "bg-green-500",  bgLight: "bg-green-50",  text: "text-green-800",  border: "border-green-500",  label: "OK" },
  yellow: { bg: "bg-yellow-500", bgLight: "bg-yellow-50", text: "text-yellow-800", border: "border-yellow-500", label: "À surveiller" },
  orange: { bg: "bg-orange-500", bgLight: "bg-orange-50", text: "text-orange-800", border: "border-orange-500", label: "Attention" },
  red:    { bg: "bg-red-500",    bgLight: "bg-red-50",    text: "text-red-800",    border: "border-red-500",    label: "Critique" },
}

const SEVERITY_LABEL = (s) => SEVERITY_COLORS[s]?.label || s

// ============================================================
//  Composant principal
// ============================================================

export default function BackCheckPanel({ onClose }) {
  const [currentStep, setCurrentStep] = useState(1)

  // Etape 1 : fichiers
  const [mainFile, setMainFile] = useState(null)
  const [bcFile, setBcFile] = useState(null)
  const [mainLabel, setMainLabel] = useState("Enquête principale")
  const [bcLabel, setBcLabel] = useState("Back check")

  // Etape 2 : configuration
  const [preview, setPreview] = useState(null)         // { common_columns, main_columns, bc_columns, n_main_rows, n_bc_rows }
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)

  const [mainCodeCol, setMainCodeCol] = useState("")
  const [bcCodeCol, setBcCodeCol] = useState("")
  const [mainEnqueteurCol, setMainEnqueteurCol] = useState("")
  const [varConfigs, setVarConfigs] = useState({})     // {var_name: {selected, type, tolerance, tolerance_type}}
  const [varFilterText, setVarFilterText] = useState("")

  // Etape 3 : resultats
  const [result, setResult] = useState(null)
  const [runLoading, setRunLoading] = useState(false)
  const [runError, setRunError] = useState(null)
  const [enqExpanded, setEnqExpanded] = useState(null) // enqueteur name

  // Passage a l'etape 2 : charger les colonnes communes
  const goToStep2 = async () => {
    if (!mainFile || !bcFile) return
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const data = await api.backcheckCommonColumns(mainFile, bcFile)
      setPreview(data)

      // Auto-detection : si une colonne "code_participant" / "id" existe dans les 2 fichiers,
      // on la pre-selectionne
      const codeCandidates = ["code_participant", "code", "id_participant", "id",
                              "participant_id", "participantid"]
      const findCol = (cols) => {
        for (const cand of codeCandidates) {
          const found = cols.find((c) => c.toLowerCase().replace(/[_\s-]/g, "") === cand.replace(/[_\s-]/g, ""))
          if (found) return found
        }
        // Fallback : premiere colonne commune contenant "id" ou "code"
        return cols.find((c) => /id|code/i.test(c)) || ""
      }
      setMainCodeCol(findCol(data.main_columns || []))
      setBcCodeCol(findCol(data.bc_columns || []))

      // Auto-detection enqueteur (uniquement dans le fichier principal)
      const enqCandidates = ["enqueteur", "enquêteur", "agent", "interviewer",
                             "enumerator", "surveyor"]
      const foundEnq = (data.main_columns || []).find((c) =>
        enqCandidates.some((e) => c.toLowerCase().includes(e))
      )
      setMainEnqueteurCol(foundEnq || "")

      // Initialiser la config des variables : toutes cochees par defaut avec les valeurs auto
      const initialConfig = {}
      for (const v of data.common_columns || []) {
        // Ne pas comparer la colonne code ni la colonne enqueteur avec elle-meme
        const isCodeCol = v.name === mainCodeCol || v.name === bcCodeCol
        const isEnqCol = v.name === foundEnq
        initialConfig[v.name] = {
          selected: !isCodeCol && !isEnqCol,
          type: v.type_auto,
          tolerance: v.tolerance_auto,
          tolerance_type: v.tolerance_type_auto,
        }
      }
      setVarConfigs(initialConfig)
      setCurrentStep(2)
    } catch (e) {
      setPreviewError(e.message || "Erreur lors de la lecture des colonnes.")
    } finally {
      setPreviewLoading(false)
    }
  }

  // Deselectionner automatiquement les colonnes code/enqueteur quand elles changent
  useEffect(() => {
    if (!preview) return
    setVarConfigs((prev) => {
      const next = { ...prev }
      for (const name of Object.keys(next)) {
        if (name === mainCodeCol || name === bcCodeCol || name === mainEnqueteurCol) {
          if (next[name].selected) next[name] = { ...next[name], selected: false }
        }
      }
      return next
    })
  }, [mainCodeCol, bcCodeCol, mainEnqueteurCol, preview])

  const selectedVars = useMemo(() => {
    return Object.entries(varConfigs)
      .filter(([_, cfg]) => cfg.selected)
      .map(([name, cfg]) => ({ name, ...cfg }))
  }, [varConfigs])

  const filteredCommon = useMemo(() => {
    if (!preview) return []
    const q = varFilterText.trim().toLowerCase()
    return preview.common_columns.filter((v) =>
      !q || v.name.toLowerCase().includes(q)
    )
  }, [preview, varFilterText])

  const toggleVar = (name) => {
    setVarConfigs((prev) => ({
      ...prev,
      [name]: { ...prev[name], selected: !prev[name].selected },
    }))
  }

  const updateVarConfig = (name, patch) => {
    setVarConfigs((prev) => ({
      ...prev,
      [name]: { ...prev[name], ...patch },
    }))
  }

  const selectAll = () => {
    setVarConfigs((prev) => {
      const next = { ...prev }
      for (const name of Object.keys(next)) {
        if (name !== mainCodeCol && name !== bcCodeCol && name !== mainEnqueteurCol) {
          next[name] = { ...next[name], selected: true }
        }
      }
      return next
    })
  }

  const deselectAll = () => {
    setVarConfigs((prev) => {
      const next = { ...prev }
      for (const name of Object.keys(next)) {
        next[name] = { ...next[name], selected: false }
      }
      return next
    })
  }

  // Etape 3 : lancer l'analyse
  const runAnalysis = async () => {
    if (!mainCodeCol || !bcCodeCol || selectedVars.length === 0) return
    setRunLoading(true)
    setRunError(null)
    try {
      const variablesConfig = selectedVars.map((v) => ({
        name: v.name,
        type: v.type,
        tolerance: Number(v.tolerance) || 0,
        tolerance_type: v.tolerance_type,
      }))
      const data = await api.runBackcheck({
        mainFile,
        bcFile,
        mainCodeCols: mainCodeCol,
        bcCodeCols: bcCodeCol,
        variablesConfig,
        mainEnqueteurCol,
        mainLabel,
        bcLabel,
      })
      setResult(data)
      setCurrentStep(3)
    } catch (e) {
      setRunError(e.message || "Erreur lors de l'analyse.")
    } finally {
      setRunLoading(false)
    }
  }

  // Export CSV
  const exportDivergencesCSV = () => {
    if (!result?.divergences?.length) return
    const rows = [
      ["Code participant", "Enquêteur", "Variable", `Valeur ${mainLabel}`, `Valeur ${bcLabel}`],
      ...result.divergences.map((d) => [
        d.code, d.enqueteur, d.variable, d.val_main, d.val_bc,
      ]),
    ]
    const csv = rows.map((r) =>
      r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")
    ).join("\r\n")
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "backcheck_divergences.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const canGoToStep2 = mainFile && bcFile
  const canRun = mainCodeCol && bcCodeCol && selectedVars.length > 0

  // Rendu principal
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 slide-up">
      <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[95vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-navy text-white p-5 flex items-center gap-3 flex-shrink-0">
          <div className="bg-gold rounded-full w-10 h-10 flex items-center justify-center">
            <GitCompare className="w-5 h-5 text-navy" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-sora font-bold m-0 text-lg">Back check / Contrôle croisé</h2>
            <p className="text-gold text-sm m-0 mt-0.5">
              {currentStep === 1 && "Étape 1 sur 3 — Charger les 2 fichiers"}
              {currentStep === 2 && "Étape 2 sur 3 — Configurer les variables à comparer"}
              {currentStep === 3 && "Étape 3 sur 3 — Résultats"}
            </p>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded-lg p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 flex items-center justify-center gap-3 flex-shrink-0">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                ${currentStep === s ? "bg-navy text-white"
                : currentStep > s ? "bg-green-500 text-white"
                : "bg-slate-200 text-slate-500"}`}>
                {currentStep > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`w-16 h-1 ${currentStep > s ? "bg-green-500" : "bg-slate-200"} rounded`} />}
            </div>
          ))}
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ============================================================
              ETAPE 1 : Upload des 2 fichiers
              ============================================================ */}
          {currentStep === 1 && (
            <div className="space-y-4 slide-up">
              <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-xl p-4">
                <p className="text-sm text-blue-900 m-0">
                  <strong>Principe :</strong> vous chargez d'un côté votre <strong>enquête principale</strong> (le questionnaire complet
                  administré par vos enquêteurs), et de l'autre le <strong>back check</strong> (une ré-interview courte,
                  faite par une équipe indépendante sur un sous-échantillon des mêmes participants). L'outil compare
                  les réponses et détecte les enquêteurs dont le taux de concordance est anormalement bas — signe
                  probable de fabrication ou de bâclage.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FileSlot
                  label={mainLabel}
                  onLabelChange={setMainLabel}
                  file={mainFile}
                  onFileChange={setMainFile}
                  helper="Le questionnaire complet (30 min) administré par les enquêteurs habituels."
                  color="blue"
                />
                <FileSlot
                  label={bcLabel}
                  onLabelChange={setBcLabel}
                  file={bcFile}
                  onFileChange={setBcFile}
                  helper="La ré-interview courte (5-10 min) par une équipe indépendante."
                  color="purple"
                />
              </div>

              {previewError && (
                <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800 m-0">{previewError}</p>
                </div>
              )}

              <div className="flex justify-end pt-3">
                <button
                  onClick={goToStep2}
                  disabled={!canGoToStep2 || previewLoading}
                  className="bg-navy text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-navy-deep disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {previewLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Lecture des colonnes...
                    </>
                  ) : (
                    <>
                      Suivant : configurer
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ============================================================
              ETAPE 2 : Configuration (code + variables + tolerances)
              ============================================================ */}
          {currentStep === 2 && preview && (
            <div className="space-y-5 slide-up">
              {/* Colonnes clés */}
              <div className="card">
                <h3 className="card-title flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-gold" />
                  Colonnes clés
                </h3>
                <p className="card-desc mb-3">
                  Le <strong>code participant</strong> permet d'apparier les 2 fichiers.
                  La <strong>colonne enquêteur</strong> permet le calcul du taux de concordance par personne.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="label-text">
                      Code participant — {mainLabel} <span className="text-red-500">*</span>
                    </label>
                    <select
                      className="input-field"
                      value={mainCodeCol}
                      onChange={(e) => setMainCodeCol(e.target.value)}
                    >
                      <option value="">— Choisir —</option>
                      {preview.main_columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-text">
                      Code participant — {bcLabel} <span className="text-red-500">*</span>
                    </label>
                    <select
                      className="input-field"
                      value={bcCodeCol}
                      onChange={(e) => setBcCodeCol(e.target.value)}
                    >
                      <option value="">— Choisir —</option>
                      {preview.bc_columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-text">
                      Enquêteur principal (optionnel)
                    </label>
                    <select
                      className="input-field"
                      value={mainEnqueteurCol}
                      onChange={(e) => setMainEnqueteurCol(e.target.value)}
                    >
                      <option value="">— Aucun —</option>
                      {preview.main_columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Variables à comparer */}
              <div className="card">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h3 className="card-title m-0 flex items-center gap-2">
                    <GitCompare className="w-5 h-5 text-gold" />
                    Variables à comparer
                    <span className="text-sm text-gray-500 font-normal">
                      ({selectedVars.length} / {preview.common_columns.length} sélectionnées)
                    </span>
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs px-3 py-1.5 rounded-lg bg-navy text-white hover:bg-navy-deep font-bold"
                    >
                      Tout sélectionner
                    </button>
                    <button
                      onClick={deselectAll}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-bold"
                    >
                      Tout désélectionner
                    </button>
                  </div>
                </div>

                <p className="card-desc mb-3">
                  Cochez les variables à comparer. Pour les variables numériques (âge, revenu, taille…),
                  définissez la <strong>tolérance</strong> : un écart accepté sans compter comme divergence.
                </p>

                {/* Filtre texte */}
                <div className="relative mb-3">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={varFilterText}
                    onChange={(e) => setVarFilterText(e.target.value)}
                    placeholder="Filtrer les variables..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none"
                  />
                </div>

                {/* Table de variables */}
                <div className="overflow-x-auto max-h-96 border border-gray-200 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                      <tr>
                        <th className="p-2 text-left w-8"></th>
                        <th className="p-2 text-left">Variable</th>
                        <th className="p-2 text-left">Exemples</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-left">Tolérance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCommon.map((v) => {
                        const cfg = varConfigs[v.name] || {}
                        const isKey = v.name === mainCodeCol || v.name === bcCodeCol
                        const isEnq = v.name === mainEnqueteurCol
                        return (
                          <tr key={v.name}
                              className={`border-b border-gray-100
                                ${isKey || isEnq ? "bg-gray-50 opacity-60" : ""}`}>
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={cfg.selected || false}
                                onChange={() => toggleVar(v.name)}
                                disabled={isKey || isEnq}
                                className="w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="p-2 font-mono text-xs">
                              {v.name}
                              {isKey && <span className="ml-2 text-purple-600 font-bold text-xs">(clé)</span>}
                              {isEnq && <span className="ml-2 text-orange-600 font-bold text-xs">(enq.)</span>}
                            </td>
                            <td className="p-2 text-xs text-gray-600">
                              {(v.examples_main || []).slice(0, 2).join(", ")}
                            </td>
                            <td className="p-2">
                              <select
                                value={cfg.type || "categorical"}
                                onChange={(e) => updateVarConfig(v.name, { type: e.target.value })}
                                disabled={!cfg.selected}
                                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"
                              >
                                <option value="categorical">Catégoriel</option>
                                <option value="numeric">Numérique</option>
                              </select>
                            </td>
                            <td className="p-2">
                              {cfg.type === "numeric" ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={cfg.tolerance || 0}
                                    onChange={(e) => updateVarConfig(v.name, { tolerance: e.target.value })}
                                    disabled={!cfg.selected}
                                    className="w-16 text-xs border border-gray-300 rounded px-2 py-1 disabled:opacity-50"
                                  />
                                  <select
                                    value={cfg.tolerance_type || "absolute"}
                                    onChange={(e) => updateVarConfig(v.name, { tolerance_type: e.target.value })}
                                    disabled={!cfg.selected}
                                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"
                                  >
                                    <option value="absolute">± abs.</option>
                                    <option value="percent">± %</option>
                                  </select>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">exact</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {preview.common_columns.length === 0 && (
                  <p className="text-center text-gray-500 italic p-4">
                    Aucune colonne commune détectée entre les 2 fichiers.
                    Vérifiez que les colonnes portent bien le même nom.
                  </p>
                )}
              </div>

              {runError && (
                <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800 m-0">{runError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="text-navy px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-100"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Retour
                </button>
                <button
                  onClick={runAnalysis}
                  disabled={!canRun || runLoading}
                  className="bg-navy text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-navy-deep disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {runLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      Lancer l'analyse
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ============================================================
              ETAPE 3 : Resultats
              ============================================================ */}
          {currentStep === 3 && result && (
            <div className="space-y-5 slide-up">
              <ResultsView
                result={result}
                mainLabel={mainLabel}
                bcLabel={bcLabel}
                enqExpanded={enqExpanded}
                setEnqExpanded={setEnqExpanded}
                exportDivergencesCSV={exportDivergencesCSV}
              />
              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="text-navy px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-100"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Modifier la configuration
                </button>
                <button
                  onClick={onClose}
                  className="bg-navy text-white px-5 py-2.5 rounded-xl font-bold hover:bg-navy-deep"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ============================================================
//  Sous-composants
// ============================================================

function FileSlot({ label, onLabelChange, file, onFileChange, helper, color }) {
  const colorClasses = {
    blue: "border-blue-400 bg-blue-50 hover:border-blue-500",
    purple: "border-purple-400 bg-purple-50 hover:border-purple-500",
  }[color]
  const iconColor = { blue: "text-blue-600", purple: "text-purple-600" }[color]

  return (
    <div>
      <label className="label-text">Libellé du fichier</label>
      <input
        type="text"
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        className="input-field mb-2"
      />
      <label className={`block border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${colorClasses}`}>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.sav,.dta,.sas7bdat"
          onChange={(e) => onFileChange(e.target.files?.[0] || null)}
          className="hidden"
        />
        {file ? (
          <div className="flex items-center justify-center gap-2">
            <FileSpreadsheet className={`w-6 h-6 ${iconColor}`} />
            <div className="text-left min-w-0">
              <p className="font-bold text-navy m-0 truncate max-w-[200px]">{file.name}</p>
              <p className="text-xs text-gray-500 m-0">{(file.size / 1024).toFixed(1)} Ko — cliquer pour changer</p>
            </div>
          </div>
        ) : (
          <>
            <Upload className={`w-8 h-8 ${iconColor} mx-auto mb-2`} />
            <p className="font-bold text-navy m-0">{label}</p>
            <p className="text-xs text-gray-500 m-0 mt-1">.xlsx, .csv, .sav, .dta</p>
          </>
        )}
      </label>
      <p className="text-xs text-gray-500 mt-1">{helper}</p>
    </div>
  )
}

function ResultsView({ result, mainLabel, bcLabel, enqExpanded, setEnqExpanded, exportDivergencesCSV }) {
  const { summary, by_enqueteur, by_variable, divergences } = result
  const globalSev = SEVERITY_COLORS[summary.global_severity] || SEVERITY_COLORS.orange
  const [showFormula, setShowFormula] = useState(false)

  return (
    <>
      {/* KPI global */}
      <div className={`rounded-2xl p-6 border-l-8 ${globalSev.border} ${globalSev.bgLight}`}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className={`${globalSev.bg} text-white rounded-full w-20 h-20 flex items-center justify-center flex-shrink-0`}>
            <div className="text-center">
              <p className="font-sora font-extrabold text-2xl m-0 leading-none">
                {summary.global_rate}%
              </p>
              <p className="text-xs m-0 mt-0.5">concordance</p>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-sora font-bold text-xl ${globalSev.text} m-0`}>
              Taux de concordance global : {globalSev.label}
            </p>
            <p className="text-sm text-gray-700 mt-1 m-0">
              {summary.n_concord.toLocaleString()} paires concordantes sur {summary.n_pairs_compared.toLocaleString()} comparables
              {summary.n_missing > 0 && ` (${summary.n_missing.toLocaleString()} exclues pour données manquantes)`}
            </p>
          </div>
        </div>
      </div>

      {/* Formule de calcul (repliable) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowFormula((v) => !v)}
          className="w-full p-3 px-4 flex items-center gap-3 hover:bg-slate-100 transition-colors text-left"
        >
          <div className="bg-navy text-white rounded-lg w-8 h-8 flex items-center justify-center flex-shrink-0 font-sora font-bold">
            f<span className="text-xs">x</span>
          </div>
          <span className="font-sora font-bold text-navy text-sm flex-1">
            Comment ce taux est calculé ?
          </span>
          {showFormula ? (
            <ChevronUp className="w-5 h-5 text-navy" />
          ) : (
            <ChevronDown className="w-5 h-5 text-navy" />
          )}
        </button>

        {showFormula && (
          <div className="border-t border-slate-200 p-4 slide-up">
            {/* Formule symbolique */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 mb-3 font-mono text-sm">
              <div className="flex items-center gap-2 flex-wrap text-navy">
                <span className="font-bold">Taux</span>
                <span>=</span>
                <div className="inline-flex flex-col items-center leading-tight">
                  <span className="text-green-700">paires concordantes</span>
                  <span className="border-t border-navy w-full my-0.5"></span>
                  <span className="text-slate-700">paires comparables</span>
                </div>
                <span>×</span>
                <span>100</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 m-0 italic">
              <strong>Paires comparables</strong> = concordantes + divergentes.{" "}
              Les paires avec des données manquantes sont exclues du calcul
              (aucune faute imputable à l'enquêteur).
            </p>
          </div>
        )}
      </div>

      {/* Cartes de synthese */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Participants appariés" value={summary.n_matched} icon={<Users className="w-4 h-4" />} color="navy" />
        <SummaryCard label={`Sans paire (${mainLabel})`} value={summary.n_orphan_main} icon={<AlertTriangle className="w-4 h-4" />} color="yellow" />
        <SummaryCard label={`Sans paire (${bcLabel})`} value={summary.n_orphan_bc} icon={<AlertTriangle className="w-4 h-4" />} color="yellow" />
        <SummaryCard label="Variables comparées" value={summary.n_variables_compared} icon={<GitCompare className="w-4 h-4" />} color="navy" />
      </div>

      {/* Classement enqueteurs */}
      {by_enqueteur.length > 0 && (
        <div className="card">
          <h3 className="card-title flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-gold" />
            Classement des enquêteurs (du plus faible au plus fort)
          </h3>
          <p className="card-desc mb-3">
            Un enquêteur avec un taux &lt; 70% mérite un contrôle approfondi. Cliquez sur une ligne pour voir ses variables les plus divergentes.
          </p>
          <div className="space-y-2">
            {by_enqueteur.map((e) => {
              const sev = SEVERITY_COLORS[e.severity] || SEVERITY_COLORS.orange
              const isExpanded = enqExpanded === e.enqueteur
              return (
                <div key={e.enqueteur}>
                  <div
                    onClick={() => setEnqExpanded(isExpanded ? null : e.enqueteur)}
                    className={`${sev.bgLight} border-l-4 ${sev.border} rounded-r-xl p-3 cursor-pointer hover:shadow-md transition-shadow flex items-center gap-3`}
                  >
                    <div className={`${sev.bg} text-white rounded-lg px-3 py-2 flex-shrink-0 min-w-[70px] text-center`}>
                      <p className="font-mono font-bold text-lg m-0 leading-none">{e.concord_rate}%</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-sora font-bold ${sev.text} m-0 truncate`}>{e.enqueteur}</p>
                      <p className="text-xs text-gray-600 mt-0.5 m-0">
                        {e.n_participants} participant(s) · {e.n_concord} concord. · {e.n_diverg} divergences
                        {e.n_missing > 0 && ` · ${e.n_missing} manquantes`}
                      </p>
                    </div>
                    <span className={`${sev.bg} text-white px-2 py-1 rounded font-bold text-xs whitespace-nowrap`}>
                      {sev.label}
                    </span>
                  </div>
                  {isExpanded && e.worst_variables.length > 0 && (
                    <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-3 -mt-px">
                      <p className="text-xs font-bold text-navy mb-2">
                        Variables les plus divergentes pour cet enquêteur :
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {e.worst_variables.map((wv) => (
                          <span key={wv.name} className="bg-red-50 text-red-800 text-xs px-2 py-1 rounded border border-red-200">
                            {wv.name} <span className="font-bold">({wv.n_diverg})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Table par variable */}
      {by_variable.length > 0 && (
        <div className="card">
          <h3 className="card-title flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gold" />
            Concordance par variable
          </h3>
          <p className="card-desc mb-3">
            Une variable au taux faible pour <em>tous</em> les enquêteurs est probablement mal formulée
            ou perçue différemment par les enquêteurs (ex : le revenu, souvent difficile à retenir).
          </p>
          <div className="overflow-x-auto max-h-80 border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Variable</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-right">Comparables</th>
                  <th className="p-2 text-right">Concord.</th>
                  <th className="p-2 text-right">Diverg.</th>
                  <th className="p-2 text-right">Taux</th>
                </tr>
              </thead>
              <tbody>
                {by_variable.map((v) => {
                  const sev = SEVERITY_COLORS[
                    v.concord_rate >= 90 ? "green" :
                    v.concord_rate >= 80 ? "yellow" :
                    v.concord_rate >= 70 ? "orange" : "red"
                  ]
                  return (
                    <tr key={v.name} className="border-b border-gray-100">
                      <td className="p-2 font-mono text-xs">{v.name}</td>
                      <td className="p-2 text-xs text-gray-500">{v.type}</td>
                      <td className="p-2 text-right font-mono">{v.n_comparable}</td>
                      <td className="p-2 text-right font-mono text-green-700">{v.n_concord}</td>
                      <td className="p-2 text-right font-mono text-red-700">{v.n_diverg}</td>
                      <td className="p-2 text-right">
                        <span className={`${sev.bg} text-white px-2 py-0.5 rounded font-mono font-bold text-xs`}>
                          {v.concord_rate}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Divergences détaillées */}
      {divergences.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h3 className="card-title m-0 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-gold" />
              Divergences détectées
              <span className="text-sm text-gray-500 font-normal">
                ({divergences.length}{divergences.length >= 500 && "+ (limité)"})
              </span>
            </h3>
            <button
              onClick={exportDivergencesCSV}
              className="text-xs px-3 py-1.5 rounded-lg bg-navy text-white hover:bg-navy-deep font-bold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              Exporter CSV
            </button>
          </div>
          <div className="overflow-x-auto max-h-96 border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-left">Enquêteur</th>
                  <th className="p-2 text-left">Variable</th>
                  <th className="p-2 text-left text-blue-700">{mainLabel}</th>
                  <th className="p-2 text-left text-purple-700">{bcLabel}</th>
                </tr>
              </thead>
              <tbody>
                {divergences.slice(0, 200).map((d, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2 font-mono text-xs">{d.code}</td>
                    <td className="p-2 text-xs">{d.enqueteur}</td>
                    <td className="p-2 font-mono text-xs">{d.variable}</td>
                    <td className="p-2 text-xs text-blue-800">{d.val_main}</td>
                    <td className="p-2 text-xs text-purple-800">{d.val_bc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {divergences.length > 200 && (
            <p className="text-xs text-gray-500 mt-1 italic">
              Affichage limité aux 200 premières lignes. Exportez en CSV pour la liste complète.
            </p>
          )}
        </div>
      )}
    </>
  )
}

function SummaryCard({ label, value, icon, color }) {
  const colors = {
    navy:   "bg-navy text-white",
    yellow: "bg-yellow-50 text-yellow-900 border border-yellow-200",
    red:    "bg-red-50 text-red-900 border border-red-200",
  }[color] || "bg-gray-50 text-gray-900 border border-gray-200"

  return (
    <div className={`rounded-xl p-3 ${colors}`}>
      <div className="flex items-center gap-2 mb-1 opacity-80">
        {icon}
        <p className="text-xs uppercase tracking-wider font-bold m-0 truncate">{label}</p>
      </div>
      <p className="font-sora font-extrabold text-2xl m-0">{value?.toLocaleString() || 0}</p>
    </div>
  )
}