// Client API pour communiquer avec le backend FastAPI.

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
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
}

export const api = {
  health: () => jsonFetch("/api/health"),

  testKey: (apiName, apiKey) =>
    jsonFetch("/api/test-key", {
      method: "POST",
      body: JSON.stringify({ api: apiName, api_key: apiKey }),
    }),

  // Lecture rapide : { columns, auto_mapping, profile }
  previewColumns: async (dataFile, dictFile) => {
    const formData = new FormData()
    formData.append("data_file", dataFile)
    if (dictFile) formData.append("dict_file", dictFile)
    const res = await fetch(`${API_URL}/api/preview-columns`, {
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

  // Upload + analyse complete
  //   columnMapping     : { enqueteur, id, start, end, lat, lon } -- optionnel
  //   variableOverrides : { nom_variable: {type, label, ignore} } -- optionnel
  analyze: async (
    dataFile,
    dictFile,
    formFile,
    params,
    columnMapping = null,
    variableOverrides = null
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
    const res = await fetch(`${API_URL}/api/analyze`, {
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

  // Calcule les stats de duree d'observation a partir d'un fichier
  // (utilise dans Step1 pour proposer un seuil auto - reco SISTA v2)
  computeDurationStats: async (dataFile, startCol, endCol) => {
    const formData = new FormData()
    formData.append("data_file", dataFile)
    formData.append("start_col", startCol)
    formData.append("end_col", endCol)
    const res = await fetch(`${API_URL}/api/compute-duration-stats`, {
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
  //  Back check / Controle croise (methode J-PAL / IPA / Banque Mondiale)
  // ====================================================================

  previewColumnsOnly: async (dataFile) => {
    const formData = new FormData()
    formData.append("data_file", dataFile)
    const res = await fetch(`${API_URL}/api/preview-columns-only`, {
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

  // Colonnes communes aux 2 fichiers avec detection automatique du type
  backcheckCommonColumns: async (mainFile, bcFile) => {
    const formData = new FormData()
    formData.append("main_file", mainFile)
    formData.append("bc_file", bcFile)
    const res = await fetch(`${API_URL}/api/backcheck/common-columns`, {
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

  // Execution de la comparaison back check
  runBackcheck: async ({
    mainFile, bcFile, mainCodeCols, bcCodeCols,
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
    const res = await fetch(`${API_URL}/api/backcheck/run`, {
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

  generateRules: (payload) =>
    jsonFetch("/api/generate-rules", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getEnqueteurSummary: (sessionId) =>
    jsonFetch(`/api/session/${sessionId}/enqueteur-summary`),

  getExportUrl: (sessionId) =>
    `${API_URL}/api/session/${sessionId}/export-excel`,

  recomputeBasic: async (sessionId, params) => {
    const formData = new FormData()
    formData.append("duree_min", params.duree_min)
    formData.append("iqr_k", params.iqr_k)
    formData.append("missing_seuil", params.missing_seuil)
    const res = await fetch(
      `${API_URL}/api/session/${sessionId}/recompute-basic`,
      { method: "POST", body: formData }
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
    }),

  downloadReport: async (sessionId, reportContent = null) => {
    const res = await fetch(
      `${API_URL}/api/session/${sessionId}/download-report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_content: reportContent }),
      }
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
  //  POINT 5 SISTA : validations + rapport de Controle Qualite
  // ====================================================================

  // Recupere les decisions de validation + metadata QC de la session
  getValidations: (sessionId) =>
    jsonFetch(`/api/session/${sessionId}/validations`),

  // Sauvegarde les decisions de validation (+ optionnellement metadata)
  //   validations : { 'basic:doublons_lignes': {status, comment}, 'ai:0': {...} }
  //   metadata    : { responsable_qc, fonction, date_validation, ... }
  saveValidations: (sessionId, validations, metadata = null) =>
    jsonFetch(`/api/session/${sessionId}/validations`, {
      method: "POST",
      body: JSON.stringify({ validations, metadata }),
    }),

  // Genere et telecharge le rapport QC .docx
  downloadQcReport: async (sessionId, metadata = {}) => {
    const res = await fetch(
      `${API_URL}/api/session/${sessionId}/qc-report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      }
    )
    if (!res.ok) {
      let msg = `Erreur ${res.status}`
      try {
        const data = await res.json()
        msg = data.detail || msg
      } catch {}
      throw new Error(msg)
    }
    // Recupere le nom de fichier depuis Content-Disposition si present
    const cd = res.headers.get("content-disposition") || ""
    const fnMatch = cd.match(/filename="([^"]+)"/)
    const filename = fnMatch ? fnMatch[1] : "rapport_qc.docx"
    const blob = await res.blob()
    return { blob, filename }
  },
}