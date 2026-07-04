import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "monospace"],
        mono: ["var(--font-mono)", "monospace"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
      colors: {
        ink: "#0a0e14",
        panel: "#121821",
        panel2: "#1a2230",
        line: "#26303f",
        dim: "#7a8a9e",
        ok: "#3ad07f",
        warn: "#f5a623",
        alarm: "#ff4d4d",
        phosphor: "#5fe6c9",
      },
    },
  },
  plugins: [],
};
export default config;
