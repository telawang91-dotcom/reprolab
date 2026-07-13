import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "rgb(var(--accent) / <alpha-value>)", hover: "rgb(var(--accent-hover) / <alpha-value>)" },
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        elevated: "rgb(var(--elevated) / <alpha-value>)",
        ink: "rgb(var(--text-primary) / <alpha-value>)",
        muted: "rgb(var(--text-secondary) / <alpha-value>)",
        subtle: "rgb(var(--text-tertiary) / <alpha-value>)",
        line: "rgb(var(--hairline) / <alpha-value>)",
        role: {
          plan: "rgb(var(--role-plan) / <alpha-value>)",
          execute: "rgb(var(--role-execute) / <alpha-value>)",
          review: "rgb(var(--role-review) / <alpha-value>)"
        },
        status: {
          ok: "rgb(var(--status-ok) / <alpha-value>)",
          warn: "rgb(var(--status-warn) / <alpha-value>)",
          err: "rgb(var(--status-err) / <alpha-value>)"
        }
      },
      borderRadius: {
        appleSm: "10px",
        apple: "14px",
        appleLg: "20px",
        appleXl: "28px"
      },
      boxShadow: {
        soft: "0 0 0 1px rgb(var(--hairline) / .015)",
        lift: "0 0 0 1px rgb(var(--accent) / .22)"
      },
      fontFamily: {
        sans: ["SF Pro Text", "Segoe UI Variable Text", "-apple-system", "BlinkMacSystemFont", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
