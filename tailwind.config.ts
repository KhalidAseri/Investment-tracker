import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/components/**/*.{ts,tsx}', './src/app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', 'Inter', 'system-ui', 'sans-serif'] },
      colors: {
        surface: '#f5f5f2',
        ink: { DEFAULT: '#0b0b0b', soft: '#52514e', faint: '#8a897f' },
        line: '#e6e5e0',
        brand: { 50: '#eef7f5', 100: '#d5ebe6', 500: '#14806f', 600: '#0f6b5d', 700: '#0c574c', 900: '#083a33' },
        gain: '#12733a',
        loss: '#b3261e',
        warn: { 50: '#fff7e6', 600: '#9a5b00' },
      },
      boxShadow: { card: '0 1px 2px rgba(11,11,11,0.04), 0 1px 1px rgba(11,11,11,0.03)' },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
export default config
