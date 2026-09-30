import {
  adicionarDiasUteis,
  formatarDataSimples,
  formatarMoeda,
  hojeISO,
  preencherTemplate,
  type MensagemTemplate,
  type OrcamentoDetalhe,
} from '@onprint/shared'

export function linkAprovacao(token: string): string {
  return `${window.location.origin}/aprovar/${token}`
}

const PADRAO =
  'Olá, {{cliente_nome}}! Segue o orçamento {{numero_orcamento}} no valor de {{valor_total}}.\nPara ver e aprovar: {{link_aprovacao}}'

/** Texto do WhatsApp a partir do template "Orçamento enviado" (ou um texto padrão). */
export function mensagemDoOrcamento(o: OrcamentoDetalhe, templates: MensagemTemplate[] | undefined): string {
  const template = templates?.find((t) => t.categoria === 'orcamento_enviado' && t.ativo)
  return preencherTemplate(template?.conteudo ?? PADRAO, {
    cliente_nome: o.cliente.nome.split(' ')[0] ?? o.cliente.nome,
    numero_orcamento: o.numero,
    link_aprovacao: linkAprovacao(o.tokenPublico),
    valor_total: formatarMoeda(o.total),
    data_entrega: formatarDataSimples(adicionarDiasUteis(hojeISO(), o.prazoDias)),
  })
}
