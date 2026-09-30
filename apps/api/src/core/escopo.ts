import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Modulo } from '@onprint/shared'

/** Contexto do usuário para os services (quem é e o que pode além da permissão da rota). */
export interface ContextoUsuario {
  usuarioId: string
  /** Tem `ver_todos` no módulo: enxerga registros de outros vendedores */
  veTodos: boolean
  /** Tem `aprovar` no módulo (ex.: preço abaixo do mínimo) */
  podeAprovar: boolean
  /** Vê custos e margens (produtos:editar) */
  veCustos: boolean
}

export async function contextoUsuario(app: FastifyInstance, request: FastifyRequest, modulo: Modulo): Promise<ContextoUsuario> {
  const [veTodos, podeAprovar, veCustos] = await Promise.all([
    app.temPermissao(request, modulo, 'ver_todos'),
    app.temPermissao(request, modulo, 'aprovar'),
    app.temPermissao(request, 'produtos', 'editar'),
  ])
  return { usuarioId: request.user.sub, veTodos, podeAprovar, veCustos }
}

/** Filtro "somente os meus": sem `ver_todos`, só registros em que o usuário é o dono. */
export function escopoProprio(ctx: ContextoUsuario, campo: string): Record<string, string> {
  return ctx.veTodos ? {} : { [campo]: ctx.usuarioId }
}
