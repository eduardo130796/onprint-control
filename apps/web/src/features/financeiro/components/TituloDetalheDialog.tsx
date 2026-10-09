import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CircleDollarSign, Paperclip, Pencil, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatarData, formatarDataSimples, formatarMoeda } from '@onprint/shared'
import { arquivosApi } from '@/api/cadastros'
import { titulosApi, type TipoTitulo } from '@/api/financeiro'
import { Can } from '@/components/shared/Can'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { FormDialog } from '@/components/shared/FormDialog'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'
import { BaixaDialog } from './BaixaDialog'
import { TituloDialog } from './TituloDialog'

type Acao = { tipo: 'baixa' } | { tipo: 'editar' } | { tipo: 'cancelar' } | { tipo: 'estornar'; movimentoId: string }

/** Pedido de motivo (cancelar título ou estornar pagamento). */
function MotivoDialog({ titulo, texto, onConfirmar, onFechar }: { titulo: string; texto: string; onConfirmar: (motivo: string) => Promise<unknown>; onFechar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  return (
    <FormDialog
      aberto
      onAbertoChange={(x) => !x && onFechar()}
      titulo={titulo}
      salvando={salvando}
      textoSalvar={texto}
      onSubmit={async (e) => {
        e.preventDefault()
        if (motivo.trim().length < 3) return toast.error('Informe o motivo.')
        setSalvando(true)
        try {
          await onConfirmar(motivo.trim())
          onFechar()
        } catch (erro) {
          toast.error((erro as Error).message)
        } finally {
          setSalvando(false)
        }
      }}
    >
      <CampoFormulario id="motivo" rotulo="Motivo *">
        <Textarea id="motivo" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </CampoFormulario>
    </FormDialog>
  )
}

/** Detalhe de uma conta: dados, pagamentos (com estorno), baixa, edição, cancelamento e anexo. */
export function TituloDetalheDialog({ tipo, id, onFechar }: { tipo: TipoTitulo; id: string | null; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const api = titulosApi(tipo)
  const consulta = useQuery({ queryKey: ['financeiro', tipo, 'detalhe', id], queryFn: () => api.obter(id!), enabled: Boolean(id) })
  const [acao, setAcao] = useState<Acao | null>(null)
  const podeVerPedidos = usePermission('pedidos')
  const inputAnexo = useRef<HTMLInputElement>(null)
  const t = consulta.data
  const atualizar = () => Promise.all(['financeiro', 'pedidos'].map((c) => queryClient.invalidateQueries({ queryKey: [c] })))
  const aberto = t && !['pago', 'cancelado'].includes(t.status)

  async function abrirAnexo() {
    if (!t?.anexo) return
    try {
      window.open((await arquivosApi.urlTemporaria(t.anexo.id)).url, '_blank', 'noopener')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open={Boolean(id)} onOpenChange={(x) => !x && onFechar()}>
      <DialogContent className="top-[5%] max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogTitle>{t?.descricao ?? 'Conta'}</DialogTitle>
        <DialogDescription>{tipo === 'receber' ? t?.cliente?.nome : (t?.fornecedor?.nome ?? 'Sem fornecedor')}</DialogDescription>
        {consulta.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : consulta.isError || !t ? (
          <EstadoErro erro={consulta.error} />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge entidade="conta" codigo={t.status} />
              {t.atrasado && <span className="text-xs font-medium text-coral-escuro">em atraso</span>}
              {t.pedido &&
                (podeVerPedidos ? (
                  <Link to={`/pedidos/${t.pedido.id}?aba=financeiro`} className="text-marca-escuro hover:underline">
                    {t.pedido.numero}
                  </Link>
                ) : (
                  <span className="font-mono text-xs">{t.pedido.numero}</span>
                ))}
              {t.documento && <span className="text-texto-secundario">Doc. {t.documento}</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ['Valor', formatarMoeda(t.valor)],
                ['Pago', formatarMoeda(t.valorPago)],
                ['Saldo', formatarMoeda(t.saldo)],
                ['Vencimento', formatarDataSimples(t.vencimento)],
              ].map(([r, val]) => (
                <div key={r} className="rounded-xl bg-fundo p-3">
                  <p className="text-xs text-texto-secundario">{r}</p>
                  <p className="font-semibold text-tinta">{val}</p>
                </div>
              ))}
            </div>
            <p className="text-texto-secundario">
              {t.categoria?.nome ?? 'Sem categoria'} · parcela {t.parcela}/{t.totalParcelas}
              {Number(t.juros) + Number(t.multa) > 0 && ` · juros/multa ${formatarMoeda(Number(t.juros) + Number(t.multa))}`}
              {Number(t.desconto) > 0 && ` · desconto ${formatarMoeda(t.desconto)}`}
            </p>
            {t.motivoCancelamento && <p className="rounded-lg bg-coral/10 p-2 text-coral-escuro">Cancelada: {t.motivoCancelamento}</p>}
            {t.observacao && <p className="rounded-lg bg-fundo p-2">{t.observacao}</p>}

            <div>
              <p className="mb-2 font-semibold text-tinta">Pagamentos</p>
              {t.movimentos.length === 0 ? (
                <p className="text-texto-secundario">Nenhum pagamento registrado.</p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {t.movimentos.map((m) => (
                    <li key={m.id} className={cn('flex flex-wrap items-center gap-3 px-3 py-2', (m.estornado || m.estornoDeId) && 'text-texto-secundario')}>
                      <span className="w-24">{formatarData(m.data)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {m.estornoDeId ? 'Estorno' : (m.formaPagamento?.nome ?? '—')} · {m.contaFinanceira.nome}
                        {m.estornado && ' (estornado)'}
                      </span>
                      <span className={cn('font-medium', m.estornoDeId && 'line-through')}>{formatarMoeda(m.valor)}</span>
                      {!m.estornado && !m.estornoDeId && (
                        <Can modulo="financeiro" acao="editar">
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Estornar pagamento" onClick={() => setAcao({ tipo: 'estornar', movimentoId: m.id })}>
                            <Undo2 />
                          </Button>
                        </Can>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {aberto && (
                <Can modulo="financeiro" acao="editar">
                  <Button onClick={() => setAcao({ tipo: 'baixa' })}>
                    <CircleDollarSign /> {tipo === 'receber' ? 'Receber' : 'Pagar'}
                  </Button>
                  <Button variant="outline" onClick={() => setAcao({ tipo: 'editar' })}>
                    <Pencil /> Editar
                  </Button>
                </Can>
              )}
              {t.anexo ? (
                <Button variant="outline" onClick={() => void abrirAnexo()}>
                  <Paperclip /> {t.anexo.nomeOriginal}
                </Button>
              ) : (
                <Can modulo="financeiro" acao="editar">
                  <Button variant="outline" onClick={() => inputAnexo.current?.click()}>
                    <Paperclip /> Anexar boleto/comprovante
                  </Button>
                </Can>
              )}
              {aberto && Number(t.valorPago) === 0 && (
                <Can modulo="financeiro" acao="excluir">
                  <Button variant="ghost" className="text-coral-escuro hover:text-coral-escuro" onClick={() => setAcao({ tipo: 'cancelar' })}>
                    <Ban /> Cancelar conta
                  </Button>
                </Can>
              )}
            </div>
            <input
              ref={inputAnexo}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={async (e) => {
                const arquivo = e.target.files?.[0]
                e.target.value = ''
                if (!arquivo) return
                try {
                  await api.anexar(t.id, arquivo)
                  toast.success('Anexo salvo.')
                  await atualizar()
                } catch (erro) {
                  toast.error((erro as Error).message)
                }
              }}
            />
          </div>
        )}
        {t && acao?.tipo === 'baixa' && <BaixaDialog tipo={tipo} titulo={t} onFechar={() => setAcao(null)} />}
        {t && acao?.tipo === 'editar' && <TituloDialog tipo={tipo} titulo={t} onFechar={() => setAcao(null)} />}
        {t && acao?.tipo === 'cancelar' && (
          <MotivoDialog titulo="Cancelar esta conta?" texto="Cancelar conta" onFechar={() => setAcao(null)} onConfirmar={async (m) => { await api.cancelar(t.id, m); await atualizar() }} />
        )}
        {t && acao?.tipo === 'estornar' && (
          <MotivoDialog titulo="Estornar este pagamento?" texto="Estornar" onFechar={() => setAcao(null)} onConfirmar={async (m) => { await api.estornar(t.id, acao.movimentoId, m); await atualizar() }} />
        )}
      </DialogContent>
    </Dialog>
  )
}
