import { useState, useEffect, useMemo } from "react"
import { useStore } from "../../store/useStore"
import { api } from "../../api/client"
import UploadZone from "../ui/UploadZone"
import { DraftBanner, DraftRestoredBanner, HistoryCard } from "../HistoryPanel"
import PrePostPanel from "../PrePostPanel"
import {
  CheckCircle, XCircle, Loader2, Sparkles,
  KeyRound, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp, Clock, Plus, Trash2,
  Layers, ListChecks, Zap, Info, GitCompare, ArrowRight,
} from "lucide-react"

const TYPES_ENQUETE = [
  "(Sélectionner ou saisir)",
  "PDM - Post-Distribution Monitoring",
  "EFSA - Sécurité alimentaire",
  "HEA - Household Economy Approach",
  "WASH - Eau, hygiène, assainissement",
  "MSNA - Besoins multi-sectoriels",
  "Éducation / scolarisation",
  "Protection / GBV",
  "Santé / nutrition",
  "Cash / transferts monétaires",
  "Livelihood / moyens de subsistance",
  "Recensement / RGPH",
  "Étude de marché / commerce",
  "Étude bancaire / microfinance",
  "Enquête satisfaction client",
  "Autre (préciser ci-dessous)",
]

const KEY_COLUMNS_OPTIONAL = [
  { key: "start", label: "Date / heure de début",
    hint: "Horodatage du début. Active les tests de durée." },
  { key: "end", label: "Date / heure de fin",
    hint: "Horodatage de fin. Doit aller de pair avec le début." },
  { key: "lat", label: "Latitude (GPS)", hint: "Coordonnée GPS - latitude." },
  { key: "lon", label: "Longitude (GPS)", hint: "Coordonnée GPS - longitude." },
]

