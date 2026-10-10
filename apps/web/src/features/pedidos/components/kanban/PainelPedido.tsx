import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleDollarSign, ExternalLink, Factory, ImageOff, Pencil, Printer, ReceiptText, Tags, User, Wallet } from 'lucide-react'
import { TIPO_ENTREGA_ROTULOS, formatarDataSimples, formatarMoeda, saldoPedido, type Pedido } from '@onprint/shared'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { AcaoPainel, DadoPainel, PainelCartao } from '@/components/shared/kanban/PainelCartao'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ValorComSaldo } from '@/components/shared/ValorComSaldo'
import { Skeleton } from '@/components/ui/skeleton'
import { ReceberValorDialog } from '@/features/financeiro/components/ReceberValorDialog'
import { useDialogoEtiquetas } from '@/features/impressao/useDialogoEtiquetas'
import { useImpressao } from '@/features/impressao/useImpressao'
import { usePermissoes } from '@/hooks/usePermission'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { usePedido } from '../../hooks'
import { ReciboDialog } from '../detalhe/ReciboDialog'

const metros = (v: string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/** Painel do pedido aberto pelo kanban: dados, itens (arte e OPs), parcelas e ações rápidas. */
export function PainelPedido({ pedido: resumo, onFechar }: { pedido: Pedido; onFechar: () => void }) {
  const navigate = useNavigate()
  const pode = usePermissoes()
  const { mapa } = useStatusConfig()
  const impressao = useImpressao()
  const etiquetas = useDialogoEtiquetas()
  const consulta = usePedido(resumo.id)
  const [dialogo, setDialogo] = useState<'recibo' | 'receber' | null>(null)
  const p = consulta.data
  const encerrado = ['cancelado', 'entregue'].includes(resumo.status)
  const ir = (caminho: string) => {
    onFechar()
    navigate(caminho)
  }
  const temOps = p?.itens.some((i) => i.ordensProducao.some((o) => !o.cancelada)) ?? false
  const aberto = p ? Number(p.total) - Number(p.valorPago) : 0

  return (
    <>
      <PainelCartao
        aberto
        onFechar={onFechar}
        titulo={`${resumo.numero} · ${resumo.cliente.nome}`}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge entidade="pedido" codigo={resumo.status} />
            <span>{formatarMoeda(resumo.total)}</span>
            {resumo.statusFinanceiro === 'parcial' && <span className="font-medium text-amber-800">falta {formatarMoeda(saldoPedido(resumo.total, resumo.valorPago).falta)}</span>}
            {resumo.vendedor && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {resumo.vendedor.nome}
              </span>
            )}
          </span>
        }
        acoes={
          <>
            <AcaoPainel icone={ExternalLink} rotulo="Abrir pedido" onClick={() => ir(`/pedidos/${resumo.id}`)} destaque />
            {!encerrado && pode('pedidos', 'editar') && <AcaoPainel icone={Pencil} rotulo="Editar" onClick={() => ir(`/pedidos/${resumo.id}?editar=1`)} />}
            <AcaoPainel icone={Printer} rotulo="Imprimir pedido" onClick={() => void impressao.pedido(resumo.id, 'imprimir')} carregando={impressao.ocupado === `pedido:${resumo.id}:imprimir`} />
            {temOps && <AcaoPainel icone={Tags} rotulo="Etiquetas" onClick={() => etiquetas.abrir([{ pedidoId: resumo.id }])} />}
            {Number(resumo.valorPago) > 0 && <AcaoPainel icone={ReceiptText} rotulo="Recibo" onClick={() => setDialogo('recibo')} />}
            {aberto > 0.004 && pode('financeiro', 'editar') && <AcaoPainel icone={CircleDollarSign} rotulo="Receber valor" onClick={() => setDialogo('receber')} />}
            <AcaoPainel icone={Wallet} rotulo="Financeiro" onClick={() => ir(`/pedidos/${resumo.id}?aba=financeiro`)} />
          </>
        }
      >
        {consulta.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : consulta.isError || !p ? (
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <DadoPainel rotulo="Previsão de entrega">{formatarDataSimples(p.dataPrevistaEntrega)}</DadoPainel>
              <DadoPainel rotulo={TIPO_ENTREGA_ROTULOS[p.tipoEntrega]}>{p.tipoEntrega === 'retirada' ? 'No balcão' : p.enderecoEntrega || 'A combinar'}</DadoPainel>
              <DadoPainel rotulo="Pago">{formatarMoeda(p.valorPago)}</DadoPainel>
              <DadoPainel rotulo="Em aberto">{formatarMoeda(aberto)}</DadoPainel>
            </dl>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-secundario">Itens</h3>
              <ul className="space-y-2">
                {p.itens.map((i) => {
                  const arte = i.artes[0]
                  return (
                    <li key={i.id} className="flex gap-3 rounded-xl border border-border p-2.5">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-fundo">
                        {arte?.miniaturaUrl ? <img src={arte.miniaturaUrl} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-texto-secundario" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{i.descricao}</p>
                        <p className="text-xs text-texto-secundario">
                          {Number(i.quantidade).toLocaleString('pt-BR')} un{i.largura ? ` · ${metros(i.largura)} × ${metros(i.altura ?? '0')} m` : ''} · {formatarMoeda(i.total)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <StatusBadge entidade="arte" codigo={arte?.status ?? 'aguardando_arquivo'} className="text-[0.6875rem]" />
                          {i.ordensProducao
                            .filter((o) => !o.cancelada)
                            .map((o) => (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => ir(`/producao/ordens/${o.id}`)}
                                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[0.6875rem] font-medium text-tinta hover:bg-fundo"
                                title="Abrir a OP"
                              >
                                <Factory className="h-3 w-3" /> {o.numero} · {mapa.get(`producao:${o.etapaAtual}`)?.rotulo ?? o.etapaAtual}
                              </button>
                            ))}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

            {p.contasReceber.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-secundario">Parcelas</h3>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {p.contasReceber.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate">{c.descricao}</span>
                      <span className="text-xs text-texto-secundario">{formatarDataSimples(c.vencimento)}</span>
                      <ValorComSaldo total={c.valor} pago={c.valorPago} cancelado={c.status === 'cancelado'} className="font-medium" />
                      <StatusBadge entidade="conta" codigo={c.status} className="text-[0.6875rem]" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {p.observacoes && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-texto-secundario">Observações</h3>
                <p className="whitespace-pre-line">{p.observacoes}</p>
              </section>
            )}
          </>
        )}
      </PainelCartao>
      {etiquetas.dialogo}
      {dialogo === 'recibo' && <ReciboDialog pedidoId={resumo.id} numero={resumo.numero} onFechar={() => setDialogo(null)} />}
      {dialogo === 'receber' && p && <ReceberValorDialog pedidoId={p.id} numero={p.numero} contas={p.contasReceber} onFechar={() => setDialogo(null)} />}
    </>
  )
}
