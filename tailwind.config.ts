import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/modulos/**/*.{js,ts,jsx,tsx,mdx}',
    './src/infra/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        livion: {
          // Tokens semânticos adaptativos (Dark: Tinta Noturna | Light: Creme Papiro)
          fundo: 'var(--livion-bg-fundo)',
          card: 'var(--livion-bg-card)',
          elevado: 'var(--livion-bg-elevado)',
          borda: 'var(--livion-borda)',
          texto: 'var(--livion-texto-principal)',
          secundario: 'var(--livion-texto-secundario)',
          apoio: 'var(--livion-texto-apoio)',

          // Cores fixas da marca
          indigo: {
            profundo: '#1E1B4B',
            DEFAULT: '#312E81',
            hover: '#3730A3',
            borda: '#4338CA',
          },
          ambar: {
            claro: '#FBBF24',
            DEFAULT: '#F59E0B',
            chama: '#EA580C',
            profundo: '#78350F',
          },
          violeta: {
            claro: '#8B5CF6',
            DEFAULT: '#6D28D9',
            profundo: '#4C1D95',
          },
          papiro: {
            DEFAULT: '#FAF8F5',
            card: '#F2ECE1',
            borda: '#E2D9C8',
          },
          tinta: {
            DEFAULT: '#0F172A',
            card: '#172036',
            elevado: '#1E293B',
          },
          grafite: {
            DEFAULT: '#1E293B',
            suave: '#475569',
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
