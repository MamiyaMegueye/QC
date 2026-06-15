import { useEffect } from "react"
import { useStore } from "./store/useStore"
import { api } from "./api/client"
import Login from "./components/Login"
import Header from "./components/Header"
import Stepper from "./components/Stepper"
import InfoBanner from "./components/InfoBanner"
import Step1Import from "./components/steps/Step1Import"
import Step2Detect from "./components/steps/Step2Detect"
import Step3Report from "./components/steps/Step3Report"
import Step4AnalyticalReport from "./components/steps/Step4AnalyticalReport"
import { AlertCircle } from "lucide-react"

export default function App() {
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const currentStep = useStore((s) => s.currentStep)
  const apiError = useStore((s) => s.apiError)
  const setApiConfigured = useStore((s) => s.setApiConfigured)

  // Au demarrage : verifier le statut du backend (seulement si authentifie)
  useEffect(() => {
    if (!isAuthenticated) return
    api
      .health()
      .then((data) =>
        setApiConfigured({
          api1Configured: data.api1_configured,
          api2Configured: data.api2_configured,
        })
      )
      .catch(() => {
        // Backend hors ligne : on n'affiche pas d'erreur immediate
      })
  }, [isAuthenticated, setApiConfigured])

  // Si non authentifie : afficher la page de login
  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-beige">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <Header />
        <Stepper />
        <InfoBanner />

        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 flex items-start gap-3 slide-up">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-800 text-sm">{apiError}</p>
          </div>
        )}

        {currentStep === 1 && <Step1Import />}
        {currentStep === 2 && <Step2Detect />}
        {currentStep === 3 && <Step3Report />}
        {currentStep === 4 && <Step4AnalyticalReport />}
      </div>
    </div>
  )
}