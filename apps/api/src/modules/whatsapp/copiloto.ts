import { formatarMoeda, linhaItemMensagem, listaItensMensagem, type ItemMensagem, type NotaCompraLida, type RespostaPergunta } from '@onprint/shared'
import { jidNormalizado } from './enquete'
import { normalizarResposta, variantesDoNumero } from './respostas'

/** Número de um jid de telefone ("5511…@s.whatsapp.net"); "@lid" não tem número */
const numeroDoJid = (jid: string | null) => (jid && /@(s\.whatsapp\.net|c\.us)$/.test(jid) ? jid.split('@')[0]!.split(':')[0]!.replace(/\D/g, '') || null : null)

/*
 * Copiloto pelo WhatsApp: as regras puras (testáveis). A conversa fica no WhatsApp e o sistema trabalha nos bastidores:
 * o dono reage com 📝 numa mensagem do cliente e o Assistente salva um orçamento rascunho; a conversa "Você" (mensagem
 * para mim mesmo, só o dono vê) vira o canal do Assistente: avisos, "ok" para enviar, perguntas e a foto da nota.
 * Segurança do "ok": nunca envia o orçamento errado nem um antigo (escolherParaEnviar). O banco fica em
 * copiloto.service.ts.
 */

/** "ok" solto (sem citar o aviso) só vale para o rascunho avisado há menos que isto */
export const OK_SOLTO_MS = 30 * 60_000
/** Aviso mais velho que isto: nem citando envia direto (mostra o resumo atual e pede outro ok) */
export const AVISO_VALE_MS = 2 * 3_600_000
/** A pergunta "Qual envio? 1) … 2) …" espera a resposta este tempo */
export const PERGUNTA_VALE_MS = 10 * 60_000
/** Rascunhos do canal que ainda aparecem na lista (mais velhos que isto, só pelo sistema) */
export const RASCUNHO_NO_CANAL_MS = 7 * 86_400_000
/** Mensagens do cliente que entram num orçamento pelo 📝 (as mais perto da reagida) */
export const MENSAGENS_NO_ORCAMENTO = 15

// ─── Reação 📝 ───

/** Emoji sem o seletor de variação (FE0F), sem o tom de pele (1F3FB–1F3FF) e sem o ZWJ */
export const normalizarEmoji = (texto: string) => texto.replace(/\u{FE0E}|\u{FE0F}|\u{200D}|\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF}/gu, '').trim()

/** 📝 (memo) ou ✍ (mão escrevendo, com qualquer tom de pele): pede o orçamento. Reação removida chega vazia. */
export function ehReacaoDeOrcamento(texto: string | null | undefined): boolean {
  const e = normalizarEmoji(texto ?? '')
  return e === '\u{1F4DD}' || e === '\u{270D}'
}

// ─── Canal "Você" (a conversa do número da gráfica com ele mesmo) ───

export interface ContaConectada {
  /** whatsapp_config.numero (55DDD…) */
  numero: string | null
  /** LID da conta ("…@lid"), guardado ao conectar */
  lid: string | null
  /** O "sender" do webhook (o número conectado, como a Evolution manda) */
  sender?: string | null
}

/** A mensagem é da conversa "Você": o jid é o número conectado (com e sem o 9º dígito) ou o LID da própria conta */
export function ehCanalVoce(jids: (string | null | undefined)[], conta: ContaConectada): boolean {
  const numeros = new Set([conta.numero, numeroDoJid(conta.sender ?? null)].filter((n): n is string => Boolean(n)).flatMap(variantesDoNumero))
  const lid = conta.lid ? jidNormalizado(conta.lid) : null
  return jids.some((j) => {
    if (!j) return false
    const n = numeroDoJid(j)
    if (n && numeros.has(n)) return true
    return Boolean(lid && /@(lid|hosted\.lid)$/.test(j) && jidNormalizado(j) === lid)
  })
}

/** Texto para comparar o eco (espaços e quebras não contam) */
const chaveDoTexto = (t: string) => t.replace(/\s+/g, ' ').trim()

/**
 * Anti-laço: a mensagem que o próprio Assistente mandou ao "Você" volta pelo webhook como do dono. É eco quando o id
 * é de uma enviada nossa, ou quando o texto é igual a um que acabamos de mandar (o webhook pode chegar antes de o
 * envio devolver o id).
 */
export function ehEcoDoAssistente(e: { idMensagem: string; texto: string | null }, enviados: { ids: ReadonlySet<string>; textos: readonly string[] }): boolean {
  if (enviados.ids.has(e.idMensagem)) return true
  return Boolean(e.texto && enviados.textos.some((t) => chaveDoTexto(t) === chaveDoTexto(e.texto!)))
}

