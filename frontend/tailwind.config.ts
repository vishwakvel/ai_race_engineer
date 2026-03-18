import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-mono)", "monospace"],
        ui: ["var(--font-ui)", "sans-serif"],
      },
      colors: {
        "bg-primary": "var(--bg-primary)",
        "bg-surface": "var(--bg-surface)",
        "bg-elevated": "var(--bg-elevated)",
        "border-default": "var(--border-default)",
        "border-subtle": "var(--border-subtle)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "tyre-soft": "var(--tyre-soft)",
        "tyre-medium": "var(--tyre-medium)",
        "tyre-hard": "var(--tyre-hard)",
        "tyre-inter": "var(--tyre-inter)",
        "tyre-wet": "var(--tyre-wet)",
        positive: "var(--positive)",
        negative: "var(--negative)",
        warning: "var(--warning)",
        urgent: "var(--urgent)",
        "ferrari-red": "var(--ferrari-red)",
      },
    },
  },
  plugins: [],
} satisfies Config;
