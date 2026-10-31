import { useState } from "react"
import { Check, Lock } from "lucide-react"
import { useStore } from "../store/useStore"

const STEPS = [
  { num: 1, label: "Questionnaire", shortLabel: "Quest.", color: "from-accent-violet to-purple-600", ring: "ring-accent-violet/15", text: "text-accent-violet" },
  { num: 2, label: "Collecte", shortLabel: "Collecte", color: "from-accent-sky to-blue-600", ring: "ring-accent-sky/15", text: "text-accent-sky" },
  { num: 3, label: "Rapport QC", shortLabel: "Rapport", color: "from-gold to-amber-500", ring: "ring-gold/15", text: "text-gold-deep" },
  { num: 4, label: "Back check", shortLabel: "B. check", color: "from-accent-teal to-emerald-600", ring: "ring-accent-teal/15", text: "text-accent-teal" },
  { num: 5, label: "Rapport d'analyse", shortLabel: "Analyse", color: "from-emerald-500 to-green-600", ring: "ring-emerald-500/15", text: "text-emerald-700" },
]

export default function Stepper() {
  const currentStep = useStore((s) => s.currentStep)
  const setStep = useStore((s) => s.setStep)
  const sessionId = useStore((s) => s.sessionId)
  const [tooltip, setTooltip] = useState(null)

  const stepStatus = (num) => {
    if (num === currentStep) return "active"
    if (num < currentStep) return "done"
    return "todo"
  }

  const canGoTo = (num) => {
    if (num === 1) return true
    if (num === 2) return true
    if (num === 3) return true
    if (num === 4) return !!sessionId
    if (num === 5) return !!sessionId
    return !!sessionId
  }

  const handleClick = (step) => {
    if (canGoTo(step.num)) {
      setStep(step.num)
      setTooltip(null)
    } else if (step.num >= 4) {
      setTooltip(step.num)
      setTimeout(() => setTooltip(null), 3000)
    }
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-3 sm:p-5 md:px-8 mb-5 shadow-card border border-gray-200/60 flex items-center justify-between overflow-x-auto scrollbar-none">
      {STEPS.map((step, idx) => {
        const status = stepStatus(step.num)
        const clickable = canGoTo(step.num)
        const locked = !clickable && step.num === 4

        return (
          <div key={step.num} className="flex items-center flex-1 last:flex-none min-w-0">
            <div className="relative">
              <button
                onClick={() => handleClick(step)}
                className={`flex items-center gap-1.5 sm:gap-2 md:gap-3 group whitespace-nowrap ${
                  clickable ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                }`}
              >
                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-sora font-bold text-sm sm:text-base transition-all duration-300 flex-shrink-0 ${
                    status === "active"
                      ? `bg-gradient-to-br ${step.color} text-white shadow-lg ring-4 ${step.ring}`
                      : status === "done"
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {status === "done" ? (
                    <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : locked ? (
                    <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  ) : (
                    step.num
                  )}
                </div>
                {/* Label toujours visible : version courte sur mobile, complète sur md+ */}
                <span
                  className={`font-sora font-semibold text-xs sm:text-sm md:text-base transition-colors ${
                    status === "active"
                      ? step.text
                      : status === "done"
                      ? "text-green-700"
                      : "text-gray-400"
                  }`}
                >
                  <span className="md:hidden">{step.shortLabel}</span>
                  <span className="hidden md:inline">{step.label}</span>
                </span>
              </button>

              {/* Tooltip pour step 4 verrouillé */}
              {tooltip === step.num && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-navy text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap animate-fade-in">
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-navy rotate-45" />
                  Lancez d'abord une analyse (étape 2)
                </div>
              )}
            </div>

            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 sm:mx-2 md:mx-4 min-w-[6px] rounded-full transition-all duration-500 ${
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
