import { cn } from './utils'

/**
 * Abas com "cara de botão" (controle segmentado): bandeja branca com sombra; a aba ativa em grafite.
 * Usado por AbasNavegacao, AbasComercial, as visões dos relatórios e o componente Tabs.
 */
export const bandejaAbas =
  'mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

export const classeAba = (ativa: boolean) =>
  cn(
    'shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    ativa ? 'bg-grafite text-white shadow-sm' : 'text-grafite/75 hover:bg-fundo hover:text-grafite',
  )
