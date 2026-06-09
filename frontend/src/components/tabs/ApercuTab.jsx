import { useState } from "react"
import { useStore } from "../../store/useStore"
import MetricCard from "../cards/MetricCard"
import { ChevronDown, ChevronUp } from "lucide-react"

const typeClass = (t) => {
  const tl = (t || "").toLowerCase()
  if (/num|int|float|decimal/.test(tl)) return "bg-orange-100 text-orange-800"
  if (/date|time|datetime/.test(tl)) return "bg-teal-100 text-teal-800"
  if (/cat|factor|enum/.test(tl)) return "bg-pink-100 text-pink-800"
  if (/bool|logical/.test(tl)) return "bg-amber-100 text-amber-800"
  if (/str|text|object|char/.test(tl)) return "bg-purple-100 text-purple-800"
  return "bg-gray-100 text-gray-600"
}

const fillClass = (r) => {
  if (r >= 80) return "bg-green-100 text-green-800"
  if (r >= 40) return "bg-orange-100 text-orange-800"
  return "bg-red-100 text-red-800"
}

export default function ApercuTab() {
  const profile = useStore((s) => s.profile)
  const filename = useStore((s) => s.filename)
  const preview = useStore((s) => s.preview)
  const [showPreview, setShowPreview] = useState(false)

  const summary = profile.summary

  return (
    <div>
      <h4 className="font-sora font-bold text-navy text-lg mb-4">{filename}</h4>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <MetricCard variant="navy" value={summary.n_rows} label="Lignes" />
        <MetricCard variant="blue" value={summary.n_vars} label="Variables" />
        <MetricCard variant="gold" value={summary.n_numeric} label="Numériques" />
        <MetricCard
          variant="purple"
          value={summary.n_categorical}
          label="Catégorielles"
        />
        <MetricCard
          variant="green"
          value={`${summary.global_fill_rate}%`}
          label="Remplissage"
        />
      </div>

      <h5 className="font-sora font-bold text-navy mb-3">Détail des variables</h5>

      {/* Légende */}
      <div className="flex gap-3 flex-wrap mb-3 p-3 bg-gray-50 rounded-xl text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-orange-100" /> Numérique
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-purple-100" /> Texte
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-teal-100" /> Date
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-pink-100" /> Catégoriel
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-100" /> Rempli &gt;=80%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-orange-100" /> 40-80%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-100" /> &lt;40%
        </span>
      </div>

      {/* Tableau variables */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-br from-slate-100 to-slate-200">
              <tr>
                {["Variable", "Libellé", "Type", "Remplissage", "Uniques", "Exemples"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-sora font-bold text-xs text-navy uppercase tracking-wider border-b-2 border-gray-200"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {profile.variables.map((v, i) => (
                <tr
                  key={i}
                  className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
                  <td className="px-4 py-2.5">
                    <span className="inline-block bg-blue-100 text-blue-800 px-2.5 py-1 rounded-md font-mono text-xs">
                      {v.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-navy text-xs">
                    {(v.label || "").slice(0, 60)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`badge ${typeClass(v.type)}`}>
                      {v.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold min-w-[50px] text-center ${fillClass(
                        v.fill_rate
                      )}`}
                    >
                      {v.fill_rate}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">
                    {v.uniques}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {(v.examples || [])
                      .slice(0, 2)
                      .map(String)
                      .join(", ")
                      .slice(0, 50)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apercu donnees */}
      <div className="mt-5">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="btn-secondary w-full justify-center flex items-center gap-2"
        >
          Aperçu des données (20 lignes)
          {showPreview ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
        {showPreview && preview.length > 0 && (
          <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  {Object.keys(preview[0]).map((k) => (
                    <th
                      key={k}
                      className="px-3 py-2 text-left font-bold text-navy whitespace-nowrap"
                    >
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-2 whitespace-nowrap">
                        {String(v).slice(0, 50)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
