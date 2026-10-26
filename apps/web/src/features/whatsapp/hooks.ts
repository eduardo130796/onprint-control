import { useQuery } from '@tanstack/react-query'
import { CHAVE_CONVERSAS, whatsappApi } from '@/api/whatsapp'
import { usePermission } from '@/hooks/usePermission'

/** Conversas do WhatsApp abertas (bolinha no menu); o tempo real (conversa:atualizada) atualiza na hora */
export function useContagemConversas() {
  const pode = usePermission('whatsapp', 'visualizar')
  return useQuery({
    queryKey: [...CHAVE_CONVERSAS, 'contagem'],
    queryFn: whatsappApi.contagemConversas,
    enabled: pode,
    refetchInterval: 2 * 60 * 1000,
    select: (r) => r.abertas,
  })
}
