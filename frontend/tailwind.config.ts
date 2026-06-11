import type { Config } from "tailwindcss";

/**
 * Theme maps to the CSS custom properties defined in `src/index.css`.
 * Every variable referenced here exists there — keep the two in sync.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        body: ["var(--font-body)", "sans-serif"],
      },
      colors: {
        // Dashboard surfaces
        "dash-bg": "var(--dash-bg)",
        "dash-surface": "var(--dash-surface)",
        "dash-elevated": "var(--dash-elevated)",
        "dash-border": "var(--dash-border)",
        "dash-border-bright": "var(--dash-border-bright)",
        "dash-text-primary": "var(--dash-text-primary)",
        "dash-text-secondary": "var(--dash-text-secondary)",
        "dash-text-muted": "var(--dash-text-muted)",
        // Homepage surfaces
        "home-bg": "var(--home-bg)",
        "home-surface": "var(--home-surface)",
        "home-card": "var(--home-card)",
        "home-text-primary": "var(--home-text-primary)",
        "home-text-secondary": "var(--home-text-secondary)",
        "home-text-muted": "var(--home-text-muted)",
        "home-border": "var(--home-border)",
        // Brand
        "ferrari-red": "var(--ferrari-red)",
        "ferrari-red-dark": "var(--ferrari-red-dark)",
        "sky-blue": "var(--sky-blue)",
        // Tyres
        "tyre-soft": "var(--tyre-soft)",
        "tyre-medium": "var(--tyre-medium)",
        "tyre-hard": "var(--tyre-hard)",
        "tyre-inter": "var(--tyre-inter)",
        "tyre-wet": "var(--tyre-wet)",
        // Status
        "status-gain": "var(--status-gain)",
        "status-loss": "var(--status-loss)",
        "status-warn": "var(--status-warn)",
        "status-urgent": "var(--status-urgent)",
        "status-sc": "var(--status-sc)",
      },
    },
  },
  plugins: [],
} satisfies Config;
