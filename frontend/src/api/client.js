// Client API pour communiquer avec le backend FastAPI.

const API_URL = import.meta.env.VITE_API_URL || ""

// ====================================================================
//  Timeout helper — avorte un fetch après N ms (fix #7)
// ====================================================================
const DEFAULT_TIMEOUT = 120_000 // 2 minutes
const LONG_TIMEOUT = 300_000   // 5 minutes (analyses lourdes)

function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal })
    .catch((err) => {
      if (err.name === "AbortError") throw new Error("timeout")
      throw err
    })
    .finally(() => clearTimeout(id))
}

// ====================================================================
//  Authentification : jeton signe delivre par /api/login
// ====================================================================
const TOKEN_KEY = "sista_token"

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || "" } catch { return "" }
}
export function setToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t) } catch {}
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem("sista_auth")
  } catch {}
}

// Ajoute ?token=... aux liens ouverts directement par le navigateur (telechargements GET)
export function withToken(url) {
  const t = getToken()
  if (!t) return url
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t)
}

// ====================================================================
//  Stockage sécurisé des clés API (sessionStorage au lieu de localStorage)
//  Fix #5 : les clés ne persistent pas après fermeture du navigateur
// ====================================================================
export function getApiKey(name) {
  try { return sessionStorage.getItem(`sista_${name}`) || "" } catch { return "" }
}
export function setApiKey(name, value) {
  try { sessionStorage.setItem(`sista_${name}`, value) } catch {}
}

// ====================================================================
//  Session expirée : message clair avant reload (fix #12)
// ====================================================================
let _sessionExpiredShown = false

function handleSessionExpired() {
  if (_sessionExpiredShown) return
  _sessionExpiredShown = true
  clearToken()
  // Affiche un message avant de recharger
  const div = document.createElement("div")
  div.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px)"
  div.innerHTML = `
    <div style="background:white;border-radius:16px;padding:32px;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <p style="font-size:18px;font-weight:700;color:#0D1B2C;margin:0 0 8px">Session expirée</p>
      <p style="font-size:14px;color:#6B7280;margin:0 0 20px">Votre session a expiré. Veuillez vous reconnecter.</p>
      <button onclick="window.location.reload()" style="background:linear-gradient(135deg,#0D1B2C,#1E3A5C);color:white;border:none;padding:10px 24px;border-radius:10px;font-weight:600;cursor:pointer;font-size:14px">
        Se reconnecter
      </button>
    </div>
  `
  document.body.appendChild(div)
}

// fetch + en-tete Authorization ; en cas de 401 on deconnecte l'utilisateur
export async function authFetch(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const headers = { ...(options.headers || {}) }
  const t = getToken()
  if (t) headers["Authorization"] = `Bearer ${t}`
  const res = await fetchWithTimeout(url, { ...options, headers }, timeoutMs)
  if (res.status === 401 && !String(url).endsWith("/api/login")) {
    handleSessionExpired()
    throw new Error("Session expirée")
  }
  return res
}

