import { useState, useMemo, useEffect } from "react"
import { useStore } from "../../store/useStore"
import { api } from "../../api/client"
import MetricCard from "../cards/MetricCard"
import {
  Loader2,
  Download,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Power,
  PowerOff,
  AlertTriangle,
  Eye,
  EyeOff,
  Search,
  AlertCircle,
  Clock,
  Zap,
  Users,
  X,
  Info,
} from "lucide-react"

const SEV_LABEL = { high: "Gravité haute", med: "Gravité moyenne", low: "Gravité faible" }
const SEV_BORDER = {
  high: "border-l-red-500",
  med: "border-l-orange-500",
  low: "border-l-blue-500",
}
const SEV_BG = {
  high: "bg-red-50 text-red-800",
  med: "bg-orange-50 text-orange-800",
  low: "bg-blue-50 text-blue-800",
}
const SEV_ICON = {
  high: AlertCircle,
  med: AlertTriangle,
  low: Sparkles,
}

// Severite "agregee" pour une regle = max(severite des cas)
function getRuleSeverite(nCas) {
  if (nCas > 10) return "high"
  if (nCas > 3) return "med"
  if (nCas > 0) return "low"
  return null
}

// Valeur speciale "Tous les enqueteurs"
const ALL_ENQ = "__all__"

