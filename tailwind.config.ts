import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        hoiku: {
          green: "#7cc89a",
          mint: "#ecf8f0",
          deep: "#2f6b48",
          ink: "#26352d",
        },
      },
      boxShadow: {
        soft: "0 16px 45px rgba(43, 82, 58, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
