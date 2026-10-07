import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, ExternalLink, ImageOff, Palette, Pencil, ShoppingCart, Tag } from 'lucide-react'
import { PRIORIDADE_ROTULOS, formatarDataHora, formatarDataSimples, type OrdemProducao } from '@onprint/shared'
import { opsApi } from '@/api/producao'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { AcaoPainel, DadoPainel, PainelCartao } from '@/components/shared/kanban/PainelCartao'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { useImpressao } from '@/features/impressao/useImpressao'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { formatarDuracao } from '@/lib/datas'

const num = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—')

interface PainelOpProps {
  op: OrdemProducao
  onFechar: () => void
  /** Ausente para quem não pode editar a OP */
  onEditar?: (op: OrdemProducao) => void
}

/** Painel da OP aberto pelo kanban: arte, item, medidas, máquina, prazos, histórico de etapas e ações rápidas. */
export function PainelOp({ op, onFechar, onEditar }: PainelOpProps) {
  const navigate = useNavigate()
  const { mapa } = useStatusConfig()
  const impressao = useImpressao()
  const consulta = useQuery({ queryKey: ['ops', 'detalhe', op.id], queryFn: () => opsApi.obter(op.id) })
  const d = consulta.data
  const ir = (caminho: string) => {
    onFechar()
    navigate(caminho)
  }

  return (
    <PainelCartao
      aberto
      onFechar={onFechar}
      titulo={`${op.numero} · ${op.pedido.cliente.nome}`}
      subtitulo={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge entidade="producao" codigo={op.etapaAtual} />
          <span>Pedido {op.pedido.numero}</span>
        </span>
      }
      acoes={
        <>
          <AcaoPainel icone={ExternalLink} rotulo="Abrir OP" onClick={() => ir(`/producao/ordens/${op.id}`)} destaque />
          <AcaoPainel icone={ShoppingCart} rotulo="Abrir pedido" onClick={() => ir(`/pedidos/${op.pedidoId}`)} />
          {onEditar && (
            <AcaoPainel
              icone={Pencil}
              rotulo="Editar OP"
              onClick={() => {
                onFechar()
                onEditar(op)
              }}
            />
          )}
          <AcaoPainel icone={ClipboardList} rotulo="Ficha da OP" onClick={() => window.open(`/producao/ordens/${op.id}/ficha`, '_blank', 'noopener')} />
          <AcaoPainel icone={Tag} rotulo="Etiqueta" onClick={() => void impressao.etiquetas(op.pedidoId, [op.id])} carregando={impressao.ocupado === `etiquetas:${op.id}`} />
          <AcaoPainel icone={Palette} rotulo="Arte do pedido" onClick={() => ir(`/pedidos/${op.pedidoId}?aba=arte`)} />
        </>
      }
    >
      <div className="flex h-48 items-center justify-center overflow-hidden rounded-xl bg-fundo">
        {op.arte?.miniaturaUrl ? <img src={op.arte.miniaturaUrl} alt="Arte" className="h-full w-full object-contain" /> : <ImageOff className="h-8 w-8 text-texto-secundario" />}
      </div>
      <div>
        <p className="text-base font-semibold">{op.item.descricao}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <StatusBadge entidade="arte" codigo={op.arte?.status ?? 'aguardando_arquivo'} className="text-[11px]" />
          {op.arte && <span className="text-xs text-texto-secundario">versão {op.arte.versao}</span>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <DadoPainel rotulo="Quantidade">{num(op.quantidade)}</DadoPainel>
        <DadoPainel rotulo="Medidas">{op.largura ? `${num(op.largura)} × ${num(op.altura)} m (${num(op.areaM2)} m²)` : '—'}</DadoPainel>
        <DadoPainel rotulo="Máquina">{op.maquina?.nome ?? '—'}</DadoPainel>
        <DadoPainel rotulo="Responsável">{op.responsavel?.nome ?? '—'}</DadoPainel>
        <DadoPainel rotulo="Prazo">{formatarDataSimples(op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega)}</DadoPainel>
        <DadoPainel rotulo="Prioridade">{PRIORIDADE_ROTULOS[op.prioridade]}</DadoPainel>
        <DadoPainel rotulo="Horas previstas">{num(op.horasEstimadas)} h</DadoPainel>
        <DadoPainel rotulo="Nesta etapa há">{formatarDuracao(Math.max(0, (Date.now() - new Date(op.entrouEtapaEm).getTime()) / 1000))}</DadoPainel>
      </dl>
      {consulta.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : consulta.isError || !d ? (
        <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
      ) : (
        <>
          {d.acabamentos.length > 0 && <DadoPainel rotulo="Acabamentos">{d.acabamentos.join(', ')}</DadoPainel>}
          {d.observacoes && <DadoPainel rotulo="Observações">{d.observacoes}</DadoPainel>}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-secundario">Etapas</h3>
            <ol className="space-y-1.5">
              {[...d.historico].reverse().slice(0, 8).map((h) => (
                <li key={h.id} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: mapa.get(`producao:${h.etapaPara}`)?.cor ?? '#9CA3AF' }} />
                  <span className="font-medium">{mapa.get(`producao:${h.etapaPara}`)?.rotulo ?? h.etapaPara}</span>
                  <span className="text-texto-secundario">{formatarDataHora(h.createdAt)}</span>
                  {h.usuario && <span className="ml-auto truncate text-texto-secundario">{h.usuario.nome.split(' ')[0]}</span>}
                </li>
              ))}
            </ol>
          </section>
          {d.apontamentos.length > 0 && (
            <p className="text-xs text-texto-secundario">
              {d.apontamentos.length} apontamento(s) ·{' '}
              {num(String(d.apontamentos.reduce((s, a) => s + Number(a.quantidadeProduzida), 0)))} produzido(s)
            </p>
          )}
        </>
      )}
    </PainelCartao>
  )
}
