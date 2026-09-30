import { Link } from 'react-router-dom'
import { MessageCircle, MessageSquareText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IntegracaoFutura } from '@/components/shared/IntegracaoFutura'
import { PageHeader } from '@/components/layout/PageHeader'

export function WhatsAppPage({ titulo = 'WhatsApp' }: { titulo?: string }) {
  return (
    <>
      <PageHeader titulo={titulo} />
      <IntegracaoFutura
        icone={MessageCircle}
        titulo="Integração com WhatsApp"
        descricao="A caixa de entrada de conversas, o envio automático de mensagens e o pré-cadastro de clientes a partir do WhatsApp chegam numa próxima etapa. Por enquanto, use os templates de mensagens e o botão “Copiar mensagem” para colar o texto no WhatsApp."
        acao={
          <Button asChild variant="outline">
            <Link to="/configuracoes/templates">
              <MessageSquareText /> Templates de mensagens
            </Link>
          </Button>
        }
      />
    </>
  )
}
