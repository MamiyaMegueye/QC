import { useState, useMemo } from "react"
import { useStore } from "../../store/useStore"
import { api } from "../../api/client"
import MetricCard from "../cards/MetricCard"
import {
  Loader2,
  Download,
  ChevronDown,
  ChevronUp,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  Power,
  PowerOff,
  AlertTriangle,
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

export default function QcAITab() {
  const store = useStore()
  const [viewMode, setViewMode] = useState("cards")
  const [rulesExpanded, setRulesExpanded] = useState(false)

  // Indices des règles désactivées par l'utilisateur (Set)
  const [disabledRules, setDisabledRules] = useState(() => new Set())

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
    setDisabledRules(new Set()) // reset les règles désactivées
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

  const enableAllRules = () => setDisabledRules(new Set())
  const disableAllRules = () => {
    if (!store.aiRules) return
    setDisabledRules(new Set(store.aiRules.map((_, i) => i)))
  }

  // ─── Cas filtrés (excluant les règles désactivées) ─────────────────────
  const filteredCases = useMemo(() => {
    if (!store.aiResult?.lignes) return []
    if (disabledRules.size === 0) return store.aiResult.lignes
    return store.aiResult.lignes.filter(
      (cas) => !disabledRules.has(cas._rule_idx)
    )
  }, [store.aiResult, disabledRules])

  const nbCasActifs = filteredCases.length
  const nbCasTotal = store.aiResult?.lignes?.length || 0
  const nbCasHidden = nbCasTotal - nbCasActifs

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

      {store.aiResult && (
        <div className="slide-up">
          {/* Métriques de l'appel */}
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

          {/* Liste des règles (avec toggle activer/désactiver) */}
          <div className="mb-4">
            <button
              onClick={() => setRulesExpanded(!rulesExpanded)}
              className="btn-secondary w-full justify-between flex items-center"
            >
              <span>
                Voir les {store.aiRules.length} règles générées par l'IA
                {disabledRules.size > 0 && (
                  <span className="ml-2 text-amber-700 font-semibold">
                    ({disabledRules.size} désactivée{disabledRules.size > 1 ? "s" : ""})
                  </span>
                )}
              </span>
              {rulesExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {rulesExpanded && (
              <div className="mt-2 space-y-2">
                {/* Actions globales */}
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={enableAllRules}
                    className="text-blue-700 hover:underline"
                    disabled={disabledRules.size === 0}
                  >
                    Tout activer
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    onClick={disableAllRules}
                    className="text-red-700 hover:underline"
                    disabled={disabledRules.size === store.aiRules.length}
                  >
                    Tout désactiver
                  </button>
                </div>

                {store.aiRules.map((r, i) => {
                  const nCas = store.aiResult.cas_par_regle?.[i] || 0
                  const isDisabled = disabledRules.has(i)
                  return (
                    <div
                      key={i}
                      className={`bg-white border-l-4 rounded-r-xl p-3 px-4 shadow-sm transition-all ${
                        isDisabled
                          ? "border-gray-300 opacity-50"
                          : "border-yellow-500"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className={`m-0 text-sm ${isDisabled ? "line-through text-gray-500" : ""}`}>
                            <span className="font-bold text-navy">
                              Règle {i + 1}
                            </span>{" "}
                            — {r.description}
                          </p>
                          <p className="text-gray-500 text-xs mt-1 m-0">
                            {nCas} cas détecté{nCas > 1 ? "s" : ""}
                            {isDisabled && " — masqués"}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleRule(i)}
                          className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            isDisabled
                              ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                              : "bg-green-100 text-green-800 hover:bg-green-200"
                          }`}
                          title={isDisabled ? "Réactiver cette règle" : "Désactiver cette règle"}
                        >
                          {isDisabled ? (
                            <>
                              <PowerOff className="w-3.5 h-3.5" />
                              Désactivée
                            </>
                          ) : (
                            <>
                              <Power className="w-3.5 h-3.5" />
                              Activée
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <h3 className="font-sora font-bold text-navy text-xl mb-3">
            {nbCasActifs} cas détectés
            {nbCasHidden > 0 && (
              <span className="text-sm text-gray-500 font-normal ml-2">
                ({nbCasHidden} masqué{nbCasHidden > 1 ? "s" : ""} par règles désactivées)
              </span>
            )}
          </h3>

          {filteredCases.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 text-center">
              {nbCasTotal === 0
                ? "Aucune incohérence détectée. Bravo !"
                : "Tous les cas ont été masqués par les règles désactivées."}
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex flex-col md:flex-row gap-3 mb-4 items-center">
                <button
                  onClick={handleExport}
                  className="btn-success flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Exporter en Excel
                </button>
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setViewMode("cards")}
                    className={`px-4 py-2 rounded-lg font-sora font-semibold text-sm flex items-center gap-2 transition-all ${
                      viewMode === "cards"
                        ? "bg-white text-navy shadow-sm"
                        : "text-gray-500"
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" /> Cartes
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`px-4 py-2 rounded-lg font-sora font-semibold text-sm flex items-center gap-2 transition-all ${
                      viewMode === "table"
                        ? "bg-white text-navy shadow-sm"
                        : "text-gray-500"
                    }`}
                  >
                    <TableIcon className="w-4 h-4" /> Tableau
                  </button>
                </div>
              </div>

              {/* Vue Cartes */}
              {viewMode === "cards" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredCases.map((cas, i) => (
                    <div
                      key={i}
                      className={`bg-white border border-gray-200 border-l-4 ${
                        SEV_BORDER[cas._severite]
                      } rounded-xl p-3 px-4 shadow-sm hover:shadow-md transition-all`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span
                          className={`${
                            SEV_BG[cas._severite]
                          } px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider`}
                        >
                          {SEV_LABEL[cas._severite]}
                        </span>
                        <span className="font-mono text-xs text-gray-500">
                          Cas #{i + 1} | Ligne {cas._index}
                        </span>
                      </div>
                      <p className="font-sora font-bold text-navy text-sm mb-2 m-0">
                        {cas.Regle}
                      </p>
                      {cas._valeurs_dict &&
                        Object.keys(cas._valeurs_dict).length > 0 && (
                          <div className="bg-gray-50 rounded-lg p-2 mb-2 text-xs">
                            {Object.entries(cas._valeurs_dict).map(
                              ([k, v]) => (
                                <div
                                  key={k}
                                  className="flex justify-between py-0.5"
                                >
                                  <span className="text-gray-500 font-mono">
                                    {k}
                                  </span>
                                  <span className="text-navy font-bold">
                                    {String(v).slice(0, 30)}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        )}
                      {cas._pourquoi && (
                        <p className="text-xs text-gray-500 m-0 mb-1">
                          <strong className="text-navy">Pourquoi :</strong>{" "}
                          {cas._pourquoi}
                        </p>
                      )}
                      {cas._action && (
                        <p className="text-xs text-gray-500 m-0 mb-2">
                          <strong className="text-navy">Action :</strong>{" "}
                          {cas._action}
                        </p>
                      )}
                      <div className="border-t border-gray-200 pt-2 text-xs text-navy font-semibold">
                        <span className="text-gray-500 text-xs font-normal">
                          Enquêteur :
                        </span>{" "}
                        {cas.Enqueteur}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Vue Tableau */}
              {viewMode === "table" && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto max-h-[600px]">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        {[
                          "Cas N°",
                          "Ligne",
                          "Gravité",
                          "Enquêteur",
                          "Règle",
                          "Colonnes",
                          "Valeurs en cause",
                          "Action",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2.5 text-left font-bold text-navy whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((cas, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {i + 1}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {cas._index}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={`badge ${SEV_BG[cas._severite]}`}
                            >
                              {{ high: "Haute", med: "Moy.", low: "Faible" }[
                                cas._severite
                              ]}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {cas.Enqueteur}
                          </td>
                          <td className="px-3 py-2 max-w-xs">{cas.Regle}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {cas.Colonnes_concernees}
                          </td>
                          <td className="px-3 py-2 max-w-xs">
                            {cas.Valeurs}
                          </td>
                          <td className="px-3 py-2 max-w-xs">
                            {cas._action}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}