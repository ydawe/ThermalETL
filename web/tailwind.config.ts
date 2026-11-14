import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#13262f",
          soft: "#33505c",
          mute: "#5a7380",
        },
        ash: {
          50: "#f4f7f7",
          100: "#e8eeef",
          200: "#d3dee1",
          300: "#b4c6cb",
        },
        ember: {
          DEFAULT: "#b8441b",
          deep: "#8f3212",
          soft: "#f3d8cc",
        },
        tide: {
          DEFAULT: "#1f5f78",
          deep: "#164659",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "Helvetica Neue", "sans-serif"],
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        rise: "rise 520ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        fade: "fade 400ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
