import { useState, useRef } from "react"
import { useStore } from "../../store/useStore"
import { api } from "../../api/client"
import {
  FileText, Download, Loader2, Sparkles,
  CheckCircle2, RefreshCw, Pencil, Check, X, AlertCircle,
  Eye, EyeOff, AlertTriangle, BarChart3, Upload, FileUp,
} from "lucide-react"

// ====================================================================
//  Composant editable pour les interpretations IA
// ====================================================================

function EditableInterpretation({ value, onChange }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value || "")

  const save = () => {
    onChange(draft)
    setIsEditing(false)
  }
  const cancel = () => {
    setDraft(value || "")
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="bg-yellow-50 border-l-4 border-gold rounded-r-lg p-4 my-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-bold text-gold-deep uppercase">
          <Pencil className="w-3 h-3" />
          Édition de l'interprétation
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full p-3 border border-gold-deep rounded-lg text-sm font-serif text-navy-deep focus:outline-none focus:ring-2 focus:ring-gold"
          rows={4}
          autoFocus
        />
        <div className="flex gap-2 mt-2">
          <button onClick={save} className="flex items-center gap-1 px-3 py-1 bg-navy text-white rounded-lg text-sm font-bold hover:bg-navy-deep">
            <Check className="w-4 h-4" /> Valider
          </button>
          <button onClick={cancel} className="flex items-center gap-1 px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">
            <X className="w-4 h-4" /> Annuler
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-yellow-50 border-l-4 border-gold rounded-r-lg p-4 my-3 group cursor-pointer hover:bg-yellow-100 transition-colors relative"
      onClick={() => setIsEditing(true)}
      title="Cliquer pour modifier"
    >
      <div className="flex items-center gap-2 mb-1 text-xs font-bold text-gold-deep uppercase">
        Interprétation IA
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-sm font-serif text-navy-deep m-0 leading-relaxed">
        {value || <span className="italic text-gray-400">(Aucune interprétation - cliquer pour ajouter)</span>}
      </p>
    </div>
  )
}

// ====================================================================
//  Section univariee
// ====================================================================

