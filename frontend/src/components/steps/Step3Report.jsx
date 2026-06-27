import { useState } from "react"
import { useStore } from "../../store/useStore"
import { ArrowLeft, Users, ClipboardCheck, FileText } from "lucide-react"
import Step3BilanTab from "./step3/Step3BilanTab"
import Step3ValidationTab from "./step3/Step3ValidationTab"
import Step3GenerationTab from "./step3/Step3GenerationTab"

const TABS = [
  {
    key: "bilan",
    label: "Bilan par enquêteur",
    icon: Users,
    desc: "Classement des enquêteurs selon leurs anomalies",
  },
  {
    key: "validation",
    label: "Validation des anomalies",
    icon: ClipboardCheck,
    desc: "Confirmer, rejeter ou marquer comme corrigées",
  },
  {
    key: "generation",
    label: "Rapport de synthèse",
    icon: FileText,
    desc: "Générer le rapport formel pour audit",
  },
]

export default function Step3Report() {
  const store = useStore()
  const [activeTab, setActiveTab] = useState("bilan")

  if (!store.sessionId) {
    return (
      <div className="card text-center">
        <p className="text-gray-600 mb-4">
          Veuillez d'abord importer et analyser un fichier.
        </p>
        <button onClick={() => store.setStep(1)} className="btn-secondary">
          <ArrowLeft className="w-4 h-4 inline mr-1" /> Retour
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 slide-up">
      {/* Onglets */}
      <div className="card p-2">
        <div className="flex gap-1 flex-wrap">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 min-w-[180px] flex items-center gap-2 px-4 py-3 rounded-xl font-sora font-semibold text-sm transition-all ${
                  isActive
                    ? "bg-navy text-white shadow-md"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <div>{tab.label}</div>
                  {!isActive && (
                    <div className="text-xs font-normal text-gray-500 mt-0.5">
                      {tab.desc}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Contenu de l'onglet actif */}
      {activeTab === "bilan" && <Step3BilanTab />}
      {activeTab === "validation" && (
        <Step3ValidationTab onGoToGeneration={() => setActiveTab("generation")} />
      )}
      {activeTab === "generation" && (
        <Step3GenerationTab onGoToValidation={() => setActiveTab("validation")} />
      )}
    </div>
  )
}