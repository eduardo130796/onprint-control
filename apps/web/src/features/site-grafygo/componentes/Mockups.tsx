import { ArrowUpRight, CheckCheck, ChevronLeft, ClipboardList, Factory, FileText, LayoutDashboard, MessageCircle, Phone, Search, ShoppingBag, Video, Wallet, Zap } from 'lucide-react'
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

/** Captura de verdade dentro do aparelho (lazy) */
export function CelularImagem({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn('rounded-[2.25rem] bg-[#0B1B33] p-2 shadow-[0_2rem_4rem_-1.5rem_rgba(2,26,64,0.5)]', className)}>
      <img src={src} alt={alt} width={585} height={1266} loading="lazy" decoding="async" className="block aspect-[585/1266] w-full rounded-[1.75rem] bg-slate-100" />
    </div>
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

// ─── WhatsApp: a conversa como o cliente vê (textos iguais aos das mensagens prontas do sistema) ───

/** *negrito* do WhatsApp */
function Negrito({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*[^*\n]+\*)/g).map((t, i) =>
        t.length > 2 && t.startsWith('*') && t.endsWith('*') ? (
          <strong key={i} className="font-bold">
            {t.slice(1, -1)}
          </strong>
        ) : (
          <span key={i}>{t}</span>
        ),
      )}
    </>
  )
}

function Hora({ hora, lida }: { hora: string; lida?: boolean }) {
  return (
    <span className="float-right ml-2 mt-1 flex translate-y-0.5 items-center gap-0.5 text-[0.5rem] font-normal text-slate-500">
      {hora}
      {lida && <CheckCheck className="h-2.5 w-2.5 text-sky-500" />}
    </span>
  )
}

/** Balão recebido (da gráfica), com a prévia do link no topo quando o link fecha a mensagem */
function BalaoRecebido({ texto, hora, previa }: { texto: string; hora: string; previa?: { titulo: string; site: string } }) {
  return (
    <div className="mr-5 rounded-lg rounded-tl-none bg-white p-1 shadow-sm">
      {previa && (
        <div className="mb-1 flex overflow-hidden rounded-md bg-slate-100">
          <span className="w-1 shrink-0 bg-[#0265DC]" />
          <div className="min-w-0 px-2 py-1">
            <p className="truncate text-[0.5625rem] font-bold text-slate-800">{previa.titulo}</p>
            <p className="truncate text-[0.5rem] text-slate-500">{previa.site}</p>
          </div>
        </div>
      )}
      <p className="whitespace-pre-line break-words px-1 text-[0.5625rem] leading-[1.4] text-slate-800">
        <Negrito texto={texto} />
        <Hora hora={hora} />
      </p>
    </div>
  )
}

function BalaoEnviado({ texto, hora }: { texto: string; hora: string }) {
  return (
    <div className="ml-auto w-fit rounded-lg rounded-tr-none bg-[#D9FDD3] px-2 py-1 shadow-sm">
      <p className="text-[0.625rem] text-slate-800">
        <Negrito texto={texto} />
        <Hora hora={hora} lida />
      </p>
    </div>
  )
}

function BalaoPdf({ nome, hora }: { nome: string; hora: string }) {
  return (
    <div className="mr-5 rounded-lg bg-white p-1 shadow-sm">
      <div className="flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1.5">
        <span className="flex h-6 w-5 shrink-0 items-center justify-center rounded-sm bg-[#E5484D] text-[0.4375rem] font-black text-white">PDF</span>
        <div className="min-w-0">
          <p className="truncate text-[0.5625rem] font-semibold text-slate-800">{nome}</p>
          <p className="text-[0.5rem] text-slate-500">1 página · PDF</p>
        </div>
      </div>
      <p className="px-1 text-right text-[0.5rem] text-slate-500">{hora}</p>
    </div>
  )
}

function TelaWhatsapp({ children, contato }: { children: React.ReactNode; contato: string }) {
  return (
    <>
      <div className="flex items-center gap-2 bg-[#008069] px-2.5 pb-2 pt-7 text-white">
        <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[0.5625rem] font-black text-teal-800">H</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.6875rem] font-bold">{contato}</p>
          <p className="text-[0.5rem] opacity-80">online</p>
        </div>
        <Video className="h-3.5 w-3.5 shrink-0" />
        <Phone className="h-3 w-3 shrink-0" />
      </div>
      <div className="space-y-1.5 bg-[#EFEAE2] px-2 pb-4 pt-2.5">{children}</div>
    </>
  )
}

function Dia({ children }: { children: React.ReactNode }) {
  return <p className="mx-auto w-fit rounded-md bg-white/90 px-2 py-0.5 text-[0.5rem] font-medium text-slate-500 shadow-sm">{children}</p>
}

