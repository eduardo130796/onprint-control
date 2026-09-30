import fp from 'fastify-plugin'
import { Server } from 'socket.io'
import type { AccessTokenPayload } from './auth'

export type EventoTempoReal = 'op:atualizada' | 'pedido:atualizado' | 'notificacao:nova'

declare module 'fastify' {
  interface FastifyInstance {
    tempoReal: {
      /** Envia um evento para uma ou mais salas ("producao", "pedidos", "usuario:{id}"). */
      emitir: (salas: string | string[], evento: EventoTempoReal, dados: Record<string, unknown>) => void
    }
  }
}

/**
 * Socket.IO (seção 10): conexão autenticada com o access token e salas por assunto.
 * O front usa os eventos só para invalidar as queries; os dados vêm sempre da API REST.
 */
export const socketPlugin = fp(async (app) => {
  const io = new Server(app.server, {
    path: '/socket.io',
    cors: { origin: app.config.APP_URL, credentials: true },
  })

  io.use((socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '')
      const payload = app.jwt.verify<AccessTokenPayload>(token)
      if (payload.dts) return next(new Error('TROCA_SENHA_OBRIGATORIA'))
      socket.data.usuarioId = payload.sub
      socket.data.papelId = payload.papelId
      next()
    } catch {
      next(new Error('NAO_AUTENTICADO'))
    }
  })

  io.on('connection', async (socket) => {
    const permissoes = await app.permissoesDoPapel(socket.data.papelId as string)
    await socket.join(`usuario:${socket.data.usuarioId}`)
    if (permissoes.has('producao:visualizar') || permissoes.has('pcp:visualizar')) await socket.join('producao')
    if (permissoes.has('pedidos:visualizar')) await socket.join('pedidos')
  })

  app.decorate('tempoReal', {
    emitir: (salas, evento, dados) => {
      io.to(salas).emit(evento, dados)
    },
  })

  // Só desconecta os clientes: o servidor HTTP é fechado pelo próprio Fastify
  app.addHook('onClose', async () => {
    io.disconnectSockets(true)
  })
})
