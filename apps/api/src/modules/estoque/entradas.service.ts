import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { Decimal, type entradaEstoqueSchema, type entradasQuerySchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { proximoNumero } from '../../core/numeracao'
import { paginacao, paginado } from '../../core/paginacao'
import { criarCustosService } from '../produtos/custos.service'
import { formatarProdutoRef, produtoRef } from './consultas'
import { movimentar } from './movimentacao'

type Entrada = z.output<typeof entradaEstoqueSchema>
type Query = z.output<typeof entradasQuerySchema>

const incluirResumo = {
  fornecedor: { select: { id: true, nome: true } },
  local: { select: { id: true, nome: true } },
  usuario: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
} satisfies Prisma.EstoqueEntradaInclude

const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** Entradas de estoque (nota do fornecedor): cada item vira movimentação "entrada" e atualiza o custo médio. */
export function criarEntradasService(app: FastifyInstance) {
  const { prisma } = app
  const custos = criarCustosService(app)

  async function obter(id: string) {
    const e = await prisma.estoqueEntrada.findUnique({
      where: { id },
      include: { ...incluirResumo, itens: { include: { produto: produtoRef }, orderBy: { id: 'asc' } } },
    })
    if (!e) throw AppError.naoEncontrado('Entrada não encontrada.')
    const { _count, itens, ...resto } = e
    return { ...resto, itensCount: _count.itens, itens: itens.map(({ produto, ...i }) => ({ ...i, produto: formatarProdutoRef(produto) })) }
  }

  return {
    obter,

    async listar(q: Query) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.EstoqueEntradaWhereInput = {
        ...(q.fornecedorId ? { fornecedorId: q.fornecedorId } : {}),
        ...(q.de || q.ate ? { dataEntrada: { ...(q.de ? { gte: dataBanco(q.de) } : {}), ...(q.ate ? { lte: dataBanco(q.ate) } : {}) } } : {}),
        ...(texto ? { OR: [{ numero: texto }, { notaFiscal: texto }, { fornecedor: { nome: texto } }] } : {}),
      }
      const pag = paginacao(q, ['dataEntrada', 'numero', 'total', 'createdAt'] as const, { campo: 'createdAt', direcao: 'desc' })
      const [total, data] = await prisma.$transaction([
        prisma.estoqueEntrada.count({ where }),
        prisma.estoqueEntrada.findMany({ where, ...pag, include: incluirResumo }),
      ])
      return paginado(data.map(({ _count, ...e }) => ({ ...e, itensCount: _count.itens })), total, q)
    },

    async criar(d: Entrada, usuarioId: string) {
      const repetidos = d.itens.map((i) => i.produtoId).filter((id, i, l) => l.indexOf(id) !== i)
      if (repetidos.length) throw AppError.regraNegocio('O mesmo produto aparece mais de uma vez na entrada. Some as quantidades numa linha só.')
      if (d.fornecedorId && !(await prisma.fornecedor.findUnique({ where: { id: d.fornecedorId } }))) throw AppError.regraNegocio('Fornecedor não encontrado.')

      const itens = d.itens.map((i) => ({ ...i, total: new Decimal(i.quantidade).mul(i.custoUnitario).toDecimalPlaces(2).toFixed(2) }))
      const total = itens.reduce((s, i) => s.plus(i.total), new Decimal(0)).toFixed(2)
      const custosAntes = await prisma.produto.findMany({ where: { id: { in: itens.map((i) => i.produtoId) } }, select: { id: true, custo: true } })
      const id = await prisma.$transaction(async (tx) => {
        const entrada = await tx.estoqueEntrada.create({
          data: {
            numero: await proximoNumero(tx, 'entrada'),
            fornecedorId: d.fornecedorId ?? null,
            localId: d.localId,
            notaFiscal: d.notaFiscal ?? null,
            dataEntrada: dataBanco(d.dataEntrada),
            total,
            observacoes: d.observacoes ?? null,
            createdBy: usuarioId,
            itens: { create: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, custoUnitario: i.custoUnitario, total: i.total })) },
          },
        })
        for (const i of itens) {
          await movimentar(tx, {
            tipo: 'entrada',
            produtoId: i.produtoId,
            localId: d.localId,
            quantidade: new Decimal(i.quantidade),
            custoEntrada: i.custoUnitario,
            motivo: d.notaFiscal ? `NF ${d.notaFiscal}` : `Entrada ${entrada.numero}`,
            fornecedorId: d.fornecedorId ?? null,
            entradaId: entrada.id,
            usuarioId,
          })
        }
        await registrarAuditoria(tx, { tabela: 'estoque_entradas', registroId: entrada.id, acao: 'criar', depois: { numero: entrada.numero, total, itens: itens.length }, usuarioId })
        return entrada.id
      })
      // Depois do commit: o custo médio mudou → recalcula os produtos que usam o insumo (e avisa do reajuste)
      const depois = await prisma.produto
        .findMany({ where: { id: { in: custosAntes.map((p) => p.id) } }, select: { id: true, nome: true, custo: true, unidadeMedida: { select: { sigla: true } } } })
        .catch((erro) => (app.log.error({ err: erro }, 'Falha ao recalcular custos após a entrada'), []))
      for (const p of depois) {
        const antes = custosAntes.find((a) => a.id === p.id)!
        if (!antes.custo.eq(p.custo)) await custos.aposMudarCustoInsumo({ id: p.id, nome: p.nome, unidade: p.unidadeMedida?.sigla ?? null }, antes.custo.toString(), p.custo.toString())
      }
      return obter(id)
    },
  }
}
