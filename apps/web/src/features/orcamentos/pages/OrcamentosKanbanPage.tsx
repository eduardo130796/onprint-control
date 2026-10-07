import { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { toast } from 'sonner'
import { acaoKanbanOrcamento, type Orcamento, type OrcamentoDetalhe, type StatusOrcamento } from '@onprint/shared'
import { orcamentosApi } from '@/api/comercial'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { FormDialog } from '@/components/shared/FormDialog'
import { Kanban, type ColunaDef } from '@/components/shared/kanban/Kanban'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useImpressao } from '@/features/impressao/useImpressao'
import { useDebounce } from '@/hooks/useDebounce'
import { destinoDaColuna, montarColunas, personalizadoValido } from '@/lib/colunasStatus'
import { usePermissoes } from '@/hooks/usePermission'
import { useStatusDaEntidade } from '@/hooks/useStatusConfig'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { AbasComercial } from '../components/AbasComercial'
import { ConverterDialog } from '../components/editor/ConverterDialog'
import { CartaoOrcamento } from '../components/kanban/CartaoOrcamento'
import { PainelOrcamento } from '../components/kanban/PainelOrcamento'
import { linkAprovacao } from '../mensagem'

const idDe = (o: Orcamento) => o.id
type Pendente = { o: Orcamento; acao: 'aprovar' | 'recusar'; concluir: (ok: boolean) => void }

/**
 * Kanban de orçamentos: arrastar executa a ação do orçamento (enviar, negociar, aprovar, recusar,
 * reabrir, converter). Convertidos, recusados e expirados há mais de 30 dias saem do quadro.
 */
