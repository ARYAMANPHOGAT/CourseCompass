/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--cc-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: token("midnight"),
        abyss: token("abyss"),
        charcoal: token("charcoal"),
        slate: token("slate"),
        graphite: token("graphite"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        muted: token("muted"),
        faint: token("faint"),
        violet: { DEFAULT: token("violet"), bright: token("violet-bright"), deep: token("violet-deep") },
        cyan: { DEFAULT: token("cyan"), deep: token("cyan-deep") },
        mint: token("mint"),
        amber: token("amber"),
        rose: token("rose"),
      },
      fontFamily: {
        display: ["'Unbounded Variable'", "Unbounded", "'Segoe UI'", "system-ui", "sans-serif"],
        sans: ["'Manrope Variable'", "Manrope", "'Segoe UI'", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.75rem", { lineHeight: "1.1rem" }],
        xs: ["0.8125rem", { lineHeight: "1.2rem" }],
        sm: ["0.875rem", { lineHeight: "1.35rem" }],
        base: ["1rem", { lineHeight: "1.6rem" }],
        lg: ["1.25rem", { lineHeight: "1.8rem" }],
        xl: ["1.5625rem", { lineHeight: "2.1rem" }],
        "2xl": ["1.953rem", { lineHeight: "2.4rem" }],
        "3xl": ["2.441rem", { lineHeight: "2.8rem" }],
        "4xl": ["3.052rem", { lineHeight: "3.3rem" }],
        "5xl": ["3.815rem", { lineHeight: "1.02" }],
        "6xl": ["4.768rem", { lineHeight: "0.98" }],
      },
      borderRadius: {
        sm: "var(--cc-radius-sm)",
        md: "var(--cc-radius-md)",
        lg: "var(--cc-radius-lg)",
        xl: "var(--cc-radius-xl)",
      },
      boxShadow: {
        surface: "var(--cc-shadow-surface)",
        lift: "var(--cc-shadow-lift)",
        "glow-violet": "var(--cc-glow-violet)",
        "glow-cyan": "var(--cc-glow-cyan)",
      },
      transitionTimingFunction: { out: "var(--cc-ease-out)" },
      transitionDuration: { fast: "var(--cc-dur-fast)", base: "var(--cc-dur)", slow: "var(--cc-dur-slow)" },
      maxWidth: { prose: "68ch" },
    },
  },
  plugins: [],
};
