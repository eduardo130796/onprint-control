import type { FastifyInstance } from 'fastify'
import { calcularPreco, type ResultadoPreco, type simulacaoSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'

type Simulacao = z.output<typeof simulacaoSchema>

/**
 * Preço calculado pela API com os dados do banco (preço, medidas máximas, acabamentos e área mínima
 * da empresa). O front mostra os mesmos valores ao vivo com o mesmo motor (@onprint/shared/pricing),
 * mas quem vale é este cálculo.
 */
export function criarPrecificacaoService(app: FastifyInstance) {
  const { prisma } = app

  return {
    async simular(produtoId: string, dados: Simulacao): Promise<ResultadoPreco & { acabamentosAplicados: string[] }> {
      const produto = await prisma.produto.findUnique({
        where: { id: produtoId },
        include: { acabamentos: { include: { acabamento: true } } },
      })
      if (!produto?.ativo) throw AppError.naoEncontrado('Produto não encontrado ou desativado.')

      // Obrigatórios sempre entram; os demais só se pedidos
      const obrigatorios = produto.acabamentos.filter((pa) => pa.obrigatorio).map((pa) => pa.acabamentoId)
      const ids = [...new Set([...obrigatorios, ...dados.acabamentoIds])]
      const acabamentos = await prisma.acabamento.findMany({ where: { id: { in: ids }, ativo: true } })
      if (acabamentos.length !== ids.length) throw AppError.regraNegocio('Há acabamentos inválidos ou desativados.')

      const empresa = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { areaMinimaM2: true } })
      const resultado = calcularPreco({
        modoCalculo: produto.modoCalculo,
        precoUnitario: dados.precoUnitario ?? produto.precoVenda.toString(),
        custoUnitario: produto.custo.toString(),
        precoMinimo: produto.precoMinimo?.toString(),
        quantidade: dados.quantidade,
        largura: dados.largura,
        altura: dados.altura,
        areaMinimaM2: empresa?.areaMinimaM2.toString(),
        medidasMaximas: { largura: produto.larguraMaxima?.toString(), altura: produto.alturaMaxima?.toString() },
        // Mantém a ordem de cadastro do produto para o resultado ficar estável
        acabamentos: ids
          .map((id) => acabamentos.find((a) => a.id === id)!)
          .map((a) => ({ id: a.id, nome: a.nome, tipoCobranca: a.tipoCobranca, valor: a.valor.toString(), custo: a.custo.toString() })),
      })
      return { ...resultado, acabamentosAplicados: ids }
    },
  }
}
