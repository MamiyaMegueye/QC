import { useState } from "react"
import { useStore } from "../../store/useStore"
import Step1Import from "./Step1Import"
import Step2Detect from "./Step2Detect"
import { Database, ShieldCheck, Info } from "lucide-react"

export default function Step2Collecte() {
  const [activeTab, setActiveTab] = useState("import")
  const [showTooltip, setShowTooltip] = useState(false)
  const profile = useStore((s) => s.profile)

  const TABS = [
    { id: "import", label: "Charger la BD", icon: Database },
    { id: "qc", label: "Contrôle Qualité", icon: ShieldCheck, disabled: !profile },
  ]

  const handleTabClick = (tab) => {
    if (tab.disabled) {
      setShowTooltip(true)
      setTimeout(() => setShowTooltip(false), 3000)
      return
    }
    setActiveTab(tab.id)
  }

  return (
    <div className="slide-up">
      {/* Onglets */}
      <div className="flex gap-1.5 mb-4">
        {TABS.map((tab) => (
          <div key={tab.id} className="relative">
            <button
              onClick={() => handleTabClick(tab)}
              className={`px-5 py-2.5 rounded-xl font-sora font-semibold text-sm border transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? "bg-navy text-white border-navy"
                  : tab.disabled
                  ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                  : "bg-white text-navy border-gray-200 hover:bg-gray-50 cursor-pointer"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
            {tab.disabled && showTooltip && tab.id === "qc" && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-navy text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap animate-fade-in">
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-navy rotate-45" />
                Chargez d'abord une base de données
              </div>
            )}
          </div>
        ))}
      </div>

      {activeTab === "import" && <Step1Import />}
      {activeTab === "qc" && <Step2Detect />}
    </div>
  )
}
