import type { PrismaClient } from '@prisma/client'
import { Decimal, formatarDataHora, formatarMoeda, hojeISO } from '@onprint/shared'
import { usuariosDoEstoque } from '../modules/estoque/movimentacao'

/**
 * Avisos das 07:00 (seção 10): resumo do estoque baixo para quem movimenta estoque e
 * contas a receber e a pagar que vencem hoje para o financeiro e entregas agendadas para hoje
 * ao responsável (ou ao vendedor).
 * Devolve quantas notificações foram criadas.
 */
export async function avisosDoDia(prisma: PrismaClient): Promise<number> {
  let criadas = 0

  const produtos = await prisma.produto.findMany({
    where: { controlaEstoque: true, ativo: true },
    select: { nome: true, estoqueMinimo: true, saldosEstoque: { select: { quantidade: true } } },
    orderBy: { nome: 'asc' },
  })
  const baixos = produtos.filter((p) => p.saldosEstoque.reduce((s, x) => s.plus(x.quantidade.toString()), new Decimal(0)).lte(p.estoqueMinimo.toString()))
  if (baixos.length > 0) {
    const nomes = baixos.slice(0, 5).map((p) => p.nome).join(', ')
    const usuarios = await usuariosDoEstoque(prisma)
    const r = await prisma.notificacao.createMany({
      data: usuarios.map((usuarioId) => ({
        usuarioId,
        titulo: `${baixos.length} item(ns) com estoque baixo`,
        mensagem: baixos.length > 5 ? `${nomes} e mais ${baixos.length - 5}.` : `${nomes}.`,
        link: '/estoque/alertas',
      })),
    })
    criadas += r.count
  }

  const hoje = hojeISO()
  const vencendo = { status: { in: ['aberto', 'parcial'] as ('aberto' | 'parcial')[] }, vencimento: new Date(`${hoje}T00:00:00Z`) }
  const [receber, pagar] = await Promise.all([
    prisma.contaReceber.aggregate({ where: vencendo, _count: true, _sum: { valor: true, valorPago: true } }),
    prisma.contaPagar.aggregate({ where: vencendo, _count: true, _sum: { valor: true, valorPago: true } }),
  ])
  if (receber._count + pagar._count > 0) {
    const saldo = (a: typeof receber) => formatarMoeda(new Decimal(a._sum.valor?.toString() ?? 0).minus(a._sum.valorPago?.toString() ?? 0).toFixed(2))
    const financeiro = await prisma.usuario.findMany({
      where: { ativo: true, papel: { permissoes: { some: { permissao: { modulo: 'financeiro', acao: 'visualizar' } } } } },
      select: { id: true },
    })
    const r = await prisma.notificacao.createMany({
      data: financeiro.map((u) => ({
        usuarioId: u.id,
        titulo: 'Contas do dia',
        mensagem: `A receber: ${receber._count} (${saldo(receber)}). A pagar: ${pagar._count} (${saldo(pagar)}).`,
        link: '/financeiro/calendario',
      })),
    })
    criadas += r.count
  }

  const entregas = await prisma.entrega.findMany({
    where: {
      status: { in: ['pendente', 'agendada'] },
      dataAgendada: { gte: new Date(`${hoje}T00:00:00-03:00`), lte: new Date(`${hoje}T23:59:59.999-03:00`) },
    },
    select: { tipo: true, dataAgendada: true, responsavelId: true, pedido: { select: { id: true, numero: true, vendedorId: true, cliente: { select: { nome: true } } } } },
  })
  for (const e of entregas) {
    const usuarioId = e.responsavelId ?? e.pedido.vendedorId
    if (!usuarioId) continue
    await prisma.notificacao.create({
      data: {
        usuarioId,
        titulo: `${e.tipo === 'retirada' ? 'Retirada' : e.tipo === 'instalacao' ? 'Instalação' : 'Entrega'} hoje: ${e.pedido.numero}`,
        mensagem: `${e.pedido.cliente.nome} · ${formatarDataHora(e.dataAgendada)}`,
        link: `/pedidos/${e.pedido.id}?aba=entrega`,
      },
    })
    criadas++
  }
  return criadas
}