const ITENS = '• 1× Banner em lona 440 g 3,0 × 1,0 m — R$ 210,00\n• 2× Adesivo vinil 2,0 × 0,5 m — R$ 140,00'

const MSG_ORCAMENTO = `Olá, Mariana!

Segue o seu orçamento *ORC-0142*:
${ITENS}

Total: *R$ 350,00*
Pagamento: Entrada de R$ 175,00 (50%) na aprovação + 1× de R$ 175,00 em 30 dias
Prazo de produção: *3 dias úteis*
Válido até *31/10/2026*

Responda *APROVADO* aqui mesmo ou peça o ajuste que precisar.

— Gráfica Horizonte

Se preferir, veja e aprove pelo link:
https://app.grafygo.com.br/aprovar/…`

const MSG_CONFIRMADO = `Olá, Mariana!

Seu pedido *PED-0098* está confirmado ✅
Total: *R$ 350,00*
Pago: *R$ 175,00* · Falta: *R$ 175,00*
Previsão de entrega: *29/10/2026*

Avisamos por aqui quando estiver pronto.

— Gráfica Horizonte`

const MSG_PRONTO = `Olá, Mariana!

Seu pedido *PED-0098* está *pronto* 📦
${ITENS}

Retirada: Av. Brasil, 120 · Seg a sex, 8h às 18h
Pago: *R$ 175,00* · Falta: *R$ 175,00*
Pix para pagar: *financeiro@horizonte.com.br*

— Gráfica Horizonte

Detalhes do pedido:
https://app.grafygo.com.br/pedido/…`

/** O orçamento chega no WhatsApp com tudo no corpo e o PDF; o cliente responde APROVADO */
export function MockWhatsappOrcamento({ className }: { className?: string }) {
  return (
    <Celular className={className}>
      <TelaWhatsapp contato="Gráfica Horizonte">
        <Dia>Hoje</Dia>
        <BalaoRecebido texto={MSG_ORCAMENTO} hora="09:12" previa={{ titulo: 'Orçamento ORC-0142 · Gráfica Horizonte', site: 'app.grafygo.com.br' }} />
        <BalaoPdf nome="ORC-0142 - Mariana Costa.pdf" hora="09:12" />
        <BalaoEnviado texto="*APROVADO* 👍" hora="09:20" />
      </TelaWhatsapp>
    </Celular>
  )
}

/** Avisos automáticos: pedido confirmado e pedido pronto (retirada, o que falta pagar e a chave Pix) */
export function MockWhatsappPronto({ className }: { className?: string }) {
  return (
    <Celular className={className}>
      <TelaWhatsapp contato="Gráfica Horizonte">
        <Dia>Hoje</Dia>
        <BalaoRecebido texto={MSG_CONFIRMADO} hora="09:22" />
        <Dia>Quinta-feira</Dia>
        <BalaoRecebido texto={MSG_PRONTO} hora="15:40" previa={{ titulo: 'Pedido PED-0098 · Gráfica Horizonte', site: 'app.grafygo.com.br' }} />
        <BalaoEnviado texto="Passo aí às 17h 🙌" hora="15:43" />
      </TelaWhatsapp>
    </Celular>
  )
}

/** Aviso ao vivo no sistema: o cliente aprovou e o orçamento virou pedido */
export function MockAvisoAprovacao({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-900/10', className)} aria-hidden="true">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
        <Zap className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-bold leading-snug text-slate-900">Mariana Costa aprovou o orçamento ORC-0142 · virou o pedido PED-0098</p>
        <p className="mt-1 text-[0.625rem] font-semibold text-[#0265DC]">Abrir pedido</p>
      </div>
    </div>
  )
}

/** Mini conversa do hero: o cliente respondeu APROVADO */
export function MockMiniConversa({ className }: { className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl bg-[#EFEAE2] shadow-xl ring-1 ring-slate-900/10', className)} aria-hidden="true">
      <div className="flex items-center gap-1.5 bg-[#008069] px-2.5 py-1.5 text-white">
        <MessageCircle className="h-3 w-3" />
        <span className="text-[0.5625rem] font-bold">Gráfica Horizonte</span>
      </div>
      <div className="space-y-1.5 p-2">
        <div className="mr-4 whitespace-pre-line rounded-lg rounded-tl-none bg-white px-2 py-1 text-[0.5625rem] leading-snug text-slate-800 shadow-sm">
          <Negrito texto={'Orçamento *ORC-0142*\nTotal: *R$ 350,00*\nResponda *APROVADO* aqui mesmo'} />
        </div>
        <div className="mr-4 flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 shadow-sm">
          <FileText className="h-3 w-3 text-[#E5484D]" />
          <span className="text-[0.5rem] text-slate-600">ORC-0142.pdf</span>
        </div>
        <BalaoEnviado texto="*APROVADO* 👍" hora="09:20" />
      </div>
    </div>
  )
}