export default function QcAITab() {
  const store = useStore()
  const [expandedRules, setExpandedRules] = useState(new Set())
  const [filterText, setFilterText] = useState("")

  // Indices des règles désactivées par l'utilisateur (Set)
  const [disabledRules, setDisabledRules] = useState(() => new Set())

  // ============================================================
  //  Filtre superviseur + enqueteur (etat partage via zustand)
  //  -> cascade : superviseur choisi = enqueteurs de son equipe seulement
  // ============================================================
  const selectedSuperviseur = useStore((s) => s.qcFilterSuperviseur)
  const setSelectedSuperviseur = useStore((s) => s.setQcFilterSuperviseur)
  const selectedEnqueteur = useStore((s) => s.qcFilterEnqueteur)
  const setSelectedEnqueteur = useStore((s) => s.setQcFilterEnqueteur)

  // Table enqueteur -> superviseur (union basiques + IA)
  const enqToSup = useMemo(() => {
    const map = new Map()
    const addPair = (enq, sup) => {
      if (!enq || enq === "—" || enq === "Inconnu" || !String(enq).trim()) return
      if (!sup || sup === "—" || !String(sup).trim()) return
      if (!map.has(String(enq))) map.set(String(enq), String(sup))
    }
    for (const r of store.results || []) {
      for (const l of r.lignes || []) {
        addPair(l._enqueteur, l._superviseur)
      }
    }
    for (const l of store.aiResult?.lignes || []) {
      addPair(l.Enqueteur, l.Superviseur)
    }
    return map
  }, [store.results, store.aiResult])

  // Liste unifiee des superviseurs
  const uniqueSuperviseurs = useMemo(() => {
    const set = new Set()
    for (const sup of enqToSup.values()) set.add(sup)
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))
  }, [enqToSup])

  // Liste des enqueteurs presents dans les cas basiques + IA
  // (meme calcul que dans QcBasicTab pour une liste coherente entre onglets)
  // Cascade : si un superviseur est selectionne, on ne garde que ses enqueteurs
  const uniqueEnqueteurs = useMemo(() => {
    const set = new Set()
    for (const r of store.results || []) {
      for (const l of r.lignes || []) {
        const enq = l._enqueteur
        if (enq && enq !== "—" && String(enq).trim() !== "") {
          set.add(String(enq))
        }
      }
    }
    for (const l of store.aiResult?.lignes || []) {
      const enq = l.Enqueteur
      if (enq && enq !== "Inconnu" && String(enq).trim() !== "") {
        set.add(String(enq))
      }
    }
    let arr = Array.from(set)
    if (selectedSuperviseur !== ALL_ENQ) {
      arr = arr.filter((enq) => enqToSup.get(enq) === selectedSuperviseur)
    }
    return arr.sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))
  }, [store.results, store.aiResult, selectedSuperviseur, enqToSup])

  const isFiltered =
    selectedSuperviseur !== ALL_ENQ || selectedEnqueteur !== ALL_ENQ

  const apiLabel = store.selectedApi === "api1" ? "API 1" : "API 2"
  const currentKey =
    store.selectedApi === "api1" ? store.apiKey1 : store.apiKey2
  const currentConfigured =
    store.selectedApi === "api1" ? store.api1Configured : store.api2Configured

  const canGenerate = !!currentKey || currentConfigured

  const handleGenerate = async () => {
    if (!store.sessionId) return
    store.setIsGenerating(true)
    store.setApiError(null)
    setDisabledRules(new Set())
    setExpandedRules(new Set())
    try {
      const data = await api.generateRules({
        session_id: store.sessionId,
        api: store.selectedApi,
        api_key: currentKey,
        survey_type: store.surveyType,
        survey_description: store.surveyDescription,
        survey_population: store.surveyPopulation,
        survey_eligibility: store.surveyEligibility,
        form_content: "",
      })
      store.setAiResults(data)
    } catch (e) {
      store.setApiError(e.message)
    } finally {
      store.setIsGenerating(false)
    }
  }

  const handleExport = () => {
    window.open(api.getExportUrl(store.sessionId), "_blank")
  }

  const toggleRule = (ruleIdx) => {
    setDisabledRules((prev) => {
      const next = new Set(prev)
      if (next.has(ruleIdx)) next.delete(ruleIdx)
      else next.add(ruleIdx)
      return next
    })
  }

  const toggleExpand = (ruleIdx) => {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      if (next.has(ruleIdx)) next.delete(ruleIdx)
      else next.add(ruleIdx)
      return next
    })
  }

  const enableAllRules = () => setDisabledRules(new Set())
  const disableAllRules = () => {
    if (!store.aiRules) return
    setDisabledRules(new Set(store.aiRules.map((_, i) => i)))
  }

  // ─── Regrouper les cas par regle (indispensable pour l'agregation) ─
  //     Applique les filtres superviseur + enqueteur si actifs.
  const casesByRule = useMemo(() => {
    const map = new Map()
    if (!store.aiResult?.lignes) return map
    for (const cas of store.aiResult.lignes) {
      // Filtre superviseur
      if (selectedSuperviseur !== ALL_ENQ &&
          String(cas.Superviseur) !== selectedSuperviseur) continue
      // Filtre enqueteur
      if (selectedEnqueteur !== ALL_ENQ &&
          String(cas.Enqueteur) !== selectedEnqueteur) continue
      const ri = cas._rule_idx
      if (!map.has(ri)) map.set(ri, [])
      map.get(ri).push(cas)
    }
    return map
  }, [store.aiResult, selectedSuperviseur, selectedEnqueteur])

  // ─── Liste des regles enrichie : avec n_cas + severite + filtrage texte ─
  const enrichedRules = useMemo(() => {
    if (!store.aiRules) return []
    const filter = filterText.trim().toLowerCase()
    return store.aiRules.map((r, i) => {
      const cases = casesByRule.get(i) || []
      const nCas = cases.length
      const sev = getRuleSeverite(nCas)
      const isDisabled = disabledRules.has(i)
      const matchesFilter =
        !filter ||
        (r.description || "").toLowerCase().includes(filter)
      return { rule: r, idx: i, cases, nCas, sev, isDisabled, matchesFilter }
    })
  }, [store.aiRules, casesByRule, disabledRules, filterText])

  // Tri : actives d'abord, puis par n_cas DESC, puis par severite
  const sortedRules = useMemo(() => {
    const sevOrder = { high: 0, med: 1, low: 2, null: 3 }
    return [...enrichedRules]
      .filter((r) => r.matchesFilter)
      .sort((a, b) => {
        if (a.isDisabled !== b.isDisabled) return a.isDisabled ? 1 : -1
        if (a.nCas !== b.nCas) return b.nCas - a.nCas
        return sevOrder[a.sev || "null"] - sevOrder[b.sev || "null"]
      })
  }, [enrichedRules])

  const totalCasActifs = enrichedRules
    .filter((r) => !r.isDisabled)
    .reduce((sum, r) => sum + r.nCas, 0)
  const totalCasMasques = enrichedRules
    .filter((r) => r.isDisabled)
    .reduce((sum, r) => sum + r.nCas, 0)

  // Pour les actions "tout deplier" : on cible uniquement les regles
  // visibles ET qui ont des cas
  const expandableIdx = sortedRules
    .filter((r) => r.nCas > 0 && !r.isDisabled)
    .map((r) => r.idx)

  const expandAll = () => setExpandedRules(new Set(expandableIdx))
  const collapseAll = () => setExpandedRules(new Set())

  return (
    <div>
      <div className="bg-gray-50 rounded-xl p-3 px-4 mb-4 border border-gray-200">
        <span className="font-bold text-navy">Moteur IA actif :</span>{" "}
        <span className="text-navy">{apiLabel}</span>{" "}
        <span className="text-gray-500 text-sm">
          (vous pouvez changer ce choix à l'étape 1)
        </span>
      </div>

      <p className="text-gray-600 text-sm mb-4 leading-relaxed">
        L'IA lit les variables, leurs libellés, le dictionnaire et la description
        pour générer des règles de cohérence logique adaptées. Si le fichier est
        volumineux, l'analyse se fait en plusieurs lots. Les règles sont
        ensuite exécutées sur <strong>100% du fichier</strong>.
      </p>

      {/* Estimation de duree pour les gros fichiers */}
      {!store.aiResult && store.profile?.summary?.n_vars > 100 && (
        <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-xl p-3 px-4 mb-4 flex items-start gap-2 text-sm">
          <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-blue-900 m-0">
              Fichier volumineux détecté ({store.profile.summary.n_vars} colonnes)
            </p>
            <p className="text-blue-800 text-xs mt-1 m-0">
              L'analyse IA peut prendre quelques minutes. Pour aller plus vite,
              <strong> sélectionnez API 2 à l'étape 1</strong> (généralement plus rapide
              que API 1 sur les gros fichiers).
            </p>
          </div>
        </div>
      )}

      {!store.aiResult && (
        <div className="flex justify-center">
          <button
            onClick={handleGenerate}
            disabled={store.isGenerating || !canGenerate}
            className="btn-primary"
          >
            {store.isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Analyse intelligente en cours...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 inline mr-2" />
                Générer et exécuter les règles avec {apiLabel}
              </>
            )}
          </button>
        </div>
      )}

      {/* Chronometre + log de progression pendant l'analyse */}
      {store.isGenerating && <GenerationProgress apiLabel={apiLabel} />}

      {store.aiResult && (
        <div className="slide-up">
          {/* ============================================================
              BARRE DE FILTRE : SUPERVISEUR + ENQUETEUR
              (partagee avec l'onglet QC basique via zustand)
              ============================================================ */}
          {(uniqueSuperviseurs.length > 0 || uniqueEnqueteurs.length > 0) && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-navy">
                  <Users className="w-5 h-5 text-gold" />
                  <span className="font-sora font-bold text-sm">
                    Filtrer par :
                  </span>
                </div>

                {/* Dropdown superviseur */}
                {uniqueSuperviseurs.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="filter-superviseur-ai"
                      className="text-sm text-gray-700 font-semibold"
                    >
                      Superviseur :
                    </label>
                    <select
                      id="filter-superviseur-ai"
                      value={selectedSuperviseur}
                      onChange={(e) => {
                        setSelectedSuperviseur(e.target.value)
                        setExpandedRules(new Set())
                      }}
                      className="min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none"
                    >
                      <option value={ALL_ENQ}>
                        Tous ({uniqueSuperviseurs.length})
                      </option>
                      {uniqueSuperviseurs.map((sup) => (
                        <option key={sup} value={sup}>
                          {sup}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Dropdown enqueteur */}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="filter-enqueteur-ai"
                    className="text-sm text-gray-700 font-semibold"
                  >
                    Enquêteur :
                  </label>
                  <select
                    id="filter-enqueteur-ai"
                    value={selectedEnqueteur}
                    onChange={(e) => {
                      setSelectedEnqueteur(e.target.value)
                      setExpandedRules(new Set())
                    }}
                    className="min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-gold focus:ring-2 focus:ring-gold/20 outline-none"
                    disabled={uniqueEnqueteurs.length === 0}
                  >
                    <option value={ALL_ENQ}>
                      Tous ({uniqueEnqueteurs.length})
                    </option>
                    {uniqueEnqueteurs.map((enq) => (
                      <option key={enq} value={enq}>
                        {enq}
                      </option>
                    ))}
                  </select>
                </div>

                {isFiltered && (
                  <button
                    onClick={() => {
                      setSelectedSuperviseur(ALL_ENQ)   // reset superviseur ET enqueteur (via cascade)
                      setExpandedRules(new Set())
                    }}
                    className="text-xs px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-bold flex items-center gap-1"
                    title="Réinitialiser tous les filtres"
                  >
                    <X className="w-3.5 h-3.5" />
                    Réinitialiser
                  </button>
                )}
              </div>
              {isFiltered && (
                <p className="text-xs text-gray-500 mt-3 mb-0 italic flex items-start gap-1">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    Affichage limité{" "}
                    {selectedEnqueteur !== ALL_ENQ
                      ? <>aux cas de <strong>{selectedEnqueteur}</strong></>
                      : <>à l'équipe <strong>{selectedSuperviseur}</strong></>
                    }
                    . Ce filtre s'applique aussi à l'onglet QC basique.
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Métriques globales */}
          {store.aiMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <MetricCard
                variant="blue"
                value={`${store.aiMetrics.duration}s`}
                label="Durée totale"
              />
              <MetricCard
                variant="gold"
                value={store.aiMetrics.n_batches || 1}
                label="Lots traités"
              />
              <MetricCard
                variant="purple"
                value={store.aiMetrics.n_vars_analysed || "?"}
                label="Variables analysées"
              />
              <MetricCard
                variant="green"
                value={store.aiMetrics.n_rules}
                label="Règles générées"
              />
            </div>
          )}

          {/* Alerte sur règles filtrées automatiquement par le backend */}
          {store.aiMetrics?.n_rules_filtered > 0 && (
            <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-xl p-3 px-4 mb-4 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-900 m-0">
                    {store.aiMetrics.n_rules_filtered} règle(s) suspecte(s) écartée(s) automatiquement
                  </p>
                  <p className="text-amber-800 text-xs mt-1 m-0">
                    Le système a détecté et bloqué des règles aberrantes (ex : croisement
                    enquêteur ↔ répondant, déduction du sexe à partir du nom).
                  </p>
                  {store.aiMetrics.filtered_rules?.length > 0 && (
                    <ul className="text-amber-800 text-xs mt-2 m-0 pl-4 list-disc">
                      {store.aiMetrics.filtered_rules.slice(0, 3).map((r, i) => (
                        <li key={i}>
                          <em>{r.description}</em> — {r.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {store.aiComment && (
            <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-xl p-3 px-4 mb-4 text-sm text-navy">
              {store.aiComment}
            </div>
          )}

          {/* Synthese globale */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-sora font-bold text-navy text-lg m-0">
                {totalCasActifs} cas détectés
                {totalCasMasques > 0 && (
                  <span className="text-sm text-gray-500 font-normal ml-2">
                    ({totalCasMasques} masqué{totalCasMasques > 1 ? "s" : ""} par règles désactivées)
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-500 m-0 mt-1">
                Regroupés en {enrichedRules.filter((r) => !r.isDisabled).length} règle(s) active(s)
              </p>
            </div>
            <button
              onClick={handleExport}
              className="btn-success flex items-center gap-2"
              disabled={totalCasActifs === 0}
            >
              <Download className="w-4 h-4" />
              Exporter en Excel
            </button>
          </div>

          {/* Toolbar : filtre + actions globales */}
          <div className="flex flex-col md:flex-row gap-3 mb-4 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Rechercher une règle..."
                className="input-field pl-9 py-2 w-full"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={expandAll}
                disabled={expandableIdx.length === 0}
                className="text-xs flex items-center gap-1 px-3 py-2 rounded-lg bg-navy text-white hover:bg-navy-deep disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Tout déplier
              </button>
              <button
                onClick={collapseAll}
                disabled={expandedRules.size === 0}
                className="text-xs flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <EyeOff className="w-3.5 h-3.5" />
                Tout replier
              </button>
              <button
                onClick={enableAllRules}
                disabled={disabledRules.size === 0}
                className="text-xs flex items-center gap-1 px-3 py-2 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Power className="w-3.5 h-3.5" />
                Tout activer
              </button>
              <button
                onClick={disableAllRules}
                disabled={
                  !store.aiRules || disabledRules.size === store.aiRules.length
                }
                className="text-xs flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <PowerOff className="w-3.5 h-3.5" />
                Tout désactiver
              </button>
            </div>
          </div>

          {/* Cas particulier : selection sans aucun cas IA */}
          {isFiltered && totalCasActifs === 0 && totalCasMasques === 0 && (
            <div className="bg-green-50 border-l-4 border-green-500 rounded-r-xl p-4 mb-3 flex items-start gap-3">
              <Sparkles className="w-6 h-6 text-green-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-sora font-bold text-green-900 m-0">
                  Aucune incohérence IA détectée pour{" "}
                  {selectedEnqueteur !== ALL_ENQ
                    ? selectedEnqueteur
                    : "l'équipe " + selectedSuperviseur}
                </p>
                <p className="text-sm text-green-800 mt-1 m-0">
                  Aucun cas trouvé dans les règles générées par l'IA.
                </p>
              </div>
            </div>
          )}

          {sortedRules.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-gray-600 text-center text-sm">
              {filterText
                ? "Aucune règle ne correspond à votre recherche."
                : "Aucune règle générée."}
            </div>
          )}

          {/* Liste des regles agregees (chaque regle est un accordeon) */}
          <div className="space-y-2">
            {sortedRules.map(({ rule, idx, cases, nCas, sev, isDisabled }) => {
              const sevStyle = sev ? SEV_BG[sev] : "bg-green-50 text-green-800"
              const sevBorder = sev ? SEV_BORDER[sev] : "border-l-green-500"
              const Icon = sev ? SEV_ICON[sev] : Sparkles
              const isOpen = expandedRules.has(idx)
              const hasCases = nCas > 0

              return (
                <div
                  key={idx}
                  className={`bg-white border border-gray-200 border-l-4 ${sevBorder} rounded-r-xl overflow-hidden shadow-sm transition-all ${
                    isDisabled ? "opacity-60" : ""
                  }`}
                >
                  {/* Header de la regle */}
                  <div
                    className={`p-3 px-4 flex items-center gap-3 ${
                      hasCases && !isDisabled
                        ? "cursor-pointer hover:bg-gray-50"
                        : ""
                    } transition-colors`}
                    onClick={() =>
                      hasCases && !isDisabled && toggleExpand(idx)
                    }
                  >
                    <div
                      className={`${sevStyle} rounded-full w-9 h-9 flex items-center justify-center flex-shrink-0`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-sora font-bold text-sm text-navy m-0 ${
                          isDisabled ? "line-through text-gray-500" : ""
                        }`}
                      >
                        Règle {idx + 1} — {rule.description}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 m-0">
                        {isDisabled
                          ? `${nCas} cas masqué${nCas > 1 ? "s" : ""}`
                          : nCas === 0
                          ? "Aucun cas détecté"
                          : sev
                          ? `${SEV_LABEL[sev]} · ${nCas} cas`
                          : `${nCas} cas`}
                      </p>
                    </div>

                    {/* Badge nb cas */}
                    {hasCases && (
                      <span
                        className={`${sevStyle} px-2.5 py-1 rounded-md font-mono text-sm font-bold flex-shrink-0`}
                        title={`${nCas} cas détectés`}
                      >
                        {nCas}
                      </span>
                    )}

                    {/* Bouton voir details */}
                    {hasCases && !isDisabled && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(idx)
                        }}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg ${sevStyle} text-xs font-bold hover:shadow-sm transition-shadow whitespace-nowrap flex-shrink-0`}
                      >
                        {isOpen ? "Masquer" : "Voir détails"}
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    {/* Toggle activer/desactiver la regle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleRule(idx)
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                        isDisabled
                          ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                          : "bg-green-100 text-green-800 hover:bg-green-200"
                      }`}
                      title={
                        isDisabled
                          ? "Réactiver cette règle"
                          : "Désactiver cette règle"
                      }
                    >
                      {isDisabled ? (
                        <PowerOff className="w-3.5 h-3.5" />
                      ) : (
                        <Power className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Detail : les cas concernes */}
                  {isOpen && hasCases && !isDisabled && (
                    <div className="border-t border-gray-200 bg-gray-50 p-4 slide-up">
                      {/* Explications */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                        {rule.pourquoi && (
                          <div className="bg-purple-50 rounded-lg p-2.5">
                            <p className="text-xs text-purple-800 uppercase tracking-wider font-bold mb-1 m-0">
                              Pourquoi
                            </p>
                            <p className="text-xs text-navy m-0">
                              {rule.pourquoi}
                            </p>
                          </div>
                        )}
                        {rule.cause && (
                          <div className="bg-orange-50 rounded-lg p-2.5">
                            <p className="text-xs text-orange-800 uppercase tracking-wider font-bold mb-1 m-0">
                              Cause probable
                            </p>
                            <p className="text-xs text-navy m-0">
                              {rule.cause}
                            </p>
                          </div>
                        )}
                        {rule.action && (
                          <div className="bg-green-50 rounded-lg p-2.5">
                            <p className="text-xs text-green-800 uppercase tracking-wider font-bold mb-1 m-0">
                              Action
                            </p>
                            <p className="text-xs text-navy m-0">
                              {rule.action}
                            </p>
                          </div>
                        )}
                      </div>

                      <p className="font-bold text-navy text-xs mb-2 mt-2">
                        Lignes concernées ({cases.length}) :
                      </p>

                      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto max-h-96">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-bold text-navy whitespace-nowrap">
                                Ligne
                              </th>
                              <th className="px-3 py-2 text-left font-bold text-navy whitespace-nowrap">
                                Enquêteur
                              </th>
                              <th className="px-3 py-2 text-left font-bold text-navy">
                                Valeurs en cause
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {cases.slice(0, 200).map((c, i) => (
                              <tr key={i} className="border-b border-gray-100">
                                <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-600">
                                  {c._index}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {c.Enqueteur}
                                </td>
                                <td className="px-3 py-2">
                                  {c._valeurs_dict &&
                                  Object.keys(c._valeurs_dict).length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      {Object.entries(c._valeurs_dict).map(
                                        ([k, v]) => (
                                          <span
                                            key={k}
                                            className="bg-gray-100 rounded px-2 py-0.5 text-xs"
                                          >
                                            <span className="text-gray-500 font-mono">
                                              {k}=
                                            </span>
                                            <span className="text-navy font-semibold ml-0.5">
                                              {String(v).slice(0, 40)}
                                            </span>
                                          </span>
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 italic">
                                      {c.Valeurs || "—"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {cases.length > 200 && (
                        <p className="text-xs text-gray-500 mt-2 italic">
                          Affichage limité aux 200 premiers cas. Exportez en Excel pour la liste complète.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ====================================================================
//  Composant : chronometre + etapes pendant la generation IA
// ====================================================================

function GenerationProgress({ apiLabel }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const display = mins > 0
    ? `${mins} min ${secs.toString().padStart(2, "0")}s`
    : `${secs}s`

  // Etape pseudo-dynamique selon le temps ecoule
  // (le backend ne stream pas en temps reel, on simule visuellement)
  let stage, stageMsg
  if (elapsed < 5) {
    stage = "init"
    stageMsg = "Préparation des variables..."
  } else if (elapsed < 30) {
    stage = "plan"
    stageMsg = "L'IA analyse le contexte et planifie les règles..."
  } else if (elapsed < 120) {
    stage = "generation"
    stageMsg = "Génération des règles QC en cours (peut prendre 1-3 lots)..."
  } else if (elapsed < 240) {
    stage = "long"
    stageMsg = "Analyse plus longue que prévu - fichier volumineux. Patience..."
  } else {
    stage = "very_long"
    stageMsg = "Analyse très longue. Si > 8 min, essayez de relancer avec API 2 (plus rapide)."
  }

  return (
    <div className="mt-4 bg-gradient-to-br from-navy to-navy-deep text-white rounded-2xl p-5 shadow-lg">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-gold" />
          <div>
            <p className="font-sora font-bold m-0">Moteur IA actif : {apiLabel}</p>
            <p className="text-xs text-gold m-0 mt-1">{stageMsg}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-gold m-0">{display}</p>
          <p className="text-xs text-white/60 m-0">Temps écoulé</p>
        </div>
      </div>

      {/* Etapes visuelles */}
      <div className="flex gap-1.5 mt-3">
        {["init", "plan", "generation", "long"].map((s) => {
          const stagesOrder = ["init", "plan", "generation", "long", "very_long"]
          const currIdx = stagesOrder.indexOf(stage)
          const sIdx = stagesOrder.indexOf(s)
          const active = sIdx <= currIdx
          return (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                active ? "bg-gold" : "bg-white/20"
              }`}
            />
          )
        })}
      </div>

      {elapsed > 180 && (
        <div className="mt-3 bg-white/10 rounded-lg p-3 flex items-start gap-2">
          <Zap className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/90 m-0">
            <strong>Astuce :</strong> Pour les très gros fichiers (300+ colonnes),
            l'API 2 est souvent 2x à 3x plus rapide. Si vous relancez,
            changez le moteur à l'étape 1.
          </p>
        </div>
      )}
    </div>
  )
}