export function OrcamentosKanbanPage() {
  const queryClient = useQueryClient()
  const pode = usePermissoes()
  const status = useStatusDaEntidade('orcamento')
  const impressao = useImpressao()
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useDebounce(busca.trim())
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [convertendo, setConvertendo] = useState<OrcamentoDetalhe | null>(null)
  const [aberto, setAberto] = useState<Orcamento | null>(null)
  const aoFecharConversao = useRef<(() => void) | null>(null)

  const params = { kanban: 'true' as const, busca: buscaAtrasada || undefined }
  const consulta = useQuery({
    queryKey: ['orcamentos', 'kanban', params],
    queryFn: () => buscarTodasPaginas((page, pageSize) => orcamentosApi.listar({ ...params, page, pageSize })),
  })

  const colunas = useMemo<ColunaDef<Orcamento>[]>(
    () => montarColunas(status, consulta.data ?? [], (o) => o.status, (o) => o.statusPersonalizadoId),
    [status, consulta.data],
  )

  // Coluna própria = status do sistema (base) + o id dela; mesma base só troca a coluna
  const podeSoltar = useCallback(
    (o: Orcamento, destino: string) => {
      const { base } = destinoDaColuna(status, destino)
      return base === o.status ? o.status !== 'convertido' : acaoKanbanOrcamento(o.status, base as StatusOrcamento) !== null
    },
    [status],
  )

  const atualizar = useCallback(() => queryClient.invalidateQueries({ queryKey: ['orcamentos'] }), [queryClient])

  const onMover = useCallback(
    async (o: Orcamento, destino: string) => {
      const { base, personalizadoId } = destinoDaColuna(status, destino)
      const acao = base === o.status ? null : acaoKanbanOrcamento(o.status, base as StatusOrcamento)
      try {
        if (acao === 'aprovar' || acao === 'recusar') {
          // Pede o dado no diálogo; cancelar devolve o cartão à coluna de origem
          const ok = await new Promise<boolean>((concluir) => setPendente({ o, acao, concluir }))
          if (!ok) throw new Error('cancelado')
        } else if (acao === 'converter') {
          const detalhe = await orcamentosApi.obter(o.id)
          await new Promise<void>((fechou) => {
            aoFecharConversao.current = fechou
            setConvertendo(detalhe)
          })
        } else if (acao === 'enviar') await orcamentosApi.enviar(o.id)
        else if (acao === 'negociacao') await orcamentosApi.negociacao(o.id)
        else if (acao === 'reabrir') await orcamentosApi.reabrir(o.id)
        // A ação já mudou a base (e a coluna própria antiga foi limpa); agora a coluna própria, se mudou
        const atual = acao ? null : personalizadoValido(status, o.status, o.statusPersonalizadoId)
        if (acao !== 'converter' && personalizadoId !== atual) await orcamentosApi.statusPersonalizado(o.id, personalizadoId)
        await atualizar()
      } catch (e) {
        if ((e as Error).message !== 'cancelado') toast.error((e as Error).message)
        throw e
      }
    },
    [atualizar, status],
  )

  function fecharPendente(ok: boolean) {
    pendente?.concluir(ok)
    setPendente(null)
    setTexto('')
  }

  async function confirmarPendente(e: React.FormEvent) {
    e.preventDefault()
    if (!pendente) return
    setSalvando(true)
    try {
      if (pendente.acao === 'aprovar') await orcamentosApi.aprovar(pendente.o.id, texto)
      else await orcamentosApi.recusar(pendente.o.id, texto)
      toast.success(pendente.acao === 'aprovar' ? 'Aprovação registrada.' : 'Recusa registrada.')
      fecharPendente(true)
    } catch (erro) {
      toast.error((erro as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const { orcamento: imprimirOrcamento, ocupado } = impressao
  const renderCartao = useCallback(
    (o: Orcamento) => (
      <CartaoOrcamento
        o={o}
        acoes={{
          onAbrir: setAberto,
          onImprimir: (x) => void imprimirOrcamento(x.id, 'imprimir'),
          onCopiarLink: (x) => {
            void navigator.clipboard.writeText(linkAprovacao(x.tokenPublico))
            toast.success('Link de aprovação copiado.')
          },
          imprimindo: ocupado === `orcamento:${o.id}:imprimir`,
        }}
      />
    ),
    [imprimirOrcamento, ocupado],
  )
  const podeEditar = pode('orcamentos', 'editar')
  const podeArrastar = useCallback((o: Orcamento) => podeEditar && o.status !== 'convertido', [podeEditar])

  return (
    <>
      <PageHeader
        titulo="Orçamentos"
        subtitulo={
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Clique no cartão para ver detalhes e ações. Arraste para enviar, negociar, aprovar, recusar ou converter.
          </span>
        }
      />
      <AbasComercial />
      <div className="mb-4 max-w-sm">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número ou cliente…" aria-label="Buscar" />
      </div>
      {consulta.isPending || status.length === 0 ? (
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
        <Kanban colunas={colunas} idDe={idDe} renderCartao={renderCartao} podeArrastar={podeArrastar} podeSoltar={podeSoltar} onMover={onMover} reordenavel={false} onAbrir={setAberto} />
      )}

      {pendente && (
        <FormDialog
          aberto
          onAbertoChange={(v) => !v && fecharPendente(false)}
          titulo={pendente.acao === 'aprovar' ? `Aprovar ${pendente.o.numero}` : `Recusar ${pendente.o.numero}`}
          descricao={pendente.acao === 'aprovar' ? 'Registre quem aprovou e por qual canal.' : undefined}
          textoSalvar={pendente.acao === 'aprovar' ? 'Aprovar' : 'Recusar'}
          salvando={salvando}
          onSubmit={(e) => void confirmarPendente(e)}
        >
          {pendente.acao === 'aprovar' ? (
            <Input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Quem aprovou (ex.: João, pelo WhatsApp)" aria-label="Quem aprovou" />
          ) : (
            <Textarea autoFocus rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Motivo da recusa (ex.: preço, prazo, fechou com concorrente)" aria-label="Motivo" />
          )}
        </FormDialog>
      )}
      {aberto && <PainelOrcamento orcamento={aberto} onFechar={() => setAberto(null)} />}
      {convertendo && (
        <ConverterDialog
          orcamento={convertendo}
          onFechar={() => {
            setConvertendo(null)
            aoFecharConversao.current?.()
            aoFecharConversao.current = null
          }}
        />
      )}
    </>
  )
}
