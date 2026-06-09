import { useState } from "react"
import { useStore } from "../../store/useStore"
import ApercuTab from "../tabs/ApercuTab"
import QcBasicTab from "../tabs/QcBasicTab"
import QcAITab from "../tabs/QcAITab"
import { ArrowLeft } from "lucide-react"

export default function Step2Detect() {
  const [activeTab, setActiveTab] = useState("apercu")
  const profile = useStore((s) => s.profile)
  const setStep = useStore((s) => s.setStep)

  if (!profile) {
    return (
      <div className="card text-center">
        <p className="text-gray-600 mb-4">
          Veuillez d'abord importer un fichier.
        </p>
        <button onClick={() => setStep(1)} className="btn-secondary">
          <ArrowLeft className="w-4 h-4 inline mr-1" /> Retour
        </button>
      </div>
    )
  }

  const TABS = [
    { id: "apercu", label: "Aperçu & profilage" },
    { id: "basic", label: "QC basique" },
    { id: "ai", label: "QC intelligent" },
  ]

  return (
    <div className="slide-up">
      {/* Tabs */}
      <div className="flex gap-1.5 mb-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 rounded-t-xl font-sora font-semibold text-sm border border-gray-200 border-b-0 transition-all ${
              activeTab === tab.id
                ? "bg-navy text-white"
                : "bg-white text-navy hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl rounded-tl-none p-6 shadow-soft border border-gray-200">
        {activeTab === "apercu" && <ApercuTab />}
        {activeTab === "basic" && <QcBasicTab />}
        {activeTab === "ai" && <QcAITab />}
      </div>
    </div>
  )
}
