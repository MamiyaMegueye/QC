// Etat global de l'application.

import { create } from "zustand"

// Verifie si l'utilisateur etait deja connecte (rememberd via localStorage)
const isAuthFromStorage = () => {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem("sista_auth") === "1"
  } catch {
    return false
  }
}

export const useStore = create((set, get) => ({
  // Authentification
  isAuthenticated: isAuthFromStorage(),
  setAuthenticated: (v) => set({ isAuthenticated: v }),
  logout: () => {
    try {
      localStorage.removeItem("sista_auth")
    } catch {}
    set({ isAuthenticated: false })
  },

  // Etapes
  currentStep: 1,
  setStep: (step) => set({ currentStep: step }),

  // Fichiers
  dataFile: null,
  dictFile: null,
  formFile: null,
  setDataFile: (f) => set({ dataFile: f }),
  setDictFile: (f) => set({ dictFile: f }),
  setFormFile: (f) => set({ formFile: f }),

  // Config IA
  selectedApi: "api1",
  apiKey1: "",
  apiKey2: "",
  api1Status: null,
  api2Status: null,
  api1Configured: false,  // true si .env contient la cle
  api2Configured: false,
  setSelectedApi: (api) => set({ selectedApi: api }),
  setApiKey1: (k) => set({ apiKey1: k, api1Status: null }),
  setApiKey2: (k) => set({ apiKey2: k, api2Status: null }),
  setApiStatus: (api, status) =>
    set(api === "api1" ? { api1Status: status } : { api2Status: status }),
  setApiConfigured: ({ api1Configured, api2Configured }) =>
    set({ api1Configured, api2Configured }),

  // Contexte enquete
  surveyType: "",
  surveyDescription: "",
  surveyPopulation: "",
  surveyEligibility: "",
  setSurveyType: (v) => set({ surveyType: v }),
  setSurveyDescription: (v) => set({ surveyDescription: v }),
  setSurveyPopulation: (v) => set({ surveyPopulation: v }),
  setSurveyEligibility: (v) => set({ surveyEligibility: v }),

  // Parametres QC
  params: { duree_min: 18, iqr_k: 1.5, missing_seuil: 50 },
  setParams: (p) => set({ params: p }),

  // Resultats analyse
  sessionId: null,
  filename: null,
  profile: null,
  results: [],
  mp: null,
  stats: null,
  preview: [],
  setAnalysisData: (data) =>
    set({
      sessionId: data.session_id,
      filename: data.filename,
      profile: data.profile,
      results: data.qc_basic.results,
      mp: data.mp,
      stats: data.qc_basic.stats,
      preview: data.preview,
    }),

  // Resultats IA
  aiRules: [],
  aiResult: null,
  aiComment: "",
  aiMetrics: null,
  setAiResults: (data) =>
    set({
      aiRules: data.rules,
      aiResult: data.result,
      aiComment: data.comment,
      aiMetrics: data.metrics,
    }),

  // Bilan enqueteurs
  enqueteurSummary: [],
  enqueteurCounts: null,
  setEnqueteurSummary: (data) =>
    set({ enqueteurSummary: data.summary, enqueteurCounts: data.counts }),

  // Erreurs
  apiError: null,
  setApiError: (e) => set({ apiError: e }),

  // Loading states
  isAnalyzing: false,
  isGenerating: false,
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setIsGenerating: (v) => set({ isGenerating: v }),

  // Reset
  reset: () =>
    set({
      currentStep: 1,
      dataFile: null,
      dictFile: null,
      formFile: null,
      sessionId: null,
      profile: null,
      results: [],
      mp: null,
      stats: null,
      preview: [],
      aiRules: [],
      aiResult: null,
      aiComment: "",
      aiMetrics: null,
      enqueteurSummary: [],
      apiError: null,
    }),
}))
