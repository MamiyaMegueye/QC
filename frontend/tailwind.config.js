/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Charte SISTA
        navy: {
          DEFAULT: "#13263D",
          deep: "#0D1B2C",
          light: "#1E3A5C",
        },
        gold: {
          DEFAULT: "#EFC71A",
          deep: "#D4AC0D",
          light: "#F3D44E",
        },
        beige: "#F4F7FA",
      },
      fontFamily: {
        sora: ["Sora", "sans-serif"],
        spline: ["Spline Sans", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        soft: "0 2px 14px rgba(13,27,44,0.06)",
        card: "0 2px 10px rgba(13,27,44,0.05)",
        header: "0 8px 24px rgba(13,27,44,0.18)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.4s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        slideUp: {
          "0%": { opacity: 0, transform: "translateY(8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
}
