import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { Acabamento, acabamentoSchema, cadastroQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { criarCrud } from '../../core/crud'
import { incluirAcabamentoCusto } from './custos.service'

type Dados = z.output<typeof acabamentoSchema>
type Query = z.output<typeof cadastroQuerySchema>
type AcabamentoDb = Prisma.AcabamentoGetPayload<{ include: typeof incluirAcabamentoCusto }>

/** Saída do acabamento com os insumos que ele gasta (custo do insumo só para quem vê custos). */
function formatar(a: AcabamentoDb, veCustos: boolean): Acabamento {
  const { insumos, ...resto } = a
  return {
    ...(resto as unknown as Acabamento),
    materiais: insumos.map((i) => ({
      insumoId: i.insumoId,
      nome: i.insumo.nome,
      unidade: i.insumo.unidadeMedida?.sigla ?? '',
      quantidade: i.quantidade.toString(),
      perdaPercentual: i.perdaPercentual.toFixed(2),
      ...(veCustos ? { custoUnitario: i.insumo.custo.toFixed(4) } : {}),
    })),
  }
}

/**
 * Acabamentos (fase 3 da precificação): CRUD padrão + os insumos que o acabamento consome por unidade da
 * cobrança ("O que este acabamento gasta"). `materiais` não enviado = não mexe (telas antigas).
 */
export function criarAcabamentosService(app: FastifyInstance) {
  const { prisma } = app
  const crud = criarCrud<Dados, Query>(app, {
    tabela: 'acabamentos',
    rotulo: 'Acabamento',
    delegate: (db) => db.acabamento,
    include: incluirAcabamentoCusto,
    busca: ['nome', 'descricao'],
    ordenaveis: ['nome', 'valor', 'createdAt'],
    padrao: { campo: 'nome', direcao: 'asc' },
  })

  async function validarMateriais(materiais: Dados['materiais']) {
    if (!materiais?.length) return
    const ids = materiais.map((m) => m.insumoId)
    if (new Set(ids).size !== ids.length) throw AppError.regraNegocio('Insumo repetido no acabamento.')
    const validos = await prisma.produto.count({ where: { id: { in: ids }, ativo: true, tipo: { in: ['insumo', 'revenda'] } } })
    if (validos !== ids.length) throw AppError.regraNegocio('Os materiais do acabamento precisam ser insumos (ou produtos de revenda) ativos.')
  }

  const linhas = (acabamentoId: string, materiais: NonNullable<Dados['materiais']>) =>
    materiais.map((m, i) => ({ acabamentoId, insumoId: m.insumoId, quantidade: m.quantidade, perdaPercentual: m.perdaPercentual, ordem: i + 1 }))

  return {
    async listar(q: Query, veCustos: boolean) {
      const r = await crud.listar(q)
      return { ...r, data: (r.data as AcabamentoDb[]).map((a) => formatar(a, veCustos)) }
    },

    obter: async (id: string, veCustos: boolean) => formatar((await crud.obter(id)) as AcabamentoDb, veCustos),

    async criar(d: Dados, usuarioId: string, veCustos: boolean) {
      await validarMateriais(d.materiais)
      const { materiais, ...dados } = d
      const id = await prisma.$transaction(async (tx) => {
        const a = await tx.acabamento.create({ data: { ...dados, createdBy: usuarioId } })
        if (materiais?.length) await tx.acabamentoInsumo.createMany({ data: linhas(a.id, materiais) })
        await registrarAuditoria(tx, { tabela: 'acabamentos', registroId: a.id, acao: 'criar', depois: { ...a, materiais: materiais ?? [] }, usuarioId })
        return a.id
      })
      return this.obter(id, veCustos)
    },

    async atualizar(id: string, d: Dados, usuarioId: string, veCustos: boolean) {
      const antes = (await crud.obter(id)) as AcabamentoDb
      await validarMateriais(d.materiais)
      const { materiais, ...dados } = d
      await prisma.$transaction(async (tx) => {
        const depois = await tx.acabamento.update({ where: { id }, data: dados })
        if (materiais !== undefined) {
          await tx.acabamentoInsumo.deleteMany({ where: { acabamentoId: id } })
          if (materiais.length) await tx.acabamentoInsumo.createMany({ data: linhas(id, materiais) })
        }
        await registrarAuditoria(tx, {
          tabela: 'acabamentos',
          registroId: id,
          acao: 'editar',
          antes: { ...antes, insumos: antes.insumos.map((i) => ({ insumoId: i.insumoId, quantidade: i.quantidade, perdaPercentual: i.perdaPercentual })) },
          depois: { ...depois, ...(materiais !== undefined ? { materiais } : {}) },
          usuarioId,
        })
      })
      return this.obter(id, veCustos)
    },

    alterarAtivo: async (id: string, ativo: boolean, usuarioId: string, veCustos: boolean) => formatar((await crud.alterarAtivo(id, ativo, usuarioId)) as AcabamentoDb, veCustos),
  }
}
