import {
  descontosMensagem,
  formatarDataSimples,
  formatarMoeda,
  inserirAntesDoFim,
  lerRegrasDoOrcamento,
  textosParaCliente,
  listaItensMensagem,
  nomeCliente,
  nomeParaSaudacao,
  preencherMensagem,
  resumoCondicoesPagamento,
  textoPrazoDias,
  type MensagemTemplate,
  type OrcamentoDetalhe,
} from '@onprint/shared'
import type { EnvioWhatsapp } from '@/features/whatsapp/components/EnviarWhatsappDialog'
import { textoDoTemplate } from '@/features/whatsapp/previa'
import { linkPublico } from '@/lib/empresaAtual'

export function linkAprovacao(token: string): string {
  return linkPublico('aprovar', token)
}

/**
 * Mensagem do orçamento (template "Orçamento enviado"): itens em lista, total, pagamento combinado, prazo, validade,
 * "responda APROVADO" e o link de aprovação sozinho no fim. Com o PDF anexado, avisa (antes da assinatura) que ele
 * vai logo abaixo.
 */
export function mensagemDoOrcamento(o: OrcamentoDetalhe, templates: MensagemTemplate[] | undefined, empresa: string, comPdf = false): string {
  const conteudo = textoDoTemplate('orcamento_enviado', templates)
  // Regras comerciais: as frases para o cliente ("Desconto de 5% por quantidade") na linha {{descontos}}; template
  // editado antes desta versão (sem a variável): no fim da lista de itens, para o cliente ver de onde veio o valor
  const descontos = descontosMensagem(textosParaCliente(lerRegrasDoOrcamento(o.regras)))
  const semVariavel = Boolean(descontos) && !/\{\{\s*descontos\s*\}\}/.test(conteudo)
  const texto = preencherMensagem(conteudo, {
    cliente_nome: nomeParaSaudacao(nomeCliente(o.cliente), o.cliente.cpfCnpj),
    numero_orcamento: o.numero,
    itens_orcamento: semVariavel ? `${listaItensMensagem(o.itens)}\n${descontos}` : listaItensMensagem(o.itens),
    descontos,
    valor_total: formatarMoeda(o.total),
    // O mesmo resumo do PDF, da página de aprovação e das contas a receber do pedido
    condicoes_pagamento: resumoCondicoesPagamento({ total: o.total, sinalPercentual: o.sinalPercentual, parcelas: o.parcelas, intervaloDias: o.intervaloDias }),
    prazo_producao: textoPrazoDias(o.prazoDias),
    validade: formatarDataSimples(o.validade),
    link_aprovacao: linkAprovacao(o.tokenPublico),
    empresa_nome: empresa,
  })
  return comPdf ? inserirAntesDoFim(texto, 'O orçamento em PDF vai logo abaixo.') : texto
}

/**
 * "Enviar orçamento" (tela do orçamento e kanban): o diálogo "Enviar pelo WhatsApp" com o texto acima, o PDF
 * marcado para ir junto e, depois do envio, o orçamento em rascunho marcado como enviado.
 */
export function envioDoOrcamento(
  o: OrcamentoDetalhe,
  opcoes: { templates: MensagemTemplate[] | undefined; empresa: string; gerarPdf: () => Promise<{ blob: Blob; nome: string }>; onEnviado?: EnvioWhatsapp['onEnviado'] },
): EnvioWhatsapp {
  return {
    titulo: `Enviar o orçamento ${o.numero}`,
    tipo: 'orcamento_enviado',
    destinatario: { nome: nomeCliente(o.cliente), numero: o.cliente.whatsapp || o.cliente.telefone, clienteId: o.clienteId },
    vinculo: { orcamentoId: o.id },
    mensagem: (comPdf) => mensagemDoOrcamento(o, opcoes.templates, opcoes.empresa, comPdf),
    pdf: { rotulo: `${o.numero} - ${nomeCliente(o.cliente)}.pdf`, gerar: opcoes.gerarPdf, marcado: true },
    onEnviado: opcoes.onEnviado,
  }
}
