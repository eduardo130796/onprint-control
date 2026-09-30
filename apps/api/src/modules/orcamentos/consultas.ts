import type { Prisma } from '@prisma/client'

export const incluirResumo = {
  cliente: { select: { id: true, nome: true, situacao: true, whatsapp: true, email: true, telefone: true, cpfCnpj: true } },
  vendedor: { select: { id: true, nome: true } },
  solicitacao: { select: { id: true, numero: true } },
} satisfies Prisma.OrcamentoInclude

export const incluirDetalhe = {
  ...incluirResumo,
  itens: {
    orderBy: { ordem: 'asc' },
    include: {
      produto: { select: { id: true, codigo: true, nome: true, modoCalculo: true } },
      acabamentos: true,
      precoLiberadoPor: { select: { id: true, nome: true } },
    },
  },
  pedido: {
    select: {
      id: true,
      numero: true,
      status: true,
      statusFinanceiro: true,
      dataPrevistaEntrega: true,
      total: true,
      contasReceber: { orderBy: { parcela: 'asc' }, select: { id: true, descricao: true, parcela: true, totalParcelas: true, valor: true, vencimento: true, status: true } },
      comissoes: { select: { id: true, valor: true, percentual: true, status: true } },
      itens: { orderBy: { ordem: 'asc' }, select: { id: true, descricao: true, artes: { select: { id: true, versao: true, status: true } } } },
    },
  },
} satisfies Prisma.OrcamentoInclude
