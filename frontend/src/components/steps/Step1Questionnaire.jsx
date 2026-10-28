import { useState } from "react"
import Step5XlsForm from "./Step5XlsForm"
import {
  ClipboardList, Stethoscope, Layers, Bug,
} from "lucide-react"

const SUB_TABS = [
  { id: "elaborer", label: "Élaborer", icon: ClipboardList },
  { id: "audit", label: "Diagnostic Audit", icon: Stethoscope },
  { id: "masque", label: "Masque de saisie", icon: Layers },
  { id: "programme", label: "Diagnostic programme", icon: Bug },
]

export default function Step1Questionnaire() {
  const [activeTab, setActiveTab] = useState("elaborer")

  return (
    <div className="slide-up">
      {/* Sous-onglets */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl font-sora font-semibold text-sm border transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? "bg-navy text-white border-navy"
                : "bg-white text-navy border-gray-200 hover:bg-gray-50 cursor-pointer"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "elaborer" && <Step5XlsForm />}

      {activeTab === "audit" && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-orange-700" />
              </div>
              <div>
                <h2 className="text-lg font-sora font-bold text-navy">
                  Diagnostic Audit
                </h2>
                <p className="text-sm text-gray-500">
                  Chargez un questionnaire existant pour obtenir un diagnostic qualité automatique
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r-xl p-4 mb-4">
              <p className="text-sm text-blue-900 m-0">
                <strong>Objectif :</strong> analyser la structure, la cohérence et la conformité
                d'un questionnaire existant (formulation des questions, logique de passage,
                couverture des indicateurs, respect des normes OMS/éthiques).
              </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center">
              <Stethoscope className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 font-sora font-semibold">Bientôt disponible</p>
              <p className="text-xs text-gray-400 mt-1">
                Charger le questionnaire → Résultats du diagnostic
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "masque" && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <Layers className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <h2 className="text-lg font-sora font-bold text-navy">
                  Confection du masque de saisie
                </h2>
                <p className="text-sm text-gray-500">
                  Transformez le questionnaire en programme de collecte (Kobo / CSPro)
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r-xl p-4 mb-4">
              <p className="text-sm text-blue-900 m-0">
                <strong>Objectif :</strong> convertir automatiquement le questionnaire validé
                en un masque de saisie compatible avec les outils de collecte terrain
                (KoboToolbox, CSPro, ODK). Génère les sauts conditionnels, les contraintes
                de validation et les listes de choix.
              </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center">
              <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 font-sora font-semibold">Bientôt disponible</p>
              <p className="text-xs text-gray-400 mt-1">
                Charger le questionnaire → (Kobo / CSPro) → Proposition de collecte
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "programme" && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Bug className="w-5 h-5 text-red-700" />
              </div>
              <div>
                <h2 className="text-lg font-sora font-bold text-navy">
                  Diagnostic du programme de collecte
                </h2>
                <p className="text-sm text-gray-500">
                  Auditez un programme de collecte existant (XLSForm, CSPro)
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r-xl p-4 mb-4">
              <p className="text-sm text-blue-900 m-0">
                <strong>Objectif :</strong> charger le code source d'un programme de collecte
                existant et détecter automatiquement les erreurs de logique, les sauts manquants,
                les contraintes incohérentes et les problèmes de performance.
              </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center">
              <Bug className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 font-sora font-semibold">Bientôt disponible</p>
              <p className="text-xs text-gray-400 mt-1">
                Charger le code source → Résultats du diagnostic
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
