import { useEffect, useMemo, useState } from "react"
import { useStore } from "../../../store/useStore"
import { api } from "../../../api/client"
import MetricCard from "../../cards/MetricCard"
import {
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  User,
  Calendar,
  Building2,
  MessageSquare,
} from "lucide-react"

const STATUS_DISPLAY = {
  confirmed:      { label: "Confirmées",     color: "red"   },
  false_positive: { label: "Faux positifs",  color: "gray"  },
  corrected:      { label: "Déjà corrigées", color: "green" },
  pending:        { label: "En attente",     color: "orange"},
}

export default function Step3GenerationTab({ onGoToValidation }) {
  const store = useStore()
  const [downloading, setDownloading] = useState(false)
  const [downloadSuccess, setDownloadSuccess] = useState(false)

  // Aujourd'hui par defaut
  useEffect(() => {
    if (!store.qcMetadata.date_validation) {
      const today = new Date().toLocaleDateString("fr-FR")
      store.setQcMetadataField("date_validation", today)
    }
  }, [])

  // ---- Re-calcul des compteurs (cote frontend, miroir du backend) ----
  const summary = useMemo(() => {
    const counts = { confirmed: 0, false_positive: 0, corrected: 0, pending: 0 }
    let nRules = 0
    let nRulesBasic = 0
    let nRulesAi = 0

    // Basique
    for (const r of store.results || []) {
      if (r.severite === "ok") continue
      nRules++
      nRulesBasic++
      const itemId = `basic:${r.id || r.titre}`
      const status = store.validations[itemId]?.status || "pending"
      counts[status] += r.n_cas || 0
    }

    // IA
    const aiRules = store.aiRules || []
    const aiResult = store.aiResult
    if (aiRules.length > 0 && aiResult) {
      const cpr = aiResult.cas_par_regle || {}
      for (let i = 0; i < aiRules.length; i++) {
        const nCas = Number(cpr[i] ?? cpr[String(i)] ?? 0)
        if (nCas === 0) continue
        nRules++
        nRulesAi++
        const itemId = `ai:${i}`
        const status = store.validations[itemId]?.status || "pending"
        counts[status] += nCas
      }
    }

    const total = counts.confirmed + counts.false_positive + counts.corrected + counts.pending
    const nObs = store.profile?.summary?.n_rows || 0
    const taux = nObs > 0
      ? Math.round(Math.max(0, (nObs - counts.confirmed) / nObs * 100) * 10) / 10
      : 0

    return {
      counts,
      total,
      nRules,
      nRulesBasic,
      nRulesAi,
      nObs,
      taux,
    }
  }, [store.results, store.aiRules, store.aiResult, store.validations, store.profile])

  const tauxColor = summary.taux >= 90 ? "green"
                  : summary.taux >= 70 ? "gold"
                  : "red"

  const tauxText  = summary.taux >= 90 ? "Qualité satisfaisante"
                  : summary.taux >= 70 ? "Qualité à améliorer"
                  : "Qualité insuffisante"

  const handleDownload = async () => {
    if (!store.qcMetadata.responsable_qc?.trim()) {
      store.setApiError("Veuillez indiquer le nom du responsable QC avant de générer le rapport.")
      return
    }

    setDownloading(true)
    setDownloadSuccess(false)
    store.setApiError(null)

    try {
      // 1. Sauvegarder les validations et metadata
      await api.saveValidations(store.sessionId, store.validations, store.qcMetadata)

      // 2. Generer + telecharger le .docx
      const { blob, filename } = await api.downloadQcReport(
        store.sessionId,
        store.qcMetadata
      )

      // 3. Declencher le telechargement navigateur
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      setDownloadSuccess(true)
      setTimeout(() => setDownloadSuccess(false), 5000)
    } catch (e) {
      store.setApiError(e.message)
    } finally {
      setDownloading(false)
    }
  }

  const readyToGenerate = summary.nRules > 0
  const allValidated = readyToGenerate && summary.counts.pending === 0
  const responsableFilled = !!store.qcMetadata.responsable_qc?.trim()

  return (
    <div className="space-y-4 slide-up">
      {/* Intro */}
      <div className="card">
        <h3 className="card-title flex items-center gap-2">
          <FileText className="w-5 h-5 text-gold" />
          Rapport de synthèse QC
        </h3>
        <p className="card-desc">
          Le rapport final reprend l'ensemble des anomalies détectées avec votre
          décision, par règle, et compose un document Word formel servant de trace
          d'audit pour l'équipe SISTA.
        </p>
      </div>

      {/* Synthese visuelle */}
      <div className="card">
        <h4 className="font-sora font-bold text-navy mb-3 m-0">
          Aperçu du contenu du rapport
        </h4>

        {/* Compteurs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <MetricCard variant="navy" value={summary.nObs} label="Observations" />
          <MetricCard variant="purple" value={summary.nRules} label="Règles exécutées" />
          <MetricCard variant="blue" value={summary.total} label="Anomalies traitées" />
          <MetricCard variant={tauxColor} value={`${summary.taux}%`} label="Taux qualité estimé" />
        </div>

        {/* Repartition par statut */}
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 m-0">
            Répartition des décisions
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(STATUS_DISPLAY).map(([key, info]) => {
              const n = summary.counts[key] || 0
              const pct = summary.total > 0 ? Math.round(n / summary.total * 100) : 0
              const colorClass = {
                red:    "bg-red-50 text-red-800 border-red-300",
                gray:   "bg-gray-100 text-gray-700 border-gray-300",
                green:  "bg-green-50 text-green-800 border-green-300",
                orange: "bg-orange-50 text-orange-800 border-orange-300",
              }[info.color]
              return (
                <div key={key} className={`rounded-lg p-2 border-l-4 ${colorClass}`}>
                  <p className="text-xs font-bold uppercase tracking-wider m-0 opacity-70">
                    {info.label}
                  </p>
                  <p className="font-mono font-bold text-lg m-0 mt-1">
                    {n} <span className="text-xs font-normal opacity-60">({pct}%)</span>
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Alerte validations en attente */}
        {readyToGenerate && !allValidated && (
          <div className="mt-3 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl p-3 px-4 flex items-start gap-2 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-amber-900 m-0">
                {summary.counts.pending} cas encore en attente de décision
              </p>
              <p className="text-amber-800 text-xs mt-1 m-0">
                Tu peux quand même générer le rapport, mais il indiquera ces cas
                comme "en attente" et ne sera pas une trace définitive.
              </p>
            </div>
            <button
              onClick={onGoToValidation}
              className="text-xs bg-white text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-100 font-bold flex items-center gap-1 whitespace-nowrap"
            >
              <ArrowLeft className="w-3 h-3" />
              Retour à la validation
            </button>
          </div>
        )}

        {allValidated && (
          <div className="mt-3 bg-green-50 border-l-4 border-green-500 rounded-r-xl p-3 px-4 flex items-start gap-2 text-sm">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-green-900 m-0">
              <strong>Toutes les anomalies ont été validées.</strong> Le rapport
              sera complet et constituera une trace d'audit définitive.
            </p>
          </div>
        )}
      </div>

      {/* Metadonnees du responsable QC */}
      <div className="card">
        <h4 className="font-sora font-bold text-navy mb-1 m-0 flex items-center gap-2">
          <User className="w-4 h-4 text-gold" />
          Informations du responsable QC
        </h4>
        <p className="text-xs text-gray-500 m-0 mb-4">
          Ces informations apparaîtront dans la page de garde et la page de signature
          du rapport.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label-text flex items-center gap-1">
              <User className="w-3 h-3" />
              Nom du responsable
              <span className="text-red-600 text-xs font-bold" title="Obligatoire">*</span>
            </label>
            <input
              type="text"
              className={`input-field ${!responsableFilled ? "border-red-300" : ""}`}
              value={store.qcMetadata.responsable_qc || ""}
              onChange={(e) => store.setQcMetadataField("responsable_qc", e.target.value)}
              placeholder="Ex : Mohamed Ould Brahim"
            />
          </div>

          <div>
            <label className="label-text">Fonction / titre</label>
            <input
              type="text"
              className="input-field"
              value={store.qcMetadata.fonction || ""}
              onChange={(e) => store.setQcMetadataField("fonction", e.target.value)}
              placeholder="Ex : Responsable Qualité SISTA"
            />
          </div>

          <div>
            <label className="label-text flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              Organisation
            </label>
            <input
              type="text"
              className="input-field"
              value={store.qcMetadata.organisation || ""}
              onChange={(e) => store.setQcMetadataField("organisation", e.target.value)}
              placeholder="SISTA Consult Mauritanie"
            />
          </div>

          <div>
            <label className="label-text flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Date du contrôle
            </label>
            <input
              type="text"
              className="input-field"
              value={store.qcMetadata.date_validation || ""}
              onChange={(e) => store.setQcMetadataField("date_validation", e.target.value)}
              placeholder="JJ/MM/AAAA"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="label-text flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            Observations générales (facultatif)
          </label>
          <textarea
            className="input-field min-h-[80px] resize-y"
            value={store.qcMetadata.observations_generales || ""}
            onChange={(e) => store.setQcMetadataField("observations_generales", e.target.value)}
            placeholder="Commentaires généraux qui apparaîtront dans la section Recommandations du rapport..."
            maxLength={2000}
          />
          <p className="text-xs text-gray-500 mt-1 m-0">
            {(store.qcMetadata.observations_generales || "").length} / 2000 caractères
          </p>
        </div>
      </div>

      {/* Structure du rapport */}
      <div className="card bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200">
        <h4 className="font-sora font-bold text-navy mb-2 m-0">
          Que contiendra le rapport ?
        </h4>
        <ol className="text-sm text-navy space-y-1 m-0 pl-5">
          <li><strong>Page de garde</strong> — logo SISTA, fichier source, date, responsable QC</li>
          <li><strong>Synthèse exécutive</strong> — compteurs globaux, répartition par décision, taux de qualité</li>
          <li><strong>Détail des contrôles automatiques</strong> — chaque test basique avec son statut et votre commentaire</li>
          <li><strong>Détail des règles IA</strong> — chaque règle générée par l'IA avec son statut et votre commentaire</li>
          <li><strong>Bilan par enquêteur</strong> — anomalies confirmées attribuées à chacun</li>
          <li><strong>Recommandations</strong> — actions à mener pour chaque anomalie confirmée</li>
          <li><strong>Page de validation et signature</strong> — espace pour signature manuscrite</li>
        </ol>
      </div>

      {/* Bouton de telechargement */}
      <div className="card text-center">
        {!readyToGenerate ? (
          <p className="text-gray-600 m-0">
            Aucune anomalie à reporter. Importez un fichier qui en contient.
          </p>
        ) : (
          <>
            <button
              onClick={handleDownload}
              disabled={downloading || !responsableFilled}
              className="btn-primary px-8 py-3 text-base inline-flex items-center gap-2"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Génération du rapport...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Télécharger le rapport QC (.docx)
                </>
              )}
            </button>

            {!responsableFilled && (
              <p className="text-xs text-amber-700 mt-2 m-0">
                Renseignez le nom du responsable QC pour activer le bouton.
              </p>
            )}

            {downloadSuccess && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 inline-flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm text-green-800 font-medium">
                  Rapport téléchargé avec succès
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}