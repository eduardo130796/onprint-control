import type { Config } from 'tailwindcss'
import paleta from 'tailwindcss/colors'
import plugin from 'tailwindcss/plugin'
import animate from 'tailwindcss-animate'

/**
 * Modo escuro: as famílias de cor usadas em selos e avisos viram variáveis; no escuro a escala se inverte
 * (50↔950, 100↔900…), então "fundo claro + texto escuro" vira "fundo escuro + texto claro" com o mesmo contraste.
 */
const FAMILIAS = ['amber', 'sky', 'violet', 'slate', 'red', 'green', 'purple'] as const
const TONS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')
const familia = (nome: string) => Object.fromEntries(TONS.map((t) => [t, `rgb(var(--${nome}-${t}) / <alpha-value>)`]))
const varsFamilias = (inverter: boolean) =>
  Object.fromEntries(
    FAMILIAS.flatMap((f) =>
      TONS.map((t, i) => [`--${f}-${t}`, rgb((paleta[f] as Record<string, string>)[TONS[inverter ? TONS.length - 1 - i : i]] as string)]),
    ),
  )
const cor = (nome: string) => `rgb(var(--${nome}) / <alpha-value>)`

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      fontFamily: {
        // Fonte do texto escolhida pelo usuário (Aparência → Texto); padrão Inter
        sans: ['var(--fonte-texto)'],
        titulo: ['Manrope Variable', 'Manrope', 'Inter Variable', 'system-ui', 'sans-serif'],
      },
      // Pesos por variável: o usuário escolhe texto leve, normal ou forte (aplicarTipografia)
      fontWeight: {
        normal: 'var(--peso-normal)',
        medium: 'var(--peso-medio)',
        semibold: 'var(--peso-semi)',
        bold: 'var(--peso-forte)',
        extrabold: 'var(--peso-extra)',
      },
      colors: {
        // Identidade visual: grafite (cinza escuro) + verde WhatsApp, com laranja em pequenos detalhes
        // Grafite: superfícies escuras (topo, cartões em destaque); no modo escuro, um pouco mais claras que o fundo
        grafite: { DEFAULT: cor('grafite'), escuro: cor('grafite-escuro') },
        // Tinta: texto forte (títulos, valores); escurece no claro e clareia no escuro
        tinta: cor('tinta'),
        ...Object.fromEntries(FAMILIAS.map((f) => [f, familia(f)])),
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
        fundo: cor('fundo'),
        coral: { DEFAULT: '#EF5A57', escuro: cor('coral-escuro') },
        verde: '#22C55E',
        ambar: '#F59E0B',
        texto: { DEFAULT: cor('texto'), secundario: cor('texto-secundario') },
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
  plugins: [
    animate,
    plugin(({ addBase }) => {
      // Superfícies escuras (topo, cartões grafite) já foram desenhadas com tons claros de texto: lá a escala não inverte
      addBase({ ':root': varsFamilias(false), '.dark': varsFamilias(true), '.dark .bg-grafite, .dark .bg-grafite-escuro': varsFamilias(false) })
    }),
  ],
} satisfies Config
