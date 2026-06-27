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

const EMPTY_MAPPING = {
  enqueteur: "",
  id: "",
  start: "",
  end: "",
  lat: "",
  lon: "",
}

const EMPTY_QC_METADATA = {
  responsable_qc: "",
  fonction: "",
  organisation: "",
  date_validation: "",
  observations_generales: "",
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
  setDataFile: (f) =>
    set({
      dataFile: f,
      // Reset du preview a chaque nouveau fichier
      previewColumns: [],
      previewAutoMapping: { ...EMPTY_MAPPING },
      previewProfile: null,
      columnMapping: { ...EMPTY_MAPPING },
      previewError: null,
    }),
  setDictFile: (f) => set({ dictFile: f }),
  setFormFile: (f) => set({ formFile: f }),

  // ---- Pre-visualisation des colonnes (avant analyse) ----
  previewColumns: [],
  previewAutoMapping: { ...EMPTY_MAPPING },
  previewProfile: null,
  previewLoading: false,
  previewError: null,
  setPreviewData: (data) =>
    set({
      previewColumns: data.columns || [],
      previewAutoMapping: { ...EMPTY_MAPPING, ...(data.auto_mapping || {}) },
      previewProfile: data.profile || null,
      // Pre-remplir le mapping utilisateur avec l'auto-detection
      columnMapping: { ...EMPTY_MAPPING, ...(data.auto_mapping || {}) },
      previewError: null,
    }),
  setPreviewLoading: (v) => set({ previewLoading: v }),
  setPreviewError: (e) => set({ previewError: e }),

  // ---- Mapping utilisateur des colonnes-cles (responsabilite SISTA) ----
  columnMapping: { ...EMPTY_MAPPING },
  setColumnMappingField: (key, value) =>
    set((s) => ({ columnMapping: { ...s.columnMapping, [key]: value } })),
  resetColumnMapping: () =>
    set((s) => ({ columnMapping: { ...EMPTY_MAPPING, ...s.previewAutoMapping } })),

  // Config IA
  selectedApi: "api1",
  apiKey1: "",
  apiKey2: "",
  api1Status: null,
  api2Status: null,
  api1Configured: false,
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
      // Nouvelle analyse = reset des validations et metadata QC
      validations: {},
      qcMetadata: { ...EMPTY_QC_METADATA },
      qcReportError: null,
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

  // ====================================================================
  //  POINT 5 SISTA : workflow de validation + rapport QC
  // ====================================================================

  // validations : { 'basic:doublons_lignes': {status, comment}, 'ai:0': {...} }
  validations: {},
  setValidationStatus: (itemId, status) =>
    set((s) => ({
      validations: {
        ...s.validations,
        [itemId]: {
          status,
          comment: (s.validations[itemId]?.comment) || "",
        },
      },
    })),
  setValidationComment: (itemId, comment) =>
    set((s) => ({
      validations: {
        ...s.validations,
        [itemId]: {
          status: s.validations[itemId]?.status || "pending",
          comment,
        },
      },
    })),
  setAllValidations: (validations) => set({ validations: validations || {} }),
  resetValidations: () => set({ validations: {} }),

  // Metadonnees du rapport QC (responsable, date, etc.)
  qcMetadata: { ...EMPTY_QC_METADATA },
  setQcMetadataField: (key, value) =>
    set((s) => ({ qcMetadata: { ...s.qcMetadata, [key]: value } })),
  setQcMetadata: (metadata) =>
    set((s) => ({ qcMetadata: { ...EMPTY_QC_METADATA, ...s.qcMetadata, ...metadata } })),

  // Etat de generation du rapport
  qcReportLoading: false,
  qcReportError: null,
  setQcReportLoading: (v) => set({ qcReportLoading: v }),
  setQcReportError: (e) => set({ qcReportError: e }),

  // Erreurs globales
  apiError: null,
  setApiError: (e) => set({ apiError: e }),

  // Loading states
  isAnalyzing: false,
  isGenerating: false,
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setIsGenerating: (v) => set({ isGenerating: v }),

  // Reset complet
  reset: () =>
    set({
      currentStep: 1,
      dataFile: null,
      dictFile: null,
      formFile: null,
      previewColumns: [],
      previewAutoMapping: { ...EMPTY_MAPPING },
      previewProfile: null,
      previewError: null,
      columnMapping: { ...EMPTY_MAPPING },
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
      validations: {},
      qcMetadata: { ...EMPTY_QC_METADATA },
      qcReportError: null,
      qcReportLoading: false,
    }),
}))