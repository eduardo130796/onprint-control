import type { FastifyInstance } from 'fastify'
import type { cadastroQuerySchema, maquinaSchema, maquinasQuerySchema, processoSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { criarCrud } from '../../core/crud'
import type { CustosService } from './custos.service'

/** Máquinas e processos usam o CRUD padrão (acabamentos: acabamentos.service.ts); custo/hora e tempo recalculam as composições. */
export function criarCadastrosProdutos(app: FastifyInstance, custos: CustosService) {
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

  // Mudou o que entra no custo de produção: recalcula os produtos em composição (depois do commit)
  const mudou = (antes: Record<string, unknown>, depois: Record<string, unknown>, campos: string[]) => campos.some((c) => String(antes[c] ?? '') !== String(depois[c] ?? ''))
  const maquinasComCusto = {
    ...maquinas,
    async atualizar(id: string, dados: z.output<typeof maquinaSchema>, usuarioId: string) {
      const antes = await maquinas.obter(id)
      const depois = await maquinas.atualizar(id, dados, usuarioId)
      if (mudou(antes, depois, ['custoHora', 'velocidadeM2Hora'])) await custos.aposMudarMaquina(depois)
      return depois
    },
  }
  const processosComCusto = {
    ...processos,
    async atualizar(id: string, dados: z.output<typeof processoSchema>, usuarioId: string) {
      const antes = await processos.obter(id)
      const depois = await processos.atualizar(id, dados, usuarioId)
      if (mudou(antes, depois, ['custoHora', 'tempoPadraoMinutos', 'maquinaPadraoId'])) await custos.aposMudarProcesso(depois)
      return depois
    },
  }

  return { maquinas: maquinasComCusto, processos: processosComCusto }
}
