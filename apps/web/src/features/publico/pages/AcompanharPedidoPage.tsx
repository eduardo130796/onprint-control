import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, Check, CheckCircle2, Clock, FileText, Loader2, MapPin, Maximize2, MessageCircle, Package, Palette, PencilLine, Store, Truck, Wallet, XCircle } from 'lucide-react'
import { formatarDataHora, formatarDataSimples, formatarMoeda, formatarTelefone, type PedidoAcompanhamento } from '@onprint/shared'
import type { LinkPublico } from '@/api/comercial'
import { pedidoPublicoApi } from '@/api/producao'
import { Logo } from '@/components/layout/Logo'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { aplicarTema } from '@/features/aparencia/tema'
import { linkWhatsapp } from '@/features/vitrine-site/formato'
import { cn } from '@/lib/utils'

const metros = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '')
const quantidade = (v: string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/** Meta tag do <head> (cria se faltar) e devolve a limpeza (volta ao conteúdo anterior). */
function definirMeta(nome: string, conteudo: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`)
  const anterior = meta?.content ?? null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = nome
    document.head.appendChild(meta)
  }
  meta.content = conteudo
  return () => {
    if (anterior === null) meta.remove()
    else meta.content = anterior
  }
}

/**
 * Título da aba, descrição, noindex e cor do tema da gráfica. A prévia do link no WhatsApp (Open Graph) vem do
 * servidor: o leitor de link não roda este JavaScript (Caddy/Vite desviam para /publico/pedido-og).
 */
function useCabecalhoDaPagina(a: PedidoAcompanhamento | undefined) {
  useEffect(() => definirMeta('robots', 'noindex, nofollow'), [])
  const titulo = a ? `Pedido ${a.numero} · ${a.empresa.nome}` : 'Acompanhe seu pedido'
  const descricao = a ? `${a.situacao.titulo}. Acompanhe o andamento do seu pedido.` : 'Acompanhe o andamento do seu pedido.'
  useEffect(() => {
    const antes = document.title
    document.title = titulo
    const limpar = definirMeta('description', descricao)
    return () => {
      document.title = antes
      limpar()
    }
  }, [titulo, descricao])
  const corTema = a?.empresa.corTema
  useEffect(() => {
    aplicarTema(corTema)
    return () => aplicarTema(null)
  }, [corTema])
}

function Cabecalho({ a }: { a?: PedidoAcompanhamento }) {
  return (
    <header className="flex h-16 items-center bg-grafite px-4">
      {a?.empresa.logoUrl ? <img src={a.empresa.logoUrl} alt={a.empresa.nome} className="h-10 max-w-[11.25rem] rounded bg-white/90 object-contain p-1" /> : <Logo placa className="h-9" />}
      {a && <span className="ml-3 truncate font-semibold text-white">{a.empresa.nome}</span>}
    </header>
  )
}

function Resumo({ a }: { a: PedidoAcompanhamento }) {
  const final = a.cancelado || a.status === 'entregue'
  return (
    <div className={cn('rounded-2xl p-5', a.cancelado ? 'bg-coral/10' : 'bg-marca text-marca-contraste')}>
      <p className={cn('text-sm', a.cancelado ? 'text-texto-secundario' : 'opacity-90')}>
        Olá, {a.cliente.nome}! Pedido <strong className="font-semibold">{a.numero}</strong>
      </p>
      <h1 className={cn('mt-1 font-titulo text-2xl font-bold', a.cancelado && 'text-coral-escuro')}>{a.situacao.titulo}</h1>
      <p className={cn('text-sm', a.cancelado ? 'text-texto' : 'opacity-90')}>{a.situacao.descricao}</p>
      {!final && (
        <p className="mt-4 flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="h-4 w-4 shrink-0" /> Previsão de entrega: {formatarDataSimples(a.dataPrevistaEntrega)}
        </p>
      )}
    </div>
  )
}

function Etapas({ a }: { a: PedidoAcompanhamento }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-4 font-semibold text-tinta">Andamento</h2>
        <ol>
          {a.etapas.map((e, i) => {
            const ultima = i === a.etapas.length - 1
            return (
              <li key={e.codigo} className="relative flex gap-3 pb-5 last:pb-0" aria-current={e.situacao === 'atual' ? 'step' : undefined}>
                {!ultima && <span className={cn('absolute left-[0.9375rem] top-8 h-[calc(100%-2rem)] w-0.5', e.situacao === 'concluida' ? 'bg-marca' : 'bg-border')} aria-hidden />}
                <span
                  className={cn(
                    'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                    e.situacao === 'concluida' && 'border-marca bg-marca text-marca-contraste',
                    e.situacao === 'atual' && 'border-marca bg-marca-suave text-marca-escuro ring-4 ring-marca/20',
                    e.situacao === 'pendente' && 'border-border bg-card text-texto-secundario',
                  )}
                >
                  {e.situacao === 'concluida' ? <Check className="h-4 w-4" /> : e.situacao === 'atual' ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-marca" /> : <span className="text-xs">{i + 1}</span>}
                </span>
                <div className="min-w-0 pt-1">
                  <p className={cn('font-medium leading-tight', e.situacao === 'pendente' ? 'text-texto-secundario' : 'text-tinta')}>{e.titulo}</p>
                  {e.situacao !== 'pendente' && <p className="text-sm text-texto-secundario">{e.descricao}</p>}
                  {e.quando && e.situacao !== 'pendente' && <p className="text-xs text-texto-secundario">{formatarDataHora(e.quando)}</p>}
                </div>
              </li>
            )
          })}
        </ol>
        {a.cancelado && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-coral/10 p-3 text-sm text-coral-escuro">
            <XCircle className="h-4 w-4 shrink-0" /> Pedido cancelado{a.canceladoEm && ` em ${formatarDataHora(a.canceladoEm)}`}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

type ItemAcompanhamento = PedidoAcompanhamento['itens'][number]
type ArteAcompanhamento = NonNullable<ItemAcompanhamento['arte']>

/** Prévia da arte: a imagem (ou a miniatura do PDF/CDR); toque abre em tamanho real */
function PreviaArte({ arte, descricao }: { arte: ArteAcompanhamento; descricao: string }) {
  const arquivo = arte.arquivo
  const imagem = arquivo?.visualizavel && arquivo.mime.startsWith('image/') ? arquivo.url : arte.miniaturaUrl
  const conteudo = imagem ? (
    <img src={imagem} alt={`Arte: ${descricao}`} className="h-full w-full object-contain" />
  ) : (
    <span className="flex flex-col items-center gap-1 text-texto-secundario">
      <FileText className="h-10 w-10" />
      <span className="text-xs font-medium">{arquivo?.mime === 'application/pdf' ? 'PDF' : 'Arquivo'}</span>
    </span>
  )
  const caixa = 'flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-white'
  return arquivo?.visualizavel ? (
    <a href={arquivo.url} target="_blank" rel="noreferrer" className={cn(caixa, 'group relative')} aria-label={`Abrir a arte de ${descricao} em tamanho real`}>
      {conteudo}
      <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-grafite/80 px-2 py-1 text-xs font-medium text-white">
        <Maximize2 className="h-3 w-3" /> {arquivo.mime === 'application/pdf' ? 'Abrir PDF' : 'Ampliar'}
      </span>
    </a>
  ) : (
    <div className={caixa}>{conteudo}</div>
  )
}

/**
 * Seção "Artes" (#artes, o link da mensagem do WhatsApp): todas as artes do pedido, "Aprovar todas" num toque e
 * "Pedir ajuste" em cada uma. Só aparece enquanto alguma arte aguarda o cliente e o pedido ainda está na etapa
 * da arte (aprovacaoArte.mostrar): em produção, pronto, entregue ou cancelado não pede mais nada.
 */
function ArtesDoPedido({ a, link, onRespondido }: { a: PedidoAcompanhamento; link: LinkPublico; onRespondido: (r: PedidoAcompanhamento, aviso: string) => void }) {
  const [nome, setNome] = useState(a.cliente.nome)
  const [aceite, setAceite] = useState(false)
  const [ajustando, setAjustando] = useState<string | null>(null)
  const [comentario, setComentario] = useState('')
  const [erro, setErro] = useState<string>()
  const responder = useMutation({
    mutationFn: (r: { aprovar: string[] | 'todas' } | { ajuste: string }) =>
      'ajuste' in r ? pedidoPublicoApi.pedirAjusteArte(link, r.ajuste, nome.trim(), comentario.trim()) : pedidoPublicoApi.aprovarArtes(link, nome.trim(), r.aprovar === 'todas' ? undefined : r.aprovar),
    onSuccess: (r, pedido) => {
      setAjustando(null)
      setComentario('')
      setAceite(false)
      onRespondido(r, 'ajuste' in pedido ? 'Recebemos o seu pedido de ajuste. Você recebe a nova versão para aprovar.' : 'Arte aprovada. Obrigado! A produção já pode começar.')
    },
    onError: (e) => setErro(e.message),
  })
  if (!a.aprovacaoArte.mostrar) return null
  const artes = a.itens.filter((i) => i.arte && (i.arte.arquivo || i.arte.miniaturaUrl))
  const pendentes = a.aprovacaoArte.pendentes
  const nomeValido = nome.trim().length >= 3

  function aprovar(arteIds: string[] | 'todas') {
    setErro(undefined)
    if (!nomeValido || !aceite) return setErro('Para aprovar, informe seu nome e marque a confirmação abaixo.')
    responder.mutate({ aprovar: arteIds })
  }

  return (
    <section id="artes" className="scroll-mt-4 space-y-4 rounded-2xl border-2 border-ambar/60 bg-card p-4 sm:p-5" aria-labelledby="titulo-artes">
      <div>
        <h2 id="titulo-artes" className="flex items-center gap-2 font-titulo text-xl font-bold text-tinta">
          <Palette className="h-5 w-5 shrink-0 text-amber-700" /> {pendentes > 1 ? `Aprove as artes (${pendentes})` : 'Aprove a arte'}
        </h2>
        <p className="text-sm text-texto-secundario">Confira textos, cores e medidas. A produção começa assim que você aprovar.</p>
      </div>

      <ul className="space-y-4">
        {artes.map((i) => {
          const arte = i.arte!
          return (
            <li key={arte.id} className="space-y-2">
              <PreviaArte arte={arte} descricao={i.descricao} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-tinta">{i.descricao}</p>
                  <p className="text-xs text-texto-secundario">
                    Versão {arte.versao} · <span className={cn(arte.status === 'aprovada' && 'text-green-800', arte.aguardandoAprovacao && 'text-amber-800')}>{arte.rotulo}</span>
                  </p>
                </div>
                {arte.aguardandoAprovacao && (
                  <div className="flex gap-2">
                    {pendentes > 1 && (
                      <Button size="sm" variant="outline" disabled={responder.isPending} onClick={() => aprovar([arte.id])}>
                        <Check /> Aprovar esta
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={responder.isPending} onClick={() => setAjustando(ajustando === arte.id ? null : arte.id)} aria-expanded={ajustando === arte.id}>
                      <PencilLine /> Pedir ajuste
                    </Button>
                  </div>
                )}
              </div>
              {arte.ajustePedido && <p className="rounded-lg bg-sky-50 p-2.5 text-sm text-sky-900">Ajuste pedido: “{arte.ajustePedido}”</p>}
              {ajustando === arte.id && (
                <div className="space-y-2 rounded-xl bg-fundo p-3">
                  <CampoFormulario id={`ajuste-${arte.id}`} rotulo="O que precisa mudar?">
                    <Textarea id={`ajuste-${arte.id}`} rows={3} autoFocus value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ex.: trocar o telefone para (11) 99999-0000" />
                  </CampoFormulario>
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={responder.isPending || comentario.trim().length < 5 || !nomeValido}
                    onClick={() => {
                      setErro(undefined)
                      responder.mutate({ ajuste: arte.id })
                    }}
                  >
                    {responder.isPending && <Loader2 className="animate-spin" />} Enviar pedido de ajuste
                  </Button>
                  {!nomeValido && <p className="text-xs text-coral-escuro">Informe seu nome abaixo.</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="space-y-3 border-t border-border pt-4">
        <CampoFormulario id="artes-nome" rotulo="Seu nome">
          <Input id="artes-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
        </CampoFormulario>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5" />
          Conferi textos, cores, medidas e dados de contato. Autorizo a impressão.
        </label>
        {erro && <p className="text-sm text-coral-escuro">{erro}</p>}
        <Button size="lg" className="h-auto min-h-12 w-full whitespace-normal" disabled={responder.isPending} onClick={() => aprovar('todas')}>
          {responder.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {pendentes > 1 ? 'Aprovar todas as artes' : 'Aprovar a arte'}
        </Button>
      </div>
    </section>
  )
}

function Itens({ a }: { a: PedidoAcompanhamento }) {
  return (
    // Sem a seção das artes (nada aguardando), o link #artes da mensagem cai aqui
    <Card id={a.aprovacaoArte.mostrar ? undefined : 'artes'} className="scroll-mt-4">
      <h2 className="px-4 pt-5 font-semibold text-tinta sm:px-6">Itens do pedido</h2>
      <ul className="divide-y divide-border">
        {a.itens.map((i, n) => (
          <li key={n} className="flex gap-3 p-4 text-sm sm:px-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
              {i.arte?.miniaturaUrl ? <img src={i.arte.miniaturaUrl} alt="" className="h-full w-full object-contain" /> : <Package className="h-6 w-6 text-texto-secundario" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-3">
                <p className="font-medium text-tinta">{i.descricao}</p>
                <p className="shrink-0 font-medium">{formatarMoeda(i.total)}</p>
              </div>
              <p className="text-texto-secundario">
                Qtd. {quantidade(i.quantidade)}
                {i.largura && ` · ${metros(i.largura)}${i.altura ? ` × ${metros(i.altura)}` : ''} m`}
              </p>
              {i.acabamentos.length > 0 && <p className="text-xs text-texto-secundario">{i.acabamentos.join(', ')}</p>}
              {i.arte && (
                <p className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      i.arte.rotulo === 'Aprovada' ? 'bg-verde/15 text-green-800' : i.arte.aguardandoAprovacao ? 'bg-ambar/15 text-amber-800' : 'bg-fundo text-texto-secundario',
                    )}
                  >
                    <Palette className="h-3 w-3" /> Arte: {i.arte.rotulo}
                  </span>
                  {i.arte.aguardandoAprovacao && (
                    <a href="#artes" className="text-xs font-medium text-marca-escuro underline underline-offset-2">
                      Ver e aprovar
                    </a>
                  )}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {a.observacoes && <p className="border-t border-border p-4 text-sm sm:px-6"><strong>Observações:</strong> {a.observacoes}</p>}
    </Card>
  )
}

function EntregaInfo({ a }: { a: PedidoAcompanhamento }) {
  const retirada = a.entrega.tipo === 'retirada'
  const Icone = retirada ? Store : Truck
  return (
    <Card>
      <CardContent className="space-y-2 pt-6 text-sm">
        <h2 className="flex items-center gap-2 font-semibold text-tinta">
          <Icone className="h-4 w-4" /> {a.entrega.rotulo}
        </h2>
        {retirada ? (
          <>
            {a.empresa.endereco && (
              <p className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-texto-secundario" /> {a.empresa.endereco}
              </p>
            )}
            {a.empresa.horario && (
              <p className="flex gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-texto-secundario" /> <span className="whitespace-pre-line">{a.empresa.horario}</span>
              </p>
            )}
          </>
        ) : (
          a.entrega.endereco && (
            <p className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-texto-secundario" /> {a.entrega.endereco}
            </p>
          )
        )}
        {a.entrega.realizadaEm ? (
          <p className="text-texto-secundario">Concluída em {formatarDataHora(a.entrega.realizadaEm)}</p>
        ) : (
          a.entrega.agendadaPara && <p className="text-texto-secundario">Agendada para {formatarDataHora(a.entrega.agendadaPara)}</p>
        )}
      </CardContent>
    </Card>
  )
}

function Financeiro({ a }: { a: PedidoAcompanhamento }) {
  const f = a.financeiro
  const pago = Number(f.total) > 0 ? Math.min(100, (Number(f.pago) / Number(f.total)) * 100) : 0
  return (
    <Card>
      <CardContent className="space-y-3 pt-6 text-sm">
        <h2 className="flex items-center gap-2 font-semibold text-tinta">
          <Wallet className="h-4 w-4" /> Pagamento
        </h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-fundo p-2">
            <p className="text-xs text-texto-secundario">Total</p>
            <p className="font-semibold text-tinta">{formatarMoeda(f.total)}</p>
          </div>
          <div className="rounded-xl bg-fundo p-2">
            <p className="text-xs text-texto-secundario">Pago</p>
            <p className="font-semibold text-green-700">{formatarMoeda(f.pago)}</p>
          </div>
          <div className="rounded-xl bg-fundo p-2">
            <p className="text-xs text-texto-secundario">Falta</p>
            <p className="font-semibold text-tinta">{formatarMoeda(f.restante)}</p>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-fundo" role="progressbar" aria-valuenow={Math.round(pago)} aria-valuemin={0} aria-valuemax={100} aria-label="Valor pago">
          <div className="h-full rounded-full bg-verde" style={{ width: `${pago}%` }} />
        </div>
        {f.quitado ? (
          <p className="flex items-center gap-2 font-medium text-green-800">
            <CheckCircle2 className="h-4 w-4" /> Pagamento concluído. Obrigado!
          </p>
        ) : (
          f.proximoVencimento && (
            <p className={cn('flex items-center gap-2 font-medium', f.proximoVencimento.vencida ? 'text-coral-escuro' : 'text-tinta')}>
              {f.proximoVencimento.vencida ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CalendarClock className="h-4 w-4 shrink-0" />}
              {f.proximoVencimento.vencida ? 'Em aberto desde' : 'Próximo vencimento:'} {formatarDataSimples(f.proximoVencimento.data)} · {formatarMoeda(f.proximoVencimento.valor)}
            </p>
          )
        )}
        {f.parcelas.length > 1 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {f.parcelas.map((p, n) => (
              <li key={n} className="flex items-center justify-between gap-2 px-3 py-2">
                <div>
                  <p className="font-medium">{p.rotulo}</p>
                  <p className="text-xs text-texto-secundario">{p.pago && p.pagoEm ? `Pago em ${formatarDataSimples(p.pagoEm)}` : `Vence em ${formatarDataSimples(p.vencimento)}`}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatarMoeda(p.valor)}</p>
                  <p className={cn('text-xs font-medium', p.pago ? 'text-green-700' : p.vencida ? 'text-coral-escuro' : 'text-texto-secundario')}>{p.pago ? 'Pago' : p.vencida ? 'Vencida' : 'A pagar'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Historico({ a }: { a: PedidoAcompanhamento }) {
  if (!a.historico.length) return null
  return (
    <Card>
      <CardContent className="pt-6 text-sm">
        <h2 className="mb-3 font-semibold text-tinta">Histórico</h2>
        <ul className="space-y-2">
          {a.historico.map((m, n) => (
            <li key={n} className="flex gap-3">
              <span className="w-28 shrink-0 text-xs leading-5 text-texto-secundario">{formatarDataHora(m.quando)}</span>
              <span>{m.titulo}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** Barra fixa no rodapé (celular) / botão no fim (computador): WhatsApp da gráfica com o número do pedido. */
function FaleConosco({ a }: { a: PedidoAcompanhamento }) {
  const zap = linkWhatsapp(a.empresa.whatsapp, `Olá! Gostaria de falar sobre o pedido ${a.numero}.`)
  const telefone = a.empresa.telefone ?? a.empresa.whatsapp
  if (!zap && !telefone) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <div className="mx-auto max-w-2xl">
        {zap ? (
          <Button asChild className="w-full bg-[#25D366] text-[#1E2226] hover:bg-[#1EBE5A]" size="lg">
            <a href={zap} target="_blank" rel="noreferrer">
              <MessageCircle /> Falar com a gráfica no WhatsApp
            </a>
          </Button>
        ) : (
          <p className="text-center text-sm text-texto-secundario">
            Dúvidas? Ligue: <a className="font-medium text-marca-escuro" href={`tel:${telefone}`}>{formatarTelefone(telefone)}</a>
          </p>
        )}
      </div>
    </div>
  )
}

/** Página pública /pedido/:empresa/:token: o cliente acompanha o pedido pelo celular, sem login. */
export function AcompanharPedidoPage() {
  const { empresa = '', token = '' } = useParams()
  const consulta = useQuery({
    queryKey: ['publico', 'pedido', empresa, token],
    queryFn: () => pedidoPublicoApi.obter({ empresa, token }),
    retry: false,
    staleTime: 15_000,
  })
  const a = consulta.data
  const link = { empresa, token }
  const queryClient = useQueryClient()
  const [aviso, setAviso] = useState<string | null>(null)
  // Link da mensagem (#artes): rola até as artes quando a página carrega
  const carregou = Boolean(a)
  useEffect(() => {
    if (carregou && window.location.hash === '#artes') document.getElementById('artes')?.scrollIntoView({ block: 'start' })
  }, [carregou])
  // O cliente volta do WhatsApp (ou da aprovação da arte) para a aba e vê a situação atualizada
  const { refetch, dataUpdatedAt } = consulta
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - dataUpdatedAt > 15_000) void refetch()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [refetch, dataUpdatedAt])
  useCabecalhoDaPagina(a)

  return (
    <div className="min-h-screen bg-fundo">
      <Cabecalho a={a} />
      <main className="mx-auto max-w-2xl space-y-4 p-4 pb-28 pt-6 sm:pb-10">
        {consulta.isPending ? (
          <>
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full" />
          </>
        ) : !a ? (
          <Card>
            <EmptyState icone={Package} titulo="Pedido não encontrado" descricao="O link pode estar incompleto ou ter sido digitado errado. Confira a mensagem recebida ou fale com a gráfica." />
          </Card>
        ) : (
          <>
            <Resumo a={a} />
            {aviso && (
              <p role="status" className="flex items-center gap-3 rounded-2xl bg-verde/10 p-4 text-sm font-medium text-green-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" /> {aviso}
              </p>
            )}
            <ArtesDoPedido
              a={a}
              link={link}
              onRespondido={(r, texto) => {
                queryClient.setQueryData(['publico', 'pedido', empresa, token], r)
                setAviso(texto)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
            <Etapas a={a} />
            <Itens a={a} />
            <EntregaInfo a={a} />
            <Financeiro a={a} />
            <Historico a={a} />
            <FaleConosco a={a} />
            <p className="text-center text-xs text-texto-secundario">Pedido feito em {formatarDataHora(a.criadoEm)}</p>
          </>
        )}
      </main>
    </div>
  )
}
