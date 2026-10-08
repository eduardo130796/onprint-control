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
        titulo: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Identidade visual: grafite (cinza escuro) + verde WhatsApp, com laranja em pequenos detalhes
        grafite: { DEFAULT: '#2B3036', escuro: '#1E2226' },
        // Cor da marca: a do tema da empresa (Configurações → Aparência; padrão verde ONPrint), em variáveis RGB
        // para aceitar opacidade (bg-marca/15). DEFAULT: botões, barras, destaques; escuro: texto na cor sobre fundo
        // claro (contraste AA); hover: botão; suave: fundo de destaque; contraste: texto sobre a cor
        marca: {
          DEFAULT: 'rgb(var(--marca) / <alpha-value>)',
          escuro: 'rgb(var(--marca-escuro) / <alpha-value>)',
          hover: 'rgb(var(--marca-hover) / <alpha-value>)',
          suave: 'rgb(var(--marca-suave) / <alpha-value>)',
          contraste: 'rgb(var(--marca-contraste) / <alpha-value>)',
        },
        // DEFAULT: detalhe decorativo; escuro: selos/contadores com texto branco (contraste AA)
        laranja: { DEFAULT: '#F97316', escuro: '#C2410C', suave: '#FFF1E6' },
        fundo: '#F2F4F5',
        coral: { DEFAULT: '#EF5A57', escuro: '#C8322F' },
        verde: '#22C55E',
        ambar: '#F59E0B',
        texto: { DEFAULT: '#1F2328', secundario: '#5A6169' },
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
