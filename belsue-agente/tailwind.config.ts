import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Color corporativo granate de Belsué
        belsue: {
          DEFAULT: "#8a0c3c",
          50: "#fbeaf0",
          100: "#f4c6d6",
          500: "#8a0c3c",
          600: "#8a0c3c",
          700: "#6d0a30",
        },
      },
    },
  },
  plugins: [],
};

export default config;
