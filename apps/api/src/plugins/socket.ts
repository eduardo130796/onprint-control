import fp from 'fastify-plugin'
import { Server } from 'socket.io'
import { contextoEmpresa } from '../core/contexto-empresa'
import type { AccessTokenPayload } from './auth'

export type EventoTempoReal = 'op:atualizada' | 'pedido:atualizado' | 'notificacao:nova'

declare module 'fastify' {
  interface FastifyInstance {
    tempoReal: {
      /** Envia um evento para salas da empresa atual ("producao", "pedidos", "usuario:{id}"). */
      emitir: (salas: string | string[], evento: EventoTempoReal, dados: Record<string, unknown>) => void
    }
  }
}

/**
 * Socket.IO (seção 10): conexão autenticada com o access token e salas por assunto,
 * sempre prefixadas pela empresa ("{empresa}:pedidos"): um evento nunca chega a outra empresa.
 * O front usa os eventos só para invalidar as queries; os dados vêm sempre da API REST.
 */
export const socketPlugin = fp(async (app) => {
  const io = new Server(app.server, {
    path: '/socket.io',
    cors: { origin: app.config.APP_URL, credentials: true },
  })

  /** Usuário ainda ativo e com o mesmo papel (consulta o banco da empresa, com o cache curto da autenticação). */
  async function usuarioValido(empresaId: string, usuarioId: string, papelId: string) {
    const empresa = await app.empresas.porId(empresaId)
    if (!empresa) return false
    const usuario = await contextoEmpresa.com(empresa, () => app.situacaoUsuario(empresa.id, usuarioId))
    return Boolean(usuario?.ativo && usuario.papelId === papelId)
  }

  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '')
      const payload = app.jwt.verify<AccessTokenPayload & { exp?: number; plat?: boolean }>(token)
      if (payload.plat) return next(new Error('NAO_AUTENTICADO'))
      if (payload.dts) return next(new Error('TROCA_SENHA_OBRIGATORIA'))
      const empresa = await app.empresas.porId(payload.emp)
      const usuario = empresa && (await contextoEmpresa.com(empresa, () => app.situacaoUsuario(empresa.id, payload.sub)))
      if (!usuario?.ativo) return next(new Error('NAO_AUTENTICADO'))
      socket.data.usuarioId = payload.sub
      // Salas pelo papel atual do banco (o do token pode estar desatualizado)
      socket.data.papelId = usuario.papelId
      socket.data.empresaId = payload.emp
      socket.data.expira = (payload.exp ?? 0) * 1000
      next()
    } catch {
      next(new Error('NAO_AUTENTICADO'))
    }
  })

  io.on('connection', async (socket) => {
    const empresa = await app.empresas.porId(socket.data.empresaId as string)
    if (!empresa) return void socket.disconnect(true)
    const sala = (nome: string) => `${empresa.id}:${nome}`
    const permissoes = await contextoEmpresa.com(empresa, () => app.permissoesDoPapel(socket.data.papelId as string))
    await socket.join(sala(`usuario:${socket.data.usuarioId}`))
    if (permissoes.has('producao:visualizar') || permissoes.has('pcp:visualizar')) await socket.join(sala('producao'))
    if (permissoes.has('pedidos:visualizar')) await socket.join(sala('pedidos'))
  })

  // A cada minuto: token vencido, usuário desativado ou com papel trocado → desconecta
  // (o front reconecta com o token atual e as salas são refeitas pelo papel novo)
  const revalidacao = setInterval(() => {
    void (async () => {
      for (const socket of io.sockets.sockets.values()) {
        const { empresaId, usuarioId, papelId, expira } = socket.data as { empresaId?: string; usuarioId?: string; papelId?: string; expira?: number }
        if (!empresaId || !usuarioId || !papelId) continue
        const valido = (expira ?? 0) > Date.now() && (await usuarioValido(empresaId, usuarioId, papelId).catch(() => true))
        if (!valido) socket.disconnect(true)
      }
    })()
  }, 60_000)
  revalidacao.unref()

  app.decorate('tempoReal', {
    emitir: (salas, evento, dados) => {
      const empresaId = contextoEmpresa.exigir().id
      io.to((Array.isArray(salas) ? salas : [salas]).map((s) => `${empresaId}:${s}`)).emit(evento, dados)
    },
  })

  // Só desconecta os clientes: o servidor HTTP é fechado pelo próprio Fastify
  app.addHook('onClose', async () => {
    clearInterval(revalidacao)
    io.disconnectSockets(true)
  })
})
