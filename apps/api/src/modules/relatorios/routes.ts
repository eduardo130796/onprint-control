import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { RELATORIOS, relatorioParamSchema, relatorioQuerySchema, type Relatorio, type TipoRelatorio } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import type { Contexto } from './comum'
import { relatorioComissoes } from './comissoes'
import { relatorioEstoque } from './estoque'
import { relatorioFinanceiro } from './financeiro'
import { relatorioOrcamentos } from './orcamentos'
import { relatorioProducao } from './producao'
import { relatorioVendas } from './vendas'

const GERADORES: Record<TipoRelatorio, (c: Contexto, visao: string) => Promise<Relatorio>> = {
  vendas: relatorioVendas,
  orcamentos: relatorioOrcamentos,
  producao: relatorioProducao,
  estoque: relatorioEstoque,
  financeiro: relatorioFinanceiro,
  comissoes: relatorioComissoes,
}

/** Relatórios (seção 11): agregações SQL no banco, formato único para tela, CSV e PDF. */
export const relatoriosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/relatorios/:tipo',
    {
      onRequest: [app.exigirPermissao('relatorios', 'visualizar')],
      schema: { tags: ['relatorios'], summary: 'Relatório (vendas, orçamentos, produção, estoque, financeiro, comissões)', params: relatorioParamSchema, querystring: relatorioQuerySchema },
    },
    (req) => {
      const { tipo } = req.params
      if (!(req.query.visao in RELATORIOS[tipo].visoes)) throw AppError.regraNegocio('Visão de relatório inválida.')
      return GERADORES[tipo]({ prisma: app.prisma, de: req.query.de, ate: req.query.ate }, req.query.visao)
    },
  )
}
