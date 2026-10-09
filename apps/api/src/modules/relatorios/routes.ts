import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { RELATORIOS, lucratividadeQuerySchema, relatorioParamSchema, relatorioQuerySchema, type Relatorio, type TipoRelatorio } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import type { Contexto } from './comum'
import { relatorioComissoes } from './comissoes'
import { relatorioEstoque } from './estoque'
import { relatorioFinanceiro } from './financeiro'
import { relatorioLucratividade } from './lucratividade'
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
  // Lucratividade (fase 3 da precificação): também exige ver custos (produtos:editar)
  app.get(
    '/relatorios/lucratividade',
    {
      onRequest: [
        app.exigirPermissao('relatorios', 'visualizar'),
        async (req) => {
          if (!(await app.temPermissao(req, 'produtos', 'editar'))) throw AppError.semPermissao('Você não pode ver custos e lucro.')
        },
      ],
      schema: { tags: ['relatorios'], summary: 'Lucro por pedido ou por produto (estimado × real de materiais)', querystring: lucratividadeQuerySchema },
    },
    (req) => {
      if (req.query.inicio > req.query.fim) throw AppError.regraNegocio('A data final deve ser depois da inicial.')
      return relatorioLucratividade(app.prisma, req.query)
    },
  )

  app.get(
    '/relatorios/:tipo',
    {
      onRequest: [app.exigirPermissao('relatorios', 'visualizar')],
      schema: { tags: ['relatorios'], summary: 'Relatório (vendas, orçamentos, produção, estoque, financeiro, comissões)', params: relatorioParamSchema, querystring: relatorioQuerySchema },
    },
    async (req) => {
      const { tipo } = req.params
      if (!(req.query.visao in RELATORIOS[tipo].visoes)) throw AppError.regraNegocio('Visão de relatório inválida.')
      return GERADORES[tipo]({ prisma: app.prisma, de: req.query.de, ate: req.query.ate, veCustos: await app.temPermissao(req, 'produtos', 'editar') }, req.query.visao)
    },
  )
}
