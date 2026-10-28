import { useState, useEffect } from "react"
import { useStore } from "../store/useStore"
import { Lock, User, AlertCircle, LogIn, Loader2 } from "lucide-react"
import { api, setToken } from "../api/client"

export default function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [coldStart, setColdStart] = useState(false)
  const setAuthenticated = useStore((s) => s.setAuthenticated)

  // Préchauffe le backend dès l'affichage du login
  useEffect(() => {
    fetch(( import.meta.env.VITE_API_URL || "") + "/").catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    if (!username.trim() || !password) {
      setError("Veuillez saisir votre identifiant et votre mot de passe")
      return
    }
    setLoading(true)
    setColdStart(false)

    // Tentative avec retry automatique (cold start Vercel)
    let attempts = 0
    const maxAttempts = 3
    while (attempts < maxAttempts) {
      try {
        const data = await api.login(username.trim(), password)
        setToken(data.token)
        try { localStorage.setItem("sista_auth", "1") } catch {}
        setAuthenticated(true)
        return
      } catch (err) {
        attempts++
        const msg = String(err.message || "")
        const isNetwork = msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("timeout")
        if (isNetwork && attempts < maxAttempts) {
          setColdStart(true)
          await new Promise((r) => setTimeout(r, 3000))
          continue
        }
        setError(
          isNetwork
            ? "Le serveur met du temps à démarrer. Réessayez dans quelques secondes."
            : msg || "Nom d'utilisateur ou mot de passe incorrect"
        )
        break
      }
    }
    setLoading(false)
    setColdStart(false)
  }

  return (
    <div className="min-h-screen bg-beige flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo + titre */}
        <div className="text-center mb-8">
          <div
            className="inline-block mb-5 px-8 py-5 rounded-2xl shadow-header"
            style={{
              background:
                "linear-gradient(115deg, #0D1B2C 0%, #13263D 60%, #1E3A5C 120%)",
            }}
          >
            <img
              src="/logo_sista.png"
              alt="SISTA"
              className="h-14 mx-auto"
              onError={(e) => (e.target.style.display = "none")}
            />
          </div>
          <h1 className="font-sora text-3xl font-extrabold text-navy m-0">
            Contrôle Qualité <span className="text-gold-deep">QC</span>
          </h1>
          <p className="text-gray-500 text-sm uppercase tracking-widest font-medium mt-2 m-0">
            
          </p>
        </div>

        {/* Carte de connexion */}
        <div className="card slide-up">
          <h3 className="card-title flex items-center gap-2">
            <LogIn className="w-5 h-5" />
            Connexion
          </h3>
          <p className="card-desc">
            Saisissez vos identifiants pour accéder à la plateforme.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-text flex items-center gap-2">
                <User className="w-4 h-4" />
                Nom d'utilisateur
              </label>
              <input
                type="text"
                className="input-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Saisissez votre identifiant"
                autoFocus
              />
            </div>

            <div>
              <label className="label-text flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Mot de passe
              </label>
              <input
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Saisissez votre mot de passe"
              />
            </div>

            {coldStart && !error && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2 slide-up">
                <Loader2 className="w-5 h-5 text-blue-600 flex-shrink-0 animate-spin" />
                <span className="text-blue-800 text-sm font-medium">
                  Démarrage du serveur en cours, veuillez patienter…
                </span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 slide-up">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <span className="text-red-800 text-sm font-medium">
                  {error}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center flex items-center gap-2 mt-2 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? (coldStart ? "Démarrage du serveur…" : "Connexion…") : "Se connecter"}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          
        </p>
      </div>
    </div>
  )
}
