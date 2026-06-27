import { useEffect, useMemo, useState } from "react"
import { useStore } from "../../../store/useStore"
import { api } from "../../../api/client"
import MetricCard from "../../cards/MetricCard"
import {
  CheckCircle2,
  XCircle,
  Wrench,
  Clock,
  Save,
  Loader2,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react"

// ---- Vocabulaire des statuts de validation ----
const STATUS_OPTIONS = [
  {
    key: "confirmed",
    label: "Confirmée",
    short: "Vraie anomalie",
    icon: CheckCircle2,
    color: "red",
    bgClass: "bg-red-50 text-red-800 border-red-500",
    activeClass: "bg-red-500 text-white",
  },
  {
    key: "false_positive",
    label: "Faux positif",
    short: "Règle s'est trompée",
    icon: XCircle,
    color: "gray",
    bgClass: "bg-gray-50 text-gray-700 border-gray-400",
    activeClass: "bg-gray-600 text-white",
  },
  {
    key: "corrected",
    label: "Déjà corrigée",
    short: "Résolue par l'enquêteur",
    icon: Wrench,
    color: "green",
    bgClass: "bg-green-50 text-green-800 border-green-500",
    activeClass: "bg-green-600 text-white",
  },
]

const STATUS_DISPLAY = {
  confirmed:      { label: "Confirmée",      color: "text-red-700",    bg: "bg-red-50" },
  false_positive: { label: "Faux positif",   color: "text-gray-700",   bg: "bg-gray-100" },
  corrected:      { label: "Déjà corrigée",  color: "text-green-700",  bg: "bg-green-50" },
  pending:        { label: "En attente",     color: "text-orange-700", bg: "bg-orange-50" },
}

// ---- Helpers ----
const makeItemId = (kind, key) => `${kind}:${key}`

function ValidationCard({ rule, currentStatus, currentComment, onStatusChange, onCommentChange }) {
  const [expanded, setExpanded] = useState(false)
  const status = currentStatus || "pending"
  const statusInfo = STATUS_DISPLAY[status] || STATUS_DISPLAY.pending

  return (
    <div
      className={`bg-white rounded-xl border-l-4 ${
        status === "confirmed"      ? "border-red-500" :
        status === "false_positive" ? "border-gray-400" :
        status === "corrected"      ? "border-green-500" :
                                       "border-orange-400"
      } border border-gray-200 shadow-sm overflow-hidden`}
    >
      {/* Header */}
      <div className="p-3 px-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                {rule.kindLabel}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-md font-bold ${statusInfo.bg} ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            <p className="font-sora font-bold text-navy text-sm m-0 leading-snug">
              {rule.titre}
            </p>
          </div>
          <span
            className="bg-navy text-white px-3 py-1 rounded-md font-mono text-sm font-bold flex-shrink-0"
            title="Nombre de cas détectés"
          >
            {rule.n_cas}
          </span>
        </div>

        {/* Boutons de statut */}
        <div className="grid grid-cols-3 gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const isActive = status === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => onStatusChange(opt.key)}
                className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border-2 transition-all text-xs font-bold ${
                  isActive
                    ? `${opt.activeClass} border-transparent shadow-md`
                    : `${opt.bgClass} hover:shadow-sm`
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{opt.label}</span>
              </button>
            )
          })}
        </div>

        {/* Bouton pour afficher/masquer le commentaire */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-navy hover:underline flex items-center gap-1"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {currentComment ? "Commentaire" : "Ajouter un commentaire"}
          {currentComment && (
            <span className="text-gray-500 ml-1 truncate max-w-[300px]">
              — {currentComment.slice(0, 60)}
            </span>
          )}
        </button>

        {expanded && (
          <textarea
            className="input-field mt-2 min-h-[60px] text-sm"
            value={currentComment || ""}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Précisez votre décision (optionnel)..."
            maxLength={1000}
          />
        )}
      </div>
    </div>
  )
}

// ====================================================================
//  Composant principal
// ====================================================================

