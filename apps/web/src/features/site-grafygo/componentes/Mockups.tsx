import { ArrowUpRight, Check, ClipboardList, Factory, LayoutDashboard, MessageCircle, Palette, Search, ShoppingBag, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Ilustrações do produto feitas em código (não são capturas): nítidas em qualquer tela, com dados fictícios.
 * Decorativas: o texto ao lado explica o recurso (aria-hidden).
 */

function Janela({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl bg-white shadow-[0_2rem_4rem_-1.5rem_rgba(2,26,64,0.35)] ring-1 ring-slate-900/10', className)} aria-hidden="true">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[0.625rem] text-slate-400 ring-1 ring-slate-200">app.grafygo.com.br</span>
      </div>
      {children}
    </div>
  )
}

const KPIS = [
  { rotulo: 'Vendas do mês', valor: 'R$ 48.920', variacao: '+18%', serie: [30, 42, 38, 51, 47, 60, 72] },
  { rotulo: 'Orçamentos abertos', valor: '23', variacao: 'R$ 31 mil', serie: [20, 18, 26, 22, 30, 28, 34] },
  { rotulo: 'Em produção', valor: '14', variacao: '3 hoje', serie: [8, 12, 10, 14, 11, 15, 14] },
  { rotulo: 'A receber', valor: 'R$ 12.340', variacao: '7 dias', serie: [40, 35, 44, 38, 30, 34, 28] },
]

function Mini({ serie }: { serie: number[] }) {
  const max = Math.max(...serie)
  const pontos = serie.map((v, i) => `${(i / (serie.length - 1)) * 100},${30 - (v / max) * 26}`).join(' ')
  return (
    <svg viewBox="0 0 100 32" className="mt-2 h-6 w-full" preserveAspectRatio="none">
      <polyline points={pontos} fill="none" stroke="#0265DC" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const COLUNAS = [
  { titulo: 'Arte', cor: 'bg-violet-500', cards: [{ t: 'Fachada ACM 4×1 m', c: 'Padaria Pão Quente', p: 'Seg' }] },
  {
    titulo: 'Impressão',
    cor: 'bg-sky-500',
    cards: [
      { t: 'Banner lona 3×1 m', c: 'Mercado Bom Preço', p: 'Hoje' },
      { t: 'Adesivo vitrine', c: 'Ótica Visão', p: 'Amanhã' },
    ],
  },
  { titulo: 'Acabamento', cor: 'bg-amber-500', cards: [{ t: 'Cartões 1.000 un', c: 'Dra. Ana Lima', p: 'Hoje' }] },
]

/** Painel do sistema: indicadores do mês e o kanban da produção */
export function MockPainel({ className }: { className?: string }) {
  return (
    <Janela className={className}>
      <div className="flex">
        <div className="hidden w-14 shrink-0 flex-col items-center gap-3 bg-[#0B1B33] py-4 sm:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0265DC] text-xs font-black text-white">G</span>
          {[LayoutDashboard, ClipboardList, Factory, ShoppingBag, Wallet].map((I, i) => (
            <span key={i} className={cn('flex h-8 w-8 items-center justify-center rounded-lg', i === 0 ? 'bg-white/15 text-white' : 'text-white/50')}>
              <I className="h-4 w-4" />
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 bg-slate-50 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.625rem] text-slate-500">Bom dia, Carla</p>
              <p className="truncate text-sm font-extrabold text-slate-900">Visão geral</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[0.625rem] text-slate-400 ring-1 ring-slate-200">
              <Search className="h-3 w-3" /> Localizar…
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {KPIS.map((k) => (
              <div key={k.rotulo} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <p className="truncate text-[0.5625rem] font-medium uppercase tracking-wide text-slate-500">{k.rotulo}</p>
                <p className="mt-1 text-sm font-extrabold text-slate-900 sm:text-base">{k.valor}</p>
                <p className="flex items-center gap-0.5 text-[0.5625rem] font-semibold text-emerald-600">
                  <ArrowUpRight className="h-2.5 w-2.5" />
                  {k.variacao}
                </p>
                <Mini serie={k.serie} />
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <p className="text-[0.625rem] font-bold text-slate-900">Produção</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {COLUNAS.map((col) => (
                <div key={col.titulo} className="min-w-0 rounded-lg bg-slate-50 p-2">
                  <p className="flex items-center gap-1 text-[0.5625rem] font-bold text-slate-600">
                    <span className={cn('h-1.5 w-1.5 rounded-full', col.cor)} /> {col.titulo}
                  </p>
                  <div className="mt-1.5 space-y-1.5">
                    {col.cards.map((c) => (
                      <div key={c.t} className="rounded-md bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
                        <p className="truncate text-[0.5625rem] font-semibold text-slate-900">{c.t}</p>
                        <p className="truncate text-[0.5rem] text-slate-500">{c.c}</p>
                        <p className={cn('mt-0.5 inline-block rounded px-1 text-[0.5rem] font-bold', c.p === 'Hoje' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600')}>{c.p}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Janela>
  )
}

function Celular({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[2.25rem] bg-[#0B1B33] p-2 shadow-[0_2rem_4rem_-1.5rem_rgba(2,26,64,0.5)]', className)} aria-hidden="true">
      <div className="relative overflow-hidden rounded-[1.75rem] bg-white">
        <div className="absolute left-1/2 top-1.5 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-[#0B1B33]" />
        {children}
      </div>
    </div>
  )
}

/** O cliente aprova o orçamento pelo celular */
export function MockAprovacao({ className }: { className?: string }) {
  return (
    <Celular className={className}>
      <div className="bg-[#0265DC] px-4 pb-4 pt-8 text-white">
        <p className="text-[0.625rem] opacity-80">Gráfica Horizonte</p>
        <p className="text-sm font-extrabold">Orçamento ORC-0142</p>
      </div>
      <div className="space-y-2 p-4">
        {[
          ['Banner lona 440 g · 3×1 m', 'R$ 210,00'],
          ['Adesivo vinil · 2×0,5 m', 'R$ 140,00'],
          ['Instalação', 'R$ 90,00'],
        ].map(([d, v]) => (
          <div key={d} className="flex justify-between gap-2 border-b border-slate-100 pb-2 text-[0.625rem]">
            <span className="text-slate-700">{d}</span>
            <span className="shrink-0 font-semibold text-slate-900">{v}</span>
          </div>
        ))}
        <div className="flex items-end justify-between pt-1">
          <span className="text-[0.625rem] text-slate-500">Total</span>
          <span className="text-lg font-extrabold text-slate-900">R$ 440,00</span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-white">
          <Check className="h-3.5 w-3.5" /> Aprovar orçamento
        </div>
        <div className="rounded-xl py-2 text-center text-[0.625rem] font-semibold text-slate-500 ring-1 ring-slate-200">Pedir ajuste</div>
      </div>
    </Celular>
  )
}

/** A vitrine no celular e o link compartilhado no WhatsApp */
export function MockVitrine({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)} aria-hidden="true">
      <Celular className="mx-auto w-[15.5rem]">
        <div className="flex items-center justify-between px-3 pb-2 pt-7">
          <span className="flex items-center gap-1.5 text-[0.6875rem] font-extrabold text-slate-900">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-700 text-[0.5625rem] text-white">H</span> Horizonte
          </span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-white">
            <ClipboardList className="h-3 w-3" />
          </span>
        </div>
        <div className="mx-3 rounded-xl bg-gradient-to-br from-teal-600 to-teal-900 px-3 py-4 text-white">
          <p className="text-[0.6875rem] font-extrabold">Sua marca em destaque</p>
          <p className="text-[0.5rem] opacity-80">Banners, adesivos e impressos</p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {[
            { n: 'Banner em lona', p: 'R$ 45,00 / m²', c: 'from-sky-500 to-sky-800' },
            { n: 'Cartão de visita', p: 'R$ 120,00 / mil', c: 'from-violet-500 to-indigo-800' },
            { n: 'Adesivo vinil', p: 'R$ 60,00 / m²', c: 'from-rose-500 to-red-800' },
            { n: 'Caneca', p: 'R$ 25,00 / un', c: 'from-amber-400 to-orange-700' },
          ].map((x) => (
            <div key={x.n}>
              <div className={cn('aspect-square rounded-lg bg-gradient-to-br', x.c)} />
              <p className="mt-1 truncate text-[0.5625rem] font-semibold text-slate-900">{x.n}</p>
              <p className="text-[0.5rem] font-bold text-slate-700">{x.p}</p>
            </div>
          ))}
        </div>
      </Celular>
      {/* Prévia do link no WhatsApp */}
      <div className="absolute -bottom-6 -left-2 w-52 rounded-2xl bg-[#E7FFDB] p-1.5 shadow-xl ring-1 ring-black/5 sm:-left-10">
        <div className="overflow-hidden rounded-xl bg-white/80">
          <div className="h-16 bg-gradient-to-br from-sky-500 to-sky-800" />
          <div className="p-2">
            <p className="text-[0.5625rem] font-bold text-slate-900">Banner em lona · R$ 45,00/m²</p>
            <p className="text-[0.5rem] text-slate-500">horizonte.grafygo.com.br</p>
          </div>
        </div>
        <p className="px-1 pt-1 text-[0.5625rem] text-slate-700">Olá! Tenho interesse no banner 👋</p>
      </div>
      <div className="absolute -right-1 top-10 flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-[0.625rem] font-bold text-[#0B3B1F] shadow-lg sm:-right-6">
        <MessageCircle className="h-3.5 w-3.5" /> Pedir pelo WhatsApp
      </div>
    </div>
  )
}

/** Arte enviada e aprovada (cartão pequeno para a seção de recursos) */
export function MockArte({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl bg-white p-3 shadow-lg ring-1 ring-slate-900/10', className)} aria-hidden="true">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
          <Palette className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[0.6875rem] font-bold text-slate-900">Arte v2 · Fachada</p>
          <p className="text-[0.5625rem] text-emerald-600">Aprovada pelo cliente · 14:32</p>
        </div>
      </div>
    </div>
  )
}
