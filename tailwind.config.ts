import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        washed: {
          surface: "var(--surface)",
          card: "var(--card)",
          border: "var(--border)",
          muted: "var(--muted)",
          foreground: "var(--foreground)",
        }
      }
    },
  },
  plugins: [],
};
export default config;