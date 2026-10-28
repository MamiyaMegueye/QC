import { Check } from "lucide-react"
import { useStore } from "../store/useStore"

const STEPS = [
  { num: 1, label: "Questionnaire", color: "from-accent-violet to-purple-600", ring: "ring-accent-violet/15", text: "text-accent-violet" },
  { num: 2, label: "Collecte", color: "from-accent-sky to-blue-600", ring: "ring-accent-sky/15", text: "text-accent-sky" },
  { num: 3, label: "Back check", color: "from-accent-teal to-emerald-600", ring: "ring-accent-teal/15", text: "text-accent-teal" },
  { num: 4, label: "Rapport d'analyse", color: "from-gold to-amber-500", ring: "ring-gold/15", text: "text-gold-deep" },
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
    if (num === 2) return true
    if (num === 3) return true
    return !!sessionId
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-3 sm:p-5 md:px-8 mb-5 shadow-card border border-gray-200/60 flex items-center justify-between overflow-hidden">
      {STEPS.map((step, idx) => {
        const status = stepStatus(step.num)
        const clickable = canGoTo(step.num)

        return (
          <div key={step.num} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => clickable && setStep(step.num)}
              disabled={!clickable}
              className={`flex items-center gap-2 md:gap-3 group ${
                clickable ? "cursor-pointer" : "cursor-not-allowed opacity-60"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-sora font-bold text-base transition-all duration-300 ${
                  status === "active"
                    ? `bg-gradient-to-br ${step.color} text-white shadow-lg ring-4 ${step.ring}`
                    : status === "done"
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {status === "done" ? <Check className="w-5 h-5" /> : step.num}
              </div>
              <span
                className={`font-sora font-semibold text-sm md:text-base transition-colors ${
                  status === "active" ? "inline" : "hidden lg:inline"
                } ${
                  status === "active"
                    ? step.text
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
                className={`flex-1 h-0.5 mx-2 md:mx-4 min-w-[8px] rounded-full transition-all duration-500 ${
                  step.num < currentStep
                    ? "bg-gradient-to-r from-green-400 to-green-500"
                    : "bg-gray-200"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
