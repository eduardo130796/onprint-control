import { OPCOES_ENQUETE_ORCAMENTO, STATUS_ORCAMENTO_ABERTOS, type FormatoRespostaOrcamento, type IntencaoRespostaIA, type TipoRespostaWhatsapp } from '@onprint/shared'

/*
 * O cliente responde o orçamento na própria conversa: voto na enquete ("✅ Aprovado" / "✏️ Quero modificações") ou
 * texto ("aprovado", "pode fazer", "quero mudar a cor") ou, se a gráfica escolheu "Responder 1 ou 2", o número. Aqui só a decisão (pura, testável); o banco fica em
 * respostas.service.ts. Na dúvida, nada muda sozinho: a equipe recebe a notificação e confirma no orçamento.
 */

/** O que a resposta pede */
export type IntencaoResposta = 'aprovar' | 'modificar' | 'indefinida'

/** Texto sem acento, minúsculo, só letras/números separados por um espaço */
export function normalizarResposta(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const NEGACAO = /\b(nao|n|nem|nunca|jamais|negativo|ainda)\b/
const MODIFICAR =
  /\b(mud\w*|alter\w*|ajust\w*|modific\w*|troc\w*|corrig\w*|correc\w*|refaz\w*|refa[cz]a|diminu\w*|aument\w*|tira|tirar|retir\w*|acrescent\w*|inclu\w*|coloc\w*|errad\w*|errou|erro|outra cor|outro tamanho|desconto|mais barato)\b/
const APROVAR = /\b(aprovad[oa]s?|aprovo|aprovamos|aprovei|aprovar|aprova|aprovadissimo)\b/
const CONFIRMAR = /\b(pode (fazer|produzir|seguir|imprimir|rodar|mandar( fazer| ver)?|confirmar|fechar)|fechado|fechou|fechamos|manda ver|pode ser assim)\b/

/**
 * Intenção do texto. Conservadora: aprovar só sem negação nem pergunta e sem pedido de mudança ("aprovado, mas muda a
 * cor" é modificação; "não aprovado", "ainda não" e "aprovado?" ficam para a equipe).
 */
export function intencaoDoTexto(texto: string): IntencaoResposta {
  const t = normalizarResposta(texto)
  if (!t || t.length > 300) return 'indefinida'
  if (NEGACAO.test(t)) return 'indefinida'
  if (MODIFICAR.test(t)) return 'modificar'
  if (texto.includes('?')) return 'indefinida'
  if (APROVAR.test(t) || CONFIRMAR.test(t)) return 'aprovar'
  return 'indefinida'
}

/**
 * "1" (aprovar) ou "2" (pedir mudança) respondido sozinho: "1", "1." ou "1️⃣" (espaços em volta não contam). Qualquer
 * outra coisa ("1 banner", "12", "opção 1") não é número de resposta.
 */
export function numeroDaResposta(texto: string): 1 | 2 | null {
  const m = /^([12])(?:\.|\uFE0F?\u20E3)?$/u.exec(texto.trim())
  return m ? (Number(m[1]) as 1 | 2) : null
}

/** Opção escolhida na enquete (o nome que voltou no voto) */
export function intencaoDaOpcao(opcoes: string[]): IntencaoResposta | 'sem_voto' {
  if (opcoes.length === 0) return 'sem_voto'
  const escolhidas = new Set(opcoes.map(normalizarResposta))
  const aprova = escolhidas.has(normalizarResposta(OPCOES_ENQUETE_ORCAMENTO.aprovar)) || [...escolhidas].some((o) => /\baprovad/.test(o))
  const modifica = escolhidas.has(normalizarResposta(OPCOES_ENQUETE_ORCAMENTO.modificar)) || [...escolhidas].some((o) => /\bmodifica/.test(o))
  if (aprova && !modifica) return 'aprovar'
  if (modifica && !aprova) return 'modificar'
  return 'indefinida'
}

/** Orçamento enviado pelo WhatsApp (a linha orcamento_enviado em mensagens_whatsapp) */
export interface OrcamentoEnviado {
  mensagemId: string
  orcamentoId: string
  numero: string
  status: string
  /** Mensagem do orçamento e enquete (ids no WhatsApp) */
  idExterno: string | null
  enqueteId: string | null
  /** Como saiu: o "1"/"2" só vale para "numeros" (null = envio de antes da escolha: nunca) */
  formatoResposta: FormatoRespostaOrcamento | null
  enviadaEm: Date
  /** Última resposta já registrada */
  resposta: TipoRespostaWhatsapp | null
  respostaEm: Date | null
  respostaIdExterno: string | null
}

export type Recebida =
  /** opcoes null = não deu para abrir o voto */
  | { tipo: 'voto'; idMensagem: string; idEnquete: string; opcoes: string[] | null }
  | { tipo: 'texto'; idMensagem: string; texto: string; citadoId: string | null }

export type MotivoNotificacao =
  /** Texto que não é aprovação nem pedido de mudança claro */
  | 'texto'
  /** Mais de um orçamento aberto para o número: qual? */
  | 'varios'
  /** O voto não abriu (a equipe confere a enquete no celular) */
  | 'voto_ilegivel'
  /** Aprovação, com "aprovar sozinho" desligado */
  | 'aprovacao_manual'
  /** Pediu mudança (ou mudou o voto) num orçamento já aprovado/convertido */
  | 'depois_de_aprovado'
  /** Respondeu um orçamento recusado ou expirado */
  | 'fechado'
  /** O Assistente GrafyGo leu e não é caso de agir sozinho (pergunta, outro assunto, pouca certeza) */
  | 'assistente'

/** O que o Assistente GrafyGo entendeu do texto (vai junto da decisão para registrar e avisar a equipe) */
export interface LeituraAssistente {
  intencao: IntencaoRespostaIA
  confianca: number
  resumo: string
  temPergunta: boolean
}

export type Decisao =
  | { acao: 'ignorar'; motivo: string }
  | { acao: 'aprovar'; alvo: OrcamentoEnviado; resposta: TipoRespostaWhatsapp; assistente?: LeituraAssistente }
  | { acao: 'modificar'; alvo: OrcamentoEnviado; resposta: TipoRespostaWhatsapp; responderCliente: boolean; assistente?: LeituraAssistente }
  | { acao: 'notificar'; motivo: MotivoNotificacao; alvos: OrcamentoEnviado[]; resposta: TipoRespostaWhatsapp; avisarEquipe: boolean; assistente?: LeituraAssistente }

/** Texto sem citar a mensagem vale para o único orçamento aberto enviado ao número nestes dias */
export const JANELA_RESPOSTA_MS = 30 * 86_400_000
/** Outra mensagem sem intenção clara no mesmo orçamento logo depois: registra, sem notificar de novo */
export const SILENCIO_NOTIFICACAO_MS = 10 * 60_000
/** "Já avisei a equipe" sai uma vez; outro pedido de mudança nestas horas não repete a resposta */
export const SILENCIO_RESPOSTA_CLIENTE_MS = 6 * 3_600_000

const aberto = (status: string) => (STATUS_ORCAMENTO_ABERTOS as readonly string[]).includes(status) && status !== 'rascunho'
const aprovado = (status: string) => status === 'aprovado' || status === 'convertido'

/**
 * O que fazer com a resposta. `candidatos`: para o voto, a linha da enquete (pelo id); para o texto, os orçamentos
 * enviados ao número (o citado, se houver, e os abertos nos últimos 30 dias).
 * "1"/"2" sozinho só vale para o orçamento que saiu pedindo o número (formato "numeros"): o citado, ou o único aberto
 * enviado ao número nos 30 dias. Para orçamento com enquete ou só texto, o número é uma resposta qualquer (a equipe vê).
 */
export function decidirResposta(r: Recebida, candidatos: OrcamentoEnviado[], opcoes: { aprovarSozinho: boolean; agora: Date }): Decisao {
  let alvo: OrcamentoEnviado | undefined
  let intencao: IntencaoResposta
  if (r.tipo === 'voto') {
    alvo = candidatos.find((c) => c.enqueteId === r.idEnquete)
    if (!alvo) return { acao: 'ignorar', motivo: 'enquete desconhecida' }
    if (r.opcoes === null) {
      if (alvo.respostaIdExterno === r.idMensagem) return { acao: 'ignorar', motivo: 'repetida' }
      return { acao: 'notificar', motivo: 'voto_ilegivel', alvos: [alvo], resposta: 'outra', avisarEquipe: true }
    }
    const i = intencaoDaOpcao(r.opcoes)
    if (i === 'sem_voto') return { acao: 'ignorar', motivo: 'voto retirado' }
    intencao = i
  } else {
    alvo = r.citadoId ? candidatos.find((c) => c.idExterno === r.citadoId || c.enqueteId === r.citadoId) : undefined
    const numero = numeroDaResposta(r.texto)
    intencao = numero === null ? intencaoDoTexto(r.texto) : 'indefinida'
    if (!alvo) {
      const limite = opcoes.agora.getTime() - JANELA_RESPOSTA_MS
      const abertos = candidatos.filter((c) => aberto(c.status) && c.enviadaEm.getTime() >= limite)
      // Vários envios do mesmo orçamento contam como um (fica o mais recente)
      const porOrcamento = [...abertos].sort((a, b) => b.enviadaEm.getTime() - a.enviadaEm.getTime()).filter((c, i, l) => l.findIndex((x) => x.orcamentoId === c.orcamentoId) === i)
      if (porOrcamento.length === 0) return { acao: 'ignorar', motivo: 'sem orçamento aberto para o número' }
      if (porOrcamento.length > 1) {
        if (porOrcamento.every((c) => c.respostaIdExterno === r.idMensagem)) return { acao: 'ignorar', motivo: 'repetida' }
        // Não se sabe de qual: fica registrada como resposta "a confirmar" em cada um (nunca como aprovado)
        return { acao: 'notificar', motivo: 'varios', alvos: porOrcamento, resposta: 'outra', avisarEquipe: true }
      }
      alvo = porOrcamento[0]!
    }
    // O número só aprova/pede mudança no orçamento que saiu pedindo 1/2
    if (numero !== null && alvo.formatoResposta === 'numeros') intencao = numero === 1 ? 'aprovar' : 'modificar'
  }

  if (alvo.respostaIdExterno === r.idMensagem) return { acao: 'ignorar', motivo: 'repetida' }
  const resposta: TipoRespostaWhatsapp = intencao === 'aprovar' ? 'aprovado' : intencao === 'modificar' ? 'modificacoes' : 'outra'

  if (aprovado(alvo.status)) {
    // Já aprovado: "aprovado" de novo não muda nada; mudança de ideia nunca desfaz a aprovação (a equipe decide)
    if (intencao === 'aprovar') return { acao: 'ignorar', motivo: 'já aprovado' }
    return { acao: 'notificar', motivo: 'depois_de_aprovado', alvos: [alvo], resposta, avisarEquipe: true }
  }
  if (!aberto(alvo.status)) return { acao: 'notificar', motivo: 'fechado', alvos: [alvo], resposta, avisarEquipe: true }

  if (intencao === 'aprovar') {
    return opcoes.aprovarSozinho ? { acao: 'aprovar', alvo, resposta } : { acao: 'notificar', motivo: 'aprovacao_manual', alvos: [alvo], resposta, avisarEquipe: true }
  }
  if (intencao === 'modificar') return { acao: 'modificar', alvo, resposta, responderCliente: !jaRespondeuModificacao(alvo, opcoes.agora) }
  const recente = alvo.respostaEm !== null && opcoes.agora.getTime() - alvo.respostaEm.getTime() < SILENCIO_NOTIFICACAO_MS
  return { acao: 'notificar', motivo: 'texto', alvos: [alvo], resposta, avisarEquipe: !recente }
}

/** "Já avisei a equipe" saiu há pouco para este orçamento (não repete) */
const jaRespondeuModificacao = (alvo: OrcamentoEnviado, agora: Date) =>
  alvo.resposta === 'modificacoes' && alvo.respostaEm !== null && agora.getTime() - alvo.respostaEm.getTime() < SILENCIO_RESPOSTA_CLIENTE_MS

// ─── Assistente GrafyGo: o texto que as regras não entenderam ───

/** Certeza mínima para aprovar sozinho (e nunca com pergunta no texto) e para tratar como pedido de modificação */
export const CONFIANCA_APROVAR = 0.85
export const CONFIANCA_MODIFICAR = 0.8

/**
 * A resposta vai para o Assistente: texto (não número, não voto) sem intenção clara para as regras, ligado a um único
 * orçamento aberto. Vários orçamentos, número desconhecido, orçamento fechado ou já aprovado continuam como antes.
 */
export function vaiParaAssistente(d: Decisao, r: Recebida): d is Extract<Decisao, { acao: 'notificar' }> {
  return r.tipo === 'texto' && d.acao === 'notificar' && d.motivo === 'texto' && d.alvos.length === 1 && numeroDaResposta(r.texto) === null && r.texto.trim().length > 0
}

/**
 * O que fazer com a leitura do Assistente. Age sozinho só no claro: aprova com confiança ≥ 0,85 e sem pergunta (nem no
 * texto, nem na leitura); pedido de modificação com ≥ 0,8 segue o fluxo de modificação. O resto avisa o vendedor com o
 * resumo ("Assistente: o cliente perguntou se dá para entregar sexta"). `base` é a decisão das regras (notificar).
 */
export function decidirPeloAssistente(leitura: LeituraAssistente, texto: string, base: Extract<Decisao, { acao: 'notificar' }>, opcoes: { aprovarSozinho: boolean; agora: Date }): Decisao {
  const alvo = base.alvos[0]!
  const pergunta = leitura.temPergunta || texto.includes('?')
  if (leitura.intencao === 'aprova' && leitura.confianca >= CONFIANCA_APROVAR && !pergunta) {
    return opcoes.aprovarSozinho
      ? { acao: 'aprovar', alvo, resposta: 'aprovado', assistente: leitura }
      : { acao: 'notificar', motivo: 'aprovacao_manual', alvos: [alvo], resposta: 'aprovado', avisarEquipe: true, assistente: leitura }
  }
  if (leitura.intencao === 'quer_modificacoes' && leitura.confianca >= CONFIANCA_MODIFICAR) {
    return { acao: 'modificar', alvo, resposta: 'modificacoes', responderCliente: !jaRespondeuModificacao(alvo, opcoes.agora), assistente: leitura }
  }
  // Pergunta sempre avisa (mesmo logo depois de outra mensagem); o resto respeita o silêncio de 10 minutos
  return { acao: 'notificar', motivo: 'assistente', alvos: [alvo], resposta: 'outra', avisarEquipe: pergunta || leitura.intencao === 'pergunta' || base.avisarEquipe, assistente: leitura }
}

/** Número com e sem o 9º dígito (celular antigo no WhatsApp: 55 + DDD + 8 dígitos) */
export function variantesDoNumero(numero: string): string[] {
  const d = numero.replace(/\D/g, '')
  const lista = new Set([d])
  if (/^55\d{2}9\d{8}$/.test(d)) lista.add(d.slice(0, 4) + d.slice(5))
  if (/^55\d{2}[6-9]\d{7}$/.test(d)) lista.add(`${d.slice(0, 4)}9${d.slice(4)}`)
  return [...lista]
}
