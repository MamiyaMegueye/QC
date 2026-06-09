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
  // Healthcheck
  health: () => jsonFetch("/api/health"),

  // Test cle API
  testKey: (apiName, apiKey) =>
    jsonFetch("/api/test-key", {
      method: "POST",
      body: JSON.stringify({ api: apiName, api_key: apiKey }),
    }),

  // Upload + analyse
  analyze: async (dataFile, dictFile, formFile, params) => {
    const formData = new FormData()
    formData.append("data_file", dataFile)
    if (dictFile) formData.append("dict_file", dictFile)
    if (formFile) formData.append("form_file", formFile)
    formData.append("duree_min", params?.duree_min || 18)
    formData.append("iqr_k", params?.iqr_k || 1.5)
    formData.append("missing_seuil", params?.missing_seuil || 50)
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

  // Generer regles IA
  generateRules: (payload) =>
    jsonFetch("/api/generate-rules", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Bilan enqueteurs
  getEnqueteurSummary: (sessionId) =>
    jsonFetch(`/api/session/${sessionId}/enqueteur-summary`),

  // Export Excel
  getExportUrl: (sessionId) =>
    `${API_URL}/api/session/${sessionId}/export-excel`,

  // Recalcul QC basique
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

  // Liberer session
  deleteSession: (sessionId) =>
    jsonFetch(`/api/session/${sessionId}`, { method: "DELETE" }),
}
