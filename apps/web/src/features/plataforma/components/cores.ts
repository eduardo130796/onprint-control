import { CreditCard, QrCode, Receipt, type LucideIcon } from 'lucide-react'
import { CATEGORIA_EMPRESA_ROTULOS, type CategoriaEmpresa } from '@onprint/shared'

/** Nome da situação no singular (selo de uma empresa). */
export const CATEGORIA_SINGULAR: Record<CategoriaEmpresa, string> = { ...CATEGORIA_EMPRESA_ROTULOS, aviso: 'Em atraso', bloqueada: 'Bloqueada', cancelada: 'Cancelada' }

/** Forma de pagamento da assinatura em rótulo curto (tabela e ficha). */
export const FORMA_CURTA: Record<string, { rotulo: string; Icone: LucideIcon }> = {
  pix_automatico: { rotulo: 'PIX Automático', Icone: QrCode },
  cartao: { rotulo: 'Cartão', Icone: CreditCard },
  pix_boleto: { rotulo: 'PIX / boleto', Icone: Receipt },
}

/** Cor de cada situação comercial (selos e indicadores do painel). */
export const COR_CATEGORIA: Record<CategoriaEmpresa, string> = {
  em_dia: 'bg-marca-suave text-marca-escuro ring-marca/30',
  teste: 'bg-sky-50 text-sky-800 ring-sky-300/60',
  cortesia: 'bg-violet-50 text-violet-800 ring-violet-300/60',
  aviso: 'bg-amber-50 text-amber-900 ring-amber-300/70',
  somente_leitura: 'bg-coral/10 text-coral-escuro ring-coral/40',
  bloqueada: 'bg-red-600 text-white ring-red-700',
  cancelada: 'bg-slate-100 text-texto-secundario ring-slate-300',
}

/** Ponto colorido / faixa lateral da linha (mesmo tom do selo, mais forte). */
export const PONTO_CATEGORIA: Record<CategoriaEmpresa, string> = {
  em_dia: 'bg-marca',
  teste: 'bg-sky-500',
  cortesia: 'bg-violet-500',
  aviso: 'bg-amber-500',
  somente_leitura: 'bg-coral',
  bloqueada: 'bg-red-600',
  cancelada: 'bg-slate-400',
}

/** Pílula sobre fundo grafite (cartão escuro da ficha). */
export const PILULA_ESCURA: Record<CategoriaEmpresa, string> = {
  em_dia: 'bg-marca/15 text-marca ring-marca/30',
  teste: 'bg-sky-400/15 text-sky-200 ring-sky-300/30',
  cortesia: 'bg-violet-400/20 text-violet-200 ring-violet-300/40',
  aviso: 'bg-amber-400/15 text-amber-200 ring-amber-300/30',
  somente_leitura: 'bg-coral/20 text-red-200 ring-coral/40',
  bloqueada: 'bg-red-500/25 text-red-100 ring-red-400/50',
  cancelada: 'bg-white/10 text-white/80 ring-white/20',
}

/** Benefício em vigor (chip da tabela e do cartão de benefícios). */
export const COR_BENEFICIO: Record<'cupom' | 'cortesia' | 'liberacao', string> = {
  cupom: 'bg-laranja-suave text-laranja-escuro ring-laranja/30',
  cortesia: 'bg-violet-50 text-violet-800 ring-violet-300/60',
  liberacao: 'bg-sky-50 text-sky-800 ring-sky-300/60',
}
