// Utilitaires de persistance locale (localStorage)
// Recommandation SISTA v2 : permettre la reprise apres deconnexion + historique

const DRAFT_KEY = "sista_qc_draft"
const HISTORY_KEY = "sista_qc_history"
const MAX_HISTORY_ENTRIES = 20

// Wrapper safe pour localStorage
function safeLocalStorage() {
  if (typeof window === "undefined") return null
  try {
    const test = "__test__"
    window.localStorage.setItem(test, test)
    window.localStorage.removeItem(test)
    return window.localStorage
  } catch {
    return null
  }
}

// ====================================================================
//  BROUILLON (draft) - la session en cours
// ====================================================================

/**
 * Sauvegarde du brouillon (etat de travail en cours).
 * Contient : dataFileName, dictFileName, mapping, contexte, validations,
 * metadata QC, variableOverrides, parametres.
 * NOTE : les fichiers eux-memes ne sont pas serialisables, on ne stocke
 *        que leur nom pour rappel a l'utilisateur.
 */
export function saveDraft(state) {
  const ls = safeLocalStorage()
  if (!ls) return false
  try {
    const draft = {
      version: 2,
      saved_at: new Date().toISOString(),
      // Etat mapping et contexte
      dataFileName: state.dataFile?.name || null,
      dictFileName: state.dictFile?.name || null,
      formFileName: state.formFile?.name || null,
      columnMapping: state.columnMapping,
      isCompositeId: state.isCompositeId,
      compositeIdCols: state.compositeIdCols,
      variableOverrides: state.variableOverrides,
      params: state.params,
      // Contexte enquete
      surveyType: state.surveyType,
      surveyDescription: state.surveyDescription,
      surveyPopulation: state.surveyPopulation,
      surveyEligibility: state.surveyEligibility,
      // API selectionnee (pas la cle)
      selectedApi: state.selectedApi,
      // Etat des validations si session en cours
      validations: state.validations,
      qcMetadata: state.qcMetadata,
      currentStep: state.currentStep,
    }
    ls.setItem(DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch (e) {
    console.warn("[persistence] draft save failed:", e)
    return false
  }
}

/**
 * Recupere le brouillon precedent (retourne null si aucun).
 */
export function loadDraft() {
  const ls = safeLocalStorage()
  if (!ls) return null
  try {
    const raw = ls.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw)
    // Ne pas restaurer les brouillons de + de 30 jours
    const ageMs = Date.now() - new Date(draft.saved_at).getTime()
    if (ageMs > 30 * 24 * 3600 * 1000) return null
    return draft
  } catch (e) {
    console.warn("[persistence] draft load failed:", e)
    return null
  }
}

export function clearDraft() {
  const ls = safeLocalStorage()
  if (!ls) return
  try { ls.removeItem(DRAFT_KEY) } catch {}
}

// ====================================================================
//  HISTORIQUE - liste des analyses passees
// ====================================================================

/**
 * Ajoute une entree dans l'historique (garde les MAX_HISTORY_ENTRIES plus recentes).
 * Une entree = un snapshot d'une analyse terminee.
 */
export function addHistoryEntry(entry) {
  const ls = safeLocalStorage()
  if (!ls) return false
  try {
    const raw = ls.getItem(HISTORY_KEY)
    let list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) list = []
    const enriched = {
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      saved_at: new Date().toISOString(),
      ...entry,
    }
    list.unshift(enriched)
    if (list.length > MAX_HISTORY_ENTRIES) list = list.slice(0, MAX_HISTORY_ENTRIES)
    ls.setItem(HISTORY_KEY, JSON.stringify(list))
    return true
  } catch (e) {
    console.warn("[persistence] history save failed:", e)
    return false
  }
}

/**
 * Charge la liste des analyses passees.
 */
export function loadHistory() {
  const ls = safeLocalStorage()
  if (!ls) return []
  try {
    const raw = ls.getItem(HISTORY_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch (e) {
    console.warn("[persistence] history load failed:", e)
    return []
  }
}

export function removeHistoryEntry(entryId) {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    const raw = ls.getItem(HISTORY_KEY)
    if (!raw) return
    let list = JSON.parse(raw)
    if (!Array.isArray(list)) return
    list = list.filter((e) => e.id !== entryId)
    ls.setItem(HISTORY_KEY, JSON.stringify(list))
  } catch (e) {
    console.warn("[persistence] history remove failed:", e)
  }
}

export function clearHistory() {
  const ls = safeLocalStorage()
  if (!ls) return
  try { ls.removeItem(HISTORY_KEY) } catch {}
}

/**
 * Estime la taille du stockage utilise (informatif).
 */
export function getStorageInfo() {
  const ls = safeLocalStorage()
  if (!ls) return { available: false }
  try {
    const draft = ls.getItem(DRAFT_KEY) || ""
    const history = ls.getItem(HISTORY_KEY) || ""
    const totalKb = Math.round((draft.length + history.length) / 1024)
    return {
      available: true,
      draftSize: Math.round(draft.length / 1024),
      historySize: Math.round(history.length / 1024),
      totalKb,
    }
  } catch {
    return { available: false }
  }
}