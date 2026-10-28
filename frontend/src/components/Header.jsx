import { useStore } from "../store/useStore"
import { LogOut, Sparkles } from "lucide-react"

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
      className="rounded-2xl p-5 px-8 mb-5 flex items-center justify-between shadow-header relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #0D1B2C 0%, #13263D 40%, #1E3A5C 70%, #7C3AED 130%)",
      }}
    >
      {/* Subtle decorative orbs */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-accent-violet/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-8 left-1/3 w-32 h-32 bg-gold/10 rounded-full blur-3xl" />

      <div className="flex items-center gap-5 relative z-10">
        <img
          src="/logo_sista.png"
          alt="SISTA"
          className="h-14 drop-shadow-lg"
          onError={(e) => (e.target.style.display = "none")}
        />
        <div className="w-px h-11 bg-white/20" />
        <div>
          <h1 className="text-white text-2xl font-extrabold tracking-tight m-0 flex items-center gap-2">
            Contrôle Qualité <span className="text-gold">QC</span>
            <Sparkles className="w-5 h-5 text-gold/60 animate-pulse-soft" />
          </h1>
          <p className="text-white/50 text-xs uppercase tracking-widest font-medium mt-1 m-0">
            
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 relative z-10">
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-sora font-semibold border backdrop-blur-sm ${
            anyActive
              ? "bg-green-500/15 text-green-300 border-green-400/20"
              : "bg-red-500/15 text-red-300 border-red-400/20"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              anyActive ? "bg-green-500 animate-pulse-soft" : "bg-red-500"
            }`}
          />
          {anyActive ? "IA active" : "IA inactive"}
        </div>

        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-sora font-semibold bg-white/10 text-white border border-white/15 hover:bg-white/20 hover:border-accent-violet/40 transition-all duration-200"
          title="Se déconnecter"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden md:inline">Déconnexion</span>
        </button>
      </div>
    </div>
  )
}
