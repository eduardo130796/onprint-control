import {
  TEXTOS_PADRAO_MENSAGEM,
  caminhoAcompanhamento,
  listaItensMensagem,
  preencherMensagem,
  proximoPassoPedido,
  formaEntregaPronto,
  textoPrazoDias,
  type CategoriaTemplate,
  type MensagemTemplate,
  type VariavelTemplate,
} from '@onprint/shared'

/** Texto da categoria: o template ativo mais antigo (como na API) ou o texto padrão. */
export function textoDoTemplate(categoria: CategoriaTemplate, templates: MensagemTemplate[] | undefined): string {
  const ativos = (templates ?? []).filter((t) => t.categoria === categoria && t.ativo).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return ativos[0]?.conteudo ?? TEXTOS_PADRAO_MENSAGEM[categoria]
}

/** Dados de exemplo das prévias (editor de templates e "Ver mensagem" dos avisos) */
export function valoresDeExemplo(empresa: { nome: string; slug: string; origem: string }): Partial<Record<VariavelTemplate, string>> {
  return {
    cliente_nome: 'Maria',
    numero_orcamento: 'ORC-2026-0042',
    itens_orcamento: listaItensMensagem([
      { descricao: 'Banner em lona', quantidade: 2, largura: 2, altura: 1, total: 130 },
      { descricao: 'Cartão de visita 4x4', quantidade: 1000, total: 89.9 },
    ]),
    validade: '20/10/2026',
    prazo_producao: textoPrazoDias(5),
    numero_pedido: 'PED-2026-0017',
    descricao_item: 'Banner em lona 2,0 × 1,0 m',
    proximo_passo: proximoPassoPedido(true),
    forma_entrega: formaEntregaPronto('retirada'),
    data_entrega: '15/10/2026',
    link_acompanhamento: `${empresa.origem}${caminhoAcompanhamento(empresa.slug, 'exemplo')}`,
    link_aprovacao: `${empresa.origem}/arte/${empresa.slug}/exemplo`,
    valor_pago: 'R$ 150,00',
    valor_total: 'R$ 219,90',
    valor_em_aberto: 'R$ 69,90',
    empresa_nome: empresa.nome,
  }
}

/** Prévia com dados de exemplo (como o cliente vai receber) */
export function previaDoTemplate(categoria: CategoriaTemplate, conteudo: string, empresa: { nome: string; slug: string; origem: string }): string {
  const valores = valoresDeExemplo(empresa)
  // No orçamento, o link é o da aprovação do orçamento
  if (categoria === 'orcamento_enviado') valores.link_aprovacao = `${empresa.origem}/aprovar/${empresa.slug}/exemplo`
  return preencherMensagem(conteudo, valores)
}

/** Prévia do aviso automático (template ativo da categoria do evento) */
export function previaDoEvento(evento: CategoriaTemplate, templates: MensagemTemplate[] | undefined, empresa: { nome: string; slug: string; origem: string }): string {
  return previaDoTemplate(evento, textoDoTemplate(evento, templates), empresa)
}
