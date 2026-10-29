import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './mail-merge/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#050a30',
          900: '#050a30',
          800: '#0d1446',
          700: '#1a2260',
        },
        orange: {
          DEFAULT: '#ff751f',
          50: '#fff4eb',
          100: '#ffe6d3',
          300: '#ffb080',
          500: '#ff751f',
          600: '#e56a1c',
          700: '#c45512',
          deep: '#e56a1c',
        },
        canvas: '#f6f5f1',
        paper: '#f4f2ec',
        line: '#e8e5dc',
      },
      fontFamily: {
        sans: ['var(--font-titillium)', 'Titillium Web', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(5,10,48,0.04), 0 1px 3px rgba(5,10,48,0.05)',
        lift: '0 12px 32px -12px rgba(5,10,48,0.22), 0 2px 6px rgba(5,10,48,0.05)',
        pop: '0 24px 64px -16px rgba(5,10,48,0.35)',
        glow: '0 0 0 4px rgba(255,117,31,0.16)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'none' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        draw: { from: { strokeDashoffset: '48' }, to: { strokeDashoffset: '0' } },
      },
      animation: {
        'fade-up': 'fade-up 320ms cubic-bezier(0.2,0.8,0.2,1) both',
        'fade-in': 'fade-in 200ms ease-out both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.2,0.8,0.2,1) both',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        draw: 'draw 500ms 150ms ease-out both',
      },
    },
  },
  plugins: [],
}

export default config
