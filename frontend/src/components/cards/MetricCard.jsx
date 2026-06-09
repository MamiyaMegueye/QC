// Carte de metrique colorée (gradient).

const VARIANTS = {
  navy: "from-navy-light to-navy text-white",
  blue: "from-blue-500 to-blue-700 text-white",
  gold: "from-yellow-300 to-yellow-600 text-navy",
  red: "from-red-400 to-red-600 text-white",
  green: "from-emerald-400 to-emerald-600 text-white",
  purple: "from-purple-400 to-purple-600 text-white",
  orange: "from-orange-400 to-orange-600 text-white",
}

export default function MetricCard({ variant = "navy", value, label }) {
  const variantClass = VARIANTS[variant] || VARIANTS.navy

  return (
    <div
      className={`metric-card bg-gradient-to-br ${variantClass}`}
    >
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  )
}
