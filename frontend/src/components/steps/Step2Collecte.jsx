import { useState } from "react"
import { useStore } from "../../store/useStore"
import Step1Import from "./Step1Import"
import Step2Detect from "./Step2Detect"
import { Database, ShieldCheck } from "lucide-react"

export default function Step2Collecte() {
  const [activeTab, setActiveTab] = useState("import")
  const profile = useStore((s) => s.profile)

  const TABS = [
    { id: "import", label: "Charger la BD", icon: Database },
    { id: "qc", label: "Contrôle Qualité", icon: ShieldCheck, disabled: !profile },
  ]

  return (
    <div className="slide-up">
      {/* Onglets */}
      <div className="flex gap-1.5 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
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
        ))}
      </div>

      {activeTab === "import" && <Step1Import />}
      {activeTab === "qc" && <Step2Detect />}
    </div>
  )
}
