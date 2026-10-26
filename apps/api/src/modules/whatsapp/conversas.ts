import { adicionarDias, diaDaSemana, formatarDataSimples, type AssuntoConversa, type IntencaoRespostaIA, type StatusPedido, type TipoEntrega } from '@onprint/shared'
import { normalizarResposta, variantesDoNumero } from './respostas'

/*
 * Conversas do WhatsApp (copiloto nível 1): as regras puras (testáveis) — juntar mensagens seguidas numa conversa,
 * o assunto pelas palavras (na hora, sem custo) ou pela leitura do Assistente GrafyGo, e a resposta pronta sobre o
 * pedido. O banco fica em conversas.service.ts.
 */

/** Mensagens do mesmo contato com menos que isto entre uma e outra ficam na mesma conversa (aberta) */
export const JANELA_CONVERSA_MS = 20 * 60_000
/** O Assistente espera o cliente terminar de escrever (mensagens em sequência viram uma leitura só) */
export const ESPERA_CLASSIFICAR_MS = 25_000
/** Mensagens que vão para a leitura do Assistente (as mais recentes) */
export const MENSAGENS_NA_LEITURA = 10

/** Junta na conversa do contato: ela continua aberta e a última mensagem foi há pouco */
export function juntarNaConversa(conversa: { situacao: string; ultimaEm: Date } | null, agora: Date): boolean {
  return Boolean(conversa && conversa.situacao === 'aberta' && agora.getTime() - conversa.ultimaEm.getTime() < JANELA_CONVERSA_MS)
}

/** Ordem de importância: uma conversa nunca "desce" de pedido de orçamento para conversa à toa */
const PESO: Record<AssuntoConversa, number> = { orcamento: 3, pedido: 2, duvida: 1, outro: 0 }
export const assuntoMaisImportante = (a: AssuntoConversa, b: AssuntoConversa): AssuntoConversa => (PESO[b] > PESO[a] ? b : a)

const PRECO = /\b(quanto|quantos|quantas|valor|valores|preco|precos|orcamento|orcamentos|orcar|orca|cotacao|tabela|sai por|fica por|custa|custo)\b/
const QUER = /\b(quero|queria|preciso|precisava|gostaria|faz|fazem|voces fazem|vcs fazem|vc faz|voce faz|tem como fazer|trabalham com|encomendar|mandar fazer|imprimir|impressao)\b/
const PRODUTO =
  /\b(panfleto\w*|flyer\w*|folder\w*|cartao|cartoes|cartaz\w*|adesivo\w*|banner\w*|lona\w*|placa\w*|faixa\w*|fachada\w*|plotagem|plotar|envelopamento|camiset\w*|caneca\w*|etiqueta\w*|rotulo\w*|ima\b|imas|calendario\w*|convite\w*|tag\b|tags|bloco\w*|talao|taloes|carimbo\w*|encaderna\w*|apostila\w*|xerox|copia\w*|livreto\w*|cardapio\w*|totem\w*|display\w*|backdrop|wind ?banner|letreiro\w*|sacola\w*|embalage\w*|crach\w*|marca pagina|folheto\w*|mini ?jornal|revista\w*)\b/
const QUANTIDADE = /\b(\d+|mil|cem|duzent\w*|trezent\w*|quinhent\w*|milheiro)\b/
const PEDIDO_FEITO =
  /\b(meu pedido|o pedido|do pedido|meus pedidos|ficou pronto|ficaram prontos|ta pronto|tao prontos|esta pronto|ja ta pronto|ja esta pronto|pronto|prontos|pronta|prontas|ja saiu|saiu pra entrega|saiu para entrega|entrega|entregar|entregue|chega|chegou|chegam|retirar|retiro|buscar|busco|pegar|previsao|andamento|status|rastre\w*)\b/
/** Agradecimento, "ok", saudação ou emoji sozinhos: não pedem ação */
const CORTESIA =
  /^(ok|okay|blz|beleza|obrigad[oa]|obg|brigad[oa]|valeu|vlw|tmj|show|top|massa|perfeito|otimo|certo|ta bom|ta|ta certo|combinado|bom dia|boa tarde|boa noite|oi|ola|e ai|tudo bem|tudo bom|joia|de nada|disponha|amem|kk+|haha+|rs+)( (ok|obrigad[oa]|valeu|bom dia|boa tarde|boa noite|tudo bem|tudo bom|pessoal|amigo|amiga|moca|moco|querido|querida|sim|ta|blz))*$/

/**
 * Assunto pelas palavras (na hora, sem o Assistente). `temPedidoEmAndamento`: o contato é cliente com pedido aberto
 * ("tá pronto?" de quem não tem pedido é só dúvida).
 */
export function assuntoPelasRegras(textos: string[], ctx: { temPedidoEmAndamento: boolean }): AssuntoConversa {
  const original = textos.join('\n')
  const t = normalizarResposta(original)
  if (!t) return 'outro'
  const produto = PRODUTO.test(t)
  if (PRECO.test(t) && !/\b(meu pedido|o pedido|do pedido)\b/.test(t)) return 'orcamento'
  if (produto && (QUER.test(t) || QUANTIDADE.test(t) || original.includes('?'))) return 'orcamento'
  if (PEDIDO_FEITO.test(t) && (ctx.temPedidoEmAndamento || /\bpedido\b/.test(t))) return 'pedido'
  if (original.includes('?') || /\b(como|onde|qual|quais|quando|voces|vcs|aceita\w*|abre|abrem|funciona\w*|horario|endereco|pix)\b/.test(t)) return 'duvida'
  return 'outro'
}