function UnivariateSection({ uni, onUpdate }) {
  return (
    <div className="bg-white rounded-xl p-5 mb-4 border border-gray-200 shadow-sm">
      <h3 className="font-sora font-bold text-navy text-lg m-0 mb-1">{uni.label}</h3>
      <p className="text-xs text-gray-500 m-0 mb-3 italic">
        Variable : {uni.name} | Type : {uni.type} | Réponses : {uni.n} ({uni.fill_rate}%)
      </p>
      {uni.error ? (
        <p className="text-sm text-gray-500 italic">{uni.error}</p>
      ) : (
        <>
          {uni.chart_base64 && (
            <div className="text-center my-3">
              <img src={`data:image/png;base64,${uni.chart_base64}`} alt={uni.label}
                className="max-w-full mx-auto rounded-lg border border-gray-100" style={{ maxHeight: "350px" }} />
            </div>
          )}
          {uni.type === "numerique" && uni.stats && (
            <table className="w-full text-sm my-3 border-collapse">
              <thead><tr className="bg-navy text-white">
                <th className="p-2 text-left">Statistique</th><th className="p-2 text-right">Valeur</th>
              </tr></thead>
              <tbody>
                {Object.entries({ min: "Minimum", max: "Maximum", mean: "Moyenne", median: "Mediane", std: "Ecart-type", q1: "1er quartile", q3: "3e quartile" })
                  .map(([k, lab]) => uni.stats[k] !== undefined ? (
                    <tr key={k} className="odd:bg-beige">
                      <td className="p-2 border-b border-gray-100">{lab}</td>
                      <td className="p-2 border-b border-gray-100 text-right font-mono">{uni.stats[k]}</td>
                    </tr>
                  ) : null)}
              </tbody>
            </table>
          )}
          {uni.distribution && (
            <table className="w-full text-sm my-3 border-collapse">
              <thead><tr className="bg-navy text-white">
                <th className="p-2 text-left">Modalite</th><th className="p-2 text-right">Effectif</th><th className="p-2 text-right">Pourcentage</th>
              </tr></thead>
              <tbody>
                {uni.distribution.slice(0, 15).map((row, i) => (
                  <tr key={i} className="odd:bg-beige">
                    <td className="p-2 border-b border-gray-100">{row.modalite}</td>
                    <td className="p-2 border-b border-gray-100 text-right">{row.effectif}</td>
                    <td className="p-2 border-b border-gray-100 text-right font-mono">{row.pourcentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <EditableInterpretation value={uni.interpretation} onChange={(v) => onUpdate({ ...uni, interpretation: v })} />
        </>
      )}
    </div>
  )
}

// ====================================================================
//  Section bivariee
// ====================================================================

function BivariateSection({ biv, onUpdate }) {
  return (
    <div className="bg-white rounded-xl p-5 mb-4 border border-gray-200 shadow-sm">
      <h3 className="font-sora font-bold text-navy text-lg m-0 mb-1">{biv.label1} × {biv.label2}</h3>
      {biv.rationale && <p className="text-xs text-gray-500 m-0 mb-3 italic">{biv.rationale}</p>}
      {biv.error ? (
        <p className="text-sm text-gray-500 italic">{biv.error}</p>
      ) : (
        <>
          {biv.chart_base64 && (
            <div className="text-center my-3">
              <img src={`data:image/png;base64,${biv.chart_base64}`} alt={`${biv.label1} x ${biv.label2}`}
                className="max-w-full mx-auto rounded-lg border border-gray-100" style={{ maxHeight: "400px" }} />
            </div>
          )}
          <EditableInterpretation value={biv.interpretation} onChange={(v) => onUpdate({ ...biv, interpretation: v })} />
        </>
      )}
    </div>
  )
}

// ====================================================================
//  Composant principal — INDEPENDANT (upload propre)
// ====================================================================

export default function Step4AnalyticalReport() {
  const store = useStore()
  const fileRef = useRef(null)
  const dictRef = useRef(null)

  // Etat local (indépendant du store QC)
  const [reportId, setReportId] = useState(null)
  const [uploadInfo, setUploadInfo] = useState(null)
  const [analysisScope, setAnalysisScope] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [progressLog, setProgressLog] = useState([])
  const [error, setError] = useState(null)
  const [content, setContent] = useState(null)
  const [scopeExpanded, setScopeExpanded] = useState(false)

  // Contexte enquête (optionnel)
  const [surveyType, setSurveyType] = useState("")
  const [surveyDesc, setSurveyDesc] = useState("")
  const [surveyPop, setSurveyPop] = useState("")

  // ── UPLOAD ──
  const handleUpload = async () => {
    const dataFile = fileRef.current?.files?.[0]
    if (!dataFile) return setError("Veuillez sélectionner un fichier de données.")

    setIsUploading(true)
    setError(null)
    setContent(null)
    setAnalysisScope(null)

    try {
      const dictFile = dictRef.current?.files?.[0] || null
      const data = await api.reportUpload(dataFile, dictFile)
      setReportId(data.report_id)
      setUploadInfo({ filename: data.filename, n_rows: data.n_rows, n_columns: data.n_columns })
      setAnalysisScope(data.scope)
    } catch (e) {
      setError(e.message || "Erreur d'upload")
    } finally {
      setIsUploading(false)
    }
  }

  // ── GENERATE ──
  const handleGenerate = async () => {
    if (!reportId) return
    setIsGenerating(true)
    setError(null)
    setProgressLog(["Connexion au moteur d'analyse..."])

    try {
      const data = await api.reportGenerate(reportId, {
        api: store.selectedApi,
        api_key: store.selectedApi === "api1" ? store.apiKey1 : store.apiKey2,
        survey_type: surveyType,
        survey_description: surveyDesc,
        survey_population: surveyPop,
      })
      setContent(data.content)
      setProgressLog(data.progress || [])
    } catch (e) {
      setError(e.message || "Erreur inconnue")
    } finally {
      setIsGenerating(false)
    }
  }

  // ── DOWNLOAD ──
  const handleDownload = async () => {
    if (!content || !reportId) return
    setIsDownloading(true)
    setError(null)
    try {
      const blob = await api.reportDownload(reportId, content)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const baseName = (uploadInfo?.filename || "rapport").replace(/\.[^/.]+$/, "")
      a.download = `${baseName}_rapport_analytique.docx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message || "Erreur de téléchargement")
    } finally {
      setIsDownloading(false)
    }
  }

  const updateUnivariate = (idx, updated) => {
    const c = { ...content, univariate: [...content.univariate] }
    c.univariate[idx] = updated
    setContent(c)
  }
  const updateBivariate = (idx, updated) => {
    const c = { ...content, bivariate: [...content.bivariate] }
    c.bivariate[idx] = updated
    setContent(c)
  }
  const updateExecSummary = (v) => setContent({ ...content, executive_summary: v })

  // ============================================================
  //  VUE 1 : Upload + scope + bouton generer
  // ============================================================
  if (!content && !isGenerating) {
    return (
      <div className="card slide-up">
        <h3 className="card-title flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-emerald-600" />
          Rapport d'analyse
        </h3>
        <p className="card-desc">
          Chargez un fichier de données pour générer un rapport analytique Word avec tableaux, graphiques et interprétations IA.
        </p>

        {/* Zone d'upload */}
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-6 mb-6 hover:border-emerald-400 transition-colors">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-bold text-navy mb-2">
                <FileUp className="w-4 h-4 inline mr-1" />
                Fichier de données *
              </label>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.sav,.dta"
                className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-navy file:text-white file:font-bold file:cursor-pointer hover:file:bg-navy-deep" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-navy mb-2">
                Dictionnaire (optionnel)
              </label>
              <input ref={dictRef} type="file" accept=".xlsx,.xls,.csv"
                className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-200 file:text-gray-700 file:font-bold file:cursor-pointer hover:file:bg-gray-300" />
            </div>
          </div>

          <button onClick={handleUpload} disabled={isUploading}
            className="mt-4 flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50">
            {isUploading ? <><Loader2 className="w-5 h-5 animate-spin" /> Chargement...</>
              : <><Upload className="w-5 h-5" /> Charger le fichier</>}
          </button>
        </div>

        {/* Info fichier chargé */}
        {uploadInfo && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-emerald-800 text-sm m-0">{uploadInfo.filename}</p>
              <p className="text-emerald-700 text-xs m-0 mt-0.5">
                {uploadInfo.n_rows} lignes · {uploadInfo.n_columns} colonnes
              </p>
            </div>
          </div>
        )}

        {/* Scope */}
        {analysisScope && (
          <div className="bg-white border border-gray-200 rounded-2xl mb-6 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-6 h-6 text-navy" />
                <h4 className="font-sora font-bold text-navy m-0 text-base">Périmètre du rapport</h4>
              </div>
              <p className="text-sm text-gray-700 m-0">
                Les colonnes techniques (identifiant, enquêteur, horodatages, GPS) sont automatiquement écartées.
              </p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center bg-green-50 border-l-4 border-green-500 rounded-r-xl p-3">
                  <p className="font-mono text-2xl font-bold text-green-700 m-0">{analysisScope.n_retained}</p>
                  <p className="text-xs uppercase tracking-wider font-bold text-green-800 mt-1 m-0">Retenues</p>
                </div>
                <div className="text-center bg-gray-50 border-l-4 border-gray-400 rounded-r-xl p-3">
                  <p className="font-mono text-2xl font-bold text-gray-700 m-0">{analysisScope.n_excluded}</p>
                  <p className="text-xs uppercase tracking-wider font-bold text-gray-600 mt-1 m-0">Ecartées</p>
                </div>
                <div className="text-center bg-blue-50 border-l-4 border-blue-500 rounded-r-xl p-3">
                  <p className="font-mono text-2xl font-bold text-blue-700 m-0">{analysisScope.n_total}</p>
                  <p className="text-xs uppercase tracking-wider font-bold text-blue-800 mt-1 m-0">Total</p>
                </div>
              </div>

              {analysisScope.n_retained < 3 && (
                <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-xl p-3 mb-3 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-bold text-amber-900 m-0">Très peu de variables analysables</p>
                    <p className="text-amber-800 text-xs mt-1 m-0">
                      Seulement {analysisScope.n_retained} variable(s) retenue(s).
                    </p>
                  </div>
                </div>
              )}

              <button onClick={() => setScopeExpanded(!scopeExpanded)}
                className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-xl p-3 text-sm font-bold text-navy transition-colors">
                <span className="flex items-center gap-2">
                  {scopeExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {scopeExpanded ? "Masquer" : "Voir le détail"}
                </span>
                <span className="text-xs text-gray-500 font-normal">
                  ({analysisScope.n_retained} OK · {analysisScope.n_excluded} écartées)
                </span>
              </button>

              {scopeExpanded && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 slide-up">
                  <div>
                    <p className="text-xs font-bold text-green-800 uppercase tracking-wider mb-2 m-0">
                      Variables analysées ({analysisScope.n_retained})
                    </p>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-2 max-h-72 overflow-y-auto">
                      {(analysisScope.retained || []).length === 0 ? (
                        <p className="text-xs text-gray-500 italic m-2">Aucune</p>
                      ) : (analysisScope.retained || []).map((v) => (
                        <div key={v.name} className="bg-white rounded-md px-2 py-1.5 mb-1 last:mb-0 text-xs">
                          <p className="font-bold text-navy m-0">{v.name}</p>
                          <p className="text-gray-500 m-0 mt-0.5">{v.type} · {v.fill_rate}% rempli · {v.uniques} val. unique(s)</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 m-0">
                      Variables écartées ({analysisScope.n_excluded})
                    </p>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 max-h-72 overflow-y-auto">
                      {(analysisScope.excluded || []).length === 0 ? (
                        <p className="text-xs text-gray-500 italic m-2">Aucune</p>
                      ) : (analysisScope.excluded || []).map((v) => (
                        <div key={v.name} className="bg-white rounded-md px-2 py-1.5 mb-1 last:mb-0 text-xs">
                          <p className="font-bold text-gray-700 m-0 line-through">{v.name}</p>
                          <p className="text-gray-500 m-0 mt-0.5 italic">{v.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Contexte enquête (optionnel) */}
        {reportId && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-6">
            <h4 className="font-sora font-bold text-navy text-sm mb-3">
              Contexte de l'enquête (optionnel)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={surveyType} onChange={(e) => setSurveyType(e.target.value)}
                placeholder="Type d'enquête" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              <input value={surveyDesc} onChange={(e) => setSurveyDesc(e.target.value)}
                placeholder="Description" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              <input value={surveyPop} onChange={(e) => setSurveyPop(e.target.value)}
                placeholder="Population cible" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
        )}

        {/* Bouton générer */}
        {reportId && (
          <button onClick={handleGenerate}
            disabled={analysisScope && analysisScope.n_retained === 0}
            className="w-full py-5 rounded-2xl font-sora font-bold text-lg flex items-center justify-center gap-3 transition-all
              bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5
              disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none">
            <Sparkles className="w-6 h-6" />
            Générer l'aperçu du rapport
          </button>
        )}

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-800 text-sm font-medium mb-1">Erreur</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {reportId && (
          <p className="text-xs text-gray-500 text-center mt-3">
            La génération peut prendre 1 à 3 minutes selon la taille du fichier
          </p>
        )}
      </div>
    )
  }

  // ============================================================
  //  VUE 2 : Génération en cours
  // ============================================================
  if (isGenerating) {
    return (
      <div className="card slide-up text-center">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
        <h3 className="font-sora font-bold text-navy text-xl mb-2">Génération du rapport en cours...</h3>
        <p className="text-gray-600 mb-6">L'IA analyse vos données et rédige les interprétations.</p>
        <div className="bg-beige rounded-xl p-4 border border-gray-200 text-left max-w-2xl mx-auto">
          <h5 className="font-sora font-bold text-navy text-sm mb-2 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Progression
          </h5>
          <div className="space-y-1 text-sm text-gray-700 font-mono max-h-64 overflow-y-auto">
            {progressLog.map((line, i) => (
              <div key={i} className="flex items-start gap-2"><span className="text-emerald-500">›</span><span>{line}</span></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  //  VUE 3 : Aperçu du rapport
  // ============================================================
  const socio = content.univariate.filter((u) => u.category === "sociodemo")
  const principale = content.univariate.filter((u) => u.category !== "sociodemo")

  return (
    <div className="slide-up">
      {/* Toolbar sticky */}
      <div className="sticky top-0 z-20 bg-white rounded-2xl p-4 mb-4 shadow-card border border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          <span className="font-sora font-bold text-navy">Aperçu du rapport</span>
          <span className="text-xs text-gray-500 ml-2">(cliquez sur une interprétation pour la modifier)</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setContent(null); setProgressLog([]) }} disabled={isGenerating || isDownloading}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-sm transition-colors disabled:opacity-50">
            <RefreshCw className="w-4 h-4" /> Régénérer
          </button>
          <button onClick={handleDownload} disabled={isDownloading}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm transition-colors disabled:opacity-50 shadow-md">
            {isDownloading ? <><Loader2 className="w-4 h-4 animate-spin" /> Téléchargement...</>
              : <><Download className="w-4 h-4" /> Télécharger en Word</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm m-0">{error}</p>
        </div>
      )}

      {/* Page de garde */}
      <div className="bg-white rounded-2xl p-12 mb-4 border-2 border-navy shadow-lg text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-emerald-500"></div>
        <img src="/logo_sista.png" alt="SISTA" className="w-24 h-auto mx-auto mb-8"
          onError={(e) => { e.target.style.display = "none" }} />
        <h1 className="font-sora font-bold text-navy text-4xl m-0 mb-2">RAPPORT ANALYTIQUE</h1>
        <p className="text-emerald-700 text-xl italic mb-8">{content.meta.survey_context?.type || "Enquête"}</p>
        <div className="max-w-md mx-auto text-left space-y-2 text-sm bg-beige p-4 rounded-lg">
          <div><span className="font-bold text-navy">Fichier source : </span><span className="text-navy-deep">{content.meta.filename}</span></div>
          <div><span className="font-bold text-navy">Nombre de répondants : </span><span className="text-navy-deep">{content.meta.n_rows}</span></div>
          <div><span className="font-bold text-navy">Date de génération : </span>
            <span className="text-navy-deep">{new Date(content.meta.generated_at).toLocaleDateString("fr-FR")}</span></div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-emerald-500"></div>
        <p className="text-xs text-emerald-700 mt-6 font-bold">SISTA Consult Mauritanie © {new Date().getFullYear()}</p>
      </div>

      {/* Synthèse */}
      <div className="bg-white rounded-2xl p-6 mb-4 shadow-card border border-gray-200">
        <h2 className="font-sora font-bold text-navy text-2xl m-0 mb-3 border-b-2 border-emerald-400 pb-2">Synthèse exécutive</h2>
        <EditableInterpretation value={content.executive_summary} onChange={updateExecSummary} />
      </div>

      {/* Méthodologie */}
      <div className="bg-white rounded-2xl p-6 mb-4 shadow-card border border-gray-200">
        <h2 className="font-sora font-bold text-navy text-2xl m-0 mb-3 border-b-2 border-emerald-400 pb-2">Méthodologie</h2>
        <p className="text-sm text-navy-deep leading-relaxed">{content.methodology}</p>
        {content.meta.survey_context?.description && (
          <div className="mt-3">
            <p className="font-bold text-navy text-sm mb-1">Contexte :</p>
            <p className="text-sm text-navy-deep">{content.meta.survey_context.description}</p>
          </div>
        )}
      </div>

      {/* Profil des répondants */}
      {socio.length > 0 && (
        <div className="mb-4">
          <h2 className="font-sora font-bold text-navy text-2xl mb-3 px-1">Profil des répondants</h2>
          {socio.map((u) => {
            const idx = content.univariate.indexOf(u)
            return <UnivariateSection key={idx} uni={u} onUpdate={(up) => updateUnivariate(idx, up)} />
          })}
        </div>
      )}

      {/* Analyses descriptives */}
      {principale.length > 0 && (
        <div className="mb-4">
          <h2 className="font-sora font-bold text-navy text-2xl mb-3 px-1">Analyses descriptives</h2>
          {principale.map((u) => {
            const idx = content.univariate.indexOf(u)
            return <UnivariateSection key={idx} uni={u} onUpdate={(up) => updateUnivariate(idx, up)} />
          })}
        </div>
      )}

      {/* Croisements */}
      {content.bivariate.length > 0 && (
        <div className="mb-4">
          <h2 className="font-sora font-bold text-navy text-2xl mb-3 px-1">Analyses croisées</h2>
          {content.bivariate.map((b, i) => (
            <BivariateSection key={i} biv={b} onUpdate={(up) => updateBivariate(i, up)} />
          ))}
        </div>
      )}

      {/* Qualité des données */}
      {content.qc_summary && content.qc_summary.length > 0 && (
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-card border border-gray-200">
          <h2 className="font-sora font-bold text-navy text-2xl m-0 mb-3 border-b-2 border-emerald-400 pb-2">Qualité des données</h2>
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-navy text-white">
              <th className="p-2 text-left">Test</th><th className="p-2 text-center">Gravité</th><th className="p-2 text-right">Cas détectés</th>
            </tr></thead>
            <tbody>
              {content.qc_summary.map((r, i) => (
                <tr key={i} className="odd:bg-beige">
                  <td className="p-2 border-b border-gray-100">{r.titre}</td>
                  <td className="p-2 border-b border-gray-100 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      r.severite === "high" ? "bg-red-100 text-red-700" :
                      r.severite === "med" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
                    }`}>{r.severite === "high" ? "Élevé" : r.severite === "med" ? "Modéré" : "Faible"}</span>
                  </td>
                  <td className="p-2 border-b border-gray-100 text-right font-mono">{r.n_cas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Toolbar bas */}
      <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-200 flex items-center justify-end mb-6">
        <button onClick={handleDownload} disabled={isDownloading}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 shadow-md">
          {isDownloading ? <><Loader2 className="w-5 h-5 animate-spin" /> Téléchargement...</>
            : <><Download className="w-5 h-5" /> Télécharger le rapport Word</>}
        </button>
      </div>
    </div>
  )
}