// ─── O que o dono escreveu no "Você" ───

export type ComandoVoce =
  /** "ok", "envia", "pode mandar" (ref: "ok 0105", "ok Eduardo") */
  | { tipo: 'enviar'; ref: string | null }
  /** "cancela", "não envia", "descarta" */
  | { tipo: 'cancelar'; ref: string | null }
  /** Resposta à pergunta "Qual envio?": "1", "2", "1 e 2", "todos" */
  | { tipo: 'escolha'; opcoes: number[] | 'todos' }
  /** Pedido de mudança no rascunho ("tira os panfletos", "10% de desconto"): por enquanto, o link do editor */
  | { tipo: 'ajuste' }
  /** O resto vai para o roteador do Peça ao Assistente */
  | { tipo: 'outro' }
  /** "desfazer" em cima do aviso da aprovação automática (até 10 minutos) */
  | { tipo: 'desfazer' }
  /** "reenvia" em cima do aviso de aprovação a confirmar: manda a versão nova do orçamento ao cliente */
  | { tipo: 'reenviar' }

const ENVIAR = /^(ok|okay|okk+|ok ok|blz ok|pode (mandar|enviar|ir)|manda|mande|envia|envie|enviar|manda ai|pode mandar ai|sim|isso|confirmo|confirma|confirmado)\b/
const CANCELAR = /^(cancela|cancelar|cancelado|nao envia|nao envie|nao manda|nao mande|nao enviar|descarta|descartar|deixa (pra|para) la|deixa quieto|esquece)\b/
const AJUSTE =
  /\b(tira|tirar|retira|remove|remover|desconto|muda|mudar|troca|trocar|altera|alterar|acrescenta|acrescentar|coloca|colocar|adiciona|adicionar|inclui|incluir|aumenta|aumentar|diminui|diminuir|corrige|corrigir|faz por|fecha por|fecha em|deixa por)\b|\d\s*%|^mais \d/
/** Ajuste que só vale quando a frase começa assim ("entrega pra sexta", "à vista no Pix", "com ilhós", "o banner é 3x1") */
const AJUSTE_NO_COMECO = /^(entrega|entregar|prazo|a vista|avista|pagamento|parcela|com [a-z]{4,}|sem [a-z]{4,}|(o|a|os|as) [a-z]+ (e|sao) \d)/

/** "o da Ana", "pro cliente", "esse orçamento" → "ana", "" (o que sobra identifica o orçamento) */
const semPalavrasDeLigacao = (resto: string) =>
  resto
    .split(' ')
    .filter((p) => p && !/^(o|a|os|as|do|da|de|dos|das|pro|pra|para|ao|esse|essa|este|esta|orcamento|cliente|ai|ja|agora|sim|pode|por|favor|pfv|pf)$/.test(p))
    .join(' ')

/** Entende o comando, sem IA (respostas fixas não gastam o Assistente) */
export function interpretarVoce(texto: string): ComandoVoce {
  const original = texto.trim()
  if (/^\u{1F44D}[\u{1F3FB}-\u{1F3FF}]?\u{FE0F}?$/u.test(original)) return { tipo: 'enviar', ref: null }
  const t = normalizarResposta(original)
  if (!t) return { tipo: 'outro' }
  if (/^todos?( eles| os dois)?$/.test(t) || t === 'os dois' || t === 'ambos') return { tipo: 'escolha', opcoes: 'todos' }
  if (/^\d{1,2}( (e|,)? ?\d{1,2})*$/.test(t)) {
    const opcoes = [...new Set(t.split(/\D+/).filter(Boolean).map(Number))]
    if (opcoes.every((n) => n >= 1 && n <= 20)) return { tipo: 'escolha', opcoes }
  }
  const palavras = t.split(' ')
  if (/^(desfazer|desfaz|desfaca|desfazer isso|desfaz isso|desfaca isso)$/.test(t)) return { tipo: 'desfazer' }
  if (/^(reenvia|reenviar|reenvie|manda de novo|envia de novo|manda a versao nova|envia a versao nova)\b/.test(t) && palavras.length <= 6) return { tipo: 'reenviar' }
  // "ok", "ok 0105", "ok Eduardo": curto (o pedido novo "ok, faz um orçamento pra Ana…" vai para o roteador)
  const envio = ENVIAR.exec(t)
  if (envio && palavras.length <= 5 && !AJUSTE.test(t)) {
    const resto = semPalavrasDeLigacao(t.slice(envio[0].length))
    return { tipo: 'enviar', ref: resto && !/^(ai|ja|agora|sim|pode|cliente|por favor|pfv|pf)$/.test(resto) ? resto : null }
  }
  const cancela = CANCELAR.exec(t)
  if (cancela && palavras.length <= 5) {
    const resto = semPalavrasDeLigacao(t.slice(cancela[0].length))
    return { tipo: 'cancelar', ref: resto || null }
  }
  // Mudança no rascunho: frase curta com o verbo (ou que começa como ajuste), sem pedir orçamento novo
  if ((AJUSTE.test(t) || AJUSTE_NO_COMECO.test(t)) && palavras.length <= 14 && !/\borcamento (pra|para|pro)\b/.test(t)) return { tipo: 'ajuste' }
  return { tipo: 'outro' }
}

