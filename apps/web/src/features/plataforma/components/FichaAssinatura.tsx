import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  CalendarPlus,
  CircleDollarSign,
  CreditCard,
  Crown,
  FileText,
  Gift,
  Hourglass,
  Layers,
  Lock,
  type LucideIcon,
  Receipt,
  RotateCcw,
  Sparkles,
  TicketPercent,
  Unlock,
  Wallet,
  XCircle,
  Zap,
  Circle,
} from 'lucide-react'
import { formatarData, formatarDataHora, formatarDataSimples, formatarMoeda, type EmpresaPlataformaDetalhe } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { META_ACAO, useExecutarAcao, type PedidoAcao, type TipoAcao } from './acoes'
import { Secao } from './Secao'

type Cobranca = EmpresaPlataformaDetalhe['cobrancas'][number]

// ─── Ações agrupadas ──────────────────────────────────────────────────────

const ICONE_ACAO: Partial<Record<TipoAcao, LucideIcon>> = {
  cortesia: Crown,
  encerrar_cortesia: Crown,
  meses_gratis: Gift,
  aplicar_cupom: TicketPercent,
  remover_cupom: TicketPercent,
  cobranca_manual: Receipt,
  registrar_pagamento: CircleDollarSign,
  liberar_ate: CalendarPlus,
  ativar: Sparkles,
  teste_ate: Hourglass,
  atraso_desde: CalendarClock,
  plano: ArrowLeftRight,
  modulos_extras: Layers,
  bloquear: Lock,
  desbloquear: Unlock,
  cancelar: XCircle,
  reativar: RotateCcw,
}