/** Só cortesia ("obrigado", "ok", "bom dia", 👍): a conversa nasce resolvida (não pede ação nem aviso) */
export function soCortesia(textos: string[]): boolean {
  if (!textos.length) return false
  return textos.every((texto) => {
    const t = normalizarResposta(texto)
    // Só emoji/pontuação (o normalizar tira): cortesia
    return !t || CORTESIA.test(t)
  })
}

/** O assunto que a leitura do Assistente diz (mesma leitura das respostas ao orçamento) */
export function assuntoDaLeitura(intencao: IntencaoRespostaIA): AssuntoConversa {
  switch (intencao) {
    case 'novo_pedido':
      return 'orcamento'
    case 'sobre_pedido':
      return 'pedido'
    case 'pergunta':
    case 'quer_modificacoes':
      return 'duvida'
    default:
      return 'outro'
  }
}

/** Formas do número para achar o cliente no cadastro (que guarda DDD + número, às vezes com o 55) */
export function numerosParaBusca(numero: string | null): string[] {
  if (!numero) return []
  const com55 = variantesDoNumero(numero).filter((n) => n.startsWith('55') && n.length >= 12)
  return [...new Set([...com55, ...com55.map((n) => n.slice(2))])]
}

/**
 * O número como guardamos e mostramos: celular de conta antiga que chega sem o 9º dígito (55 + DDD + 8 dígitos começando
 * com 6 a 9) ganha o 9 — é o formato que o cadastro e o envio aceitam (a Evolution acerta o dígito no envio)
 */
export function numeroCanonico(numero: string | null): string | null {
  if (!numero) return null
  const d = numero.replace(/\D/g, '')
  return /^55\d{2}[6-9]\d{7}$/.test(d) ? `${d.slice(0, 4)}9${d.slice(4)}` : d
}

/** DDD + número (como o cadastro guarda) a partir do número do WhatsApp; null se não for telefone brasileiro */
export function numeroParaCadastro(numero: string | null): string | null {
  const d = (numero ?? '').replace(/\D/g, '')
  return /^55\d{10,11}$/.test(d) ? d.slice(2) : null
}

// ─── "Ver pedido": a resposta pronta (só sai com o toque da pessoa, que pode editar) ───

const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

/** "hoje", "amanhã", "na sexta-feira (30/10)" (até 6 dias) ou "no dia 15/11" */
export function quandoFalar(dataISO: string, hojeISO: string): string {
  const dia = dataISO.slice(0, 10)
  if (dia === hojeISO) return 'hoje'
  if (dia === adicionarDias(hojeISO, 1)) return 'amanhã'
  const ddmm = formatarDataSimples(dia).slice(0, 5)
  for (let i = 2; i <= 6; i++) if (dia === adicionarDias(hojeISO, i)) return `${diaDaSemana(dia) === 0 || diaDaSemana(dia) === 6 ? 'no' : 'na'} ${SEMANA[diaDaSemana(dia)]} (${ddmm})`
  return `no dia ${ddmm}`
}

export interface PedidoParaResposta {
  numero: string
  status: StatusPedido
  dataPrevistaEntrega: string
  tipoEntrega: TipoEntrega
}

/**
 * Texto pronto sobre o pedido, no padrão das mensagens (saudação, frase curta, *negrito* no número, assinatura). Sem
 * promessa que o sistema não sabe: atrasado ou esperando a arte, diz o que falta.
 */
export function respostaProntaDoPedido(p: PedidoParaResposta, ctx: { nome: string | null; hojeISO: string; grafica: string | null }): string {
  const ola = ctx.nome ? `Olá, ${ctx.nome}!` : 'Olá!'
  const n = `*${p.numero}*`
  const quando = quandoFalar(p.dataPrevistaEntrega, ctx.hojeISO)
  const atrasado = p.dataPrevistaEntrega.slice(0, 10) < ctx.hojeISO
  let frase: string
  switch (p.status) {
    case 'pronto':
      frase = p.tipoEntrega === 'retirada' ? `Seu pedido ${n} já está pronto ✅ Pode vir buscar quando quiser.` : `Seu pedido ${n} já está pronto ✅ Em breve sai para entrega.`
      break
    case 'em_entrega':
      frase = `Seu pedido ${n} já saiu para entrega 🚚`
      break
    case 'entregue':
      frase = `Seu pedido ${n} já foi entregue ✅`
      break
    case 'cancelado':
      frase = `O pedido ${n} está cancelado. Quer que a gente veja isso com você?`
      break
    case 'aguardando_arte':
      frase = `Seu pedido ${n} está esperando a arte para entrar em produção. Assim que ela chegar, seguimos.`
      break
    case 'arte_em_aprovacao':
      frase = `A arte do seu pedido ${n} está esperando a sua aprovação. Assim que você aprovar, seguimos para a produção.`
      break
    default:
      frase = atrasado ? `Seu pedido ${n} está em produção. Avisamos por aqui assim que ficar pronto.` : `Seu pedido ${n} está em produção e fica pronto ${quando}.`
  }
  return [ola, '', frase, ...(ctx.grafica ? ['', `— ${ctx.grafica}`] : [])].join('\n')
}
