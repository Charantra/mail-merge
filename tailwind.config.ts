import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './mail-merge/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-titillium)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
