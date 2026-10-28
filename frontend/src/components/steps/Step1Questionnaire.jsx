import { useState } from "react"
import { FileText, Search, Table2, AlertTriangle } from "lucide-react"
import Step5XlsForm from "./Step5XlsForm"
import DiagnosticAudit from "./DiagnosticAudit"
import MasqueSaisie from "./MasqueSaisie"
import DiagnosticProgramme from "./DiagnosticProgramme"

const TABS = [
  { id: "generateur", label: "Générateur", shortLabel: "Génér.", icon: FileText, description: "Élaborer un questionnaire structuré" },
  { id: "diagnostic", label: "Diagnostic Audit", shortLabel: "Audit", icon: Search, description: "Charger un questionnaire → Audit IA" },
  { id: "masque", label: "Masque de saisie", shortLabel: "Masque", icon: Table2, description: "Questionnaire → XLSForm" },
  { id: "programme", label: "Diag. Programme", shortLabel: "Prog.", icon: AlertTriangle, description: "XLSForm → Diagnostic" },
]

export default function Step1Questionnaire() {
  const [activeTab, setActiveTab] = useState("generateur")

  return (
    <div className="slide-up space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                active
                  ? "bg-gradient-to-r from-accent-violet to-purple-600 text-white shadow-md"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-accent-violet/40 hover:text-accent-violet"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeTab === "generateur" && <Step5XlsForm />}
      {activeTab === "diagnostic" && <DiagnosticAudit />}
      {activeTab === "masque" && <MasqueSaisie />}
      {activeTab === "programme" && <DiagnosticProgramme />}
    </div>
  )
}