// ─── Qual orçamento o "ok" envia (segurança: nunca o errado, nunca um antigo) ───

/** Um orçamento criado pelo WhatsApp, como está agora no sistema */
export interface RascunhoCanal {
  orcamentoId: string
  numero: string
  cliente: string
  /** Decimal da API */
  total: string
  status: string
  criadoEm: Date
  /** Último aviso no "Você" (null = ainda não avisou) */
  avisadoEm: Date | null
  /** Última alteração do orçamento no sistema */
  atualizadoEm: Date
  enviadoEm: Date | null
  /** Quando o sistema marcou como enviado (orcamento.enviado_em) */
  enviadoNoSistemaEm: Date | null
  descartadoEm: Date | null
  /** Esperando a liberação de um gerente (regras comerciais) */
  liberacaoPendente: boolean
}

/** Continua rascunho, não foi enviado nem tirado da lista do canal */
export const estaPendente = (r: RascunhoCanal) => r.status === 'rascunho' && !r.enviadoEm && !r.descartadoEm

/** Mudou no sistema depois do aviso (a pessoa ajustou no editor): o "ok" mostra o resumo novo antes */
export const mudouDepoisDoAviso = (r: RascunhoCanal, avisoEm: Date) => r.atualizadoEm.getTime() > avisoEm.getTime()

/** Aviso que o dono citou: o orçamento dele e quando saiu */
export interface AvisoCitado {
  /** aviso (rascunho a enviar) | confirmar (resumo novo do rascunho) | confirmar_aprovacao (o "ok" APROVA) | aprovado_auto ("desfazer") */
  tipo?: string | null
  orcamentoId: string
  em: Date
}

/** Pergunta "Qual envio?" ainda aberta (os orçamentos na ordem das opções) */
export interface PerguntaAberta {
  opcoes: string[]
  em: Date
}

export type DecisaoEnvio =
  | { acao: 'enviar'; rascunhos: RascunhoCanal[] }
  /** Mostra o resumo atual e pede outro ok (citando esta mensagem) */
  | { acao: 'confirmar'; rascunho: RascunhoCanal; motivo: 'mudou' | 'antigo' | 'pela_referencia' }
  /** Mais de um pendente: pergunta qual (a resposta "1", "2" ou "todos" vale por 10 minutos) */
  | { acao: 'perguntar'; rascunhos: RascunhoCanal[] }
  /** O orçamento não está mais pendente (enviado, aprovado, convertido, descartado): só diz o estado, nunca reenvia */
  | { acao: 'estado'; rascunho: RascunhoCanal }
  /** O orçamento do aviso não existe mais */
  | { acao: 'apagado' }
  /** Nada pendente que o "ok" solto possa enviar (antigos: só citando o aviso) */
  | { acao: 'nenhum'; antigos: RascunhoCanal[] }
  /** "1"/"2" sem pergunta aberta, opção que não existe */
  | { acao: 'escolha_invalida'; motivo: 'sem_pergunta' | 'opcao' }

export type DecisaoCancelar =
  | { acao: 'descartar'; rascunho: RascunhoCanal }
  | { acao: 'estado'; rascunho: RascunhoCanal }
  | { acao: 'apagado' }
  | { acao: 'citar'; pendentes: RascunhoCanal[] }

const referencia = (r: RascunhoCanal) => (r.avisadoEm ?? r.criadoEm).getTime()
const recentes = (lista: RascunhoCanal[], agora: Date) => lista.filter((r) => estaPendente(r) && agora.getTime() - referencia(r) <= OK_SOLTO_MS)

