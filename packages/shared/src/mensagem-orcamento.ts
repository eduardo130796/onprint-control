import { formatarDataSimples, formatarMoeda, nomeCliente, nomeParaSaudacao } from './format'
import { descontosMensagem, inserirAntesDoFim, listaItensMensagem, textoPrazoDias, type ItemMensagem } from './mensagens'
import { resumoCondicoesPagamento } from './pagamento'
import { lerRegrasDoOrcamento, textosParaCliente } from './regras-comerciais'
import { preencherMensagem } from './whatsapp'

/*
 * Texto do orçamento para o cliente (template "Orçamento enviado"), igual pelos dois caminhos: o "Enviar orçamento"
 * da tela (web) e o "ok" na conversa "Você" do WhatsApp (API). Quem chama passa o conteúdo do template ativo e o link
 * de aprovação (cada lado monta o seu).
 */

export interface OrcamentoParaMensagem {
  numero: string
  cliente: { nome: string; fantasia?: string | null; cpfCnpj?: string | null }
  itens: ItemMensagem[]
  total: string | number
  sinalPercentual: string | number
  parcelas: number
  intervaloDias: number
  prazoDias: number
  /** AAAA-MM-DD (ou ISO) */
  validade: string
  /** O que as regras comerciais fizeram (orcamento.regras) */
  regras: unknown
}

/**
 * Itens em lista, total, pagamento combinado, prazo, validade e o link de aprovação sozinho no fim. As frases das
 * regras comerciais para o cliente vão na linha {{descontos}} (template antigo, sem a variável: no fim da lista de
 * itens). Com o PDF anexado, avisa (antes da assinatura) que ele vai logo abaixo. `recusados`: o que o cliente pediu e
 * a gráfica não faz (o nome como ele pediu): a linha "Obs.: … não fazemos no momento." antes da assinatura.
 */
export function textoMensagemOrcamento(
  o: OrcamentoParaMensagem,
  conteudo: string,
  opcoes: { empresa: string; linkAprovacao: string; comPdf?: boolean; recusados?: string[] },
): string {
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
    link_aprovacao: opcoes.linkAprovacao,
    empresa_nome: opcoes.empresa,
  })
  const obs = linhaObsRecusados(opcoes.recusados ?? [])
  const comObs = obs ? inserirAntesDoFim(texto, obs) : texto
  return opcoes.comPdf ? inserirAntesDoFim(comObs, 'O orçamento em PDF vai logo abaixo.') : comObs
}

/**
 * "Obs.: chaveiro personalizado não fazemos no momento." (um ou mais itens: "chaveiro e caneca"); null sem itens.
 * Vai na mensagem do orçamento e nas observações (o PDF e a tela mostram o mesmo).
 */
export function linhaObsRecusados(nomes: string[]): string | null {
  const lista = [...new Set(nomes.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean))]
  if (!lista.length) return null
  const juntos = lista.length === 1 ? lista[0]! : `${lista.slice(0, -1).join(', ')} e ${lista.at(-1)}`
  return `Obs.: ${juntos} não fazemos no momento.`
}
