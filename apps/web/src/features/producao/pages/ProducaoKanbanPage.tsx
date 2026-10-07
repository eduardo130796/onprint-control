import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Radio } from 'lucide-react'
import { PRIORIDADES, PRIORIDADE_ROTULOS, type EtapaProducao, type OrdemProducao, type Prioridade } from '@onprint/shared'
import { opsApi } from '@/api/producao'
import { PageHeader } from '@/components/layout/PageHeader'
import { ABAS_PRODUCAO } from '@/app/abas'
import { AbasNavegacao } from '@/components/shared/AbasNavegacao'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Kanban, type ColunaDef } from '@/components/shared/kanban/Kanban'
import { Card } from '@/components/ui/card'
import { Checkbox, Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useImpressao } from '@/features/impressao/useImpressao'
import { useDebounce } from '@/hooks/useDebounce'
import { destinoDaColuna, montarColunas, personalizadoValido } from '@/lib/colunasStatus'
import { usePermission } from '@/hooks/usePermission'
import { useStatusDaEntidade } from '@/hooks/useStatusConfig'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { CartaoOp } from '../components/CartaoOp'
import { OverrideDialog } from '../components/OverrideDialog'
import { PainelOp } from '../components/PainelOp'
import { ReprogramarOpDialog } from '../components/ReprogramarOpDialog'
import { useMaquinasOpcoes, useMoverOp, useUsuariosOpcoes } from '../hooks'

const idDaOp = (op: OrdemProducao) => op.id

/** Kanban de produção: colunas = etapas (status_config "producao"), arraste com histórico e tempo real. */
export function ProducaoKanbanPage() {
  const queryClient = useQueryClient()
  const etapas = useStatusDaEntidade('producao')
  const podeMover = usePermission('producao', 'editar')
  const [filtros, setFiltros] = useState<{ maquinaId?: string; responsavelId?: string; prioridade?: Prioridade; atrasadas?: boolean }>({})
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useDebounce(busca.trim())
  const params = {
    kanban: 'true' as const,
    sort: 'ordemKanban:asc',
    busca: buscaAtrasada || undefined,
    maquinaId: filtros.maquinaId,
    responsavelId: filtros.responsavelId,
    prioridade: filtros.prioridade,
    atrasadas: filtros.atrasadas ? ('true' as const) : undefined,
  }
  const consulta = useQuery({
    queryKey: ['ops', 'kanban', params],
    queryFn: () => buscarTodasPaginas((page, pageSize) => opsApi.listar({ ...params, page, pageSize })),
  })
  const maquinas = useMaquinasOpcoes()
  const usuarios = useUsuariosOpcoes()
  const { mover, override, confirmarOverride, cancelarOverride } = useMoverOp()

  const colunas = useMemo<ColunaDef<OrdemProducao>[]>(
    () =>
      montarColunas(etapas, consulta.data ?? [], (op) => op.etapaAtual, (op) => op.etapaPersonalizadaId).map((c) => {
        const horas = c.itens.reduce((s, op) => s + Number(op.horasEstimadas), 0)
        const concluida = destinoDaColuna(etapas, c.id).base === 'concluido'
        return { ...c, extra: horas > 0 && !concluida ? `${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : undefined }
      }),
    [etapas, consulta.data],
  )

  // Etapa própria = etapa do sistema (base) + o id dela: muda a base pelo movimento normal (regras e histórico)
  // e depois a coluna própria; na mesma coluna, só reordena
  const onMover = useCallback(
    async (op: OrdemProducao, destino: string, ordemIds: string[]) => {
      const { base, personalizadoId } = destinoDaColuna(etapas, destino)
      const atual = personalizadoValido(etapas, op.etapaAtual, op.etapaPersonalizadaId)
      const mudouBase = base !== op.etapaAtual
      if (mudouBase || personalizadoId === atual) await mover(op, base as EtapaProducao, ordemIds)
      if (personalizadoId !== (mudouBase ? null : atual)) {
        try {
          await opsApi.etapaPersonalizada(op.id, personalizadoId)
        } catch (e) {
          toast.error((e as Error).message)
          throw e
        }
        await queryClient.invalidateQueries({ queryKey: ['ops'] })
      }
    },
    [mover, etapas, queryClient],
  )
  const [editando, setEditando] = useState<OrdemProducao | null>(null)
  const [aberta, setAberta] = useState<OrdemProducao | null>(null)
  const { etiquetas, ocupado } = useImpressao()
  const renderCartao = useCallback(
    (op: OrdemProducao) => (
      <CartaoOp
        op={op}
        acoes={{ onAbrir: setAberta, onEditar: podeMover ? setEditando : undefined, onEtiqueta: (o) => void etiquetas(o.pedidoId, [o.id]), imprimindoEtiqueta: ocupado === `etiquetas:${op.id}` }}
      />
    ),
    [podeMover, etiquetas, ocupado],
  )

  return (
    <>
      <PageHeader
        titulo="Produção"
        subtitulo={
          <span className="inline-flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-verde" /> Atualiza sozinho quando alguém move uma OP. Clique no cartão para ver detalhes e ações.
          </span>
        }
      />
      <AbasNavegacao rotulo="Produção" abas={ABAS_PRODUCAO} />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="OP, pedido, cliente ou item…" aria-label="Buscar" />
        <Select value={filtros.maquinaId ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, maquinaId: e.target.value || undefined }))} aria-label="Máquina">
          <option value="">Todas as máquinas</option>
          {maquinas.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Select>
        <Select value={filtros.responsavelId ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, responsavelId: e.target.value || undefined }))} aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          {usuarios.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </Select>
        <Select value={filtros.prioridade ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, prioridade: (e.target.value || undefined) as Prioridade | undefined }))} aria-label="Prioridade">
          <option value="">Todas as prioridades</option>
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              {PRIORIDADE_ROTULOS[p]}
            </option>
          ))}
        </Select>
        <label className="flex h-10 items-center gap-2 text-sm">
          <Checkbox checked={Boolean(filtros.atrasadas)} onChange={(e) => setFiltros((f) => ({ ...f, atrasadas: e.target.checked }))} /> Só atrasadas
        </label>
      </div>

      {consulta.isPending || etapas.length === 0 ? (
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <Kanban colunas={colunas} idDe={idDaOp} renderCartao={renderCartao} podeArrastar={() => podeMover} onMover={onMover} onAbrir={setAberta} />
      )}
      <OverrideDialog op={override} onConfirmar={confirmarOverride} onCancelar={cancelarOverride} />
      {aberta && <PainelOp op={aberta} onFechar={() => setAberta(null)} onEditar={podeMover ? setEditando : undefined} />}
      {editando && <ReprogramarOpDialog op={editando} onFechar={() => setEditando(null)} />}
    </>
  )
}