async function jsonFetch(path, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const res = await authFetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  }, timeoutMs)
  if (!res.ok) {
    let msg = `Erreur ${res.status}`
    try {
      const data = await res.json()
      msg = data.detail || msg
    } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export const api = {
  // Connexion : renvoie { ok, token }
  login: async (username, password) => {
    const res = await fetchWithTimeout(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }, 30_000)
    let data = {}
    try { data = await res.json() } catch {}
    if (!res.ok) throw new Error(data.detail || `Erreur ${res.status}`)
    return data
  },

  health: () => jsonFetch("/api/health"),

  analysisScope: async (sessionId) => {
    const res = await authFetch(`${API_URL}/api/session/${sessionId}/analysis-scope`)
    return res.ok ? res.json() : null
  },

  testKey: (apiName, apiKey) =>
    jsonFetch("/api/test-key", {
      method: "POST",
      body: JSON.stringify({ api: apiName, api_key: apiKey }),
    }),

  previewColumns: async (dataFile, dictFile) => {
    const formData = new FormData()
    formData.append("data_file", dataFile)
    if (dictFile) formData.append("dict_file", dictFile)
    const res = await authFetch(`${API_URL}/api/preview-columns`, {
      method: "POST",
      body: formData,
    }, LONG_TIMEOUT)
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try {
        const data = await res.json()
        msg = data.detail || msg
      } catch {}
      throw new Error(msg)
    }
    return res.json()
  },

  analyze: async (
    dataFile, dictFile, formFile, params,
    columnMapping = null, variableOverrides = null
  ) => {
    const formData = new FormData()
    formData.append("data_file", dataFile)
    if (dictFile) formData.append("dict_file", dictFile)
    if (formFile) formData.append("form_file", formFile)
    formData.append("duree_min", params?.duree_min || 18)
    formData.append("iqr_k", params?.iqr_k || 1.5)
    formData.append("missing_seuil", params?.missing_seuil || 50)
    if (columnMapping && Object.keys(columnMapping).length > 0) {
      formData.append("column_mapping", JSON.stringify(columnMapping))
    }
    if (variableOverrides && Object.keys(variableOverrides).length > 0) {
      formData.append("variable_overrides", JSON.stringify(variableOverrides))
    }
    const res = await authFetch(`${API_URL}/api/analyze`, {
      method: "POST",
      body: formData,
    }, LONG_TIMEOUT)
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try {
        const data = await res.json()
        msg = data.detail || msg
      } catch {}
      throw new Error(msg)
    }
    return res.json()
  },

  computeDurationStats: async (dataFile, startCol, endCol) => {
    const formData = new FormData()
    formData.append("data_file", dataFile)
    formData.append("start_col", startCol)
    formData.append("end_col", endCol)
    const res = await authFetch(`${API_URL}/api/compute-duration-stats`, {
      method: "POST",
      body: formData,
    })
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try {
        const data = await res.json()
        msg = data.detail || msg
      } catch {}
      throw new Error(msg)
    }
    return res.json()
  },

  // ====================================================================
  //  Back check
  // ====================================================================

  previewColumnsOnly: async (dataFile) => {
    const formData = new FormData()
    formData.append("data_file", dataFile)
    const res = await authFetch(`${API_URL}/api/preview-columns-only`, {
      method: "POST",
      body: formData,
    })
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try { const d = await res.json(); msg = d.detail || msg } catch {}
      throw new Error(msg)
    }
    return res.json()
  },

  backcheckCommonColumns: async (mainFile, bcFile) => {
    const formData = new FormData()
    formData.append("main_file", mainFile)
    formData.append("bc_file", bcFile)
    const res = await authFetch(`${API_URL}/api/backcheck/common-columns`, {
      method: "POST",
      body: formData,
    }, LONG_TIMEOUT)
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try { const d = await res.json(); msg = d.detail || msg } catch {}
      throw new Error(msg)
    }
    return res.json()
  },

  runBackcheck: async ({
    mainFile, bcFile, mainCodeCols, bcCodeCols, sampleSize,
    variablesConfig, mainEnqueteurCol, mainLabel, bcLabel,
  }) => {
    const formData = new FormData()
    formData.append("main_file", mainFile)
    formData.append("bc_file", bcFile)
    formData.append("main_code_cols", JSON.stringify(mainCodeCols))
    formData.append("bc_code_cols", JSON.stringify(bcCodeCols))
    formData.append("variables_config", JSON.stringify(variablesConfig))
    if (mainEnqueteurCol) formData.append("main_enqueteur_col", mainEnqueteurCol)
    if (mainLabel) formData.append("main_label", mainLabel)
    if (bcLabel) formData.append("bc_label", bcLabel)
    if (sampleSize) formData.append("sample_size", sampleSize)
    const res = await authFetch(`${API_URL}/api/backcheck/run`, {
      method: "POST",
      body: formData,
    }, LONG_TIMEOUT)
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try { const d = await res.json(); msg = d.detail || msg } catch {}
      throw new Error(msg)
    }
    return res.json()
  },

  generateRules: (payload) =>
    jsonFetch("/api/generate-rules", {
      method: "POST",
      body: JSON.stringify(payload),
    }, LONG_TIMEOUT),

  getEnqueteurSummary: (sessionId) =>
    jsonFetch(`/api/session/${sessionId}/enqueteur-summary`),

  getExportUrl: (sessionId) =>
    withToken(`${API_URL}/api/session/${sessionId}/export-excel`),

  getSpotcheckReportUrl: (sessionId) =>
    withToken(`${API_URL}/api/session/${sessionId}/spotcheck-report`),

  recomputeBasic: async (sessionId, params) => {
    const formData = new FormData()
    formData.append("duree_min", params.duree_min)
    formData.append("iqr_k", params.iqr_k)
    formData.append("missing_seuil", params.missing_seuil)
    const res = await authFetch(
      `${API_URL}/api/session/${sessionId}/recompute-basic`,
      { method: "POST", body: formData },
      LONG_TIMEOUT,
    )
    return res.json()
  },

  deleteSession: (sessionId) =>
    jsonFetch(`/api/session/${sessionId}`, { method: "DELETE" }),

  // === RAPPORT ANALYTIQUE ===

  generateReportPreview: (sessionId, payload) =>
    jsonFetch(`/api/session/${sessionId}/generate-report-preview`, {
      method: "POST",
      body: JSON.stringify(payload),
    }, LONG_TIMEOUT),

  downloadReport: async (sessionId, reportContent = null) => {
    const res = await authFetch(
      `${API_URL}/api/session/${sessionId}/download-report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_content: reportContent }),
      },
      LONG_TIMEOUT,
    )
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try {
        const data = await res.json()
        msg = data.detail || msg
      } catch {}
      throw new Error(msg)
    }
    return res.blob()
  },

  // ====================================================================
  //  POINT 5 SISTA : validations + rapport QC
  // ====================================================================

  getValidations: (sessionId) =>
    jsonFetch(`/api/session/${sessionId}/validations`),

  saveValidations: (sessionId, validations, metadata = null) =>
    jsonFetch(`/api/session/${sessionId}/validations`, {
      method: "POST",
      body: JSON.stringify({ validations, metadata }),
    }),

  downloadQcReport: async (sessionId, metadata = {}) => {
    const res = await authFetch(
      `${API_URL}/api/session/${sessionId}/qc-report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      },
      LONG_TIMEOUT,
    )
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try {
        const data = await res.json()
        msg = data.detail || msg
      } catch {}
      throw new Error(msg)
    }
    const cd = res.headers.get("content-disposition") || ""
    const fnMatch = cd.match(/filename="([^"]+)"/)
    const filename = fnMatch ? fnMatch[1] : "rapport_qc.docx"
    const blob = await res.blob()
    return { blob, filename }
  },

  // --- XLSForm Generator ---
  async generateQuestionnaire(noteCadrageFile, apiKey, api = "api1", cadreResultatsFile = null) {
    const formData = new FormData()
    formData.append("note_cadrage", noteCadrageFile)
    formData.append("api_key", apiKey)
    formData.append("api", api)
    if (cadreResultatsFile) {
      formData.append("cadre_resultats", cadreResultatsFile)
    }

    const res = await authFetch(API_URL + "/api/generate-xlsform", {
      method: "POST",
      body: formData,
    }, LONG_TIMEOUT)

    if (!res.ok) {
      let msg = "Erreur " + res.status
      try {
        const data = await res.json()
        msg = data.detail || msg
      } catch {}
      throw new Error(msg)
    }

    const cd = res.headers.get("content-disposition") || ""
    const fnMatch = cd.match(/filename="([^"]+)"/)
    const filename = fnMatch ? fnMatch[1] : "Questionnaire.docx"
    const blob = await res.blob()
    return { blob, filename }
  },
}

