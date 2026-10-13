import { TEXTOS_PADRAO_WHATSAPP, caminhoAcompanhamento, preencherMensagem, type EventoWhatsapp, type MensagemTemplate } from '@onprint/shared'

/** Texto do aviso: o template ativo da categoria do evento (o mais antigo, como na API) ou o texto padrão. */
export function textoDoEvento(evento: EventoWhatsapp, templates: MensagemTemplate[] | undefined): string {
  const ativos = (templates ?? []).filter((t) => t.categoria === evento && t.ativo).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return ativos[0]?.conteudo ?? TEXTOS_PADRAO_WHATSAPP[evento]
}

/** Prévia com dados de exemplo (como o cliente vai receber) */
export function previaDoEvento(evento: EventoWhatsapp, templates: MensagemTemplate[] | undefined, empresa: { nome: string; slug: string; origem: string }): string {
  return preencherMensagem(textoDoEvento(evento, templates), {
    cliente_nome: 'Maria',
    numero_pedido: 'PED-2026-0017',
    data_entrega: '15/10/2026',
    link_acompanhamento: `${empresa.origem}${caminhoAcompanhamento(empresa.slug, 'exemplo')}`,
    link_aprovacao: `${empresa.origem}/arte/${empresa.slug}/exemplo`,
    valor_pago: 'R$ 150,00',
    valor_total: 'R$ 300,00',
    empresa_nome: empresa.nome,
  })
}
