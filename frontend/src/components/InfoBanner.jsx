import { Folder, Search, BarChart3 } from "lucide-react"
import { useStore } from "../store/useStore"

const INFO = {
  1: {
    icon: Folder,
    title: "Étape 1 — Importer",
    msg: "Pour de meilleurs résultats, importez aussi le dictionnaire des variables, le questionnaire et remplissez le contexte de l'enquête.",
    grad: "linear-gradient(135deg, #EEEDFE 0%, #E1F5EE 50%, #FAEEDA 100%)",
    iconBg: "#3C3489",
  },
  2: {
    icon: Search,
    title: "Étape 2 — Détecter",
    msg: "Trois onglets : Aperçu (profilage), QC basique (tests automatiques) et QC intelligent (règles IA). Tous les résultats sont exportables.",
    grad: "linear-gradient(135deg, #E6F1FB 0%, #EAF3DE 50%, #FAEEDA 100%)",
    iconBg: "#0C447C",
  },
  3: {
    icon: BarChart3,
    title: "Étape 3 — Rapport QC",
    msg: "Classement des enquêteurs selon le nombre et la gravité des anomalies pour identifier ceux à former en priorité.",
    grad: "linear-gradient(135deg, #FAEEDA 0%, #FCEBEB 50%, #EEEDFE 100%)",
    iconBg: "#A32D2D",
  },
}

export default function InfoBanner() {
  const currentStep = useStore((s) => s.currentStep)
  const info = INFO[currentStep] || INFO[1]
  const Icon = info.icon

  return (
    <div
      className="rounded-2xl p-4 px-5 mb-5 border border-gray-200 flex items-center gap-4 shadow-sm slide-up"
      style={{ background: info.grad }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-md"
        style={{ background: info.iconBg }}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <p className="font-sora font-bold text-navy text-sm m-0">{info.title}</p>
        <p className="text-gray-600 text-sm mt-0.5 leading-relaxed m-0">
          {info.msg}
        </p>
      </div>
    </div>
  )
}
