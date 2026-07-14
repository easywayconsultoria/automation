import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: { colors: { ink: "#10211b", brand: "#167a55", paper: "#f5f7f3" } }
  },
  plugins: []
} satisfies Config;
