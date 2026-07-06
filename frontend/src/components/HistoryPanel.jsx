import { useState, useEffect } from "react"
import { useStore } from "../store/useStore"
import {
  History, RotateCcw, X, Trash2, FileText, Calendar, User,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react"

function formatDate(iso) {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return d.toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  } catch { return iso }
}

function formatFileSize(name) {
  return name || ""
}

// ====================================================================
//  Bannière brouillon disponible (haut de Step1)
// ====================================================================
export function DraftBanner() {
  const store = useStore()
  const draft = store.draftAvailable

  if (!draft) return null

  return (
    <div className="bg-gradient-to-r from-gold/20 to-gold/5 border-l-4 border-gold rounded-2xl p-4 mb-5 flex items-start gap-3 shadow-sm slide-up">
      <div className="bg-gold rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0">
        <RotateCcw className="w-5 h-5 text-navy" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-sora font-bold text-navy m-0">
          Brouillon disponible — voulez-vous reprendre ?
        </p>
        <p className="text-xs text-gray-700 mt-1 m-0">
          Sauvegardé le <strong>{formatDate(draft.saved_at)}</strong>
          {draft.dataFileName ? ` · Fichier : ${draft.dataFileName}` : ""}
          {draft.surveyType ? ` · ${draft.surveyType}` : ""}
        </p>
        <p className="text-xs text-gray-500 mt-1 m-0 italic">
          Les fichiers doivent être re-uploadés, mais le contexte, le mapping et les
          validations en cours seront restaurés.
        </p>
      </div>
      <div className="flex flex-col gap-2 flex-shrink-0">
        <button
          onClick={() => store.restoreDraft(draft)}
          className="text-xs px-3 py-1.5 rounded-lg bg-navy text-white hover:bg-navy-deep font-bold flex items-center gap-1 whitespace-nowrap"
        >
          <RotateCcw className="w-3 h-3" />
          Reprendre
        </button>
        <button
          onClick={() => store.discardDraft()}
          className="text-xs px-3 py-1.5 rounded-lg bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 font-bold flex items-center gap-1 whitespace-nowrap"
        >
          <X className="w-3 h-3" />
          Ignorer
        </button>
      </div>
    </div>
  )
}

// ====================================================================
//  Confirmation de restauration
// ====================================================================
export function DraftRestoredBanner() {
  const store = useStore()

  if (!store.draftRestored) return null

  return (
    <div className="bg-green-50 border-l-4 border-green-500 rounded-2xl p-3 px-4 mb-5 flex items-center gap-2 slide-up">
      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
      <p className="text-sm text-green-800 m-0 flex-1">
        <strong>Brouillon restauré.</strong> Vos paramètres, mapping et validations
        précédents ont été chargés. Il vous reste à re-uploader votre fichier.
      </p>
      <button
        onClick={() => useStore.setState({ draftRestored: false })}
        className="text-green-800 hover:bg-green-100 rounded-lg p-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ====================================================================
//  Carte Historique (repliable)
// ====================================================================
export function HistoryCard() {
  const store = useStore()
  const [expanded, setExpanded] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  useEffect(() => { store.loadHistoryFromStorage() }, [])

  const history = store.history || []
  if (history.length === 0) return null

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left group"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <History className="w-5 h-5 text-gold" />
          <h3 className="card-title m-0 group-hover:text-gold-deep transition-colors">
            Analyses récentes
          </h3>
          <span className="bg-navy text-white text-xs px-2 py-0.5 rounded-full font-bold">
            {history.length}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-navy" /> : <ChevronDown className="w-5 h-5 text-navy" />}
      </button>

      {!expanded && (
        <p className="card-desc m-0 mt-2">
          {history.length} analyse(s) sauvegardée(s) dans votre navigateur.
          Cliquez pour voir la liste et les détails.
        </p>
      )}

      {expanded && (
        <div className="mt-4 slide-up">
          <p className="text-xs text-gray-600 mb-3 m-0">
            L'historique est stocké dans votre navigateur (les résultats détaillés
            ne sont pas conservés, seuls les indicateurs de synthèse).
          </p>

          {/* Action globale */}
          <div className="flex justify-end mb-3">
            {!confirmClearAll ? (
              <button
                onClick={() => setConfirmClearAll(true)}
                className="text-xs px-3 py-1.5 rounded-lg text-red-700 hover:bg-red-50 font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Vider l'historique
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-1.5">
                <span className="text-xs text-red-900 font-bold">Confirmer ?</span>
                <button
                  onClick={() => { store.clearAllHistory(); setConfirmClearAll(false) }}
                  className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 font-bold"
                >
                  Oui, tout supprimer
                </button>
                <button
                  onClick={() => setConfirmClearAll(false)}
                  className="text-xs px-2 py-1 rounded bg-white text-gray-700 hover:bg-gray-100 font-bold"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>

          {/* Liste */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {history.map((entry) => (
              <HistoryEntry key={entry.id} entry={entry} onDelete={() => store.deleteHistoryEntry(entry.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryEntry({ entry, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const sev = entry.severities || {}
  const validationPct = entry.n_incoherences > 0
    ? Math.round((entry.n_validated / entry.n_incoherences) * 100)
    : 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <FileText className="w-4 h-4 text-navy flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-sora font-bold text-navy text-sm m-0 truncate">
              {entry.filename}
            </p>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(entry.saved_at)}
              </span>
              {entry.responsable_qc && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {entry.responsable_qc}
                </span>
              )}
              {entry.surveyType && (
                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                  {entry.surveyType}
                </span>
              )}
            </div>
          </div>
        </div>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg p-1 flex-shrink-0"
            title="Supprimer cette entrée"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onDelete}
              className="text-xs px-2 py-1 rounded bg-red-600 text-white font-bold"
            >
              OK
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 font-bold"
            >
              Non
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
        <div className="bg-navy/5 rounded-lg p-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider m-0">Observations</p>
          <p className="font-mono font-bold text-navy m-0 mt-0.5">{entry.n_observations}</p>
        </div>
        <div className="bg-navy/5 rounded-lg p-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider m-0">Anomalies</p>
          <p className="font-mono font-bold text-navy m-0 mt-0.5">{entry.n_incoherences}</p>
        </div>
        <div className="bg-navy/5 rounded-lg p-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider m-0">Règles IA</p>
          <p className="font-mono font-bold text-navy m-0 mt-0.5">{entry.n_ai_rules}</p>
        </div>
        <div className={`rounded-lg p-2 ${
          validationPct === 100 ? "bg-green-50" :
          validationPct > 0 ? "bg-orange-50" : "bg-gray-50"
        }`}>
          <p className="text-xs text-gray-500 uppercase tracking-wider m-0">Validées</p>
          <p className={`font-mono font-bold m-0 mt-0.5 ${
            validationPct === 100 ? "text-green-700" :
            validationPct > 0 ? "text-orange-700" : "text-gray-500"
          }`}>
            {validationPct}%
          </p>
        </div>
      </div>

      {(sev.high > 0 || sev.med > 0) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {sev.high > 0 && (
            <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded font-bold">
              {sev.high} critique(s)
            </span>
          )}
          {sev.med > 0 && (
            <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-bold">
              {sev.med} attention
            </span>
          )}
        </div>
      )}
    </div>
  )
}