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
        background: "#FFFBF2",
        surface: "#FFFFFF",
        "card-items": "#EAF6FF",
        "card-today": "#FFF0F4",
        "card-stock": "#F2F8EE",
        primary: "#F8A28D",
        "primary-hover": "#F58F7A",
        "icon-items": "#2F86C9",
        "icon-today": "#F06F8B",
        "icon-stock": "#82B96D",
        "text-primary": "#2F2F2F",
        "text-secondary": "#707070",
        "text-tertiary": "#A6A6A6",
        "border-soft": "#EFE7DC",
        divider: "#EEE9E2",
        "tab-active": "#FFF0F4",
        "tab-inactive": "#8A8A8A",
        danger: "#F06F8B",
        warning: "#E7B95A",
        success: "#82B96D",
        hoiku: {
          green: "#7cc89a",
          mint: "#ecf8f0",
          deep: "#2f6b48",
          ink: "#26352d",
        },
      },
      borderRadius: {
        card: "28px",
        section: "24px",
        button: "999px",
        input: "18px",
        tab: "22px",
        avatar: "999px",
      },
      boxShadow: {
        card: "0 8px 24px rgba(0,0,0,.05)",
        floating: "0 12px 32px rgba(0,0,0,.07)",
        button: "0 6px 16px rgba(248,162,141,.22)",
        soft: "0 16px 45px rgba(43, 82, 58, 0.08)",
      },
      fontFamily: {
        sans: ["Noto Sans JP", "system-ui", "sans-serif"],
      },
      fontSize: {
        "app-title": "32px",
        "child-name": "36px",
        "card-title": "22px",
        button: "18px",
        "list-item": "18px",
        number: "16px",
        status: "14px",
        caption: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
