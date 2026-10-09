import { useLocation, useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { STATUS_MAQUINA_ROTULOS, formatarMoeda, type Maquina, type Processo } from '@onprint/shared'
import { maquinasApi, processosApi } from '@/api/produtos'
import { PageHeader } from '@/components/layout/PageHeader'
import { BadgeInativo, CadastroLista } from '@/components/shared/CadastroLista'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatarMetros } from '@/lib/produtos'
import { cn } from '@/lib/utils'
import { MaquinaDialog } from '../components/MaquinaDialog'
import { ProcessoDialog } from '../components/ProcessoDialog'

const COR_STATUS: Record<string, string> = {
  ativa: 'bg-verde/15 text-green-800',
  manutencao: 'bg-ambar/15 text-amber-800',
  parada: 'bg-coral/15 text-coral-escuro',
}

const colunasMaquinas: ColumnDef<Maquina, unknown>[] = [
  {
    id: 'nome',
    header: 'Máquina',
    meta: { ordenavel: 'nome' },
    cell: ({ row: { original: m } }) => (
      <div>
        <p className="font-medium">
          {m.nome}
          <BadgeInativo ativo={m.ativo} />
        </p>
        {m.tipo && <p className="text-xs text-texto-secundario">{m.tipo}</p>}
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    meta: { ordenavel: 'status' },
    cell: ({ row }) => (
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', COR_STATUS[row.original.status])}>
        {STATUS_MAQUINA_ROTULOS[row.original.status]}
      </span>
    ),
  },
  { id: 'largura', header: 'Largura útil', cell: ({ row }) => formatarMetros(row.original.larguraUtil) },
  {
    id: 'velocidade',
    header: 'Velocidade',
    cell: ({ row }) => (row.original.velocidadeM2Hora ? `${Number(row.original.velocidadeM2Hora).toLocaleString('pt-BR')} m²/h` : '—'),
  },
  { id: 'custo', header: 'Custo/hora', cell: ({ row }) => formatarMoeda(row.original.custoHora) },
]

const colunasProcessos: ColumnDef<Processo, unknown>[] = [
  {
    id: 'nome',
    header: 'Processo',
    meta: { ordenavel: 'nome' },
    cell: ({ row: { original: p } }) => (
      <span className="font-medium">
        {p.nome}
        <BadgeInativo ativo={p.ativo} />
      </span>
    ),
  },
  { id: 'maquina', header: 'Máquina padrão', cell: ({ row }) => row.original.maquinaPadrao?.nome ?? '—' },
  { id: 'tempo', header: 'Tempo padrão', cell: ({ row }) => (row.original.tempoPadraoMinutos ? `${row.original.tempoPadraoMinutos} min` : '—') },
  { id: 'custo', header: 'Mão de obra/hora', cell: ({ row }) => (Number(row.original.custoHora ?? 0) > 0 ? formatarMoeda(row.original.custoHora) : '—') },
]

/** Máquinas e processos numa tela só (acessível por Produtos e por Configurações). */
export function MaquinasProcessosPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const aba = pathname.includes('/processos') ? 'processos' : 'maquinas'
  const base = pathname.startsWith('/configuracoes') ? '/configuracoes' : '/produtos'

  return (
    <>
      <PageHeader titulo="Máquinas e processos" subtitulo="Equipamentos da produção e etapas do roteiro de cada produto." />
      <Tabs
        value={aba}
        onValueChange={(v) => navigate(base === '/produtos' ? (v === 'processos' ? '/produtos/maquinas/processos' : '/produtos/maquinas') : `/configuracoes/${v}`)}
      >
        <TabsList>
          <TabsTrigger value="maquinas">Máquinas</TabsTrigger>
          <TabsTrigger value="processos">Processos</TabsTrigger>
        </TabsList>
        <TabsContent value="maquinas">
          <CadastroLista
            chave="maquinas"
            modulo="produtos"
            rotuloNovo="Nova máquina"
            caminhoNovo={`${base}/maquinas/novo`}
            api={maquinasApi}
            colunas={colunasMaquinas}
            dialogo={(m, fechar) => <MaquinaDialog maquina={m} onFechar={fechar} />}
          />
        </TabsContent>
        <TabsContent value="processos">
          <CadastroLista
            chave="processos"
            modulo="produtos"
            rotuloNovo="Novo processo"
            caminhoNovo={base === '/produtos' ? '/produtos/maquinas/processos/novo' : '/configuracoes/processos/novo'}
            api={processosApi}
            colunas={colunasProcessos}
            dialogo={(p, fechar) => <ProcessoDialog processo={p} onFechar={fechar} />}
          />
        </TabsContent>
      </Tabs>
    </>
  )
}
