import type { Config } from "tailwindcss";

/**
 * Los colores salen de variables CSS (definidas en app/globals.css). Así el
 * tema entero se cambia desde un solo sitio, sin tocar las clases de cada
 * componente: `text-gray-800` sigue significando "texto principal" aunque el
 * fondo pase de blanco a azul noche.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

/** Escala completa leída de variables: --{name}-50 … --{name}-900. */
const scale = (name: string, steps: number[]) =>
  Object.fromEntries(steps.map((s) => [s, v(`${name}-${s}`)]));

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Grises del tema: en oscuro la escala va invertida (50 = superficie
        // más honda, 900 = texto más claro).
        gray: scale("gray", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        // Color corporativo granate de Belsué, avivado para leerse sobre oscuro.
        belsue: {
          DEFAULT: v("belsue"),
          50: v("belsue-50"),
          100: v("belsue-100"),
          500: v("belsue"),
          600: v("belsue"),
          700: v("belsue-700"),
        },
        // Acento secundario cálido: brillos, degradados y detalles.
        ember: {
          DEFAULT: v("ember"),
          400: v("ember"),
          500: v("ember-500"),
        },
        // Tonos de estado. Los claros (fondos de aviso) pasan a tintes
        // oscuros y los oscuros (texto) a claros, para que los avisos rojos,
        // verdes y ámbar sigan funcionando sobre el fondo nocturno.
        red: {
          50: v("red-50"),
          100: v("red-100"),
          200: v("red-200"),
          700: v("red-700"),
        },
        green: {
          50: v("green-50"),
          100: v("green-100"),
          200: v("green-200"),
          600: v("green-600"),
          700: v("green-700"),
          800: v("green-800"),
        },
        amber: {
          50: v("amber-50"),
          100: v("amber-100"),
          200: v("amber-200"),
          300: v("amber-300"),
          700: v("amber-700"),
          800: v("amber-800"),
        },
        yellow: {
          100: v("yellow-100"),
          800: v("yellow-800"),
        },
      },
    },
  },
  plugins: [],
};

export default config;
