import { useState } from "react"
import { useStore } from "../../store/useStore"
import { api } from "../../api/client"
import {
  FileText, Download, Loader2, ArrowLeft, Sparkles,
  CheckCircle2, RefreshCw, Pencil, Check, X, AlertCircle,
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

        <button
          onClick={handleGenerate}
          className="w-full py-5 rounded-2xl font-sora font-bold text-lg
            flex items-center justify-center gap-3 transition-all
            bg-navy hover:bg-navy-deep text-white shadow-lg hover:shadow-xl
            transform hover:-translate-y-0.5"
        >
          <Sparkles className="w-6 h-6" />
          Generer l'apercu du rapport
        </button>
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