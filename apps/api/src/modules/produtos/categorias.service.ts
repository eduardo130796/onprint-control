import type { FastifyInstance } from 'fastify'
import type { categoriaSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'

type Dados = z.output<typeof categoriaSchema>

/** Categorias em árvore (pai_id). A lista vem inteira, com o caminho completo de cada uma. */
export function criarCategoriasService(app: FastifyInstance) {
  const { prisma } = app

  async function todas() {
    return prisma.categoria.findMany({ include: { _count: { select: { produtos: true } } } })
  }

  function caminhos(lista: { id: string; nome: string; paiId: string | null }[]) {
    const porId = new Map(lista.map((c) => [c.id, c]))
    const cache = new Map<string, string>()
    const caminho = (id: string, visitados = new Set<string>()): string => {
      const salvo = cache.get(id)
      if (salvo) return salvo
      const c = porId.get(id)
      if (!c) return ''
      if (visitados.has(id)) return c.nome // proteção contra ciclo
      visitados.add(id)
      const texto = c.paiId && porId.has(c.paiId) ? `${caminho(c.paiId, visitados)} › ${c.nome}` : c.nome
      cache.set(id, texto)
      return texto
    }
    return caminho
  }

  async function validar(dados: Dados, id: string | null) {
    if (!dados.paiId) return
    if (dados.paiId === id) throw AppError.regraNegocio('Uma categoria não pode ser pai dela mesma.')
    const lista = await prisma.categoria.findMany({ select: { id: true, paiId: true } })
    const paiDe = new Map(lista.map((c) => [c.id, c.paiId]))
    if (!paiDe.has(dados.paiId)) throw AppError.regraNegocio('Categoria pai não encontrada.')
    // O novo pai não pode ser descendente da própria categoria (evita ciclo)
    for (let atual: string | null | undefined = dados.paiId; atual; atual = paiDe.get(atual)) {
      if (atual === id) throw AppError.regraNegocio('A categoria pai não pode ser uma subcategoria desta.')
    }
  }

  async function obter(id: string) {
    const c = await prisma.categoria.findUnique({ where: { id } })
    if (!c) throw AppError.naoEncontrado('Categoria não encontrada.')
    return c
  }

  return {
    async listar(ativo: 'true' | 'false' | 'todos') {
      const lista = await todas()
      const caminho = caminhos(lista)
      return lista
        .filter((c) => ativo === 'todos' || c.ativo === (ativo === 'true'))
        .map((c) => ({ ...c, caminho: caminho(c.id) }))
        .sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR'))
    },

    async criar(dados: Dados, usuarioId: string) {
      await validar(dados, null)
      return prisma.$transaction(async (tx) => {
        const c = await tx.categoria.create({ data: { ...dados, createdBy: usuarioId } })
        await registrarAuditoria(tx, { tabela: 'categorias', registroId: c.id, acao: 'criar', depois: c, usuarioId })
        return c
      })
    },

    async atualizar(id: string, dados: Dados, usuarioId: string) {
      const antes = await obter(id)
      await validar(dados, id)
      return prisma.$transaction(async (tx) => {
        const c = await tx.categoria.update({ where: { id }, data: dados })
        await registrarAuditoria(tx, { tabela: 'categorias', registroId: id, acao: 'editar', antes, depois: c, usuarioId })
        return c
      })
    },
  }
}
