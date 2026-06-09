import { useStore } from "../store/useStore"
import { LogOut } from "lucide-react"

export default function Header() {
  const api1Configured = useStore((s) => s.api1Configured)
  const api2Configured = useStore((s) => s.api2Configured)
  const logout = useStore((s) => s.logout)
  const anyActive = api1Configured || api2Configured

  const handleLogout = () => {
    if (confirm("Voulez-vous vraiment vous déconnecter ?")) {
      logout()
    }
  }

  return (
    <div
      className="rounded-2xl p-5 px-8 mb-5 flex items-center justify-between shadow-header"
      style={{
        background:
          "linear-gradient(115deg, #0D1B2C 0%, #13263D 60%, #1E3A5C 120%)",
      }}
    >
      <div className="flex items-center gap-5">
        <img
          src="/logo_sista.png"
          alt="SISTA"
          className="h-14 drop-shadow-lg"
          onError={(e) => (e.target.style.display = "none")}
        />
        <div className="w-px h-11 bg-white/20" />
        <div>
          <h1 className="text-white text-2xl font-extrabold tracking-tight m-0">
            Contrôle Qualité <span className="text-gold">QC</span>
          </h1>
          <p className="text-white/60 text-xs uppercase tracking-widest font-medium mt-1 m-0">
            
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-sora font-semibold border ${
            anyActive
              ? "bg-green-500/15 text-green-300 border-green-400/20"
              : "bg-red-500/15 text-red-300 border-red-400/20"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              anyActive ? "bg-green-500" : "bg-red-500"
            }`}
          />
          {anyActive ? "IA active" : "IA inactive"}
        </div>

        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-sora font-semibold bg-white/10 text-white border border-white/15 hover:bg-white/20 transition-colors"
          title="Se déconnecter"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden md:inline">Déconnexion</span>
        </button>
      </div>
    </div>
  )
}
