import type { FastifyInstance } from 'fastify'
import type { acabamentoSchema, cadastroQuerySchema, maquinaSchema, maquinasQuerySchema, processoSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { criarCrud } from '../../core/crud'

/** Acabamentos, máquinas e processos usam o CRUD padrão (core/crud). */
export function criarCadastrosProdutos(app: FastifyInstance) {
  const acabamentos = criarCrud<z.output<typeof acabamentoSchema>, z.output<typeof cadastroQuerySchema>>(app, {
    tabela: 'acabamentos',
    rotulo: 'Acabamento',
    delegate: (db) => db.acabamento,
    busca: ['nome', 'descricao'],
    ordenaveis: ['nome', 'valor', 'createdAt'],
    padrao: { campo: 'nome', direcao: 'asc' },
  })

  const maquinas = criarCrud<z.output<typeof maquinaSchema>, z.output<typeof maquinasQuerySchema>>(app, {
    tabela: 'maquinas',
    rotulo: 'Máquina',
    delegate: (db) => db.maquina,
    busca: ['nome', 'tipo'],
    ordenaveis: ['nome', 'status', 'createdAt'],
    padrao: { campo: 'nome', direcao: 'asc' },
    filtros: (q) => (q.status ? { status: q.status } : {}),
  })

  const processos = criarCrud<z.output<typeof processoSchema>, z.output<typeof cadastroQuerySchema>>(app, {
    tabela: 'processos',
    rotulo: 'Processo',
    delegate: (db) => db.processo,
    include: { maquinaPadrao: { select: { id: true, nome: true } } },
    busca: ['nome', 'descricao'],
    ordenaveis: ['nome', 'createdAt'],
    padrao: { campo: 'nome', direcao: 'asc' },
    validar: async (dados) => {
      if (!dados.maquinaPadraoId) return
      const maquina = await app.prisma.maquina.findUnique({ where: { id: dados.maquinaPadraoId } })
      if (!maquina?.ativo) throw AppError.regraNegocio('Máquina padrão inválida ou desativada.')
    },
  })

  return { acabamentos, maquinas, processos }
}