export default function Step3ValidationTab({ onGoToGeneration }) {
  const store = useStore()
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [filterStatus, setFilterStatus] = useState("all") // 'all' | 'pending' | 'confirmed' | ...

  // ---- Au montage : charger les validations deja sauvegardees ----
  useEffect(() => {
    if (!store.sessionId) return
    api
      .getValidations(store.sessionId)
      .then((data) => {
        if (data.validations && Object.keys(data.validations).length > 0) {
          store.setAllValidations(data.validations)
        }
        if (data.metadata && Object.keys(data.metadata).length > 0) {
          store.setQcMetadata(data.metadata)
        }
      })
      .catch(() => {
        // Pas grave : la session peut juste etre vide
      })
  }, [store.sessionId])

  // ---- Construire la liste plate des regles a valider ----
  const allRules = useMemo(() => {
    const list = []

    // QC basique : on prend les tests qui ont au moins 1 cas
    for (const r of store.results || []) {
      if (r.severite === "ok") continue
      const ruleId = r.id || r.titre
      list.push({
        itemId:    makeItemId("basic", ruleId),
        titre:     r.titre,
        n_cas:     r.n_cas,
        severite:  r.severite,
        kind:      "basic",
        kindLabel: "QC basique",
      })
    }

    // QC IA : on prend les regles avec au moins 1 cas
    const aiRules = store.aiRules || []
    const aiResult = store.aiResult
    if (aiRules.length > 0 && aiResult) {
      const cpr = aiResult.cas_par_regle || {}
      for (let i = 0; i < aiRules.length; i++) {
        const r = aiRules[i]
        const nCas = Number(cpr[i] ?? cpr[String(i)] ?? 0)
        if (nCas === 0) continue
        list.push({
          itemId:    makeItemId("ai", i),
          titre:     r.description || `Règle ${i + 1}`,
          n_cas:     nCas,
          severite:  "med",
          kind:      "ai",
          kindLabel: "QC IA",
        })
      }
    }
    return list
  }, [store.results, store.aiRules, store.aiResult])

  // ---- Filtrage des regles selon le statut ----
  const filteredRules = useMemo(() => {
    if (filterStatus === "all") return allRules
    return allRules.filter((r) => {
      const status = store.validations[r.itemId]?.status || "pending"
      return status === filterStatus
    })
  }, [allRules, store.validations, filterStatus])

  // ---- Compteurs pour les badges ----
  const counts = useMemo(() => {
    const c = { confirmed: 0, false_positive: 0, corrected: 0, pending: 0 }
    for (const r of allRules) {
      const status = store.validations[r.itemId]?.status || "pending"
      c[status] += 1
    }
    return c
  }, [allRules, store.validations])

  const totalAnomalies = useMemo(
    () => allRules.reduce((sum, r) => sum + (r.n_cas || 0), 0),
    [allRules]
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.saveValidations(store.sessionId, store.validations, store.qcMetadata)
      setLastSaved(new Date())
    } catch (e) {
      store.setApiError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Auto-save soft : sauvegarde silencieuse 2s apres une inactivite
  useEffect(() => {
    if (!store.sessionId) return
    const t = setTimeout(() => {
      api.saveValidations(store.sessionId, store.validations, store.qcMetadata)
        .then(() => setLastSaved(new Date()))
        .catch(() => {})
    }, 2000)
    return () => clearTimeout(t)
  }, [store.validations, store.sessionId])

  if (allRules.length === 0) {
    return (
      <div className="card text-center slide-up">
        <ShieldCheck className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h3 className="font-sora font-bold text-navy text-lg m-0 mb-2">
          Aucune anomalie à valider
        </h3>
        <p className="text-gray-600 m-0">
          Aucun test n'a détecté d'anomalie dans ce fichier. Tu peux générer
          un rapport vierge directement.
        </p>
        <button onClick={onGoToGeneration} className="btn-primary mt-4">
          Générer le rapport
          <ArrowRight className="w-4 h-4 inline ml-2" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 slide-up">
      {/* Intro */}
      <div className="card">
        <h3 className="card-title flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-gold" />
          Validation des anomalies
        </h3>
        <p className="card-desc">
          Pour chaque règle ayant détecté des anomalies, indiquez votre décision.
          Cette étape est <strong>obligatoire avant la génération du rapport
          de synthèse</strong> et constitue la trace formelle de votre contrôle.
        </p>

        {/* Stats globales */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <MetricCard variant="navy" value={allRules.length} label="Règles" />
          <MetricCard variant="purple" value={totalAnomalies} label="Anomalies" />
          <MetricCard variant="red" value={counts.confirmed} label="Confirmées" />
          <MetricCard
            variant="gold"
            value={counts.false_positive + counts.corrected}
            label="Rejetées / corrigées"
          />
          <MetricCard variant="orange" value={counts.pending} label="En attente" />
        </div>

        {/* Filtres */}
        <div className="flex gap-2 flex-wrap items-center bg-gray-50 rounded-xl p-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">
            Filtrer :
          </span>
          {[
            { key: "all",            label: "Toutes",      n: allRules.length },
            { key: "pending",        label: "En attente",  n: counts.pending,        color: "orange" },
            { key: "confirmed",      label: "Confirmées",  n: counts.confirmed,      color: "red" },
            { key: "false_positive", label: "Faux pos.",   n: counts.false_positive, color: "gray" },
            { key: "corrected",      label: "Corrigées",   n: counts.corrected,      color: "green" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === f.key
                  ? "bg-navy text-white shadow-sm"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              {f.label} <span className="opacity-75">({f.n})</span>
            </button>
          ))}
        </div>

        {/* Alerte si des règles sont encore en attente */}
        {counts.pending > 0 && (
          <div className="mt-3 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl p-3 px-4 flex items-start gap-2 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900 m-0">
                {counts.pending} règle(s) encore en attente de décision
              </p>
              <p className="text-amber-800 text-xs mt-1 m-0">
                Les règles non validées apparaîtront comme "En attente" dans le
                rapport. Pour un rapport définitif, prenez une décision sur chacune.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Liste des regles a valider */}
      <div className="space-y-2">
        {filteredRules.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500 text-sm">
            Aucune règle ne correspond à ce filtre.
          </div>
        ) : (
          filteredRules.map((rule) => (
            <ValidationCard
              key={rule.itemId}
              rule={rule}
              currentStatus={store.validations[rule.itemId]?.status}
              currentComment={store.validations[rule.itemId]?.comment}
              onStatusChange={(s) => store.setValidationStatus(rule.itemId, s)}
              onCommentChange={(c) => store.setValidationComment(rule.itemId, c)}
            />
          ))
        )}
      </div>

      {/* Actions globales */}
      <div className="card sticky bottom-3 z-10 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm">
            <span className="text-gray-500">
              {lastSaved
                ? `Dernière sauvegarde : ${lastSaved.toLocaleTimeString("fr-FR")}`
                : "Vos décisions sont sauvegardées automatiquement"}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-secondary flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Enregistrer
            </button>
            <button
              onClick={onGoToGeneration}
              className="btn-primary flex items-center gap-2"
            >
              Passer à la génération du rapport
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}