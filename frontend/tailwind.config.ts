import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#2563EB", hover: "#1D4ED8" },
        canvas: "#F8FAFC",
        ink: "#0F172A",
        muted: "#64748B",
        line: "#E2E8F0"
      },
      boxShadow: { card: "0 1px 2px rgba(15,23,42,.06)" },
      fontFamily: {
        sans: ["Inter", "Noto Sans SC", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;

