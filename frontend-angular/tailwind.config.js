/** @type {import('tailwindcss').Config} */
/*
 * FoleniChap design tokens.
 * brand  - calm, deep emerald: trust + money ("paid", "go"). Primary actions use 700 for AA contrast on white.
 * ink    - neutral slate with a faint green cast for text, borders and surfaces.
 * accent - warm amber, used sparingly for attention (your turn, pending payment).
 * Semantic colours (success/warning/danger/info) map onto these so status reads the same everywhere.
 */
const v = name => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effaf5', 100: '#d7f2e5', 200: '#b1e4cd', 300: '#7ccfae', 400: '#45b48b',
          500: '#209a70', 600: '#137d5a', 700: '#0f6549', 800: '#0e513c', 900: '#0c4333', 950: '#05261d'
        },
        // ink flips between light and dark theme via CSS variables (see styles.css).
        ink: {
          DEFAULT: v('ink'), soft: v('ink-soft'),
          50: v('ink-50'), 100: v('ink-100'), 200: v('ink-200'), 300: v('ink-300'), 400: v('ink-400'),
          500: v('ink-500'), 600: v('ink-600'), 700: v('ink-700'), 800: v('ink-800'), 900: v('ink-900'), 950: v('ink-950')
        },
        // night - fixed dark neutrals for surfaces that are always dark (TV board, hero panels) in both themes.
        night: {
          50: '#f6f8f7', 100: '#eef2f0', 200: '#dfe5e2', 300: '#c3cdc9', 400: '#93a09b',
          500: '#6a7873', 600: '#4c5955', 700: '#38433f', 800: '#25302c', 900: '#14201c', 950: '#0a1310'
        },
        // surface - cards, panels, inputs (white in light theme, raised dark in dark theme).
        surface: v('surface'),
        accent: { 50: '#fff8eb', 100: '#ffedc7', 200: '#ffd98a', 300: '#ffc14d', 400: '#f5a524', 500: '#dd860b', 600: '#b86407', 700: '#924a0b' }
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif']
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }]
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem', '3xl': '1.5rem' },
      boxShadow: {
        card: '0 1px 2px rgba(20,32,28,.04), 0 1px 3px rgba(20,32,28,.06)',
        lift: '0 2px 4px rgba(20,32,28,.04), 0 12px 32px -8px rgba(20,32,28,.14)',
        focus: '0 0 0 3px rgba(32,154,112,.28)'
      },
      keyframes: {
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(32,154,112,.55)' }, '100%': { boxShadow: '0 0 0 28px rgba(32,154,112,0)' } },
        slideIn: { '0%': { transform: 'translateY(-8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        fadeUp: { '0%': { transform: 'translateY(6px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } }
      },
      animation: {
        'pulse-ring': 'pulseRing 1.4s ease-out infinite',
        'slide-in': 'slideIn .2s ease-out',
        'fade-up': 'fadeUp .3s ease-out both'
      }
    }
  },
  plugins: []
};