// ====================================================================
//  RAPPORT D'ANALYSE INDEPENDANT (Step 5)
// ====================================================================

api.reportUpload = async (dataFile, dictFile) => {
  const formData = new FormData()
  formData.append("data_file", dataFile)
  if (dictFile) formData.append("dict_file", dictFile)
  const res = await authFetch(`${API_URL}/api/report/upload`, {
    method: "POST",
    body: formData,
  }, LONG_TIMEOUT)
  if (!res.ok) {
    let msg = `Erreur ${res.status}`
    try { const d = await res.json(); msg = d.detail || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

api.reportScope = async (reportId) => {
  const res = await authFetch(`${API_URL}/api/report/${reportId}/scope`)
  return res.ok ? res.json() : null
}

api.reportGenerate = async (reportId, payload) => {
  const formData = new FormData()
  formData.append("api", payload.api || "api1")
  formData.append("api_key", payload.api_key || "")
  formData.append("survey_type", payload.survey_type || "")
  formData.append("survey_description", payload.survey_description || "")
  formData.append("survey_population", payload.survey_population || "")
  formData.append("survey_eligibility", payload.survey_eligibility || "")
  const res = await authFetch(`${API_URL}/api/report/${reportId}/generate`, {
    method: "POST",
    body: formData,
  }, LONG_TIMEOUT)
  if (!res.ok) {
    let msg = `Erreur ${res.status}`
    try { const d = await res.json(); msg = d.detail || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

api.reportDownload = async (reportId, reportContent = null) => {
  const res = await authFetch(
    `${API_URL}/api/report/${reportId}/download`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reportContent),
    },
    LONG_TIMEOUT,
  )
  if (!res.ok) {
    let msg = `Erreur ${res.status}`
    try { const d = await res.json(); msg = d.detail || msg } catch {}
    throw new Error(msg)
  }
  return res.blob()
}
