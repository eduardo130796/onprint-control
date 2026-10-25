import { OPCOES_ENQUETE_ORCAMENTO, STATUS_ORCAMENTO_ABERTOS, type TipoRespostaWhatsapp } from '@onprint/shared'

/*
 * O cliente responde o orçamento na própria conversa: voto na enquete ("✅ Aprovado" / "✏️ Quero modificações") ou
 * texto ("aprovado", "pode fazer", "quero mudar a cor"). Aqui só a decisão (pura, testável); o banco fica em
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

export type Decisao =
  | { acao: 'ignorar'; motivo: string }
  | { acao: 'aprovar'; alvo: OrcamentoEnviado; resposta: TipoRespostaWhatsapp }
  | { acao: 'modificar'; alvo: OrcamentoEnviado; resposta: TipoRespostaWhatsapp; responderCliente: boolean }
  | { acao: 'notificar'; motivo: MotivoNotificacao; alvos: OrcamentoEnviado[]; resposta: TipoRespostaWhatsapp; avisarEquipe: boolean }

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
    intencao = intencaoDoTexto(r.texto)
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
  if (intencao === 'modificar') {
    const jaRespondeu = alvo.resposta === 'modificacoes' && alvo.respostaEm !== null && opcoes.agora.getTime() - alvo.respostaEm.getTime() < SILENCIO_RESPOSTA_CLIENTE_MS
    return { acao: 'modificar', alvo, resposta, responderCliente: !jaRespondeu }
  }
  const recente = alvo.respostaEm !== null && opcoes.agora.getTime() - alvo.respostaEm.getTime() < SILENCIO_NOTIFICACAO_MS
  return { acao: 'notificar', motivo: 'texto', alvos: [alvo], resposta, avisarEquipe: !recente }
}

/** Número com e sem o 9º dígito (celular antigo no WhatsApp: 55 + DDD + 8 dígitos) */
export function variantesDoNumero(numero: string): string[] {
  const d = numero.replace(/\D/g, '')
  const lista = new Set([d])
  if (/^55\d{2}9\d{8}$/.test(d)) lista.add(d.slice(0, 4) + d.slice(5))
  if (/^55\d{2}[6-9]\d{7}$/.test(d)) lista.add(`${d.slice(0, 4)}9${d.slice(4)}`)
  return [...lista]
}
