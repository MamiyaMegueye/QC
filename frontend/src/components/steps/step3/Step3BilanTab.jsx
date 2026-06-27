import { useEffect } from "react"
import { useStore } from "../../../store/useStore"
import { api } from "../../../api/client"
import MetricCard from "../../cards/MetricCard"

const SEV_LABEL = {
  high: "RISQUE ÉLEVÉ",
  med: "RISQUE MODÉRÉ",
  low: "RISQUE FAIBLE",
}
const SEV_BORDER = {
  high: "border-l-red-500",
  med: "border-l-orange-500",
  low: "border-l-green-500",
}
const SEV_LABEL_COLOR = {
  high: "text-red-700",
  med: "text-orange-700",
  low: "text-green-700",
}

export default function Step3BilanTab() {
  const store = useStore()

  useEffect(() => {
    if (store.sessionId) {
      api
        .getEnqueteurSummary(store.sessionId)
        .then((data) => store.setEnqueteurSummary(data))
        .catch((e) => store.setApiError(e.message))
    }
  }, [store.sessionId])

  const counts = store.enqueteurCounts || { total: 0, high: 0, med: 0, low: 0 }

  return (
    <div className="card slide-up">
      <h3 className="card-title">Bilan par enquêteur</h3>
      <p className="card-desc">
        Classement selon le nombre et la gravité des anomalies (toutes les
        anomalies détectées, avant validation par le responsable QC).
      </p>

      {store.enqueteurSummary.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-800 text-center">
          Aucune colonne enquêteur détectée dans le fichier.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <MetricCard variant="navy" value={counts.total} label="Enquêteurs" />
            <MetricCard variant="red" value={counts.high} label="Risque élevé" />
            <MetricCard variant="gold" value={counts.med} label="Risque modéré" />
            <MetricCard variant="green" value={counts.low} label="Risque faible" />
          </div>

          <div className="space-y-2">
            {store.enqueteurSummary.map((e, i) => {
              const sev = e.niveau
              const details = Object.entries(e.par_test || {})
                .map(([t, n]) => `${t} (${n})`)
                .join(" | ")
              return (
                <div
                  key={i}
                  className={`bg-white rounded-xl p-3 px-4 border-l-4 ${SEV_BORDER[sev]} shadow-sm`}
                >
                  <p className="m-0">
                    <span className="font-bold text-navy">{e.nom}</span>{" "}
                    <span className={`font-bold ${SEV_LABEL_COLOR[sev]}`}>
                      — {SEV_LABEL[sev]}
                    </span>{" "}
                    <span className="font-bold text-navy">
                      ({e.total} anomalies)
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1 m-0">{details}</p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}