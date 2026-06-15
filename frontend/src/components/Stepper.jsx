import { Check } from "lucide-react"
import { useStore } from "../store/useStore"

const STEPS = [
  { num: 1, label: "Importer" },
  { num: 2, label: "Détecter" },
  { num: 3, label: "Rapport QC" },
  { num: 4, label: "Rapport analytique" },
]

export default function Stepper() {
  const currentStep = useStore((s) => s.currentStep)
  const setStep = useStore((s) => s.setStep)
  const sessionId = useStore((s) => s.sessionId)

  const stepStatus = (num) => {
    if (num === currentStep) return "active"
    if (num < currentStep) return "done"
    return "todo"
  }

  const canGoTo = (num) => {
    if (num === 1) return true
    return !!sessionId
  }

  return (
    <div className="bg-white rounded-2xl p-5 px-8 mb-5 shadow-card border border-gray-200 flex items-center justify-between">
      {STEPS.map((step, idx) => {
        const status = stepStatus(step.num)
        const clickable = canGoTo(step.num)

        return (
          <div key={step.num} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => clickable && setStep(step.num)}
              disabled={!clickable}
              className={`flex items-center gap-3 group ${
                clickable ? "cursor-pointer" : "cursor-not-allowed opacity-60"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-sora font-bold text-base transition-all ${
                  status === "active"
                    ? "bg-navy text-white shadow-lg ring-4 ring-navy/10"
                    : status === "done"
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {status === "done" ? <Check className="w-5 h-5" /> : step.num}
              </div>
              <span
                className={`font-sora font-semibold text-base transition-colors ${
                  status === "active"
                    ? "text-navy"
                    : status === "done"
                    ? "text-green-700"
                    : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </button>

            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-4 rounded-full transition-colors ${
                  step.num < currentStep ? "bg-green-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}