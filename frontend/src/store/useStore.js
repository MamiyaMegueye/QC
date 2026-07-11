// Etat global de l'application.

import { create } from "zustand"
import {
  saveDraft, loadDraft, clearDraft,
  addHistoryEntry, loadHistory, removeHistoryEntry, clearHistory,
} from "../lib/persistence"

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
  superviseur: "",
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
      isCompositeId: false,
      compositeIdCols: ["", "", ""],
      durationStats: null,
      variableOverrides: {},
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

  // ID composite (recommandation SISTA v2 : l'ID peut etre defini par 2-3 colonnes)
  //   isCompositeId : true si l'utilisateur veut un ID compose
  //   compositeIdCols : liste des colonnes composant l'ID (jusqu'a 3)
  isCompositeId: false,
  compositeIdCols: ["", "", ""],
  setIsCompositeId: (v) => set({ isCompositeId: v }),
  setCompositeIdCol: (index, value) =>
    set((s) => {
      const next = [...s.compositeIdCols]
      next[index] = value
      return { compositeIdCols: next }
    }),

  // Stats de duree (calculees a la demande via /api/compute-duration-stats)
  durationStats: null,
  durationStatsLoading: false,
  setDurationStats: (stats) => set({ durationStats: stats }),
  setDurationStatsLoading: (v) => set({ durationStatsLoading: v }),

  // Variables a inclure dans le QC (recommandation SISTA v2)
  //   variableOverrides : { nomVariable: { ignore: true } }
  //   Par defaut vide -> toutes les variables sont incluses (le backend filtre)
  variableOverrides: {},
  setVariableIgnored: (name, ignored) =>
    set((s) => {
      const next = { ...s.variableOverrides }
      if (ignored) {
        next[name] = { ...(next[name] || {}), ignore: true }
      } else {
        if (next[name]) delete next[name].ignore
        if (next[name] && Object.keys(next[name]).length === 0) delete next[name]
      }
      return { variableOverrides: next }
    }),
  setAllVariablesIgnored: (names, ignored) =>
    set((s) => {
      const next = { ...s.variableOverrides }
      for (const n of names) {
        if (ignored) {
          next[n] = { ...(next[n] || {}), ignore: true }
        } else if (next[n]) {
          delete next[n].ignore
          if (Object.keys(next[n]).length === 0) delete next[n]
        }
      }
      return { variableOverrides: next }
    }),
  resetVariableOverrides: () => set({ variableOverrides: {} }),

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
      // Nouvelle analyse = reset des validations, metadata QC et filtre
      validations: {},
      qcMetadata: { ...EMPTY_QC_METADATA },
      qcReportError: null,
      qcFilterEnqueteur: "__all__",
      qcFilterSuperviseur: "__all__",
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
  //  Filtre par enqueteur partage entre QC basique et QC intelligent
  //  Valeur "__all__" = tous les enqueteurs (pas de filtre)
  // ====================================================================
  qcFilterEnqueteur: "__all__",
  setQcFilterEnqueteur: (v) => set({ qcFilterEnqueteur: v || "__all__" }),

  // Filtre superviseur (partage aussi, cascade avec le filtre enqueteur)
  qcFilterSuperviseur: "__all__",
  setQcFilterSuperviseur: (v) =>
    set({
      qcFilterSuperviseur: v || "__all__",
      // Changer de superviseur invalide le choix d'enqueteur
      qcFilterEnqueteur: "__all__",
    }),

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
      isCompositeId: false,
      compositeIdCols: ["", "", ""],
      durationStats: null,
      variableOverrides: {},
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
      qcFilterEnqueteur: "__all__",
      qcFilterSuperviseur: "__all__",
    }),

  // ====================================================================
  //  PERSISTANCE (localStorage) - Recommandation SISTA v2
  // ====================================================================

  // Etat du brouillon restaure (si trouve au demarrage)
  draftAvailable: null,   // objet draft si un brouillon existe
  draftRestored: false,   // vrai si l'utilisateur l'a restaure

  checkDraftAvailability: () => {
    const draft = loadDraft()
    set({ draftAvailable: draft || null })
    return draft
  },

  // Restaure un brouillon dans l'etat courant
  // Note : les FICHIERS ne peuvent pas etre restaures (browser security),
  //        l'utilisateur devra re-uploader mais tout le reste est pre-rempli.
  restoreDraft: (draft) => {
    if (!draft) return
    set({
      columnMapping: draft.columnMapping || { ...EMPTY_MAPPING },
      isCompositeId: draft.isCompositeId || false,
      compositeIdCols: draft.compositeIdCols || ["", "", ""],
      variableOverrides: draft.variableOverrides || {},
      params: draft.params || { duree_min: 18, iqr_k: 1.5, missing_seuil: 50 },
      surveyType: draft.surveyType || "",
      surveyDescription: draft.surveyDescription || "",
      surveyPopulation: draft.surveyPopulation || "",
      surveyEligibility: draft.surveyEligibility || "",
      selectedApi: draft.selectedApi || "api1",
      validations: draft.validations || {},
      qcMetadata: { ...EMPTY_QC_METADATA, ...(draft.qcMetadata || {}) },
      draftRestored: true,
      draftAvailable: null,
    })
  },

  discardDraft: () => {
    clearDraft()
    set({ draftAvailable: null, draftRestored: false })
  },

  // Sauvegarde du brouillon (a appeler apres chaque changement)
  autoSaveDraft: () => {
    const s = get()
    // On ne sauvegarde que si l'utilisateur a commence a saisir quelque chose
    const hasContent = !!(
      s.dataFile ||
      s.columnMapping.id ||
      s.surveyType ||
      s.surveyDescription ||
      Object.keys(s.validations || {}).length > 0
    )
    if (hasContent) saveDraft(s)
  },

  // ====================================================================
  //  HISTORIQUE - Liste des analyses passees
  // ====================================================================

  history: [],
  loadHistoryFromStorage: () => set({ history: loadHistory() }),

  // Enregistre l'analyse courante dans l'historique (a appeler apres
  // avoir termine une phase importante : QC basique fait, ou rapport telecharge)
  saveToHistory: (extra = {}) => {
    const s = get()
    if (!s.filename || !s.stats) return
    const nHigh = (s.results || []).filter((r) => r.severite === "high").length
    const nMed  = (s.results || []).filter((r) => r.severite === "med").length
    const nLow  = (s.results || []).filter((r) => r.severite === "low").length
    const nValidated = Object.values(s.validations || {}).filter(
      (v) => v.status && v.status !== "pending"
    ).length
    const entry = {
      filename:       s.filename,
      surveyType:     s.surveyType,
      n_observations: s.stats?.observations ?? s.stats?.questionnaires ?? 0,
      n_variables:    s.profile?.summary?.n_vars || 0,
      n_incoherences: s.stats?.incoherences || 0,
      n_alertes:      s.stats?.tests_alertes || 0,
      severities:     { high: nHigh, med: nMed, low: nLow },
      n_ai_rules:     (s.aiRules || []).length,
      n_validated:    nValidated,
      responsable_qc: s.qcMetadata?.responsable_qc || "",
      ...extra,
    }
    addHistoryEntry(entry)
    set({ history: loadHistory() })
  },

  deleteHistoryEntry: (id) => {
    removeHistoryEntry(id)
    set({ history: loadHistory() })
  },

  clearAllHistory: () => {
    clearHistory()
    set({ history: [] })
  },
}))