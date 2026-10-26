import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, FileText, Loader2, MessagesSquare, Package, RotateCcw, Send, Sparkles, UserPlus, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import {
  ASSUNTO_CONVERSA_ROTULOS,
  MIDIA_CONVERSA_ROTULOS,
  formatarDataHora,
  formatarDataSimples,
  formatarNumeroWhatsapp,
  linkWaMe,
  type AssuntoConversa,
  type ConversaWhatsapp,
  type EstadoDoAssistente,
  type SituacaoConversa,
} from '@onprint/shared'
import { CHAVE_CONVERSAS, CHAVE_WHATSAPP, whatsappApi } from '@/api/whatsapp'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'

const COR_ASSUNTO: Record<AssuntoConversa, string> = {
  orcamento: 'bg-marca-suave text-marca-escuro',
  pedido: 'bg-sky-100 text-sky-900',
  duvida: 'bg-amber-100 text-amber-900',
  outro: 'bg-slate-100 text-slate-700',
}

/**
 * Conversas do WhatsApp (copiloto nível 1): cada mensagem de cliente que não virou resposta tratada de orçamento, com
 * quem é, o resumo e as ações de um toque — montar o orçamento (sem digitar número), ver o pedido com a resposta
 * pronta (só sai com "Enviar") e marcar como resolvida. Nada vai ao cliente sem o toque de uma pessoa.
 */
