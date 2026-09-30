import type { PrismaClient } from '@prisma/client'

/** Categorias com código são usadas pelo sistema (baixas automáticas, PDV, taxas, comissões). */
const CATEGORIAS: { nome: string; tipo: 'receita' | 'despesa'; codigo?: string; filhas?: { nome: string; codigo?: string }[] }[] = [
  {
    nome: 'Vendas',
    tipo: 'receita',
    codigo: 'receitas_vendas',
    filhas: [
      { nome: 'Pedidos', codigo: 'vendas' },
      { nome: 'Venda balcão (PDV)', codigo: 'vendas_balcao' },
    ],
  },
  { nome: 'Outras receitas', tipo: 'receita', codigo: 'outras_receitas' },
  {
    nome: 'Custos de produção',
    tipo: 'despesa',
    filhas: [{ nome: 'Compra de insumos', codigo: 'compras_insumos' }, { nome: 'Terceirização' }],
  },
  {
    nome: 'Despesas operacionais',
    tipo: 'despesa',
    filhas: [{ nome: 'Aluguel' }, { nome: 'Energia e água' }, { nome: 'Internet e telefone' }, { nome: 'Salários e encargos' }, { nome: 'Impostos' }],
  },
  {
    nome: 'Despesas comerciais',
    tipo: 'despesa',
    filhas: [
      { nome: 'Comissões', codigo: 'comissoes' },
      { nome: 'Taxas de cartão', codigo: 'taxas_cartao' },
    ],
  },
  { nome: 'Outras despesas', tipo: 'despesa', codigo: 'outras_despesas' },
]

/** Contas, categorias e formas de pagamento iniciais — só se o módulo ainda estiver vazio. */
export async function criarFinanceiroPadrao(prisma: PrismaClient) {
  if ((await prisma.contaFinanceira.count()) > 0) return false
  const caixa = await prisma.contaFinanceira.create({ data: { nome: 'Caixa da loja', tipo: 'caixa' } })
  const banco = await prisma.contaFinanceira.create({ data: { nome: 'Conta bancária', tipo: 'banco' } })

  for (const c of CATEGORIAS) {
    const pai = await prisma.categoriaFinanceira.create({ data: { nome: c.nome, tipo: c.tipo, codigo: c.codigo ?? null } })
    for (const f of c.filhas ?? []) await prisma.categoriaFinanceira.create({ data: { nome: f.nome, tipo: c.tipo, paiId: pai.id, codigo: f.codigo ?? null } })
  }

  await prisma.formaPagamento.createMany({
    data: [
      { nome: 'Dinheiro', tipo: 'dinheiro', contaFinanceiraId: caixa.id },
      { nome: 'PIX', tipo: 'pix', contaFinanceiraId: banco.id },
      { nome: 'Cartão de débito', tipo: 'cartao_debito', taxaPercentual: '1.50', diasRecebimento: 1, contaFinanceiraId: banco.id },
      { nome: 'Cartão de crédito', tipo: 'cartao_credito', taxaPercentual: '3.50', diasRecebimento: 30, permiteParcelamento: true, maxParcelas: 12, contaFinanceiraId: banco.id },
      { nome: 'Boleto', tipo: 'boleto', diasRecebimento: 2, contaFinanceiraId: banco.id },
      { nome: 'Transferência', tipo: 'transferencia', contaFinanceiraId: banco.id },
    ],
  })
  return true
}
