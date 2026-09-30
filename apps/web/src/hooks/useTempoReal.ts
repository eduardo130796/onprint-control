import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { toast } from 'sonner'
import { obterAccessToken, renovarSessao } from '@/api/http'

/**
 * Tempo real (Socket.IO): os eventos só invalidam as queries — os dados vêm sempre da API REST.
 * Montado uma vez no layout autenticado. Ao reconectar usa o token atual; se ele expirou, renova.
 */
export function useTempoReal(ativo: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!ativo) return
    const socket = io({ path: '/socket.io', transports: ['websocket'], auth: (cb) => cb({ token: obterAccessToken() }) })
    let renovando = false

    socket.on('connect_error', async (erro) => {
      if (erro.message !== 'NAO_AUTENTICADO' || renovando) return
      renovando = true
      const ok = await renovarSessao()
      renovando = false
      if (ok) socket.connect()
    })

    const invalidar = (...chaves: string[]) => {
      for (const chave of chaves) void queryClient.invalidateQueries({ queryKey: [chave] })
    }
    // Concluir OP baixa insumos: o estoque também muda
    socket.on('op:atualizada', () => invalidar('ops', 'pcp', 'pedidos', 'estoque'))
    socket.on('pedido:atualizado', () => invalidar('pedidos', 'entregas', 'ops', 'estoque', 'financeiro'))
    socket.on('notificacao:nova', (dados: { titulo?: string; estoque?: boolean }) => {
      if (dados.titulo) toast.info(dados.titulo)
      invalidar('notificacoes', ...(dados.estoque ? ['estoque'] : []))
    })

    return () => {
      socket.disconnect()
    }
  }, [ativo, queryClient])
}
