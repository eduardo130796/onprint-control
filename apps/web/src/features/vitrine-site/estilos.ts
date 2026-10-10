/** Classes compartilhadas do site (fora dos componentes, para o recarregamento rápido do Vite) */

export const classeGrade = 'grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-y-10'

/** Link com cara de botão (as variações do site) */
export const botao = {
  base: 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 [&_svg]:h-[1.125rem] [&_svg]:w-[1.125rem] [&_svg]:shrink-0',
  primario: 'bg-marca text-marca-contraste shadow-sm shadow-marca/30 hover:bg-marca-hover',
  escuro: 'bg-slate-900 text-white hover:bg-slate-800',
  contorno: 'border border-slate-300 bg-white text-slate-900 hover:border-slate-900',
  whatsapp: 'bg-[#25D366] text-[#0B3B1F] hover:bg-[#1EBE5A]',
  claro: 'bg-white text-slate-900 hover:bg-slate-100',
  md: 'h-11 px-5 text-sm',
  lg: 'h-[3.25rem] px-7 text-[0.9375rem]',
}

/** Fundo pontilhado (retícula de impressão) usado nos destaques coloridos */
export const reticula = { backgroundImage: 'radial-gradient(currentColor 0.0625rem, transparent 0.09rem)', backgroundSize: '1.125rem 1.125rem' }