/** "ok 0105" / "ok ORC-2026-0105" / "ok Eduardo": pelo fim do número ou pelo nome do cliente */
export function combinaComReferencia(r: RascunhoCanal, ref: string): boolean {
  const alvo = normalizarResposta(ref)
  if (!alvo) return false
  if (/\d/.test(alvo)) {
    // Pelo número: "0105", "105", "orc 2026 0105" (o fim do número do orçamento)
    const digitos = alvo.replace(/\D/g, '')
    return digitos.length >= 2 && r.numero.replace(/\D/g, '').endsWith(digitos)
  }
  const nome = normalizarResposta(r.cliente)
  return alvo.split(' ').every((p) => p.length >= 2 && new RegExp(`\\b${p}`).test(nome))
}

function decidirUm(r: RascunhoCanal, avisoEm: Date, agora: Date): DecisaoEnvio {
  if (!estaPendente(r)) return { acao: 'estado', rascunho: r }
  if (mudouDepoisDoAviso(r, avisoEm)) return { acao: 'confirmar', rascunho: r, motivo: 'mudou' }
  if (agora.getTime() - avisoEm.getTime() > AVISO_VALE_MS) return { acao: 'confirmar', rascunho: r, motivo: 'antigo' }
  return { acao: 'enviar', rascunhos: [r] }
}

/**
 * O que o "ok" faz. Citando o aviso: vale exatamente para aquele orçamento (se ainda pendente, sem mudança desde o
 * aviso e com o aviso de até 2 horas; senão mostra o resumo atual e pede outro ok). Sem citar: com referência ("ok
 * 0105"), o pendente que combina (sempre confirmando de novo); sem referência, só se houver exatamente um pendente
 * avisado nos últimos 30 minutos — mais de um, pergunta qual. "1"/"2"/"todos" só valem com a pergunta aberta.
 * `rascunhos`: os do canal como estão agora (inclusive os que saíram da lista, para dizer o estado).
 */
export function escolherParaEnviar(
  comando: Extract<ComandoVoce, { tipo: 'enviar' | 'escolha' }>,
  ctx: { citado: AvisoCitado | null; rascunhos: RascunhoCanal[]; pergunta: PerguntaAberta | null; agora: Date },
): DecisaoEnvio {
  const { agora, rascunhos } = ctx
  const porId = new Map(rascunhos.map((r) => [r.orcamentoId, r]))
  if (comando.tipo === 'escolha') {
    const p = ctx.pergunta
    if (!p || agora.getTime() - p.em.getTime() > PERGUNTA_VALE_MS) return { acao: 'escolha_invalida', motivo: 'sem_pergunta' }
    const indices = comando.opcoes === 'todos' ? p.opcoes.map((_, i) => i + 1) : comando.opcoes
    if (indices.some((i) => i < 1 || i > p.opcoes.length)) return { acao: 'escolha_invalida', motivo: 'opcao' }
    const escolhidos = indices.map((i) => porId.get(p.opcoes[i - 1]!))
    if (escolhidos.some((r) => !r)) return { acao: 'apagado' }
    const lista = escolhidos as RascunhoCanal[]
    // Um que saiu da lista ou mudou depois da pergunta: esse decide sozinho (estado ou confirmar)
    const problema = lista.find((r) => !estaPendente(r) || mudouDepoisDoAviso(r, p.em))
    if (problema) return decidirUm(problema, p.em, agora)
    return { acao: 'enviar', rascunhos: lista }
  }
  if (ctx.citado) {
    const r = porId.get(ctx.citado.orcamentoId)
    return r ? decidirUm(r, ctx.citado.em, agora) : { acao: 'apagado' }
  }
  const pendentes = rascunhos.filter(estaPendente)
  if (comando.ref) {
    const combinam = rascunhos.filter((r) => combinaComReferencia(r, comando.ref!))
    const pendentesQueCombinam = combinam.filter(estaPendente)
    if (pendentesQueCombinam.length > 1) return { acao: 'perguntar', rascunhos: pendentesQueCombinam }
    if (pendentesQueCombinam.length === 1) {
      const r = pendentesQueCombinam[0]!
      // Referência sem citar e sem aviso recente: confirma com o resumo atual antes
      const d = decidirUm(r, r.avisadoEm ?? r.criadoEm, agora)
      return d.acao === 'enviar' && agora.getTime() - referencia(r) > OK_SOLTO_MS ? { acao: 'confirmar', rascunho: r, motivo: 'pela_referencia' } : d
    }
    if (combinam.length) return { acao: 'estado', rascunho: combinam[0]! }
    return { acao: 'nenhum', antigos: pendentes }
  }
  const agoraPendentes = recentes(rascunhos, agora)
  if (agoraPendentes.length > 1) return { acao: 'perguntar', rascunhos: agoraPendentes }
  if (agoraPendentes.length === 1) {
    const r = agoraPendentes[0]!
    return decidirUm(r, r.avisadoEm ?? r.criadoEm, agora)
  }
  return { acao: 'nenhum', antigos: pendentes }
}

