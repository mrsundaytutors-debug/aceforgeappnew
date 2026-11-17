import type { Config } from 'tailwindcss'
export default { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: { colors: { navy: { DEFAULT: '#0b1f4b', 700: '#16336f' }, gold: '#f59e0b' } } }, plugins: [] } satisfies Config
