import { useState } from "react"
import { useStore } from "../../store/useStore"
import MetricCard from "../cards/MetricCard"
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

const SEV_STYLES = {
  high: {
    bg: "bg-red-50",
    border: "border-red-500",
    text: "text-red-800",
    icon: AlertCircle,
    label: "CRITIQUE",
  },
  med: {
    bg: "bg-orange-50",
    border: "border-orange-500",
    text: "text-orange-800",
    icon: AlertTriangle,
    label: "ATTENTION",
  },
  low: {
    bg: "bg-blue-50",
    border: "border-blue-500",
    text: "text-blue-800",
    icon: Info,
    label: "INFO",
  },
  ok: {
    bg: "bg-green-50",
    border: "border-green-500",
    text: "text-green-800",
    icon: CheckCircle2,
    label: "OK",
  },
}

export default function QcBasicTab() {
  const results = useStore((s) => s.results)
  const stats = useStore((s) => s.stats)
  const [expanded, setExpanded] = useState(new Set())

  const toggle = (idx) => {
    const next = new Set(expanded)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setExpanded(next)
  }

  const order = { high: 0, med: 1, low: 2, ok: 3 }
  const sortedResults = [...results].sort(
    (a, b) => order[a.severite] - order[b.severite] || b.n_cas - a.n_cas
  )

  const n_high = results.filter((r) => r.severite === "high").length
  const n_med = results.filter((r) => r.severite === "med").length
  const n_low = results.filter((r) => r.severite === "low").length
  const n_ok = results.filter((r) => r.severite === "ok").length

  return (
    <div>
      {/* Metriques globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MetricCard
          variant="navy"
          value={stats?.questionnaires || 0}
          label="Questionnaires"
        />
        <MetricCard variant="red" value={stats?.incoherences || 0} label="Incohérences" />
        <MetricCard variant="blue" value={stats?.tests || 0} label="Tests" />
        <MetricCard
          variant="gold"
          value={stats?.tests_alertes || 0}
          label="Tests avec alertes"
        />
      </div>

      {/* Repartition severite */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gradient-to-br from-red-100 to-red-300 rounded-2xl p-4 text-center border-l-4 border-red-500">
          <p className="font-sora text-3xl font-extrabold text-red-900 leading-none m-0">
            {n_high}
          </p>
          <p className="text-xs text-red-900 font-semibold uppercase tracking-wider mt-2 m-0">
            Tests critiques
          </p>
        </div>
        <div className="bg-gradient-to-br from-orange-100 to-orange-300 rounded-2xl p-4 text-center border-l-4 border-orange-500">
          <p className="font-sora text-3xl font-extrabold text-orange-900 leading-none m-0">
            {n_med}
          </p>
          <p className="text-xs text-orange-900 font-semibold uppercase tracking-wider mt-2 m-0">
            À surveiller
          </p>
        </div>
        <div className="bg-gradient-to-br from-blue-100 to-blue-300 rounded-2xl p-4 text-center border-l-4 border-blue-500">
          <p className="font-sora text-3xl font-extrabold text-blue-900 leading-none m-0">
            {n_low}
          </p>
          <p className="text-xs text-blue-900 font-semibold uppercase tracking-wider mt-2 m-0">
            Faible risque
          </p>
        </div>
        <div className="bg-gradient-to-br from-green-100 to-green-300 rounded-2xl p-4 text-center border-l-4 border-green-500">
          <p className="font-sora text-3xl font-extrabold text-green-900 leading-none m-0">
            {n_ok}
          </p>
          <p className="text-xs text-green-900 font-semibold uppercase tracking-wider mt-2 m-0">
            Tests OK
          </p>
        </div>
      </div>

      <h5 className="font-sora font-bold text-navy mb-3">
        Détail des tests exécutés
      </h5>

      <div className="space-y-2">
        {sortedResults.map((r, idx) => {
          const style = SEV_STYLES[r.severite] || SEV_STYLES.ok
          const Icon = style.icon
          const isOpen = expanded.has(idx)

          return (
            <div key={idx}>
              <div
                className={`${style.bg} border-l-4 ${style.border} rounded-r-xl p-3 px-4 flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow`}
                onClick={() => toggle(idx)}
              >
                <div
                  className={`bg-white rounded-full w-9 h-9 flex items-center justify-center ${style.text} flex-shrink-0 shadow-sm`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p
                    className={`font-sora font-bold text-sm ${style.text} m-0`}
                  >
                    {r.titre}
                  </p>
                  <p className={`text-xs ${style.text} opacity-80 mt-0.5 m-0`}>
                    {r.n_cas} cas détectés · Cliquez pour voir les détails
                  </p>
                </div>
                <span
                  className={`bg-white ${style.text} px-3 py-1 rounded-md font-sora text-xs font-bold tracking-wider shadow-sm`}
                >
                  {style.label}
                </span>
                {isOpen ? (
                  <ChevronUp className={`w-5 h-5 ${style.text}`} />
                ) : (
                  <ChevronDown className={`w-5 h-5 ${style.text}`} />
                )}
              </div>

              {isOpen && (
                <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-4 -mt-px slide-up">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <div className="bg-purple-50 rounded-lg p-3">
                      <p className="text-xs text-purple-800 uppercase tracking-wider font-bold mb-1 m-0">
                        Pourquoi
                      </p>
                      <p className="text-sm text-navy m-0">{r.explication?.pourquoi}</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-3">
                      <p className="text-xs text-orange-800 uppercase tracking-wider font-bold mb-1 m-0">
                        Cause
                      </p>
                      <p className="text-sm text-navy m-0">{r.explication?.cause}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-green-800 uppercase tracking-wider font-bold mb-1 m-0">
                        Action
                      </p>
                      <p className="text-sm text-navy m-0">{r.explication?.action}</p>
                    </div>
                  </div>

                  {r.lignes && r.lignes.length > 0 && (
                    <div className="mt-3">
                      <p className="font-bold text-navy text-sm mb-2">
                        Cas détectés :
                      </p>
                      <div className="overflow-x-auto bg-gray-50 rounded-lg max-h-72">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-200 sticky top-0">
                            <tr>
                              {Object.keys(r.lignes[0])
                                .filter(
                                  (k) => !k.startsWith("_") || k === "_index"
                                )
                                .map((k) => (
                                  <th
                                    key={k}
                                    className="px-3 py-2 text-left font-bold text-navy whitespace-nowrap"
                                  >
                                    {k === "_index" ? "Ligne" : k}
                                  </th>
                                ))}
                            </tr>
                          </thead>
                          <tbody>
                            {r.lignes.slice(0, 100).map((row, i) => (
                              <tr
                                key={i}
                                className="border-b border-gray-100"
                              >
                                {Object.entries(row)
                                  .filter(
                                    ([k]) =>
                                      !k.startsWith("_") || k === "_index"
                                  )
                                  .map(([k, v], j) => (
                                    <td
                                      key={j}
                                      className="px-3 py-1.5 whitespace-nowrap"
                                    >
                                      {String(v).slice(0, 60)}
                                    </td>
                                  ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