/** "cancela": citando o aviso ou, sem citar, com um só pendente recente (ou a referência) tira da lista do canal */
export function escolherParaCancelar(ref: string | null, ctx: { citado: AvisoCitado | null; rascunhos: RascunhoCanal[]; agora: Date }): DecisaoCancelar {
  if (ctx.citado) {
    const r = ctx.rascunhos.find((x) => x.orcamentoId === ctx.citado!.orcamentoId)
    if (!r) return { acao: 'apagado' }
    return estaPendente(r) ? { acao: 'descartar', rascunho: r } : { acao: 'estado', rascunho: r }
  }
  const pendentes = ctx.rascunhos.filter(estaPendente)
  const candidatos = ref ? pendentes.filter((r) => combinaComReferencia(r, ref)) : recentes(ctx.rascunhos, ctx.agora)
  return candidatos.length === 1 ? { acao: 'descartar', rascunho: candidatos[0]! } : { acao: 'citar', pendentes: candidatos.length ? candidatos : pendentes }
}

// ─── Quais mensagens do cliente entram no orçamento do 📝 ───

export interface MensagemCliente {
  idExterno: string
  texto: string | null
  midia: string | null
  recebidaEm: Date
  /** Já virou orçamento pelo 📝 */
  usadaEm: Date | null
  /** Resposta tratada de um orçamento (aprovou, pediu modificação) */
  tratada: boolean
}

export type SelecaoMensagens =
  | { ok: true; mensagens: MensagemCliente[]; texto: string }
  /** usada: já gerou um orçamento; antiga: é de antes do último orçamento enviado ao cliente; sem_texto: só mídia */
  | { ok: false; motivo: 'nao_encontrada' | 'usada' | 'antiga' | 'sem_texto' }

/**
 * A mensagem reagida é a âncora; entram só as mensagens do cliente da mesma conversa (o agrupamento das Conversas: as
 * seguidas, com poucos minutos entre elas), nunca as que já geraram um orçamento nem as de antes do último orçamento
 * enviado a esse cliente (um orçamento resolvido não volta). As mais perto da âncora, até 15, em ordem.
 */
export function selecionarMensagens(idAncora: string, conversa: MensagemCliente[], ctx: { ultimoEnvioEm: Date | null }): SelecaoMensagens {
  const ancora = conversa.find((m) => m.idExterno === idAncora)
  if (!ancora) return { ok: false, motivo: 'nao_encontrada' }
  if (ancora.usadaEm) return { ok: false, motivo: 'usada' }
  const limite = ctx.ultimoEnvioEm?.getTime() ?? -Infinity
  if (ancora.recebidaEm.getTime() <= limite) return { ok: false, motivo: 'antiga' }
  const valem = conversa.filter((m) => m === ancora || (!m.usadaEm && !m.tratada && m.recebidaEm.getTime() > limite))
  const perto = [...valem]
    .sort((a, b) => Math.abs(a.recebidaEm.getTime() - ancora.recebidaEm.getTime()) - Math.abs(b.recebidaEm.getTime() - ancora.recebidaEm.getTime()))
    .slice(0, MENSAGENS_NO_ORCAMENTO)
    .sort((a, b) => a.recebidaEm.getTime() - b.recebidaEm.getTime())
  const texto = perto
    .map((m) => m.texto?.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 3000)
  if (texto.length < 3) return { ok: false, motivo: 'sem_texto' }
  return { ok: true, mensagens: perto, texto }
}

// ─── Textos que o dono recebe no "Você" ───

const HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const DIA_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
/** "14h10" (hoje) ou "25/10 às 14h10" */
export function quando(d: Date, agora: Date): string {
  const mesmoDia = DIA_HORA.format(d).slice(0, 5) === DIA_HORA.format(agora).slice(0, 5)
  const hora = HORA.format(d).replace(':', 'h')
  return mesmoDia ? `às ${hora}` : `em ${DIA_HORA.format(d).slice(0, 5)} às ${hora}`
}

/** "ORC-2026-0105 · Eduardo Júnior · R$ 552,00" */
export const linhaDoRascunho = (r: Pick<RascunhoCanal, 'numero' | 'cliente' | 'total'>) => `${r.numero} · ${r.cliente} · ${formatarMoeda(r.total)}`

