import type { FastifyInstance } from 'fastify'
import type { produtoAcabamentosSchema, produtoInsumosSchema, produtoProcessosSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'

type Acabamentos = z.output<typeof produtoAcabamentosSchema>['itens']
type Insumos = z.output<typeof produtoInsumosSchema>['itens']
type Processos = z.output<typeof produtoProcessosSchema>['itens']

function semRepetidos(ids: string[], mensagem: string) {
  if (new Set(ids).size !== ids.length) throw AppError.regraNegocio(mensagem)
}

/**
 * Composição do produto: acabamentos permitidos, ficha técnica (insumos) e roteiro de processos.
 * Cada operação substitui a lista inteira, numa transação, com auditoria do antes/depois.
 */
export function criarComposicaoService(app: FastifyInstance) {
  const { prisma } = app

  async function garantirProduto(id: string) {
    const p = await prisma.produto.findUnique({ where: { id }, select: { id: true, tipo: true } })
    if (!p) throw AppError.naoEncontrado('Produto não encontrado.')
    return p
  }

  return {
    async acabamentos(produtoId: string, itens: Acabamentos, usuarioId: string) {
      await garantirProduto(produtoId)
      semRepetidos(itens.map((i) => i.acabamentoId), 'Acabamento repetido na lista.')
      const ativos = await prisma.acabamento.count({ where: { id: { in: itens.map((i) => i.acabamentoId) }, ativo: true } })
      if (ativos !== itens.length) throw AppError.regraNegocio('Há acabamentos inválidos ou desativados na lista.')

      await prisma.$transaction(async (tx) => {
        const antes = await tx.produtoAcabamento.findMany({ where: { produtoId } })
        await tx.produtoAcabamento.deleteMany({ where: { produtoId } })
        // Obrigatório implica padrão (sempre vem marcado no orçamento)
        await tx.produtoAcabamento.createMany({
          data: itens.map((i) => ({ produtoId, acabamentoId: i.acabamentoId, obrigatorio: i.obrigatorio, padrao: i.padrao || i.obrigatorio })),
        })
        await registrarAuditoria(tx, { tabela: 'produto_acabamentos', registroId: produtoId, acao: 'editar', antes, depois: itens, usuarioId })
      })
    },

    async insumos(produtoId: string, itens: Insumos, usuarioId: string) {
      await garantirProduto(produtoId)
      semRepetidos(itens.map((i) => i.insumoId), 'Insumo repetido na ficha técnica.')
      if (itens.some((i) => i.insumoId === produtoId)) throw AppError.regraNegocio('Um produto não pode ser insumo dele mesmo.')
      const validos = await prisma.produto.count({
        where: { id: { in: itens.map((i) => i.insumoId) }, ativo: true, tipo: { in: ['insumo', 'revenda'] } },
      })
      if (validos !== itens.length) throw AppError.regraNegocio('A ficha técnica só aceita produtos do tipo insumo ou revenda, ativos.')

      await prisma.$transaction(async (tx) => {
        const antes = await tx.produtoInsumo.findMany({ where: { produtoId } })
        await tx.produtoInsumo.deleteMany({ where: { produtoId } })
        await tx.produtoInsumo.createMany({ data: itens.map((i) => ({ ...i, produtoId })) })
        await registrarAuditoria(tx, { tabela: 'produto_insumos', registroId: produtoId, acao: 'editar', antes, depois: itens, usuarioId })
      })
    },

    /** A ordem do roteiro é a ordem da lista. */
    async processos(produtoId: string, itens: Processos, usuarioId: string) {
      await garantirProduto(produtoId)
      semRepetidos(itens.map((i) => i.processoId), 'Processo repetido no roteiro.')
      const processosAtivos = await prisma.processo.count({ where: { id: { in: itens.map((i) => i.processoId) }, ativo: true } })
      if (processosAtivos !== itens.length) throw AppError.regraNegocio('Há processos inválidos ou desativados no roteiro.')
      const maquinas = [...new Set(itens.map((i) => i.maquinaId).filter((m): m is string => Boolean(m)))]
      if ((await prisma.maquina.count({ where: { id: { in: maquinas }, ativo: true } })) !== maquinas.length) {
        throw AppError.regraNegocio('Há máquinas inválidas ou desativadas no roteiro.')
      }

      await prisma.$transaction(async (tx) => {
        const antes = await tx.produtoProcesso.findMany({ where: { produtoId }, orderBy: { ordem: 'asc' } })
        await tx.produtoProcesso.deleteMany({ where: { produtoId } })
        await tx.produtoProcesso.createMany({
          data: itens.map((i, indice) => ({ produtoId, processoId: i.processoId, maquinaId: i.maquinaId ?? null, ordem: indice + 1 })),
        })
        await registrarAuditoria(tx, { tabela: 'produto_processos', registroId: produtoId, acao: 'editar', antes, depois: itens, usuarioId })
      })
    },
  }
}
