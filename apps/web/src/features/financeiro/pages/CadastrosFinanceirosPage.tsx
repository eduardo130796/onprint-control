import type { ColumnDef } from '@tanstack/react-table'
import { TIPO_CONTA_FINANCEIRA_ROTULOS, TIPO_FORMA_PAGAMENTO_ROTULOS, formatarMoeda, type CategoriaFinanceira, type ContaFinanceira, type FormaPagamento } from '@onprint/shared'
import { categoriasFinanceirasApi, contasFinanceirasApi, formasApi } from '@/api/financeiro'
import { PageHeader } from '@/components/layout/PageHeader'
import { BadgeInativo, CadastroLista } from '@/components/shared/CadastroLista'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { CategoriaDialog, ContaDialog, FormaDialog } from '../components/CadastroDialogs'

const nome = <T extends { nome: string; ativo: boolean }>(): ColumnDef<T, unknown> => ({
  id: 'nome',
  header: 'Nome',
  meta: { ordenavel: 'nome' },
  cell: ({ row: { original: r } }) => (
    <span className="font-medium">
      {r.nome}
      <BadgeInativo ativo={r.ativo} />
    </span>
  ),
})

const colunasFormas: ColumnDef<FormaPagamento, unknown>[] = [
  nome<FormaPagamento>(),
  { id: 'tipo', header: 'Tipo', cell: ({ row }) => TIPO_FORMA_PAGAMENTO_ROTULOS[row.original.tipo] },
  { id: 'taxa', header: 'Taxa', cell: ({ row }) => (Number(row.original.taxaPercentual) ? `${Number(row.original.taxaPercentual).toLocaleString('pt-BR')}%` : '—') },
  { id: 'dias', header: 'Recebe em', cell: ({ row }) => (row.original.diasRecebimento ? `${row.original.diasRecebimento} dia(s)` : 'na hora') },
  { id: 'conta', header: 'Conta', cell: ({ row }) => row.original.contaFinanceira?.nome ?? '—' },
]

const colunasContas: ColumnDef<ContaFinanceira, unknown>[] = [
  nome<ContaFinanceira>(),
  { id: 'tipo', header: 'Tipo', cell: ({ row }) => TIPO_CONTA_FINANCEIRA_ROTULOS[row.original.tipo] },
  { id: 'banco', header: 'Banco', cell: ({ row }) => [row.original.banco, row.original.agencia, row.original.numeroConta].filter(Boolean).join(' · ') || '—' },
  {
    id: 'saldo',
    header: 'Saldo atual',
    meta: { className: 'text-right' },
    cell: ({ row }) => <span className={cn('font-semibold', Number(row.original.saldoAtual) < 0 && 'text-coral-escuro')}>{formatarMoeda(row.original.saldoAtual)}</span>,
  },
]

const colunasCategorias: ColumnDef<CategoriaFinanceira, unknown>[] = [
  {
    id: 'nome',
    header: 'Categoria',
    meta: { ordenavel: 'nome' },
    cell: ({ row: { original: c } }) => (
      <span className="font-medium">
        {c.pai && <span className="font-normal text-texto-secundario">{c.pai.nome} › </span>}
        {c.nome}
        <BadgeInativo ativo={c.ativo} />
      </span>
    ),
  },
  {
    id: 'tipo',
    header: 'Tipo',
    meta: { ordenavel: 'tipo' },
    cell: ({ row }) => <span className={row.original.tipo === 'receita' ? 'text-green-800' : 'text-coral-escuro'}>{row.original.tipo === 'receita' ? 'Receita' : 'Despesa'}</span>,
  },
  { id: 'sistema', header: '', cell: ({ row }) => (row.original.codigo ? <span className="text-xs text-texto-secundario">usada pelo sistema</span> : null) },
]

/** Formas de pagamento, contas financeiras (caixa e bancos, com saldo) e categorias de receita/despesa. */
export function CadastrosFinanceirosPage() {
  return (
    <>
      <PageHeader titulo="Formas de pagamento" subtitulo="Também as contas (caixa e bancos) e as categorias de receitas e despesas." />
      <Tabs defaultValue="formas">
        <TabsList>
          <TabsTrigger value="formas">Formas de pagamento</TabsTrigger>
          <TabsTrigger value="contas">Contas</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
        </TabsList>
        <TabsContent value="formas" className="pt-4">
          <CadastroLista
            chave="financeiro-formas"
            modulo="financeiro"
            rotuloNovo="Nova forma"
            caminhoNovo="/financeiro/formas-pagamento/novo"
            api={formasApi}
            colunas={colunasFormas}
            dialogo={(f, fechar) => <FormaDialog forma={f} onFechar={fechar} />}
          />
        </TabsContent>
        <TabsContent value="contas" className="pt-4">
          <CadastroLista chave="financeiro-contas" modulo="financeiro" rotuloNovo="Nova conta" api={contasFinanceirasApi} colunas={colunasContas} dialogo={(c, fechar) => <ContaDialog conta={c} onFechar={fechar} />} />
        </TabsContent>
        <TabsContent value="categorias" className="pt-4">
          <CadastroLista
            chave="financeiro-categorias"
            modulo="financeiro"
            rotuloNovo="Nova categoria"
            api={categoriasFinanceirasApi}
            colunas={colunasCategorias}
            dialogo={(c, fechar) => <CategoriaDialog categoria={c} onFechar={fechar} />}
          />
        </TabsContent>
      </Tabs>
    </>
  )
}
