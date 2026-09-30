import type { FastifyInstance, FastifyRequest } from 'fastify'
import { formatarTelefone, somenteDigitos, type ResultadoBusca } from '@onprint/shared'

/**
 * Busca global (Ctrl+K): clientes (nome, documento, telefone), orçamentos e pedidos (número ou cliente).
 * Cada grupo só aparece com a permissão do módulo; sem "ver todos", só os do próprio vendedor.
 */
export function criarBuscaService(app: FastifyInstance) {
  const { prisma } = app
  return {
    async buscar(req: FastifyRequest, termo: string): Promise<ResultadoBusca> {
      const [clientes, orcamentos, pedidos, todosOrc, todosPed] = await Promise.all([
        app.temPermissao(req, 'clientes', 'visualizar'),
        app.temPermissao(req, 'orcamentos', 'visualizar'),
        app.temPermissao(req, 'pedidos', 'visualizar'),
        app.temPermissao(req, 'orcamentos', 'ver_todos'),
        app.temPermissao(req, 'pedidos', 'ver_todos'),
      ])
      const texto = { contains: termo, mode: 'insensitive' as const }
      const digitos = somenteDigitos(termo)
      const uid = req.user.sub

      const [cs, os, ps] = await Promise.all([
        clientes
          ? prisma.cliente.findMany({
              where: { OR: [{ nome: texto }, { fantasia: texto }, ...(digitos.length >= 3 ? [{ cpfCnpj: { contains: digitos } }, { whatsapp: { contains: digitos } }, { telefone: { contains: digitos } }] : [])] },
              select: { id: true, nome: true, whatsapp: true, telefone: true, email: true },
              orderBy: { nome: 'asc' },
              take: 6,
            })
          : [],
        orcamentos
          ? prisma.orcamento.findMany({
              where: { ...(todosOrc ? {} : { vendedorId: uid }), OR: [{ numero: texto }, { cliente: { nome: texto } }] },
              select: { id: true, numero: true, status: true, cliente: { select: { nome: true } } },
              orderBy: { createdAt: 'desc' },
              take: 6,
            })
          : [],
        pedidos
          ? prisma.pedido.findMany({
              where: { ...(todosPed ? {} : { vendedorId: uid }), OR: [{ numero: texto }, { cliente: { nome: texto } }] },
              select: { id: true, numero: true, status: true, cliente: { select: { nome: true } } },
              orderBy: { createdAt: 'desc' },
              take: 6,
            })
          : [],
      ])
      return {
        clientes: cs.map((c) => ({ id: c.id, nome: c.nome, detalhe: [formatarTelefone(c.whatsapp ?? c.telefone), c.email].filter(Boolean).join(' · ') || null })),
        orcamentos: os.map((o) => ({ id: o.id, numero: o.numero, cliente: o.cliente.nome, status: o.status })),
        pedidos: ps.map((p) => ({ id: p.id, numero: p.numero, cliente: p.cliente.nome, status: p.status })),
      }
    },
  }
}
