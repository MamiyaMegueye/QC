import { ClipboardList, Database, GitCompare, FileText, BarChart3 } from "lucide-react"
import { useStore } from "../store/useStore"

const INFO = {
  1: {
    icon: ClipboardList,
    title: "Étape 1 — Questionnaire",
    msg: "Élaborez un questionnaire structuré à partir de la note de cadrage, la méthodologie et les indicateurs.",
    grad: "linear-gradient(135deg, #EEEDFE 0%, #E1F5EE 50%, #FAEEDA 100%)",
    iconBg: "#3C3489",
  },
  2: {
    icon: Database,
    title: "Étape 2 — Collecte des données",
    msg: "Chargez la base de données et lancez le contrôle qualité : profilage, tests automatiques et règles IA.",
    grad: "linear-gradient(135deg, #E6F1FB 0%, #EAF3DE 50%, #FAEEDA 100%)",
    iconBg: "#0C447C",
  },
  3: {
    icon: GitCompare,
    title: "Étape 3 — Back check",
    msg: "Comparez la base source à une re-interview de contrôle : échantillon aléatoire, variables clés et rapport de comparaison.",
    grad: "linear-gradient(135deg, #FAEEDA 0%, #FCEBEB 50%, #EEEDFE 100%)",
    iconBg: "#A32D2D",
  },
  4: {
    icon: FileText,
    title: "Étape 4 — Rapport QC",
    msg: "Consultez le rapport de synthèse du contrôle qualité avec les statistiques et anomalies détectées.",
    grad: "linear-gradient(135deg, #E1F5EE 0%, #E6F1FB 50%, #EEEDFE 100%)",
    iconBg: "#0F6E56",
  },
  5: {
    icon: BarChart3,
    title: "Étape 5 — Rapport d'analyse",
    msg: "Générez le rapport analytique Word avec tableaux, graphiques et interprétations IA.",
    grad: "linear-gradient(135deg, #DCFCE7 0%, #D1FAE5 50%, #ECFDF5 100%)",
    iconBg: "#047857",
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