export interface AvisoOrcamento {
  numero: string
  cliente: string
  clienteNovo: boolean
  itens: ItemMensagem[]
  total: string
  conferir: string[]
  link: string
  /** Desconto do orçamento (Decimal da API): a linha "Desconto: −R$ …" quando houver */
  desconto?: string
  /** Última linha no lugar do "Responda ok para enviar" (aprovação a confirmar: o "ok" aprova) */
  acaoFinal?: string
  /** Linha antes do título ("O ORC-0112 já foi enviado; montei um novo:") */
  antes?: string
  /** Esperando a liberação de um gerente (não sai pelo "ok") */
  liberacaoPendente?: boolean
}

/** Itens numerados (o dono pode dizer "tira o 2"): "1) 2× Banner 2,0 × 1,0 m — R$ 320,00" */
export const listaNumerada = (itens: ItemMensagem[]) => itens.map((i, k) => `${k + 1}) ${linhaItemMensagem(i)}`).join('\n')

/** O fim de todo aviso: itens numerados, desconto, total, o que conferir e como enviar (ou liberar) */
function corpoDoAviso(a: AvisoOrcamento): string[] {
  const linhas = [listaNumerada(a.itens)]
  if (a.desconto && Number(a.desconto) > 0) linhas.push(`Desconto: −${formatarMoeda(a.desconto)}`)
  linhas.push(`Total: *${formatarMoeda(a.total)}*`)
  if (a.conferir.length) linhas.push(`Confira: ${a.conferir.join('; ')}`)
  linhas.push('')
  linhas.push(
    a.liberacaoPendente
      ? `Ele precisa da liberação de um gerente antes de sair. Abra para liberar: ${a.link}`
      : a.acaoFinal
        ? a.acaoFinal
      : `Responda *ok* a esta mensagem para enviar ao cliente, ou abra para ajustar: ${a.link}`,
  )
  return linhas
}

/** O aviso do orçamento montado (📝 ou pedido no "Você"): itens, total, o que conferir e como enviar */
export function textoAvisoOrcamento(a: AvisoOrcamento, origem: 'reacao' | 'voce' | 'mudou' | 'antigo' | 'pela_referencia'): string {
  const titulo =
    origem === 'mudou'
      ? `O ${a.numero} mudou desde o aviso (total agora ${formatarMoeda(a.total)}):`
      : origem === 'antigo'
        ? `O aviso do ${a.numero} é antigo. Ele está assim agora:`
        : origem === 'pela_referencia'
          ? `É este? ${a.numero} para ${a.cliente}:`
          : `📝 Orçamento ${a.numero} para ${a.cliente}${a.clienteNovo ? ' (novo cliente)' : ''}:`
  return [...(a.antes ? [a.antes] : []), titulo, ...corpoDoAviso(a)].join('\n')
}

/** 📝 de novo do mesmo cliente: o que entrou e o orçamento inteiro como ficou */
export function textoAcrescimo(a: AvisoOrcamento & { novos: ItemMensagem[] }): string {
  const quantos = a.itens.length === 1 ? '1 item' : `${a.itens.length} itens`
  return [`➕ Acrescentei ao ${a.numero} (${a.cliente}):`, listaItensMensagem(a.novos), '', `Agora são ${quantos}:`, ...corpoDoAviso(a)].join('\n')
}

/** Ajuste pedido no "Você" ("10% de desconto", "tira o 2"): o que foi feito e o orçamento inteiro */
export function textoAjuste(a: AvisoOrcamento & { feito: string }): string {
  return [`✏️ ${a.numero} atualizado (${a.feito}):`, ...corpoDoAviso(a)].join('\n')
}

// ─── 📝 de novo do mesmo cliente: acrescentar ou criar outro ───

/** Rascunho do mesmo cliente criado há menos que isto recebe os itens da 📝 nova (um orçamento só) */
export const JANELA_ACRESCENTAR_MS = 12 * 3_600_000

export type DestinoDaReacao = { acao: 'acrescentar'; rascunho: RascunhoCanal } | { acao: 'criar'; anterior: RascunhoCanal | null }

/**
 * A 📝 nova do mesmo cliente: o rascunho dele das últimas 12 horas ainda pendente (rascunho, não enviado, não
 * descartado) recebe os itens no fim; se o último já foi enviado, aprovado, convertido ou descartado, nasce outro (e o
 * aviso diz o que houve com o anterior). Editado no sistema depois do aviso continua valendo: só entram itens no fim.
 */
export function destinoDaReacao(doCliente: RascunhoCanal[], agora: Date): DestinoDaReacao {
  const recentes = doCliente.filter((r) => agora.getTime() - r.criadoEm.getTime() <= JANELA_ACRESCENTAR_MS).sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
  const pendente = recentes.find(estaPendente)
  if (pendente) return { acao: 'acrescentar', rascunho: pendente }
  return { acao: 'criar', anterior: recentes[0] ?? null }
}

