import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Arabic-only UI, so the Arabic face is the default everywhere.
        sans: ['var(--font-ibm-plex-arabic)', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
export default config
