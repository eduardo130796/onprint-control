import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermission'
import { linkWhatsappEnvio, mensagemCatalogo } from './divulgar'
import { useVitrineConfig } from './hooks'

/**
 * "Enviar catálogo" (painel e ficha do cliente, painel da solicitação): abre o WhatsApp do cliente com a mensagem
 * pronta e o link da vitrine. Só aparece com o módulo `vitrine` e o site no ar.
 */
export function useEnviarCatalogo() {
  const pode = usePermissoes()
  const { usuario } = useAuth()
  const permitido = pode('vitrine')
  const config = useVitrineConfig(permitido)
  const c = config.data
  const disponivel = Boolean(permitido && c?.ativa && c.liberadaNoPlano)

  function enviar(cliente: { nome: string; whatsapp?: string | null; telefone?: string | null }) {
    if (!c) return
    const loja = (c.titulo || usuario?.empresa.exibicao || '').trim()
    const mensagem = mensagemCatalogo({ nome: cliente.nome, loja, link: c.urlPublica })
    window.open(linkWhatsappEnvio(cliente.whatsapp || cliente.telefone, mensagem), '_blank', 'noopener')
  }

  return { disponivel, enviar }
}