/** Botões das ações do suporte, em três grupos (benefícios, cobrança, plano e acesso). */
export function AcoesFicha({ empresa: e, onPedir }: { empresa: EmpresaPlataformaDetalhe; onPedir: (p: PedidoAcao) => void }) {
  const a = e.assinatura
  if (!a) return null
  const cancelada = e.situacao === 'cancelada'
  const cortesia = e.situacao === 'cortesia'
  const grupos: { titulo: string; tom: string; acoes: TipoAcao[] }[] = [
    { titulo: 'Benefícios', tom: 'text-violet-700', acoes: cancelada ? [] : [cortesia ? 'encerrar_cortesia' : 'cortesia', ...(cortesia ? [] : (['meses_gratis', 'aplicar_cupom'] as TipoAcao[]))] },
    { titulo: 'Cobrança', tom: 'text-marca-escuro', acoes: ['cobranca_manual', 'registrar_pagamento', 'liberar_ate', 'ativar', 'teste_ate', 'atraso_desde'] },
    { titulo: 'Plano e acesso', tom: 'text-tinta', acoes: ['plano', 'modulos_extras', a.bloqueioManual ? 'desbloquear' : 'bloquear', cancelada ? 'reativar' : 'cancelar'] },
  ]
  const pedir = (tipo: TipoAcao) => onPedir({ tipo, empresa: { id: e.id, nome: e.nome, planoCodigo: a.planoCodigo, modulosExtras: a.modulosExtras } })

  return (
    <Secao titulo="Ações do suporte" subtitulo="Tudo fica no histórico com o seu e-mail." icone={Zap}>
      <div className="grid gap-5 md:grid-cols-3">
        {grupos
          .filter((g) => g.acoes.length > 0)
          .map((g) => (
            <div key={g.titulo} className="min-w-0">
              <p className={cn('mb-2 text-xs font-bold uppercase tracking-[0.14em]', g.tom)}>{g.titulo}</p>
              <ul className="space-y-1.5">
                {g.acoes.map((t) => {
                  const Icone = ICONE_ACAO[t] ?? Circle
                  const perigo = META_ACAO[t].perigo
                  return (
                    <li key={t}>
                      <button
                        type="button"
                        onClick={() => pedir(t)}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ring-1 transition-colors',
                          perigo ? 'text-coral-escuro ring-coral/30 hover:bg-coral/5' : 'text-tinta ring-border hover:bg-marca-suave hover:ring-marca/40',
                        )}
                      >
                        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', perigo ? 'bg-coral/10' : 'bg-fundo group-hover:bg-white')}>
                          <Icone className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{META_ACAO[t].rotulo}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
      </div>
    </Secao>
  )
}

// ─── Benefícios em vigor ──────────────────────────────────────────────────

const mesAno = (iso: string) => formatarDataSimples(iso).slice(3)

/** Cortesia, cupom e liberação manual em vigor, cada um com o botão de desfazer. */
export function BeneficiosFicha({ empresa: e, onPedir }: { empresa: EmpresaPlataformaDetalhe; onPedir: (p: PedidoAcao) => void }) {
  const executar = useExecutarAcao()
  const a = e.assinatura
  if (!a) return null
  const ref = { id: e.id, nome: e.nome, planoCodigo: a.planoCodigo }
  const nada = !a.cortesia && !a.cupom && !a.liberadoAte

  return (
    <Secao titulo="Benefícios" subtitulo="O que a empresa tem de vantagem hoje." icone={Gift}>
      <div className="space-y-3">
        {a.cortesia && (
          <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-violet-800 p-4 text-white shadow-sm">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4" aria-hidden="true" />
              <p className="font-titulo font-extrabold">Cortesia</p>
              <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">{a.cortesia.ate ? `até ${formatarDataSimples(a.cortesia.ate)}` : 'sem prazo'}</span>
            </div>
            {a.cortesia.motivo && <p className="mt-2 text-sm text-white/80">“{a.cortesia.motivo}”</p>}
            <Button size="sm" variant="ghost" className="mt-3 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => onPedir({ tipo: 'encerrar_cortesia', empresa: ref })}>
              Encerrar cortesia
            </Button>
          </div>
        )}
        {a.cupom && (
          <div className="rounded-2xl bg-laranja-suave p-4 ring-1 ring-laranja/30">
            <div className="flex items-center gap-2">
              <TicketPercent className="h-4 w-4 text-laranja-escuro" aria-hidden="true" />
              <p className="font-mono text-base font-bold tracking-wide text-tinta">{a.cupom.codigo}</p>
              <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-bold text-laranja-escuro ring-1 ring-laranja/30">−{formatarMoeda(a.cupom.desconto)}/mês</span>
            </div>
            <p className="mt-1.5 text-sm text-tinta">{a.cupom.descricao}</p>
            <p className="mt-1 text-xs text-texto-secundario">
              {/* Sem "desde": a janela só é fixada na 1ª mensalidade gerada com o cupom */}
              {!a.cupom.desde ? `Começa na próxima mensalidade gerada · ${a.cupom.duracaoMeses == null ? 'para sempre' : a.cupom.duracaoMeses === 1 ? '1 mensalidade' : `${a.cupom.duracaoMeses} mensalidades`}` : a.cupom.ate ? `Mensalidades de ${mesAno(a.cupom.desde)} a ${mesAno(a.cupom.ate)}` : `A partir de ${mesAno(a.cupom.desde)}, para sempre`}
            </p>
            <Button size="sm" variant="ghost" className="mt-3 text-coral-escuro hover:text-coral-escuro" onClick={() => onPedir({ tipo: 'remover_cupom', empresa: ref })}>
              Remover cupom
            </Button>
          </div>
        )}
        {a.liberadoAte && (
          <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
            <div className="flex items-center gap-2">
              <Unlock className="h-4 w-4 text-sky-700" aria-hidden="true" />
              <p className="font-semibold text-tinta">Liberado pelo suporte</p>
              <span className="ml-auto text-xs font-semibold text-sky-800">até {formatarDataSimples(a.liberadoAte)}</span>
            </div>
            <p className="mt-1 text-xs text-texto-secundario">Acesso normal até a data, mesmo com atraso.</p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => void executar(e.id, { acao: 'liberar_ate', data: null })}>
              Remover liberação
            </Button>
          </div>
        )}
        {nada && (
          <div className="rounded-2xl border border-dashed border-border p-4 text-center">
            <p className="text-sm text-texto-secundario">Nenhum benefício em vigor.</p>
            {e.situacao !== 'cancelada' && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="outline" onClick={() => onPedir({ tipo: 'aplicar_cupom', empresa: ref })}>
                  <TicketPercent /> Cupom
                </Button>
                <Button size="sm" variant="outline" onClick={() => onPedir({ tipo: 'meses_gratis', empresa: ref })}>
                  <Gift /> Mês grátis
                </Button>
                <Button size="sm" variant="outline" onClick={() => onPedir({ tipo: 'cortesia', empresa: ref })}>
                  <Crown /> Cortesia
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Secao>
  )
}

// ─── Mensalidades ─────────────────────────────────────────────────────────

const SITUACAO_COBRANCA: Record<Cobranca['situacao'], { rotulo: string; ponto: string; texto: string }> = {
  pendente: { rotulo: 'Em aberto', ponto: 'bg-sky-500', texto: 'text-tinta' },
  vencida: { rotulo: 'Vencida', ponto: 'bg-coral', texto: 'text-coral-escuro' },
  paga: { rotulo: 'Paga', ponto: 'bg-marca', texto: 'text-marca-escuro' },
  cancelada: { rotulo: 'Cancelada', ponto: 'bg-slate-300', texto: 'text-texto-secundario' },
  estornada: { rotulo: 'Estornada', ponto: 'bg-amber-500', texto: 'text-amber-800' },
  abonada: { rotulo: 'Abonada', ponto: 'bg-violet-500', texto: 'text-violet-800' },
}
const FORMA_COBRANCA: Record<string, string> = { PIX: 'PIX', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão', manual: 'Manual', UNDEFINED: 'PIX ou boleto' }

/** Cobranças da empresa: desconto de cupom, abono (com motivo) e o botão "Abonar" nas que estão em aberto. */
export function CobrancasFicha({ empresa: e, onPedir }: { empresa: EmpresaPlataformaDetalhe; onPedir: (p: PedidoAcao) => void }) {
  return (
    <Secao titulo="Mensalidades e cobranças" subtitulo={e.cobrancas.length ? `${e.cobrancas.length} cobrança(s), mais recentes primeiro.` : 'Nenhuma cobrança gerada ainda.'} icone={Receipt}>
      {e.cobrancas.length > 0 && (
        <div className="relative -mx-5 overflow-x-auto sm:-mx-7">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-texto-secundario">
                <th className="py-2 pl-5 pr-3 sm:pl-7">Vencimento</th>
                <th className="px-3">Valor</th>
                <th className="px-3">Situação</th>
                <th className="px-3">Pagamento</th>
                <th className="pl-3 pr-5 text-right sm:pr-7">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {e.cobrancas.map((c) => {
                const s = SITUACAO_COBRANCA[c.situacao]
                const aberta = c.situacao === 'pendente' || c.situacao === 'vencida'
                return (
                  <tr key={c.id} className={cn('align-top', c.situacao === 'vencida' && 'bg-coral/[0.04]')}>
                    <td className="py-3 pl-5 pr-3 sm:pl-7">
                      <span className="font-medium tabular-nums text-tinta">{formatarDataSimples(c.vencimento)}</span>
                      <span className="block text-[11px] text-texto-secundario">{c.tipo === 'proporcional' ? 'Diferença proporcional' : 'Mensalidade'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('font-semibold tabular-nums', c.situacao === 'abonada' || c.situacao === 'cancelada' ? 'text-texto-secundario line-through' : 'text-tinta')}>{formatarMoeda(c.valor)}</span>
                      {c.desconto && Number(c.desconto) > 0 && (
                        <span className="mt-0.5 flex w-max items-center gap-1 rounded-full bg-laranja-suave px-1.5 py-0.5 text-[11px] font-semibold text-laranja-escuro">
                          <TicketPercent className="h-3 w-3" aria-hidden="true" /> −{formatarMoeda(c.desconto)} cupom
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('inline-flex items-center gap-2 font-medium', s.texto)}>
                        <span className={cn('h-2 w-2 rounded-full', s.ponto)} aria-hidden="true" />
                        {s.rotulo}
                      </span>
                      {c.situacao === 'abonada' && c.motivoAbono && <span className="block max-w-[240px] text-xs text-texto-secundario">“{c.motivoAbono}”</span>}
                    </td>
                    <td className="px-3 py-3 text-texto-secundario">
                      {c.situacao === 'paga' ? (
                        <span className="text-tinta">
                          {FORMA_COBRANCA[c.forma ?? ''] ?? c.forma ?? '—'}
                          {c.pagoEm && <span className="block text-xs text-texto-secundario">em {formatarData(c.pagoEm)}</span>}
                        </span>
                      ) : c.falha ? (
                        <span className="text-coral-escuro">{c.falha}</span>
                      ) : (
                        <span>{c.gateway === 'asaas' ? 'Asaas' : 'Manual'}</span>
                      )}
                      {c.notaFiscal && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs">
                          <FileText className="h-3 w-3" aria-hidden="true" />
                          {c.notaFiscal.linkPdf ? (
                            <a href={c.notaFiscal.linkPdf} target="_blank" rel="noopener noreferrer" className="text-marca-escuro hover:underline">
                              Nota {c.notaFiscal.numero ?? ''}
                            </a>
                          ) : (
                            `Nota: ${c.notaFiscal.situacao}`
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right sm:pr-7">
                      <div className="flex justify-end gap-1.5">
                        {c.linkPagamento && aberta && (
                          <Button asChild size="sm" variant="ghost">
                            <a href={c.linkPagamento} target="_blank" rel="noopener noreferrer">
                              Link
                            </a>
                          </Button>
                        )}
                        {aberta && (
                          <Button size="sm" variant="outline" onClick={() => onPedir({ tipo: 'abonar', empresa: { id: e.id, nome: e.nome }, cobranca: { id: c.id, vencimento: c.vencimento, valor: c.valor } })}>
                            <BadgeCheck /> Abonar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  )
}

// ─── Linha do tempo ───────────────────────────────────────────────────────

const TOM_EVENTO = {
  verde: 'bg-marca-suave text-marca-escuro ring-marca/30',
  coral: 'bg-coral/10 text-coral-escuro ring-coral/30',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-300',
  violeta: 'bg-violet-50 text-violet-700 ring-violet-300',
  laranja: 'bg-laranja-suave text-laranja-escuro ring-laranja/30',
  azul: 'bg-sky-50 text-sky-700 ring-sky-300',
  cinza: 'bg-fundo text-tinta ring-border',
} as const

/** Ícone e cor de cada tipo de evento ("suporte_x" usa o mesmo de "x"). */
function estiloEvento(tipo: string): { Icone: LucideIcon; tom: keyof typeof TOM_EVENTO } {
  const t = tipo.replace(/^suporte_/, '')
  if (t === 'pagamento' || t === 'registrar_pagamento') return { Icone: CircleDollarSign, tom: 'verde' }
  if (t.startsWith('falha')) return { Icone: CreditCard, tom: 'coral' }
  if (t === 'cobranca_vencida' || t === 'vencida' || t === 'atraso_desde') return { Icone: AlertTriangle, tom: 'ambar' }
  if (t.includes('cupom')) return { Icone: TicketPercent, tom: 'laranja' }
  if (t.startsWith('abon')) return { Icone: BadgeCheck, tom: 'violeta' }
  if (t === 'meses_gratis') return { Icone: Gift, tom: 'violeta' }
  if (t.includes('cortesia')) return { Icone: Crown, tom: 'violeta' }
  if (t.startsWith('plano')) return { Icone: ArrowLeftRight, tom: 'azul' }
  if (t.startsWith('cancel')) return { Icone: XCircle, tom: 'cinza' }
  if (['ativacao', 'ativar', 'reativacao', 'reativar', 'situacao'].includes(t)) return { Icone: Sparkles, tom: 'verde' }
  if (['bloquear', 'bloqueada', 'somente_leitura'].includes(t)) return { Icone: Lock, tom: 'coral' }
  if (['desbloquear', 'liberacao', 'liberar_ate'].includes(t)) return { Icone: Unlock, tom: 'azul' }
  if (t === 'forma_pagamento') return { Icone: Wallet, tom: 'cinza' }
  if (t === 'assinatura_online') return { Icone: Zap, tom: 'verde' }
  if (t === 'criada' || t === 'cadastro') return { Icone: Building2, tom: 'cinza' }
  if (t.startsWith('nota_fiscal')) return { Icone: FileText, tom: t.endsWith('erro') ? 'coral' : 'cinza' }
  if (t.startsWith('teste')) return { Icone: Hourglass, tom: 'azul' }
  if (t === 'cobranca_manual' || t === 'mensalidade' || t === 'proporcional') return { Icone: Receipt, tom: 'cinza' }
  if (t === 'modulos_extras') return { Icone: Layers, tom: 'cinza' }
  return { Icone: Circle, tom: 'cinza' }
}

interface ItemLinha {
  id: string
  tipo: string
  data: string
  titulo: string
  detalhe?: string
  autor?: string
}

/** Junta o histórico da assinatura com os pagamentos e falhas das cobranças, do mais novo ao mais antigo. */
function montarLinha(e: EmpresaPlataformaDetalhe): ItemLinha[] {
  const itens: ItemLinha[] = e.eventos.map((ev) => ({ id: ev.id, tipo: ev.tipo, data: ev.data, titulo: ev.descricao, autor: ev.autor }))
  for (const c of e.cobrancas) {
    const nome = c.tipo === 'proporcional' ? 'diferença proporcional' : `mensalidade de ${formatarDataSimples(c.vencimento)}`
    if (c.situacao === 'paga' && c.pagoEm)
      itens.push({ id: `pg-${c.id}`, tipo: 'pagamento', data: c.pagoEm, titulo: `Pagamento de ${formatarMoeda(c.valor)} recebido`, detalhe: `${nome.charAt(0).toUpperCase()}${nome.slice(1)} · ${FORMA_COBRANCA[c.forma ?? ''] ?? c.forma ?? ''}`, autor: c.gateway === 'asaas' ? 'Asaas' : 'manual' })
    if (c.falha) itens.push({ id: `fl-${c.id}`, tipo: 'falha_pagamento', data: `${c.vencimento}T12:00:00`, titulo: `Falha no pagamento (${formatarMoeda(c.valor)})`, detalhe: c.falha })
    if (c.situacao === 'vencida') itens.push({ id: `vc-${c.id}`, tipo: 'cobranca_vencida', data: `${c.vencimento}T23:59:00`, titulo: `Venceu sem pagamento: ${nome} (${formatarMoeda(c.valor)})` })
  }
  return itens.sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : 0))
}

export function LinhaDoTempo({ empresa: e }: { empresa: EmpresaPlataformaDetalhe }) {
  const [tudo, setTudo] = useState(false)
  const itens = montarLinha(e)
  const visiveis = tudo ? itens : itens.slice(0, 12)
  return (
    <Secao titulo="Linha do tempo" subtitulo="Pagamentos, cobranças e tudo o que mudou na assinatura." icone={CalendarClock}>
      {itens.length === 0 ? (
        <p className="text-sm text-texto-secundario">Nada registrado ainda.</p>
      ) : (
        <ol className="relative">
          {visiveis.map((it, i) => {
            const { Icone, tom } = estiloEvento(it.tipo)
            return (
              <li key={it.id} className="relative flex gap-3 pb-5 last:pb-0">
                {i < visiveis.length - 1 && <span className="absolute bottom-0 left-[15px] top-8 w-px bg-border" aria-hidden="true" />}
                <span className={cn('relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1', TOM_EVENTO[tom])}>
                  <Icone className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-sm font-medium text-tinta">{it.titulo}</p>
                  {it.detalhe && <p className="text-xs text-texto-secundario">{it.detalhe}</p>}
                  <p className="mt-0.5 text-xs text-texto-secundario">
                    {formatarDataHora(it.data)}
                    {it.autor && ` · ${it.autor}`}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {itens.length > 12 && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setTudo((x) => !x)}>
          {tudo ? 'Mostrar menos' : `Mostrar tudo (${itens.length})`}
        </Button>
      )}
    </Secao>
  )
}
