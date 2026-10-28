import { ajusteSimulado, atendimentoSimulado, intencaoSimulada, notaCompraSimulada } from './simulado-assistente'
import { descricaoSimulada, orcamentoSimulado, produtoSimulado, regrasSimuladas, tabelaSimulada } from './simulado-equipe'
import { ErroIA, type AnexoIA, type PedidoEstruturado, type ProvedorIA, type RespostaEstruturada, type TarefaIA } from './tipos'

/*
 * Provedor simulado (desenvolvimento e testes): determinístico, sem rede e sem custo. Responde cada tarefa com regras
 * simples sobre o conteúdo e conta os tokens por aproximação (4 caracteres ≈ 1 token). Frases de teste:
 * "[simular-erro]" (provedor fora), "[simular-invalido]" (JSON fora do schema), "[simular-lento]" (demora 3 s).
 */

/** Responde uma tarefa a partir do conteúdo enviado (o mesmo texto que iria ao modelo de verdade) */
export type SimulacaoIA = (conteudo: string, anexos?: AnexoIA[]) => unknown

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const tokens = (t: string) => Math.max(1, Math.ceil(t.length / 4))

/** Só o texto livre (mensagem ou pedido do cliente, descrição da equipe), entre as marcas que o prompt usa */
export const mensagemDoConteudo = (conteudo: string) =>
  /<(mensagem_do_cliente|pedido_do_cliente|descricao_da_equipe|texto_do_dono|pedido_da_pessoa|ajuste_pedido|tabela_de_precos|conversa)>\n?([\s\S]*?)\n?<\/\1>/.exec(conteudo)?.[2]?.trim() ?? conteudo

/** Classificação por palavras-chave: imita o modelo nos casos comuns, com confiança alta só no óbvio */
export function classificarSimulado(conteudo: string) {
  const original = mensagemDoConteudo(conteudo)
  const t = sem(original)
  const pergunta = original.includes('?') || /\b(da pra|da para|consegue|tem como|quando|qual|quanto|sera que)\b/.test(t)
  const aprova = /\b(otimo|perfeito|gostei|show|top|beleza|pode mandar|manda ver|fechado|bora|pode seguir|ta bom|esta bom|ficou bom|massa)\b/.test(t)
  const modifica = /\b(mudar|muda|trocar|troca|alterar|ajustar|maior|menor|outra cor|corrigir)\b/.test(t)
  const semOrcamento = conteudo.includes('Nenhum orçamento aguardando')
  // Preço de produto (fora do orçamento enviado ou numa conversa nova): pedido novo
  const produto = /\b(adesivo|panfleto|banner|cartao|cartoes|placa|lona|faixa|camiseta|caneca|folder|flyer|etiqueta|convite)s?\b/.test(t)
  if (/\b(quanto|preco|valor|orcamento|cotacao)\b/.test(t) && (produto || semOrcamento) && !modifica) {
    return { intencao: 'novo_pedido', confianca: 0.9, resumo: `O cliente pediu preço: ${original.replace(/\s+/g, ' ').slice(0, 110)}`, tem_pergunta: pergunta }
  }
  if (/\b(meu pedido|o pedido|ta pronto|esta pronto|ficou pronto|ja ficou|chegou)\b/.test(t)) {
    return { intencao: 'sobre_pedido', confianca: 0.88, resumo: 'O cliente perguntou se o pedido está pronto.', tem_pergunta: true }
  }
  if (semOrcamento && produto && /\b(quero|queria|preciso|gostaria|faz|fazem)\b/.test(t)) {
    return { intencao: 'novo_pedido', confianca: 0.85, resumo: `O cliente quer: ${original.replace(/\s+/g, ' ').slice(0, 110)}`, tem_pergunta: pergunta }
  }
  if (pergunta) {
    return { intencao: 'pergunta', confianca: 0.9, resumo: `O cliente perguntou: ${original.replace(/\s+/g, ' ').slice(0, 120)}`, tem_pergunta: true }
  }
  if (modifica) return { intencao: 'quer_modificacoes', confianca: 0.86, resumo: 'O cliente quer ajustes no orçamento.', tem_pergunta: false }
  if (aprova) return { intencao: 'aprova', confianca: 0.93, resumo: 'O cliente aprovou o orçamento.', tem_pergunta: false }
  if (/\b(pensar|vou ver|depois|falo com|vou falar)\b/.test(t)) return { intencao: 'outro', confianca: 0.8, resumo: 'O cliente vai pensar e responde depois.', tem_pergunta: false }
  return { intencao: 'outro', confianca: 0.5, resumo: 'Resposta sem relação clara com o orçamento.', tem_pergunta: false }
}

const SIMULACOES: Record<TarefaIA, SimulacaoIA> = {
  classificar_resposta: classificarSimulado,
  orcamento_texto: orcamentoSimulado,
  produto_texto: produtoSimulado,
  descricao: descricaoSimulada,
  regras_texto: regrasSimuladas,
  intencao: intencaoSimulada,
  nota_compra: notaCompraSimulada,
  ajuste_orcamento: ajusteSimulado,
  tabela_produtos: tabelaSimulada,
  atendimento: atendimentoSimulado,
}

export class SimuladoProvider implements ProvedorIA {
  readonly nome = 'simulado' as const
  readonly modelo = 'simulado'

  constructor(private readonly simulacoes: Partial<Record<TarefaIA, SimulacaoIA>> = {}) {}

  async estruturado<T>(pedido: PedidoEstruturado<T>): Promise<RespostaEstruturada<T>> {
    const msg = mensagemDoConteudo(pedido.conteudo)
    if (msg.includes('[simular-lento]')) await new Promise((r) => setTimeout(r, 3000))
    if (msg.includes('[simular-erro]')) throw new ErroIA('indisponivel', 'Provedor simulado fora do ar (teste).')
    const bruto = msg.includes('[simular-invalido]') ? { intencao: 'talvez' } : (this.simulacoes[pedido.tarefa] ?? SIMULACOES[pedido.tarefa])(pedido.conteudo, pedido.anexos)
    const uso = { entrada: tokens(pedido.sistema) + tokens(pedido.conteudo), saida: tokens(JSON.stringify(bruto)) }
    try {
      return { dados: pedido.validar(bruto), uso, modelo: this.modelo }
    } catch {
      throw new ErroIA('resposta_invalida', 'A resposta do modelo não veio no formato esperado.', uso)
    }
  }
}
