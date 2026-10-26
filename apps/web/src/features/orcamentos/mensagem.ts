import { nomeCliente, textoMensagemOrcamento, type MensagemTemplate, type OrcamentoDetalhe } from '@onprint/shared'
import type { EnvioWhatsapp } from '@/features/whatsapp/components/EnviarWhatsappDialog'
import { textoDoTemplate } from '@/features/whatsapp/previa'
import { linkPublico } from '@/lib/empresaAtual'

export function linkAprovacao(token: string): string {
  return linkPublico('aprovar', token)
}

/**
 * Mensagem do orçamento (template "Orçamento enviado"): itens em lista, total, pagamento combinado, prazo, validade,
 * "responda APROVADO" e o link de aprovação sozinho no fim. Com o PDF anexado, avisa (antes da assinatura) que ele
 * vai logo abaixo. O mesmo texto do "ok" na conversa "Você" do WhatsApp (textoMensagemOrcamento, no shared).
 */
export function mensagemDoOrcamento(o: OrcamentoDetalhe, templates: MensagemTemplate[] | undefined, empresa: string, comPdf = false): string {
  return textoMensagemOrcamento(o, textoDoTemplate('orcamento_enviado', templates), { empresa, linkAprovacao: linkAprovacao(o.tokenPublico), comPdf })
}

/**
 * "Enviar orçamento" (tela do orçamento e kanban): o diálogo "Enviar pelo WhatsApp" com o texto acima, o PDF
 * marcado para ir junto e, depois do envio, o orçamento em rascunho marcado como enviado. Orçamento criado pelo
 * WhatsApp (📝 na conversa): vai para o número da conversa, sem perguntar.
 */
export function envioDoOrcamento(
  o: OrcamentoDetalhe,
  opcoes: { templates: MensagemTemplate[] | undefined; empresa: string; gerarPdf: () => Promise<{ blob: Blob; nome: string }>; onEnviado?: EnvioWhatsapp['onEnviado'] },
): EnvioWhatsapp {
  return {
    titulo: `Enviar o orçamento ${o.numero}`,
    tipo: 'orcamento_enviado',
    destinatario: { nome: nomeCliente(o.cliente), numero: o.whatsapp?.numero || o.cliente.whatsapp || o.cliente.telefone, clienteId: o.clienteId },
    vinculo: { orcamentoId: o.id },
    mensagem: (comPdf) => mensagemDoOrcamento(o, opcoes.templates, opcoes.empresa, comPdf),
    pdf: { rotulo: `${o.numero} - ${nomeCliente(o.cliente)}.pdf`, gerar: opcoes.gerarPdf, marcado: true },
    onEnviado: opcoes.onEnviado,
  }
}