// ====================================================================
//  Carte 1 : colonnes-clés (avec ID composite - reco SISTA v2)
// ====================================================================
function ColumnMappingCard() {
  const store = useStore()

  const hasMetadataDetected = useMemo(() => {
    const m = store.previewAutoMapping || {}
    return !!(m.start || m.end || m.lat || m.lon)
  }, [store.previewAutoMapping])
  const [metadataExpanded, setMetadataExpanded] = useState(false)

  useEffect(() => {
    if (hasMetadataDetected) setMetadataExpanded(true)
  }, [hasMetadataDetected])

  if (!store.dataFile) return null

  if (store.previewLoading) {
    return (
      <div className="card">
        <h3 className="card-title flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-gold" />
          Colonnes-clés du fichier
        </h3>
        <div className="flex items-center gap-3 text-gray-600 text-sm py-4">
          <Loader2 className="w-5 h-5 animate-spin text-navy" />
          Lecture rapide du fichier...
        </div>
      </div>
    )
  }

  if (store.previewError) {
    return (
      <div className="card">
        <h3 className="card-title flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-gold" />
          Colonnes-clés du fichier
        </h3>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold m-0">Impossible de lire le fichier</p>
            <p className="m-0 mt-1">{store.previewError}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!store.previewColumns || store.previewColumns.length === 0) return null

  const nbMetadataFilled = KEY_COLUMNS_OPTIONAL.reduce(
    (n, kc) => n + (store.columnMapping[kc.key] ? 1 : 0), 0
  )

  // Validation ID (simple ou composite)
  const idSimpleOk = !store.isCompositeId && !!(store.columnMapping.id || "").trim()
  const idCompositeOk = store.isCompositeId &&
    store.compositeIdCols.filter((c) => c && c.trim()).length >= 2
  const idOk = idSimpleOk || idCompositeOk

  return (
    <div className="card">
      <h3 className="card-title flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-gold" />
        Colonnes-clés du fichier
      </h3>
      <p className="card-desc">
        Identifiez les colonnes essentielles avant l'analyse. Les valeurs proposées
        sont auto-détectées et peuvent être corrigées. <strong>L'identifiant unique
        est obligatoire</strong> et doit être validé par l'équipe SISTA.
      </p>

      <div className="bg-gray-50 rounded-lg px-3 py-2 mb-4 text-xs text-gray-600 flex items-center justify-between flex-wrap gap-2">
        <span>
          <strong>{store.previewColumns.length}</strong> colonne(s) détectée(s)
          {store.previewProfile?.summary?.n_rows
            ? ` · ${store.previewProfile.summary.n_rows} observation(s)`
            : ""}
        </span>
        <button
          onClick={() => {
            store.resetColumnMapping()
            store.setIsCompositeId(false)
            store.setCompositeIdCol(0, "")
            store.setCompositeIdCol(1, "")
            store.setCompositeIdCol(2, "")
          }}
          className="text-xs text-navy hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Restaurer l'auto-détection
        </button>
      </div>

      {/* --- Identifiant : simple OU composite --- */}
      <div className="mb-4 bg-gradient-to-br from-gold/10 to-transparent rounded-xl p-3 border border-gold/30">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <label className="label-text flex items-center gap-1 m-0">
            <Layers className="w-4 h-4 text-gold" />
            Identifiant unique de l'observation
            <span className="text-red-600 text-xs font-bold" title="Obligatoire">*</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-navy cursor-pointer bg-white rounded-lg px-2 py-1">
            <input
              type="checkbox"
              checked={store.isCompositeId}
              onChange={(e) => store.setIsCompositeId(e.target.checked)}
              className="cursor-pointer"
            />
            <span className="font-semibold">Identifiant composé (2 à 3 variables)</span>
          </label>
        </div>

        {!store.isCompositeId ? (
          <select
            className={`input-field ${!idSimpleOk ? "border-red-400 bg-red-50" : ""}`}
            value={store.columnMapping.id || ""}
            onChange={(e) => store.setColumnMappingField("id", e.target.value)}
          >
            <option value="">— Aucune —</option>
            {store.previewColumns.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="bg-navy text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <select
                  className={`input-field flex-1 ${
                    i < 2 && !store.compositeIdCols[i] ? "border-red-300 bg-red-50" : ""
                  }`}
                  value={store.compositeIdCols[i] || ""}
                  onChange={(e) => store.setCompositeIdCol(i, e.target.value)}
                >
                  <option value="">
                    {i === 2 ? "— Optionnel — 3ème composante" : "— Sélectionner —"}
                  </option>
                  {store.previewColumns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            ))}
            <p className="text-xs text-gray-600 italic m-0 mt-1">
              L'identifiant sera la concaténation de ces colonnes (ex : zone + numéro_ménage).
              Au moins 2 colonnes sont requises.
            </p>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1 m-0">
          À définir explicitement par l'équipe SISTA. Recommandation : utilisez un ID composé
          si aucune colonne unique n'existe.
        </p>
      </div>

      {/* --- Enqueteur --- */}
      <div className="mb-2">
        <label className="label-text">Enquêteur / agent de collecte</label>
        <select
          className="input-field"
          value={store.columnMapping.enqueteur || ""}
          onChange={(e) => store.setColumnMappingField("enqueteur", e.target.value)}
        >
          <option value="">— Aucune —</option>
          {store.previewColumns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1 m-0">
          Nom ou code de la personne ayant collecté la donnée. Active le bilan par enquêteur.
        </p>
      </div>

      {/* --- Superviseur / chef d'equipe --- */}
      <div className="mb-2">
        <label className="label-text">Superviseur / chef d'équipe (optionnel)</label>
        <select
          className="input-field"
          value={store.columnMapping.superviseur || ""}
          onChange={(e) => store.setColumnMappingField("superviseur", e.target.value)}
        >
          <option value="">— Aucun —</option>
          {store.previewColumns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1 m-0">
          Colonne identifiant le superviseur ou chef d'équipe. Permet de filtrer les
          anomalies par équipe (superviseur → ses enquêteurs) dans les onglets de contrôle qualité.
        </p>
      </div>

      {/* --- Metadonnees repliables --- */}
      <div className="mt-4 border-t border-gray-200 pt-3">
        <button
          type="button"
          onClick={() => setMetadataExpanded(!metadataExpanded)}
          className="w-full flex items-center justify-between text-left text-sm font-semibold text-navy hover:bg-gray-50 rounded-lg px-2 py-2"
        >
          <span className="flex items-center gap-2 flex-wrap">
            Métadonnées de collecte
            <span className="text-xs font-normal text-gray-500">
              (optionnel — utile pour les enquêtes Kobo/ODK)
            </span>
            {nbMetadataFilled > 0 && (
              <span className="bg-gold/20 text-navy text-xs px-2 py-0.5 rounded-full font-bold">
                {nbMetadataFilled} / 4
              </span>
            )}
          </span>
          {metadataExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {metadataExpanded && (
          <div className="slide-up mt-3">
            <p className="text-xs text-gray-500 mb-3 italic">
              Renseignez ces colonnes uniquement si votre fichier contient des horodatages
              (start/end) ou des coordonnées GPS.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {KEY_COLUMNS_OPTIONAL.map((kc) => (
                <div key={kc.key}>
                  <label className="label-text">{kc.label}</label>
                  <select
                    className="input-field"
                    value={store.columnMapping[kc.key] || ""}
                    onChange={(e) => store.setColumnMappingField(kc.key, e.target.value)}
                  >
                    <option value="">— Aucune —</option>
                    {store.previewColumns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1 m-0">{kc.hint}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!idOk && (
        <div className="mt-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl p-3 px-4 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-amber-900 m-0">Identifiant unique requis</p>
            <p className="text-amber-800 m-0 mt-1 text-xs">
              {store.isCompositeId
                ? "Sélectionnez au moins 2 colonnes pour composer l'identifiant."
                : "Choisissez la colonne qui sert d'identifiant unique des observations."}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ====================================================================
//  Carte 2 : Durée d'observation (reco SISTA v2)
// ====================================================================
function DurationConfigCard() {
  const store = useStore()
  const [computing, setComputing] = useState(false)

  // La carte n'apparait que si start/end sont définis
  const canCompute = !!(store.columnMapping.start && store.columnMapping.end)

  if (!canCompute) return null

  const handleCompute = async () => {
    setComputing(true)
    store.setApiError(null)
    try {
      const data = await api.computeDurationStats(
        store.dataFile,
        store.columnMapping.start,
        store.columnMapping.end
      )
      if (!data.ok) {
        store.setApiError(data.message || "Aucune durée calculable")
        return
      }
      store.setDurationStats(data)
      // Appliquer automatiquement le seuil suggéré
      store.setParams({ ...store.params, duree_min: data.suggested_min })
    } catch (e) {
      store.setApiError(e.message)
    } finally {
      setComputing(false)
    }
  }

  const s = store.durationStats

  return (
    <div className="card">
      <h3 className="card-title flex items-center gap-2">
        <Clock className="w-5 h-5 text-gold" />
        Seuil de durée d'observation
      </h3>
      <p className="card-desc">
        Une observation trop courte est suspecte. Définissez le seuil minimal
        (en minutes) manuellement, ou calculez-le automatiquement à partir de la
        distribution réelle de vos données.
      </p>

      <div className="flex flex-col md:flex-row items-stretch md:items-end gap-3 mb-3">
        <div className="flex-1">
          <label className="label-text">Seuil minimal (minutes)</label>
          <input
            type="number"
            min="1"
            max="240"
            className="input-field"
            value={store.params.duree_min}
            onChange={(e) =>
              store.setParams({ ...store.params, duree_min: parseInt(e.target.value) || 18 })
            }
          />
          <p className="text-xs text-gray-500 mt-1 m-0">
            Toute observation de durée inférieure sera signalée comme suspecte.
          </p>
        </div>
        <button
          onClick={handleCompute}
          disabled={computing}
          className="btn-secondary whitespace-nowrap flex items-center justify-center gap-2"
        >
          {computing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          Calculer automatiquement
        </button>
      </div>

      {s && (
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-3 mt-3 slide-up">
          <p className="text-xs font-bold text-navy uppercase tracking-wider mb-2 m-0">
            Distribution des {s.n_valid} durées observées
          </p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center">
            {[
              { label: "P10", value: s.p10, color: "text-red-700" },
              { label: "P25", value: s.p25, color: "text-orange-700" },
              { label: "Médiane", value: s.median, color: "text-navy" },
              { label: "Moyenne", value: s.mean, color: "text-navy" },
              { label: "P75", value: s.p75, color: "text-green-700" },
              { label: "P90", value: s.p90, color: "text-green-700" },
            ].map((v) => (
              <div key={v.label} className="bg-white rounded-lg p-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider m-0">{v.label}</p>
                <p className={`font-mono font-bold text-base ${v.color} m-0 mt-1`}>
                  {v.value} min
                </p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-start gap-2 bg-white rounded-lg p-2">
            <Info className="w-4 h-4 text-navy flex-shrink-0 mt-0.5" />
            <p className="text-xs text-navy m-0">
              <strong>Seuil suggéré : {s.suggested_min} min</strong> — appliqué automatiquement.
              Vous pouvez ajuster manuellement le champ ci-dessus si besoin.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ====================================================================
//  Carte 3 : Sélection des variables à inclure (reco SISTA v2)
// ====================================================================
function VariableSelectionCard() {
  const store = useStore()
  const [expanded, setExpanded] = useState(false)
  const [filterType, setFilterType] = useState("all")

  // NB : on ne fait AUCUN return conditionnel avant les hooks (useMemo).
  // Toute la logique doit être exécutée dans le même ordre à chaque render,
  // sinon React lève "Rendered more hooks than during the previous render".
  const allVars = store.previewProfile?.variables || []
  const ignored = store.variableOverrides || {}

  // Compter les variables incluses / exclues
  const nIncluded = allVars.filter((v) => !ignored[v.name]?.ignore).length
  const nExcluded = allVars.length - nIncluded

  // Filtrage pour affichage
  const filteredVars = useMemo(() => {
    if (filterType === "all") return allVars
    if (filterType === "included") return allVars.filter((v) => !ignored[v.name]?.ignore)
    if (filterType === "excluded") return allVars.filter((v) => ignored[v.name]?.ignore)
    return allVars.filter((v) => v.type === filterType)
  }, [allVars, ignored, filterType])

  const typeCounts = useMemo(() => {
    const counts = {}
    for (const v of allVars) counts[v.type] = (counts[v.type] || 0) + 1
    return counts
  }, [allVars])

  const handleToggleAll = (includeAll) => {
    const names = filteredVars.map((v) => v.name)
    store.setAllVariablesIgnored(names, !includeAll)
  }

  // Le return conditionnel doit venir APRÈS tous les hooks
  if (!store.previewProfile?.variables) return null

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left group"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <ListChecks className="w-5 h-5 text-gold" />
          <h3 className="card-title m-0 group-hover:text-gold-deep transition-colors">
            Variables à inclure dans le contrôle qualité
          </h3>
          <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-bold">
            {nIncluded} incluse(s)
          </span>
          {nExcluded > 0 && (
            <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full font-bold">
              {nExcluded} exclue(s)
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-navy" /> : <ChevronDown className="w-5 h-5 text-navy" />}
      </button>

      {!expanded && (
        <p className="card-desc m-0 mt-2">
          Toutes les variables sont incluses par défaut. Cliquez pour ajuster la sélection
          (exclure les variables inutiles ou non concernées).
        </p>
      )}

      {expanded && (
        <div className="slide-up mt-4">
          <p className="text-xs text-gray-600 mb-3 m-0">
            Décochez les variables que vous ne souhaitez pas voir apparaître dans le contrôle
            qualité (métadonnées internes, variables non pertinentes, etc.).
          </p>

          {/* Filtres */}
          <div className="flex gap-2 flex-wrap mb-3 bg-gray-50 rounded-xl p-2">
            <button
              onClick={() => setFilterType("all")}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === "all"
                  ? "bg-navy text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              Toutes ({allVars.length})
            </button>
            <button
              onClick={() => setFilterType("included")}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === "included"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              Incluses ({nIncluded})
            </button>
            <button
              onClick={() => setFilterType("excluded")}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterType === "excluded"
                  ? "bg-gray-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              Exclues ({nExcluded})
            </button>
            <div className="w-px h-6 bg-gray-300 self-center mx-1"></div>
            {Object.entries(typeCounts).map(([t, n]) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                  filterType === t
                    ? "bg-navy text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                {t} ({n})
              </button>
            ))}
          </div>

          {/* Actions groupées */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => handleToggleAll(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 font-bold"
            >
              Tout inclure ({filteredVars.length})
            </button>
            <button
              onClick={() => handleToggleAll(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-bold"
            >
              Tout exclure ({filteredVars.length})
            </button>
            <button
              onClick={() => store.resetVariableOverrides()}
              className="text-xs px-3 py-1.5 rounded-lg text-navy hover:bg-gray-100 font-bold ml-auto flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Réinitialiser
            </button>
          </div>

          {/* Liste des variables */}
          <div className="border border-gray-200 rounded-xl max-h-96 overflow-y-auto">
            {filteredVars.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6 m-0">
                Aucune variable dans cette catégorie.
              </p>
            ) : (
              filteredVars.map((v) => {
                const isIncluded = !ignored[v.name]?.ignore
                return (
                  <label
                    key={v.name}
                    className={`flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                      !isIncluded ? "opacity-50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      onChange={(e) => store.setVariableIgnored(v.name, !e.target.checked)}
                      className="w-4 h-4 cursor-pointer flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`font-mono text-sm text-navy m-0 truncate ${
                        !isIncluded ? "line-through" : ""
                      }`}>
                        {v.name}
                      </p>
                      {v.label && v.label !== v.name && (
                        <p className="text-xs text-gray-500 m-0 truncate">{v.label}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                      <span className={`px-2 py-0.5 rounded-md font-bold ${
                        v.type === "numérique"    ? "bg-blue-100 text-blue-700" :
                        v.type === "catégorielle" ? "bg-purple-100 text-purple-700" :
                        v.type === "date"         ? "bg-orange-100 text-orange-700" :
                        v.type === "identifiant"  ? "bg-gold/20 text-navy" :
                                                     "bg-gray-100 text-gray-600"
                      }`}>
                        {v.type}
                      </span>
                      <span className="text-gray-400 hidden md:inline">
                        {v.fill_rate}% rempli
                      </span>
                    </div>
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ====================================================================
//  Composant principal
// ====================================================================

export default function Step1Import() {
  const store = useStore()
  const [typeChoice, setTypeChoice] = useState(TYPES_ENQUETE[0])
  const [typeCustom, setTypeCustom] = useState(store.surveyType || "")
  const [testing, setTesting] = useState(false)
  const [showPrePost, setShowPrePost] = useState(false)

  // Au montage : verifier si un brouillon existe (recommandation SISTA v2)
  useEffect(() => {
    store.checkDraftAvailability()
    store.loadHistoryFromStorage()
  }, [])

  // Auto-save du brouillon a chaque changement significatif (2s debounce)
  useEffect(() => {
    const t = setTimeout(() => store.autoSaveDraft(), 2000)
    return () => clearTimeout(t)
  }, [
    store.columnMapping, store.isCompositeId, store.compositeIdCols,
    store.variableOverrides, store.params, store.surveyType,
    store.surveyDescription, store.surveyPopulation, store.selectedApi,
    store.validations, store.qcMetadata,
  ])

  useEffect(() => {
    if (!store.dataFile) return
    let cancelled = false
    store.setPreviewLoading(true)
    store.setPreviewError(null)
    api.previewColumns(store.dataFile, store.dictFile)
      .then((data) => { if (!cancelled) store.setPreviewData(data) })
      .catch((e) => { if (!cancelled) store.setPreviewError(e.message || "Erreur de lecture") })
      .finally(() => { if (!cancelled) store.setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [store.dataFile, store.dictFile])

  const handleTestKey = async () => {
    const apiName = store.selectedApi
    const key = apiName === "api1" ? store.apiKey1 : store.apiKey2
    setTesting(true)
    try {
      const res = await api.testKey(apiName, key)
      store.setApiStatus(apiName, { ok: res.ok, message: res.message })
    } catch (e) {
      store.setApiStatus(apiName, { ok: false, message: e.message })
    } finally {
      setTesting(false)
    }
  }

  const handleTypeChoiceChange = (v) => {
    setTypeChoice(v)
    if (v !== "(Sélectionner ou saisir)" && v !== "Autre (préciser ci-dessous)") {
      store.setSurveyType(v)
      setTypeCustom("")
    }
  }

  const handleTypeCustomChange = (v) => {
    setTypeCustom(v)
    if (v) store.setSurveyType(v)
  }

  // Validation ID simple ou composite
  const idSimpleOk = !store.isCompositeId && !!(store.columnMapping.id || "").trim()
  const idCompositeOk = store.isCompositeId &&
    store.compositeIdCols.filter((c) => c && c.trim()).length >= 2
  const idDefined = idSimpleOk || idCompositeOk
  const canAnalyze = !!store.dataFile && idDefined && !store.previewLoading

  const handleAnalyze = async () => {
    if (!store.dataFile) {
      store.setApiError("Veuillez d'abord importer une base de données.")
      return
    }
    if (!idDefined) {
      store.setApiError(
        store.isCompositeId
          ? "Veuillez sélectionner au moins 2 colonnes pour l'identifiant composé."
          : "Veuillez définir la colonne identifiant unique avant l'analyse."
      )
      return
    }
    store.setIsAnalyzing(true)
    store.setApiError(null)
    try {
      // Construire le mapping a envoyer, avec ID simple OU composite
      const mappingToSend = Object.fromEntries(
        Object.entries(store.columnMapping)
          .filter(([k, v]) => k !== "id" && v && v.trim())
      )
      if (store.isCompositeId) {
        const cols = store.compositeIdCols.filter((c) => c && c.trim())
        if (cols.length >= 2) mappingToSend.id = cols
      } else if (store.columnMapping.id) {
        mappingToSend.id = store.columnMapping.id
      }

      const data = await api.analyze(
        store.dataFile,
        store.dictFile,
        store.formFile,
        store.params,
        mappingToSend,
        store.variableOverrides,
      )
      store.setAnalysisData(data)
      // Recommandation SISTA v2 : enregistrer dans l'historique local
      setTimeout(() => store.saveToHistory(), 100)
      store.setStep(2)
    } catch (e) {
      store.setApiError(e.message)
    } finally {
      store.setIsAnalyzing(false)
    }
  }

  const currentStatus = store.selectedApi === "api1" ? store.api1Status : store.api2Status
  const currentKey = store.selectedApi === "api1" ? store.apiKey1 : store.apiKey2
  const currentConfigured = store.selectedApi === "api1" ? store.api1Configured : store.api2Configured
  const canTest = (currentKey && currentKey.length > 0) || currentConfigured

  return (
    <div className="space-y-5 slide-up">
      {/* Panel appariement pre/post (modal) */}
      {showPrePost && <PrePostPanel onClose={() => setShowPrePost(false)} />}

      {/* Persistance : bannieres brouillon */}
      <DraftBanner />
      <DraftRestoredBanner />

      {/* Outil special : appariement pre/post pour enquetes longitudinales */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-4 flex items-center gap-3 flex-wrap">
        <div className="bg-purple-600 rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0">
          <GitCompare className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-sora font-bold text-navy m-0">
            Enquête longitudinale (pré-test / post-test) ?
          </p>
          <p className="text-xs text-gray-600 m-0 mt-1">
            Vérifiez l'appariement des participants entre 2 phases de collecte
            (recommandé pour VIH/SIDA, panels, cohortes).
          </p>
        </div>
        <button
          onClick={() => setShowPrePost(true)}
          className="text-sm px-4 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 font-bold flex items-center gap-2 whitespace-nowrap"
        >
          Ouvrir l'outil
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Upload */}
      <div className="card">
        <h3 className="card-title">Importer les fichiers</h3>
        <p className="card-desc">
          La base est obligatoire. Le dictionnaire et le questionnaire améliorent
          fortement la qualité des règles générées par l'IA.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UploadZone label="Base de données" hint=".xlsx, .csv, .sav, .dta"
            required iconColor="green"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.sav,.dta,.sas7bdat"
            file={store.dataFile} onChange={(f) => store.setDataFile(f)} />
          <UploadZone label="Dictionnaire" hint=".xlsx, .csv"
            accept=".csv,.xlsx,.xls"
            file={store.dictFile} onChange={(f) => store.setDictFile(f)} />
          <UploadZone label="Questionnaire" hint="XLSForm Kobo / PDF"
            accept=".xlsx,.xls,.pdf,.txt,.docx"
            file={store.formFile} onChange={(f) => store.setFormFile(f)} />
        </div>
      </div>

      {/* Colonnes-cles */}
      <ColumnMappingCard />

      {/* Historique des analyses passees */}
      <HistoryCard />

      {/* Duree d'observation */}
      <DurationConfigCard />

      {/* Selection des variables */}
      <VariableSelectionCard />

      <div className="divider-fancy">
        <div className="text-gold-deep font-bold text-base bg-white px-3 py-1 rounded-full border-2 border-gold shadow-sm">
          ◆
        </div>
      </div>

      {/* Config IA */}
      <div className="card">
        <h3 className="card-title">Configuration de l'IA</h3>
        <p className="card-desc"></p>

        <div className="flex gap-3 mb-4">
          {["api1", "api2"].map((apiName) => {
            const configured = apiName === "api1" ? store.api1Configured : store.api2Configured
            return (
              <button
                key={apiName}
                onClick={() => store.setSelectedApi(apiName)}
                className={`flex-1 py-3 rounded-xl font-sora font-semibold transition-all relative ${
                  store.selectedApi === apiName
                    ? "bg-navy text-white shadow-md"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {apiName === "api1" ? "API 1 (Plus efficace)" : "API 2 (Plus rapide)"}
                {configured && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-400"
                    title="Clé chargée" />
                )}
              </button>
            )
          })}
        </div>

        {currentConfigured && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-800 font-medium">
              Clé {store.selectedApi === "api1" ? "API 1" : "API 2"}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-3 items-end">
          <div>
            <label className="label-text">
              Clé {store.selectedApi === "api1" ? "API 1" : "API 2"}
            </label>
            <input
              type="password"
              className="input-field"
              value={currentKey}
              onChange={(e) =>
                store.selectedApi === "api1"
                  ? store.setApiKey1(e.target.value)
                  : store.setApiKey2(e.target.value)
              }
            />
          </div>
          <button
            onClick={handleTestKey}
            disabled={testing || !canTest}
            className="btn-primary whitespace-nowrap"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Tester la connexion"}
          </button>
        </div>

        {currentStatus && (
          <div className={`mt-3 p-3 rounded-xl flex items-center gap-2 ${
            currentStatus.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}>
            {currentStatus.ok ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            <span className="text-sm font-medium">{currentStatus.message}</span>
          </div>
        )}

        <div className="mt-6 bg-gradient-to-r from-purple-50 to-blue-50 border-l-4 border-purple-500 rounded-r-xl px-4 py-3 mb-4">
          <p className="font-sora font-bold text-navy text-sm m-0 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Contexte de l'enquête
          </p>
          <p className="text-gray-600 text-xs mt-1 m-0">
            Plus les informations sont riches, meilleures sont les règles générées par l'IA.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label-text">Type d'enquête</label>
            <select className="input-field" value={typeChoice}
              onChange={(e) => handleTypeChoiceChange(e.target.value)}>
              {TYPES_ENQUETE.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div>
            <label className="label-text">Ou saisie libre</label>
            <input type="text" className="input-field" value={typeCustom}
              onChange={(e) => handleTypeCustomChange(e.target.value)} />
          </div>
        </div>

        <div className="mb-3">
          <label className="label-text">Description et objectifs</label>
          <textarea className="input-field min-h-[100px] resize-y"
            value={store.surveyDescription}
            onChange={(e) => store.setSurveyDescription(e.target.value)} />
        </div>

        <div className="mb-3">
          <label className="label-text">Population cible</label>
          <textarea className="input-field min-h-[70px] resize-y"
            value={store.surveyPopulation}
            onChange={(e) => store.setSurveyPopulation(e.target.value)} />
        </div>
      </div>

      <div className="divider-fancy">
        <div className="text-gold-deep font-bold text-base bg-white px-3 py-1 rounded-full border-2 border-gold shadow-sm">
          ▼
        </div>
      </div>

      {/* Bouton Analyser */}
      <div className="flex flex-col items-center">
        <button
          onClick={handleAnalyze}
          disabled={!canAnalyze || store.isAnalyzing}
          className="btn-primary px-12 py-4 text-base"
        >
          {store.isAnalyzing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              Analyse en cours...
            </>
          ) : (
            "Analyser le fichier"
          )}
        </button>
        {!canAnalyze && store.dataFile && !idDefined && (
          <p className="text-xs text-amber-700 mt-2 text-center">
            {store.isCompositeId
              ? "Sélectionnez au moins 2 colonnes pour l'identifiant composé."
              : "Définissez la colonne identifiant unique pour activer l'analyse."}
          </p>
        )}
      </div>
    </div>
  )
}