import type { Config } from 'tailwindcss'

// Colours are CSS variables (see globals.css) so the light and dark themes share one set of class names.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  content: ['./src/components/**/*.{ts,tsx}', './src/app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        surface: v('surface'),
        card: v('card'),
        raised: v('raised'),
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), faint: v('ink-faint') },
        line: v('line'),
        track: v('track'),
        fill: v('fill'),
        sheet: v('sheet'),
        hero: { DEFAULT: v('hero'), ink: v('hero-ink') },
        accent: { DEFAULT: v('accent'), strong: v('accent-strong') },
        tint: { DEFAULT: v('tint'), 2: v('tint-2'), ink: v('tint-ink') },
        link: v('link'),
        gain: v('gain'),
        loss: { DEFAULT: v('loss'), tint: v('loss-tint'), 'tint-2': v('loss-tint-2') },
        good: { tint: v('good-tint'), line: v('good-line') },
        warn: { 600: v('warn'), tint: v('warn-tint'), line: v('warn-line') },
      },
      boxShadow: { card: 'var(--shadow-card)', float: 'var(--shadow-float)' },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
export default config
