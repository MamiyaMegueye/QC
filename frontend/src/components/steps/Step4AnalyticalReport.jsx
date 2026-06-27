import { useState, useEffect } from "react"
import { useStore } from "../../store/useStore"
import { api } from "../../api/client"
import {
  FileText, Download, Loader2, ArrowLeft, Sparkles,
  CheckCircle2, RefreshCw, Pencil, Check, X, AlertCircle,
  Eye, EyeOff, AlertTriangle, BarChart3,
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
          Edition de l'interpretation
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full p-3 border border-gold-deep rounded-lg text-sm font-serif text-navy-deep focus:outline-none focus:ring-2 focus:ring-gold"
          rows={4}
          autoFocus
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={save}
            className="flex items-center gap-1 px-3 py-1 bg-navy text-white rounded-lg text-sm font-bold hover:bg-navy-deep"
          >
            <Check className="w-4 h-4" /> Valider
          </button>
          <button
            onClick={cancel}
            className="flex items-center gap-1 px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
          >
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
        Interpretation IA
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-sm font-serif text-navy-deep m-0 leading-relaxed">
        {value || (
          <span className="italic text-gray-400">
            (Aucune interpretation - cliquer pour ajouter)
          </span>
        )}
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
      <h3 className="font-sora font-bold text-navy text-lg m-0 mb-1">
        {uni.label}
      </h3>
      <p className="text-xs text-gray-500 m-0 mb-3 italic">
        Variable : {uni.name} | Type : {uni.type} | Reponses : {uni.n} ({uni.fill_rate}%)
      </p>

      {uni.error ? (
        <p className="text-sm text-gray-500 italic">{uni.error}</p>
      ) : (
        <>
          {uni.chart_base64 && (
            <div className="text-center my-3">
              <img
                src={`data:image/png;base64,${uni.chart_base64}`}
                alt={uni.label}
                className="max-w-full mx-auto rounded-lg border border-gray-100"
                style={{ maxHeight: "350px" }}
              />
            </div>
          )}

          {uni.type === "numerique" && uni.stats && (
            <table className="w-full text-sm my-3 border-collapse">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="p-2 text-left">Statistique</th>
                  <th className="p-2 text-right">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries({
                  min: "Minimum", max: "Maximum", mean: "Moyenne",
                  median: "Mediane", std: "Ecart-type",
                  q1: "1er quartile", q3: "3e quartile",
                }).map(([k, lab]) =>
                  uni.stats[k] !== undefined ? (
                    <tr key={k} className="odd:bg-beige">
                      <td className="p-2 border-b border-gray-100">{lab}</td>
                      <td className="p-2 border-b border-gray-100 text-right font-mono">
                        {uni.stats[k]}
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          )}

          {uni.distribution && (
            <table className="w-full text-sm my-3 border-collapse">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="p-2 text-left">Modalite</th>
                  <th className="p-2 text-right">Effectif</th>
                  <th className="p-2 text-right">Pourcentage</th>
                </tr>
              </thead>
              <tbody>
                {uni.distribution.slice(0, 15).map((row, i) => (
                  <tr key={i} className="odd:bg-beige">
                    <td className="p-2 border-b border-gray-100">{row.modalite}</td>
                    <td className="p-2 border-b border-gray-100 text-right">
                      {row.effectif}
                    </td>
                    <td className="p-2 border-b border-gray-100 text-right font-mono">
                      {row.pourcentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <EditableInterpretation
            value={uni.interpretation}
            onChange={(newVal) => onUpdate({ ...uni, interpretation: newVal })}
          />
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
      <h3 className="font-sora font-bold text-navy text-lg m-0 mb-1">
        {biv.label1} × {biv.label2}
      </h3>
      {biv.rationale && (
        <p className="text-xs text-gray-500 m-0 mb-3 italic">{biv.rationale}</p>
      )}

      {biv.error ? (
        <p className="text-sm text-gray-500 italic">{biv.error}</p>
      ) : (
        <>
          {biv.chart_base64 && (
            <div className="text-center my-3">
              <img
                src={`data:image/png;base64,${biv.chart_base64}`}
                alt={`${biv.label1} x ${biv.label2}`}
                className="max-w-full mx-auto rounded-lg border border-gray-100"
                style={{ maxHeight: "400px" }}
              />
            </div>
          )}

          <EditableInterpretation
            value={biv.interpretation}
            onChange={(newVal) => onUpdate({ ...biv, interpretation: newVal })}
          />
        </>
      )}
    </div>
  )
}

// ====================================================================
//  Composant principal
// ====================================================================

export default function Step4AnalyticalReport() {
  const store = useStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [progressLog, setProgressLog] = useState([])
  const [error, setError] = useState(null)
  const [content, setContent] = useState(null) // contenu du rapport apres preview
  const [analysisScope, setAnalysisScope] = useState(null)
  const [scopeExpanded, setScopeExpanded] = useState(false)
  const [scopeLoading, setScopeLoading] = useState(false)

  // Charger le perimetre d'analyse au montage (pour voir quelles variables
  // seront effectivement analysees AVANT de lancer la generation)
  useEffect(() => {
    if (!store.sessionId) return
    setScopeLoading(true)
    fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/session/${store.sessionId}/analysis-scope`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setAnalysisScope(data)
      })
      .catch(() => {})
      .finally(() => setScopeLoading(false))
  }, [store.sessionId])

  if (!store.sessionId) {
    return (
      <div className="card text-center">
        <p className="text-gray-600 mb-4">
          Veuillez d'abord importer un fichier a l'etape 1.
        </p>
        <button onClick={() => store.setStep(1)} className="btn-secondary">
          <ArrowLeft className="w-4 h-4 inline mr-1" /> Retour
        </button>
      </div>
    )
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    setProgressLog(["Connexion au moteur d'analyse..."])

    const apiName = store.selectedApi
    const apiKey = apiName === "api1" ? store.apiKey1 : store.apiKey2

    try {
      const data = await api.generateReportPreview(store.sessionId, {
        api: apiName,
        api_key: apiKey,
        survey_type: store.surveyType,
        survey_description: store.surveyDescription,
        survey_population: store.surveyPopulation,
        survey_eligibility: store.surveyEligibility,
      })
      setContent(data.content)
      setProgressLog(data.progress || [])
    } catch (e) {
      setError(e.message || "Erreur inconnue")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownload = async () => {
    if (!content) return
    setIsDownloading(true)
    setError(null)
    try {
      // On envoie le contenu (peut contenir des edits)
      const blob = await api.downloadReport(store.sessionId, content)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const baseName = (store.filename || "rapport").replace(/\.[^/.]+$/, "")
      a.download = `${baseName}_rapport_analytique.docx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message || "Erreur de telechargement")
    } finally {
      setIsDownloading(false)
    }
  }

  const updateUnivariate = (idx, updated) => {
    const newContent = { ...content }
    newContent.univariate = [...content.univariate]
    newContent.univariate[idx] = updated
    setContent(newContent)
  }

  const updateBivariate = (idx, updated) => {
    const newContent = { ...content }
    newContent.bivariate = [...content.bivariate]
    newContent.bivariate[idx] = updated
    setContent(newContent)
  }

  const updateExecSummary = (newVal) => {
    setContent({ ...content, executive_summary: newVal })
  }

  // ============================================================
  //  VUE INITIALE : bouton de generation
  // ============================================================
  if (!content && !isGenerating) {
    return (
      <div className="card slide-up">
        <h3 className="card-title flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-gold" />
          Rapport analytique
        </h3>
        <p className="card-desc">
          Generer un rapport Word professionnel avec logo SISTA, tableaux,
          graphiques et interpretations redigees par l'IA.
        </p>

        <div className="bg-gradient-to-r from-navy to-navy-deep text-white rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <FileText className="w-10 h-10 text-gold flex-shrink-0" />
            <div>
              <h4 className="font-sora font-bold text-lg mb-2">
                Ce que contient le rapport
              </h4>
            
              <p className="mt-3 text-sm text-gold">
                Vous pourrez modifier les interpretations IA avant de telecharger le Word.
              </p>
            </div>
          </div>
        </div>

        {/* === PERIMETRE DU RAPPORT (transparence pour l'utilisateur) === */}
        {scopeLoading && (
          <div className="bg-gray-50 rounded-2xl p-4 mb-6 flex items-center gap-3 text-gray-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Calcul du perimetre d'analyse...</span>
          </div>
        )}

        {analysisScope && (
          <div className="bg-white border border-gray-200 rounded-2xl mb-6 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-6 h-6 text-navy" />
                <h4 className="font-sora font-bold text-navy m-0 text-base">
                  Perimetre du rapport client
                </h4>
              </div>
              <p className="text-sm text-gray-700 m-0">
                Le rapport est destine au <strong>commanditaire de l'enquete</strong> 
                {" "}(l'entreprise / l'organisation qui a commande la collecte). Seules les
                variables a valeur metier seront analysees. Les colonnes techniques de pilotage
                interne SISTA (identifiant, enqueteur, horodatages, GPS, commentaires libres,
                contacts) sont automatiquement ecartees.
              </p>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center bg-green-50 border-l-4 border-green-500 rounded-r-xl p-3">
                  <p className="font-mono text-2xl font-bold text-green-700 m-0">
                    {analysisScope.n_retained}
                  </p>
                  <p className="text-xs uppercase tracking-wider font-bold text-green-800 mt-1 m-0">
                    Retenues
                  </p>
                </div>
                <div className="text-center bg-gray-50 border-l-4 border-gray-400 rounded-r-xl p-3">
                  <p className="font-mono text-2xl font-bold text-gray-700 m-0">
                    {analysisScope.n_excluded}
                  </p>
                  <p className="text-xs uppercase tracking-wider font-bold text-gray-600 mt-1 m-0">
                    Ecartees
                  </p>
                </div>
                <div className="text-center bg-blue-50 border-l-4 border-blue-500 rounded-r-xl p-3">
                  <p className="font-mono text-2xl font-bold text-blue-700 m-0">
                    {analysisScope.n_total}
                  </p>
                  <p className="text-xs uppercase tracking-wider font-bold text-blue-800 mt-1 m-0">
                    Total
                  </p>
                </div>
              </div>

              {/* Alerte si vraiment peu de variables */}
              {analysisScope.n_retained < 3 && (
                <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-xl p-3 mb-3 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-bold text-amber-900 m-0">
                      Tres peu de variables analysables
                    </p>
                    <p className="text-amber-800 text-xs mt-1 m-0">
                      Le rapport client sera limite avec seulement {analysisScope.n_retained} variable(s)
                      retenue(s). Verifiez que votre fichier contient bien des variables metier
                      (sociodemographiques, opinions, comportements) et pas uniquement des
                      metadonnees de collecte.
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={() => setScopeExpanded(!scopeExpanded)}
                className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-xl p-3 text-sm font-bold text-navy transition-colors"
              >
                <span className="flex items-center gap-2">
                  {scopeExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {scopeExpanded ? "Masquer" : "Voir le detail"} des variables retenues et ecartees
                </span>
                <span className="text-xs text-gray-500 font-normal">
                  ({analysisScope.n_retained} OK · {analysisScope.n_excluded} ecartees)
                </span>
              </button>

              {scopeExpanded && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 slide-up">
                  {/* Variables retenues */}
                  <div>
                    <p className="text-xs font-bold text-green-800 uppercase tracking-wider mb-2 m-0">
                      Variables analysees ({analysisScope.n_retained})
                    </p>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-2 max-h-72 overflow-y-auto">
                      {analysisScope.retained.length === 0 ? (
                        <p className="text-xs text-gray-500 italic m-2">Aucune</p>
                      ) : (
                        analysisScope.retained.map((v) => (
                          <div
                            key={v.name}
                            className="bg-white rounded-md px-2 py-1.5 mb-1 last:mb-0 text-xs"
                          >
                            <p className="font-bold text-navy m-0">{v.name}</p>
                            <p className="text-gray-500 m-0 mt-0.5">
                              {v.type} · {v.fill_rate}% rempli · {v.uniques} valeur(s) unique(s)
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Variables exclues */}
                  <div>
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 m-0">
                      Variables ecartees ({analysisScope.n_excluded})
                    </p>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 max-h-72 overflow-y-auto">
                      {analysisScope.excluded.length === 0 ? (
                        <p className="text-xs text-gray-500 italic m-2">Aucune</p>
                      ) : (
                        analysisScope.excluded.map((v) => (
                          <div
                            key={v.name}
                            className="bg-white rounded-md px-2 py-1.5 mb-1 last:mb-0 text-xs"
                          >
                            <p className="font-bold text-gray-700 m-0 line-through">
                              {v.name}
                            </p>
                            <p className="text-gray-500 m-0 mt-0.5 italic">
                              {v.reason}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={analysisScope && analysisScope.n_retained === 0}
          className="w-full py-5 rounded-2xl font-sora font-bold text-lg
            flex items-center justify-center gap-3 transition-all
            bg-navy hover:bg-navy-deep text-white shadow-lg hover:shadow-xl
            transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          <Sparkles className="w-6 h-6" />
          Generer l'apercu du rapport
        </button>
        {analysisScope && analysisScope.n_retained === 0 && (
          <p className="text-xs text-red-700 text-center mt-2">
            Aucune variable metier analysable. Verifiez le fichier ou le mapping des colonnes-cles.
          </p>
        )}
        <p className="text-xs text-gray-500 text-center mt-3">
          La generation peut prendre 30 a 90 secondes
        </p>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-800 text-sm font-medium mb-1">Erreur</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}
      </div>
    )
  }

  // ============================================================
  //  VUE GENERATION EN COURS
  // ============================================================
  if (isGenerating) {
    return (
      <div className="card slide-up text-center">
        <Loader2 className="w-12 h-12 text-navy animate-spin mx-auto mb-4" />
        <h3 className="font-sora font-bold text-navy text-xl mb-2">
          Generation du rapport en cours...
        </h3>
        <p className="text-gray-600 mb-6">
          L'IA analyse vos donnees et redige les interpretations.
        </p>

        <div className="bg-beige rounded-xl p-4 border border-gray-200 text-left max-w-2xl mx-auto">
          <h5 className="font-sora font-bold text-navy text-sm mb-2 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Progression
          </h5>
          <div className="space-y-1 text-sm text-gray-700 font-mono max-h-64 overflow-y-auto">
            {progressLog.map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-gold">›</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  //  VUE APERCU DU RAPPORT
  // ============================================================
  const socio = content.univariate.filter((u) => u.category === "sociodemo")
  const principale = content.univariate.filter((u) => u.category !== "sociodemo")

  return (
    <div className="slide-up">
      {/* Toolbar sticky */}
      <div className="sticky top-0 z-20 bg-white rounded-2xl p-4 mb-4 shadow-card border border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-gold" />
          <span className="font-sora font-bold text-navy">Apercu du rapport</span>
          <span className="text-xs text-gray-500 ml-2">
            (clic sur une interpretation pour la modifier)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setContent(null)
              setProgressLog([])
            }}
            disabled={isGenerating || isDownloading}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Regenerer
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center gap-1.5 px-5 py-2 bg-navy hover:bg-navy-deep text-white rounded-lg font-bold text-sm transition-colors disabled:opacity-50 shadow-md"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Telechargement...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Telecharger en Word
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm m-0">{error}</p>
        </div>
      )}

      {/* PAGE DE GARDE simulee */}
      <div className="bg-white rounded-2xl p-12 mb-4 border-2 border-navy shadow-lg text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gold"></div>
        <img
          src="/sista_logo.png"
          alt="SISTA"
          className="w-24 h-auto mx-auto mb-8"
          onError={(e) => { e.target.style.display = "none" }}
        />
        <h1 className="font-sora font-bold text-navy text-4xl m-0 mb-2">
          RAPPORT ANALYTIQUE
        </h1>
        <p className="text-gold-deep text-xl italic mb-8">
          {content.meta.survey_context?.type || "Enquete"}
        </p>
        <div className="max-w-md mx-auto text-left space-y-2 text-sm bg-beige p-4 rounded-lg">
          <div>
            <span className="font-bold text-navy">Fichier source : </span>
            <span className="text-navy-deep">{content.meta.filename}</span>
          </div>
          <div>
            <span className="font-bold text-navy">Nombre de repondants : </span>
            <span className="text-navy-deep">{content.meta.n_rows}</span>
          </div>
          <div>
            <span className="font-bold text-navy">Date de generation : </span>
            <span className="text-navy-deep">
              {new Date(content.meta.generated_at).toLocaleDateString("fr-FR")}
            </span>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-gold"></div>
        <p className="text-xs text-gold-deep mt-6 font-bold">
          SISTA Consult Mauritanie © {new Date().getFullYear()}
        </p>
      </div>

      {/* SYNTHESE EXECUTIVE */}
      <div className="bg-white rounded-2xl p-6 mb-4 shadow-card border border-gray-200">
        <h2 className="font-sora font-bold text-navy text-2xl m-0 mb-3 border-b-2 border-gold pb-2">
          Synthese executive
        </h2>
        <EditableInterpretation
          value={content.executive_summary}
          onChange={updateExecSummary}
        />
      </div>

      {/* METHODOLOGIE */}
      <div className="bg-white rounded-2xl p-6 mb-4 shadow-card border border-gray-200">
        <h2 className="font-sora font-bold text-navy text-2xl m-0 mb-3 border-b-2 border-gold pb-2">
          Methodologie
        </h2>
        <p className="text-sm text-navy-deep leading-relaxed">{content.methodology}</p>
        {content.meta.survey_context?.description && (
          <div className="mt-3">
            <p className="font-bold text-navy text-sm mb-1">Contexte de l'enquete :</p>
            <p className="text-sm text-navy-deep">{content.meta.survey_context.description}</p>
          </div>
        )}
        {content.meta.survey_context?.population && (
          <p className="text-sm text-navy-deep mt-2">
            <span className="font-bold">Population cible : </span>
            {content.meta.survey_context.population}
          </p>
        )}
      </div>

      {/* PROFIL DES REPONDANTS */}
      {socio.length > 0 && (
        <div className="mb-4">
          <h2 className="font-sora font-bold text-navy text-2xl mb-3 px-1">
            Profil des repondants
          </h2>
          {socio.map((u) => {
            const realIdx = content.univariate.indexOf(u)
            return (
              <UnivariateSection
                key={realIdx}
                uni={u}
                onUpdate={(updated) => updateUnivariate(realIdx, updated)}
              />
            )
          })}
        </div>
      )}

      {/* ANALYSES DESCRIPTIVES */}
      {principale.length > 0 && (
        <div className="mb-4">
          <h2 className="font-sora font-bold text-navy text-2xl mb-3 px-1">
            Analyses descriptives
          </h2>
          {principale.map((u) => {
            const realIdx = content.univariate.indexOf(u)
            return (
              <UnivariateSection
                key={realIdx}
                uni={u}
                onUpdate={(updated) => updateUnivariate(realIdx, updated)}
              />
            )
          })}
        </div>
      )}

      {/* CROISEMENTS */}
      {content.bivariate.length > 0 && (
        <div className="mb-4">
          <h2 className="font-sora font-bold text-navy text-2xl mb-3 px-1">
            Analyses croisees
          </h2>
          {content.bivariate.map((b, i) => (
            <BivariateSection
              key={i}
              biv={b}
              onUpdate={(updated) => updateBivariate(i, updated)}
            />
          ))}
        </div>
      )}

      {/* QUALITE DES DONNEES */}
      {content.qc_summary && content.qc_summary.length > 0 && (
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-card border border-gray-200">
          <h2 className="font-sora font-bold text-navy text-2xl m-0 mb-3 border-b-2 border-gold pb-2">
            Qualite des donnees
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-navy text-white">
                <th className="p-2 text-left">Test</th>
                <th className="p-2 text-center">Gravite</th>
                <th className="p-2 text-right">Cas detectes</th>
              </tr>
            </thead>
            <tbody>
              {content.qc_summary.map((r, i) => (
                <tr key={i} className="odd:bg-beige">
                  <td className="p-2 border-b border-gray-100">{r.titre}</td>
                  <td className="p-2 border-b border-gray-100 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      r.severite === "high" ? "bg-red-100 text-red-700" :
                      r.severite === "med" ? "bg-orange-100 text-orange-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {r.severite === "high" ? "Eleve" :
                       r.severite === "med" ? "Modere" : "Faible"}
                    </span>
                  </td>
                  <td className="p-2 border-b border-gray-100 text-right font-mono">
                    {r.n_cas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Toolbar du bas */}
      <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-200 flex items-center justify-between flex-wrap gap-3 mb-6">
        <button onClick={() => store.setStep(3)} className="btn-secondary">
          <ArrowLeft className="w-4 h-4 inline mr-1" />
          Retour au rapport QC
        </button>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center gap-2 px-6 py-3 bg-navy hover:bg-navy-deep text-white rounded-xl font-bold transition-colors disabled:opacity-50 shadow-md"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Telechargement...
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              Telecharger le rapport Word
            </>
          )}
        </button>
      </div>
    </div>
  )
}