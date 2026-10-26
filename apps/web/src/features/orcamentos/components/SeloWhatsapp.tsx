import type { Orcamento } from '@onprint/shared'

/** Selo discreto do orçamento criado pelo Assistente no WhatsApp (📝 na conversa ou pedido na conversa "Você") */
export function SeloWhatsapp({ orcamento }: { orcamento: Pick<Orcamento, 'whatsapp'> }) {
  if (!orcamento.whatsapp) return null
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-verde/10 px-1.5 text-[0.6875rem] font-medium leading-5 text-green-800" title={orcamento.whatsapp.contato ? `Criado pelo WhatsApp (${orcamento.whatsapp.contato})` : 'Criado pelo WhatsApp'}>
      do WhatsApp
    </span>
  )
}
