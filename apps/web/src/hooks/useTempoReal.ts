import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { toast } from 'sonner'
import type { EventoOrcamento, EventoSolicitacao } from '@onprint/shared'
import { obterAccessToken, renovarSessao } from '@/api/http'
import { useAuth } from '@/hooks/useAuth'
import { avisoDaNotificacao, avisoDaSolicitacao, avisoDoOrcamento, chavesDoEvento, type AvisoTempoReal, type Espectador, type EventoNotificacao } from '@/lib/tempoReal'

/** Listas que podem ter mudado sem a conexão aberta (antes de conectar ou com ela caída) */
const AO_RECONECTAR = ['orcamentos', 'solicitacoes', 'pedidos', 'ops', 'pcp', 'notificacoes', 'dashboard', 'financeiro']

/**
 * Tempo real (Socket.IO): os eventos só invalidam as queries — os dados vêm sempre da API REST.
 * Montado uma vez no layout autenticado. Ao reconectar usa o token atual; se ele expirou, renova.
 * Avisos flutuantes só para o que importa e nunca para quem fez a ação (regras em lib/tempoReal).
 */
export function useTempoReal(ativo: boolean) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { usuario } = useAuth()
  // Quem vê e para onde navegar mudam sem refazer a conexão
  const contexto = useRef<{ eu: Espectador; navigate: typeof navigate }>({ eu: { usuarioId: null, veTodosOrcamentos: false }, navigate })
  useEffect(() => {
    contexto.current = {
      eu: { usuarioId: usuario?.id ?? null, veTodosOrcamentos: Boolean(usuario?.permissoes.includes('orcamentos:ver_todos')) },
      navigate,
    }
  }, [usuario, navigate])

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
    // A API desconecta quando o token vence ou o papel muda: reconecta com o token atual (renova se preciso)
    socket.on('disconnect', (motivo) => {
      if (motivo === 'io server disconnect') socket.connect()
    })

    const invalidar = (chaves: string[]) => {
      for (const chave of new Set(chaves)) void queryClient.invalidateQueries({ queryKey: [chave] })
    }
    const avisar = (aviso: AvisoTempoReal | null) => {
      if (!aviso) return
      const { acao } = aviso
      // Com atalho, fica mais tempo na tela (dá tempo de clicar em "Abrir pedido")
      toast.info(aviso.mensagem, acao ? { duration: 10_000, action: { label: acao.rotulo, onClick: () => contexto.current.navigate(acao.link) } } : undefined)
    }

    // Conectou (ou voltou depois de cair): o que mudou entre carregar a tela e conectar não chegou
    // por evento. Só as queries da tela aberta são buscadas de novo
    socket.on('connect', () => invalidar(AO_RECONECTAR))
    socket.on('op:atualizada', () => invalidar(chavesDoEvento('op:atualizada')))
    socket.on('pedido:atualizado', () => invalidar(chavesDoEvento('pedido:atualizado')))
    socket.on('orcamento:atualizado', (dados: EventoOrcamento) => {
      invalidar(chavesDoEvento('orcamento:atualizado', dados))
      avisar(avisoDoOrcamento(dados, contexto.current.eu))
    })
    for (const evento of ['solicitacao:nova', 'solicitacao:atualizada'] as const) {
      socket.on(evento, (dados: EventoSolicitacao) => {
        invalidar(chavesDoEvento(evento))
        avisar(avisoDaSolicitacao(evento, dados, contexto.current.eu))
      })
    }
    socket.on('notificacao:nova', (dados: EventoNotificacao) => {
      invalidar(chavesDoEvento('notificacao:nova', dados))
      avisar(avisoDaNotificacao(dados))
    })

    return () => {
      socket.disconnect()
    }
  }, [ativo, queryClient])
}
