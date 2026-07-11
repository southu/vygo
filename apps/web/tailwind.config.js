/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        ink: "var(--color-ink)",
        "ink-soft": "var(--color-ink-soft)",
        muted: "var(--color-muted)",
        border: "var(--color-border)",
        purple: {
          DEFAULT: "var(--color-purple)",
          dark: "var(--color-purple-dark)",
          soft: "var(--color-purple-soft)",
        },
        green: {
          DEFAULT: "var(--color-green)",
          dark: "var(--color-green-dark)",
        },
        red: "var(--color-red)",
        amber: "var(--color-amber)",
        blue: "var(--color-blue)",
        trust: "var(--color-trust)",
      },
      fontFamily: {
        display: ["var(--font-montserrat)", "system-ui", "sans-serif"],
        body: ["var(--font-open-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "var(--radius-card)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
      maxWidth: {
        content: "72rem",
        prose: "42rem",
      },
    },
  },
  plugins: [],
};
