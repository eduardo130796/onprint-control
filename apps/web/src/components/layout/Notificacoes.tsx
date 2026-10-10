import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { formatarDataHora, type Notificacao } from '@onprint/shared'
import { notificacoesApi } from '@/api/relatorios'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

/** Central de notificações (sino da barra): últimas 20, contador de não lidas e "marcar todas". Atualiza pelo tempo real. */
export function Notificacoes() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const lista = useQuery({ queryKey: ['notificacoes'], queryFn: () => notificacoesApi.listar({ pageSize: 20 }), refetchInterval: 5 * 60 * 1000, enabled: usuario?.assinatura?.nivel !== 'bloqueado' })
  const naoLidas = lista.data?.naoLidas ?? 0
  const atualizar = () => queryClient.invalidateQueries({ queryKey: ['notificacoes'] })

  async function abrir(n: Notificacao) {
    if (!n.lida) await notificacoesApi.marcarLida(n.id).catch(() => undefined)
    void atualizar()
    if (n.link) navigate(n.link)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 data-[state=open]:bg-white/10 data-[state=open]:text-white"
          aria-label={`Notificações${naoLidas ? ` (${naoLidas} não lidas)` : ''}`}
        >
          <Bell className="h-[1.125rem] w-[1.125rem]" />
          {naoLidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[1.125rem] rounded-full bg-laranja-escuro px-1 text-center text-[0.625rem] font-bold leading-[1.125rem] text-white ring-2 ring-grafite tabular-nums">{naoLidas > 99 ? '99+' : naoLidas}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-tinta">Notificações</span>
          {naoLidas > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void notificacoesApi.marcarTodas().then(atualizar)}>
              <CheckCheck /> Marcar todas como lidas
            </Button>
          )}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {(lista.data?.data ?? []).map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => void abrir(n)} className={cn('flex w-full gap-2 border-b border-border px-3 py-2.5 text-left text-sm last:border-0 hover:bg-fundo', !n.lida && 'bg-marca/5')}>
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.lida ? 'bg-transparent' : 'bg-marca')} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block', !n.lida && 'font-semibold')}>{n.titulo}</span>
                  <span className="block whitespace-pre-line text-xs text-texto-secundario">{n.mensagem}</span>
                  <span className="block text-[0.6875rem] text-texto-secundario">{formatarDataHora(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
          {lista.data?.data.length === 0 && <li className="px-3 py-8 text-center text-sm text-texto-secundario">Nenhuma notificação.</li>}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
