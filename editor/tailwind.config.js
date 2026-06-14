/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#111315",
        panel: "#181b1f",
        border: "#252a30",
        muted: "#2a3038",
        text: "#c8cdd4",
        "text-dim": "#6b7684",
        accent: "#4ea1ff",
      },
    },
  },
  plugins: [],
}