export function ConversasCard({ conectado }: { conectado: boolean }) {
  const [situacao, setSituacao] = useState<SituacaoConversa>('aberta')
  const [busca] = useSearchParams()
  const destaque = busca.get('conversa')
  const consulta = useQuery({
    queryKey: [...CHAVE_CONVERSAS, situacao],
    queryFn: () => whatsappApi.conversas({ situacao, pageSize: 30 }),
    // O tempo real (conversa:atualizada) também atualiza; o intervalo cobre a conexão caída
    refetchInterval: 30_000,
  })
  const abertas = useQuery({ queryKey: [...CHAVE_CONVERSAS, 'contagem'], queryFn: whatsappApi.contagemConversas, select: (r) => r.abertas })

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-marca-escuro" aria-hidden="true" /> Conversas
            {Boolean(abertas.data) && <span className="rounded-full bg-laranja px-2 py-0.5 text-xs font-semibold text-white">{abertas.data}</span>}
          </CardTitle>
          <div className="flex gap-1" role="tablist" aria-label="Situação das conversas">
            {(['aberta', 'resolvida'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={situacao === s}
                onClick={() => setSituacao(s)}
                className={cn('rounded-full px-3 py-1 text-xs font-medium', situacao === s ? 'bg-grafite text-white' : 'bg-fundo text-tinta hover:bg-tinta/10')}
              >
                {s === 'aberta' ? 'Abertas' : 'Resolvidas'}
              </button>
            ))}
          </div>
        </div>
        <CardDescription>Mensagens dos clientes no WhatsApp da gráfica. Um toque monta o orçamento ou responde, sem copiar número.</CardDescription>
      </CardHeader>
      <CardContent>
        {consulta.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : consulta.isError ? (
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        ) : consulta.data.data.length === 0 ? (
          <EmptyState
            icone={MessagesSquare}
            className="py-8"
            titulo={situacao === 'aberta' ? 'Nenhuma conversa esperando' : 'Nenhuma conversa resolvida'}
            descricao={situacao === 'aberta' ? 'Quando um cliente escrever no WhatsApp da gráfica (pedindo preço, perguntando do pedido…), a conversa aparece aqui.' : 'As conversas que a equipe resolver ficam aqui.'}
          />
        ) : (
          <ul className="divide-y divide-tinta/10">
            {consulta.data.data.map((c) => (
              <ItemConversa key={c.id} c={c} destaque={c.id === destaque} conectado={conectado} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ItemConversa({ c, destaque, conectado }: { c: ConversaWhatsapp; destaque: boolean; conectado: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const podeOrcar = usePermission('orcamentos', 'criar')
  const [verPedido, setVerPedido] = useState(false)
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (destaque) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [destaque])

  const atualizar = () => void queryClient.invalidateQueries({ queryKey: CHAVE_WHATSAPP })
  const montar = useMutation({
    mutationFn: () => whatsappApi.montarOrcamento(c.id),
    onSuccess: (r) => {
      if (r.aviso) toast.info(r.aviso)
      const estado: EstadoDoAssistente = { orcamentoAssistente: { texto: r.texto, leitura: r.leitura }, conversaWhatsapp: { id: c.id } }
      navigate('/orcamentos/novo', { state: estado })
    },
    onError: (e) => toast.error((e as Error).message),
  })
  const resolver = useMutation({
    mutationFn: (sim: boolean) => (sim ? whatsappApi.resolverConversa(c.id) : whatsappApi.reabrirConversa(c.id)),
    onSuccess: (_r, sim) => {
      atualizar()
      if (sim) toast.success('Conversa resolvida.', { action: { label: 'Desfazer', onClick: () => resolver.mutate(false) } })
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const nome = c.cliente?.rotulo ?? c.nomeWhatsapp ?? (c.numero ? formatarNumeroWhatsapp(c.numero) : 'Contato do WhatsApp')
  const aberta = c.situacao === 'aberta'
  return (
    <li ref={ref} className={cn('space-y-2 py-3', destaque && '-mx-3 rounded-xl bg-marca-suave/40 px-3')}>
      <div className="flex items-start gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', c.cliente ? 'bg-marca-suave text-marca-escuro' : 'bg-amber-100 text-amber-900')}>
          {c.cliente ? <UserRound className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-tinta">{nome}</span>
            {!c.cliente && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-amber-900">novo</span>}
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', COR_ASSUNTO[c.assunto])}>{ASSUNTO_CONVERSA_ROTULOS[c.assunto]}</span>
          </div>
          <p className="text-xs text-texto-secundario">
            {c.numero ? formatarNumeroWhatsapp(c.numero) : 'sem número (o WhatsApp não mostrou)'} · {formatarDataHora(c.ultimaEm)}
            {c.orcamento && (
              <>
                {' · '}
                <Link to={`/orcamentos/${c.orcamento.id}`} className="text-marca-escuro hover:underline">
                  {c.orcamento.numero}
                </Link>
              </>
            )}
          </p>
          {c.resumo && (
            <p className="mt-1 flex items-start gap-1 text-xs font-medium text-tinta">
              {c.assuntoVia === 'assistente' && <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-marca-escuro" aria-label="Lido pelo Assistente GrafyGo" />}
              <span className="[overflow-wrap:anywhere]">{c.resumo}</span>
            </p>
          )}
          <ul className="mt-1.5 space-y-1" aria-label="Mensagens">
            {c.mensagens.slice(-4).map((m) => (
              <li key={m.id} className="w-fit max-w-full rounded-lg rounded-tl-sm bg-fundo px-2.5 py-1 text-sm text-tinta [overflow-wrap:anywhere]">
                {m.midia && <span className="mr-1 text-xs font-medium text-texto-secundario">[{MIDIA_CONVERSA_ROTULOS[m.midia]}]</span>}
                {m.texto}
              </li>
            ))}
            {c.mensagens.length > 4 && <li className="text-xs text-texto-secundario">+ {c.mensagens.length - 4} mensagem(ns) antes</li>}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sm:pl-12">
        {aberta ? (
          <>
            {podeOrcar && (
              <Button size="sm" variant={c.assunto === 'orcamento' ? 'default' : 'outline'} onClick={() => montar.mutate()} disabled={montar.isPending}>
                {montar.isPending ? <Loader2 className="animate-spin" /> : <FileText />} {montar.isPending ? 'Montando…' : 'Montar orçamento'}
              </Button>
            )}
            {c.cliente && (
              <Button size="sm" variant={c.assunto === 'pedido' ? 'default' : 'outline'} onClick={() => setVerPedido((v) => !v)} aria-expanded={verPedido}>
                <Package /> Ver pedido
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => resolver.mutate(true)} disabled={resolver.isPending}>
              <Check /> Resolvida
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => resolver.mutate(false)} disabled={resolver.isPending}>
            <RotateCcw /> Reabrir
          </Button>
        )}
      </div>
      {verPedido && c.cliente && <PedidoDaConversa c={c} conectado={conectado} onEnviado={() => resolver.mutate(true)} />}
    </li>
  )
}

/** "Ver pedido": status dos pedidos do cliente e a resposta pronta, editável; só sai com o toque em Enviar */
function PedidoDaConversa({ c, conectado, onEnviado }: { c: ConversaWhatsapp; conectado: boolean; onEnviado: () => void }) {
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: [...CHAVE_CONVERSAS, c.id, 'pedidos'], queryFn: () => whatsappApi.pedidosDaConversa(c.id) })
  const [texto, setTexto] = useState<string | null>(null)
  const resposta = texto ?? consulta.data?.respostaPronta ?? ''
  const pedido = consulta.data?.pedidos[0]
  const enviar = useMutation({
    mutationFn: () => whatsappApi.enviar({ tipo: 'resposta_conversa', telefone: c.numero!, texto: resposta, clienteId: c.cliente?.id ?? null, pedidoId: pedido?.id ?? null }),
    onSuccess: (r) => {
      if (r.aviso) toast.warning(r.aviso)
      else toast.success(`Resposta enviada para ${c.cliente?.rotulo ?? 'o cliente'}.`)
      void queryClient.invalidateQueries({ queryKey: CHAVE_WHATSAPP })
      onEnviado()
    },
    onError: (e) => toast.error((e as Error).message),
  })

  if (consulta.isPending) return <Skeleton className="h-24 w-full sm:ml-12 sm:w-auto" />
  if (consulta.isError) return <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
  const { pedidos } = consulta.data
  return (
    <div className="space-y-2 rounded-xl border border-border p-3 sm:ml-12">
      {pedidos.length === 0 ? (
        <p className="text-sm text-texto-secundario">Este cliente não tem pedido em andamento.</p>
      ) : (
        <ul className="space-y-1">
          {pedidos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Link to={`/pedidos/${p.id}`} className="font-medium text-marca-escuro hover:underline">
                {p.numero}
              </Link>
              <StatusBadge entidade="pedido" codigo={p.status} />
              <span className={cn('text-xs', p.atrasado ? 'font-medium text-coral-escuro' : 'text-texto-secundario')}>
                previsão {formatarDataSimples(p.dataPrevistaEntrega)}
                {p.atrasado ? ' · atrasado' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {consulta.data.respostaPronta && c.numero && (
        <>
          <Textarea aria-label="Resposta para o cliente" rows={5} value={resposta} onChange={(e) => setTexto(e.target.value)} className="text-sm" />
          <div className="flex flex-wrap justify-end gap-2">
            {conectado ? (
              <Button size="sm" onClick={() => enviar.mutate()} disabled={enviar.isPending || !resposta.trim()}>
                {enviar.isPending ? <Loader2 className="animate-spin" /> : <Send />} Enviar
              </Button>
            ) : (
              <Button asChild size="sm">
                <a href={linkWaMe(c.numero, resposta)} target="_blank" rel="noopener noreferrer" onClick={onEnviado}>
                  <ExternalLink /> Abrir no WhatsApp
                </a>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