/** "O ORC-0112 já foi enviado; montei um novo:" */
export function linhaDoAnterior(r: RascunhoCanal): string {
  const estado = r.descartadoEm
    ? 'foi tirado da lista'
    : r.enviadoEm || r.status === 'enviado' || r.status === 'em_negociacao'
      ? 'já foi enviado'
      : r.status === 'aprovado'
        ? 'já foi aprovado'
        : r.status === 'convertido'
          ? 'já virou pedido'
          : r.status === 'recusado'
            ? 'foi recusado'
            : r.status === 'expirado'
              ? 'expirou'
              : 'não está mais como rascunho'
  return `O ${r.numero} ${estado}; montei um novo:`
}

/** "Qual envio? 1) … 2) … Responda 1, 2 ou *todos*." */
export function textoPergunta(rascunhos: Pick<RascunhoCanal, 'numero' | 'cliente' | 'total'>[]): string {
  const opcoes = rascunhos.map((_, i) => String(i + 1))
  const como = opcoes.length === 2 ? '1, 2' : `${opcoes.slice(0, -1).join(', ')} ou ${opcoes.at(-1)}`
  return ['Qual envio?', ...rascunhos.map((r, i) => `${i + 1}) ${linhaDoRascunho(r)}`), `Responda ${opcoes.length === 2 ? `${como} ou *todos*` : `${como} (ou *todos*)`}.`].join('\n')
}

/** O estado de um orçamento que saiu da lista do canal (o "ok" nunca reenvia) */
export function textoEstado(r: RascunhoCanal, agora: Date): string {
  if (r.enviadoEm) return `O ${r.numero} já foi enviado para ${r.cliente} ${quando(r.enviadoEm, agora)}.`
  if (r.descartadoEm) return `O ${r.numero} foi tirado da lista ${quando(r.descartadoEm, agora)}. Para enviar, abra no sistema.`
  switch (r.status) {
    case 'enviado':
    case 'em_negociacao':
      return `Esse orçamento já foi enviado pelo sistema${r.enviadoNoSistemaEm ? ` ${quando(r.enviadoNoSistemaEm, agora)}` : ''} (${r.numero}).`
    case 'aprovado':
      return `O ${r.numero} já foi aprovado. Nada foi reenviado.`
    case 'convertido':
      return `O ${r.numero} já virou pedido. Nada foi reenviado.`
    case 'recusado':
      return `O ${r.numero} foi recusado. Nada foi enviado.`
    case 'expirado':
      return `O ${r.numero} expirou. Reabra no sistema para enviar.`
    default:
      return `O ${r.numero} não está mais como rascunho. Nada foi enviado.`
  }
}

/** Pergunta rápida respondida pelo sistema → texto curto para o WhatsApp */
export function textoDaPergunta(r: RespostaPergunta, linkRelatorio: string | null): string {
  const linhas = [`*${r.titulo}*`, r.resumo]
  for (const l of r.linhas.slice(0, 6)) linhas.push(`• ${l.titulo}${l.valor ? ` — ${formatarMoeda(l.valor)}` : ''}${l.detalhe ? ` (${l.detalhe})` : ''}`)
  const mais = r.mais + Math.max(0, r.linhas.length - 6)
  if (mais > 0) linhas.push(`• e mais ${mais}`)
  if (linkRelatorio) linhas.push('', `${r.link?.rotulo ?? 'Abrir'}: ${linkRelatorio}`)
  return linhas.join('\n')
}

