import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Tokens da identidade visual ONPrint
        petroleo: { DEFAULT: '#0B4F5C', escuro: '#083B45' },
        // DEFAULT/claro: decorativo (barras, bordas, fundo escuro); escuro: texto e botões sobre fundo claro (contraste AA)
        turquesa: { DEFAULT: '#14B8A6', claro: '#2DD4BF', escuro: '#0F766E', hover: '#115E59' },
        fundo: '#F1F4F6',
        coral: { DEFAULT: '#EF5A57', escuro: '#C8322F' },
        verde: '#22C55E',
        ambar: '#F59E0B',
        texto: { DEFAULT: '#1F2937', secundario: '#5B6472' },
        // Variáveis do shadcn/ui
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        suave: '0 1px 3px rgba(16, 24, 40, 0.06), 0 4px 16px rgba(16, 24, 40, 0.06)',
      },
    },
  },
  plugins: [animate],
} satisfies Config
