import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, ExternalLink, Inbox, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import {
  EVENTO_WHATSAPP_ROTULOS,
  STATUS_MENSAGEM_WHATSAPP,
  STATUS_MENSAGEM_WHATSAPP_ROTULOS,
  formatarDataHora,
  linkWaMe,
  nomeCliente,
  type MensagemWhatsapp,
  type StatusMensagemWhatsapp,
} from '@onprint/shared'
import { CHAVE_WHATSAPP, whatsappApi } from '@/api/whatsapp'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const COR_STATUS: Record<StatusMensagemWhatsapp, string> = {
  pendente: 'bg-amber-100 text-amber-800',
  enviada: 'bg-green-100 text-green-800',
  falhou: 'bg-red-100 text-red-800',
  ignorada: 'bg-slate-200 text-slate-700',
}

const POR_PAGINA = 20

/** Fila e histórico dos avisos: reenviar, tirar da fila e, com a conexão caída, mandar à mão pelo wa.me. */
export function MensagensCard({ podeEditar, conectado }: { podeEditar: boolean; conectado: boolean }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StatusMensagemWhatsapp | undefined>()
  const [pagina, setPagina] = useState(1)
  const consulta = useQuery({
    queryKey: [...CHAVE_WHATSAPP, 'mensagens', status, pagina],
    queryFn: () => whatsappApi.mensagens({ status, page: pagina, pageSize: POR_PAGINA }),
    // A fila anda sozinha: atualiza enquanto a tela está aberta
    refetchInterval: 10_000,
  })
  const acao = useMutation({
    mutationFn: ({ id, tipo }: { id: string; tipo: 'reenviar' | 'ignorar' }) => (tipo === 'reenviar' ? whatsappApi.reenviar(id) : whatsappApi.ignorar(id)),
    onSuccess: (_m, { tipo }) => {
      void queryClient.invalidateQueries({ queryKey: CHAVE_WHATSAPP })
      toast.success(tipo === 'reenviar' ? 'Aviso de volta na fila.' : 'Aviso tirado da fila.')
    },
    onError: (e) => toast.error((e as Error).message),
  })

  function filtrar(s: StatusMensagemWhatsapp | undefined) {
    setStatus(s)
    setPagina(1)
  }

  const total = consulta.data?.meta.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>Avisos enviados e na fila</CardTitle>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filtrar por situação">
          {[undefined, ...STATUS_MENSAGEM_WHATSAPP].map((s) => (
            <button
              key={s ?? 'todas'}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => filtrar(s)}
              className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium', status === s ? 'bg-grafite text-white' : 'bg-fundo text-tinta hover:bg-tinta/10')}
            >
              {s ? STATUS_MENSAGEM_WHATSAPP_ROTULOS[s] : 'Todos'}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {consulta.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : consulta.isError ? (
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        ) : consulta.data.data.length === 0 ? (
          <EmptyState icone={Inbox} titulo="Nenhum aviso por aqui" descricao="Os avisos aparecem quando os pedidos avançam." />
        ) : (
          <ul className="divide-y divide-tinta/10">
            {consulta.data.data.map((m) => (
              <LinhaMensagem
                key={m.id}
                m={m}
                podeEditar={podeEditar}
                conectado={conectado}
                ocupado={acao.isPending}
                onAcao={(tipo) => acao.mutate({ id: m.id, tipo })}
              />
            ))}
          </ul>
        )}
        {paginas > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-texto-secundario">
            <span>
              Página {pagina} de {paginas}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LinhaMensagem({
  m,
  podeEditar,
  conectado,
  ocupado,
  onAcao,
}: {
  m: MensagemWhatsapp
  podeEditar: boolean
  conectado: boolean
  ocupado: boolean
  onAcao: (tipo: 'reenviar' | 'ignorar') => void
}) {
  const [aberta, setAberta] = useState(false)
  // Sem conexão (ou falhou): a equipe manda à mão, com o texto pronto
  const manual = /^55\d{10,11}$/.test(m.telefone) && (m.status === 'falhou' || (m.status === 'pendente' && !conectado))
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', COR_STATUS[m.status])}>{STATUS_MENSAGEM_WHATSAPP_ROTULOS[m.status]}</span>
          <span className="text-sm font-medium text-tinta">{EVENTO_WHATSAPP_ROTULOS[m.evento] ?? m.evento}</span>
          {m.pedido && (
            <Link to={`/pedidos/${m.pedido.id}`} className="text-sm text-marca-escuro hover:underline">
              {m.pedido.numero}
            </Link>
          )}
        </div>
        <p className="mt-0.5 text-xs text-texto-secundario">
          {m.cliente ? nomeCliente(m.cliente) : 'Cliente'} · {formatarDataHora(m.enviadaEm ?? m.createdAt)}
          {m.tentativas > 1 ? ` · ${m.tentativas} tentativas` : ''}
        </p>
        {m.erro && <p className="mt-1 text-xs text-coral-escuro">{m.erro}</p>}
        <button type="button" onClick={() => setAberta(!aberta)} className={cn('mt-1 block w-full text-left text-xs text-texto-secundario', !aberta && 'line-clamp-1')}>
          <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.texto}</span>
        </button>
      </div>
      {podeEditar && (
        <div className="flex shrink-0 gap-1 self-end sm:self-start">
          {manual && (
            <Button asChild variant="outline" size="sm">
              <a href={linkWaMe(m.telefone, m.texto)} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Abrir no WhatsApp
              </a>
            </Button>
          )}
          {m.status !== 'enviada' && m.status !== 'pendente' && <AcaoIcone icone={RotateCcw} rotulo="Reenviar" onClick={() => !ocupado && onAcao('reenviar')} />}
          {(m.status === 'pendente' || m.status === 'falhou') && <AcaoIcone icone={Ban} rotulo="Tirar da fila" onClick={() => !ocupado && onAcao('ignorar')} />}
        </div>
      )}
    </li>
  )
}