/** A nota lida (foto, PDF ou XML mandado no "Você"): fornecedor, itens, total, parcelas, o que conferir e o link */
export function textoNota(n: NotaCompraLida, link: string): string {
  const fornecedor = n.fornecedor.existente?.nome ?? `${n.fornecedor.fantasia || n.fornecedor.nome} (fornecedor novo)`
  const linhas = [`🧾 Nota${n.numero ? ` ${n.numero}` : ''} de ${fornecedor}${n.origem === 'xml' ? '' : ' (lida da imagem)'}:`]
  const itens = n.itens.slice(0, 8)
  for (const i of itens) {
    const qtd = Number(i.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
    linhas.push(`• ${qtd} ${i.unidade ?? 'un'} ${i.insumo?.nome ?? i.descricao} — ${formatarMoeda(i.valorTotal)}${i.insumo ? '' : ' (sem item no cadastro)'}`)
  }
  if (n.itens.length > itens.length) linhas.push(`• e mais ${n.itens.length - itens.length} itens`)
  linhas.push(`Total: *${formatarMoeda(n.totalNota)}*`)
  if (n.parcelas.length) {
    const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
    linhas.push(`Parcelas: ${n.parcelas.map((p) => `${dia(p.vencimento)} ${formatarMoeda(p.valor)}`).join(' · ')}`)
  }
  const conferir = [
    ...(n.conferir ? ['os valores (lidos da imagem)'] : []),
    ...(n.itens.some((i) => i.conferir) ? [`${n.itens.filter((i) => i.conferir).length} item(ns) para escolher ou conferir o insumo`] : []),
    ...(n.jaLancada ? [`essa nota parece já lançada (entrada ${n.jaLancada.numero})`] : []),
  ]
  if (conferir.length) linhas.push(`Confira: ${conferir.join('; ')}`)
  linhas.push('', `Ela já está no sistema em Estoque › Entradas, esperando sua conferência (nada entra no estoque sem você tocar em "Registrar entrada"): ${link}`)
  return linhas.join('\n')
}

/**
 * O cliente escrito no pedido do dono ("orçamento pra Ana Souza: 2 banners", "orçamento para a Padaria Sol, 500
 * panfletos"): o nome depois do "pra", até os dois-pontos, a vírgula ou o primeiro número. Sem IA (vale quando a
 * leitura não trouxe o nome). null se não houver.
 */
export function nomeDoPedido(texto: string): string | null {
  const m = /\b(?:or[cç]amento|or[cç]a|orc)\s+(?:pra|para|pro)\s+(?:(?:a|o|os|as)\s+)?([^:,;\d\n]+)/i.exec(texto)
  const nome = m?.[1]?.replace(/\s+(?:de|com|e)\s*$/i, '').trim()
  return nome && nome.length >= 2 && nome.split(/\s+/).length <= 6 ? nome : null
}

// ─── Ajuste pelo "Você": para qual orçamento ───

export type DecisaoAjuste =
  | { acao: 'ajustar'; rascunho: RascunhoCanal }
  /** Não está mais pendente (enviado, aprovado…): não altera, diz o estado */
  | { acao: 'estado'; rascunho: RascunhoCanal }
  | { acao: 'apagado' }
  /** Vários pendentes recentes: pergunta qual (o ajuste se faz citando o aviso) */
  | { acao: 'perguntar'; rascunhos: RascunhoCanal[] }
  | { acao: 'nenhum' }

/** A mesma regra do "ok": o orçamento do aviso citado; sem citar, só com exatamente um pendente avisado há pouco */
export function escolherParaAjustar(ctx: { citado: AvisoCitado | null; rascunhos: RascunhoCanal[]; agora: Date }): DecisaoAjuste {
  if (ctx.citado) {
    const r = ctx.rascunhos.find((x) => x.orcamentoId === ctx.citado!.orcamentoId)
    if (!r) return { acao: 'apagado' }
    return estaPendente(r) ? { acao: 'ajustar', rascunho: r } : { acao: 'estado', rascunho: r }
  }
  const lista = recentes(ctx.rascunhos, ctx.agora)
  if (lista.length === 1) return { acao: 'ajustar', rascunho: lista[0]! }
  return lista.length > 1 ? { acao: 'perguntar', rascunhos: lista } : { acao: 'nenhum' }
}

// ─── Qual "ok": enviar o rascunho × confirmar a aprovação ───

export type RotaDoComando = 'aprovar' | 'reenviar' | 'nao_aprovar' | 'ajustar_aprovacao' | 'ja_aprovado' | 'desfazer' | 'reenviar_sem_citar' | 'rascunho'

/**
 * O que o comando faz conforme o aviso citado: no aviso "confirmar aprovação" o "ok" APROVA (nunca envia), "reenvia"
 * manda a versão nova e qualquer outro texto é ajuste; no aviso da aprovação automática só vale o "desfazer". Nos
 * avisos de rascunho (ou sem citar) segue o fluxo dos rascunhos ("ok" envia).
 */
export function rotaDoComando(comando: ComandoVoce, tipoCitado: string | null | undefined): RotaDoComando {
  if (comando.tipo === 'desfazer') return 'desfazer'
  if (tipoCitado === 'confirmar_aprovacao') {
    if (comando.tipo === 'enviar') return 'aprovar'
    if (comando.tipo === 'reenviar') return 'reenviar'
    if (comando.tipo === 'cancelar') return 'nao_aprovar'
    return 'ajustar_aprovacao'
  }
  if (tipoCitado === 'aprovado_auto') return 'ja_aprovado'
  if (comando.tipo === 'reenviar') return 'reenviar_sem_citar'
  return 'rascunho'
}
