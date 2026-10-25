import { z } from 'zod'
import { normalizarEtiqueta, type RegraComercialMotor } from './regras-comerciais'
import { normalizarDecimal } from './schemas/campos'
import { MODOS_USO_REGRA, regraComercialSchema, type ModoUsoRegra, type RegraComercialDados, type RegraComercialInput } from './schemas/regras'

/*
 * Regras comerciais em perguntas (Configurações → Regras comerciais): o dono responde seis perguntas simples ("Dá
 * desconto por quantidade?") e o sistema cria, atualiza ou desliga as regras por baixo — as mesmas do motor, do
 * modelo pronto de cada pergunta (tipo). As escolhas técnicas ficam no padrão: descontos novos não juntam (vale o
 * maior), a frase para o cliente sai pronta e a urgência vale sempre (com aviso para a equipe). Regra do mesmo tipo
 * com outra forma (condição a mais, R$ em vez de %, faixa por valor…) é "personalizada": a pergunta não mexe nela.
 *
 * Os números vão e voltam como decimal da API ("5", "50.00"); a tela formata.
 */

export interface FaixaQuantidade {
  /** A partir de quantas unidades (no item) */
  aPartirDe: string
  percentual: string
}

export interface RespostasRegras {
  quantidade: { ligado: boolean; faixas: FaixaQuantidade[]; modoUso: ModoUsoRegra }
  aVista: { ligado: boolean; percentual: string; modoUso: ModoUsoRegra }
  especiais: { ligado: boolean; lista: { etiqueta: string; percentual: string }[]; modoUso: ModoUsoRegra }
  urgencia: { ligado: boolean; percentual: string; dias: string }
  minimo: { ligado: boolean; valor: string }
  limite: { ligado: boolean; percentual: string }
}

export type PerguntaRegra = keyof RespostasRegras

const numeroTexto = z.union([z.string(), z.number()]).transform((v) => normalizarDecimal(String(v)))
const modoUso = z.enum(MODOS_USO_REGRA)

/** PUT /regras-comerciais/perguntas: as respostas (os números são conferidos por planoDasRespostas e pelo schema da regra) */
export const respostasRegrasSchema = z.object({
  quantidade: z.object({ ligado: z.boolean(), faixas: z.array(z.object({ aPartirDe: numeroTexto, percentual: numeroTexto })).max(10), modoUso }),
  aVista: z.object({ ligado: z.boolean(), percentual: numeroTexto, modoUso }),
  especiais: z.object({ ligado: z.boolean(), lista: z.array(z.object({ etiqueta: z.string().trim().max(40), percentual: numeroTexto })).max(20), modoUso }),
  urgencia: z.object({ ligado: z.boolean(), percentual: numeroTexto, dias: numeroTexto }),
  minimo: z.object({ ligado: z.boolean(), valor: numeroTexto }),
  limite: z.object({ ligado: z.boolean(), percentual: numeroTexto }),
})

/** Respostas de quem ainda não tem regra (a pergunta começa desligada, com um exemplo nos campos) */
export const RESPOSTAS_PADRAO: RespostasRegras = {
  quantidade: { ligado: false, faixas: [{ aPartirDe: '100', percentual: '5' }], modoUso: 'sugerir' },
  aVista: { ligado: false, percentual: '3', modoUso: 'sugerir' },
  especiais: { ligado: false, lista: [{ etiqueta: 'Revenda', percentual: '10' }], modoUso: 'sugerir' },
  urgencia: { ligado: false, percentual: '20', dias: '2' },
  minimo: { ligado: false, valor: '50' },
  limite: { ligado: false, percentual: '5' },
}

/** O que a regra da pergunta tem que ter para ser "dela" (senão é personalizada e a pergunta não mexe) */
type Regra = Pick<RegraComercialMotor, 'id' | 'nome' | 'ativa' | 'tipo' | 'condicoes' | 'acao' | 'combinacao' | 'modoUso'>

const chaves = (o: object) => Object.keys(o).sort().join(',')
const semFaixas = (a: Regra['acao']) => !('faixas' in a) || !a.faixas?.length

const FORMA: Record<PerguntaRegra, (r: Regra) => boolean> = {
  quantidade: (r) =>
    r.tipo === 'desconto_quantidade' &&
    chaves(r.condicoes) === '' &&
    r.acao.tipo === 'desconto' &&
    r.acao.modo === 'percentual' &&
    r.acao.nivel === 'item' &&
    r.acao.faixasPor === 'quantidade' &&
    Boolean(r.acao.faixas?.length),
  aVista: (r) =>
    r.tipo === 'desconto_a_vista' && chaves(r.condicoes) === 'pagamento' && r.condicoes.pagamento === 'a_vista' && r.acao.tipo === 'desconto' && r.acao.modo === 'percentual' && semFaixas(r.acao),
  especiais: (r) =>
    r.tipo === 'cliente_especial' &&
    chaves(r.condicoes) === 'etiquetas' &&
    r.condicoes.etiquetas?.length === 1 &&
    r.acao.tipo === 'desconto' &&
    r.acao.modo === 'percentual' &&
    r.acao.nivel === 'item' &&
    semFaixas(r.acao),
  urgencia: (r) =>
    r.tipo === 'urgencia' && chaves(r.condicoes) === 'prazoMenorQueDias' && r.acao.tipo === 'acrescimo' && r.acao.modo === 'percentual' && r.acao.nivel === 'orcamento' && semFaixas(r.acao),
  minimo: (r) => r.tipo === 'pedido_minimo' && chaves(r.condicoes) === '' && r.acao.tipo === 'pedido_minimo' && r.acao.modo === 'completar',
  limite: (r) => r.tipo === 'limite_negociacao' && chaves(r.condicoes) === '' && r.acao.tipo === 'limite_negociacao',
}

const TIPO_DA_PERGUNTA: Record<PerguntaRegra, string> = {
  quantidade: 'desconto_quantidade',
  aVista: 'desconto_a_vista',
  especiais: 'cliente_especial',
  urgencia: 'urgencia',
  minimo: 'pedido_minimo',
  limite: 'limite_negociacao',
}

/** As regras que a pergunta controla (as ligadas primeiro) */
export function regrasDaPergunta<T extends Regra>(p: PerguntaRegra, regras: T[]): T[] {
  return regras.filter(FORMA[p]).sort((a, b) => Number(b.ativa) - Number(a.ativa))
}

/** Regras do tipo da pergunta com outra forma (feitas no avançado): a pergunta avisa e não mexe nelas */
export function personalizadasDaPergunta<T extends Regra>(p: PerguntaRegra, regras: T[]): T[] {
  return regras.filter((r) => r.tipo === TIPO_DA_PERGUNTA[p] && !FORMA[p](r))
}

/** Regras que nenhuma pergunta controla (vão para "Regras personalizadas (avançado)") */
export function regrasAvancadas<T extends Regra>(regras: T[]): T[] {
  const dasPerguntas = new Set((Object.keys(FORMA) as PerguntaRegra[]).flatMap((p) => regrasDaPergunta(p, regras).map((r) => r.id)))
  return regras.filter((r) => !dasPerguntas.has(r.id))
}

const modo = (r: Regra, padrao: ModoUsoRegra): ModoUsoRegra => r.modoUso ?? padrao

/** Regras gravadas → respostas das perguntas */
export function respostasDasRegras(regras: Regra[]): RespostasRegras {
  const r: RespostasRegras = structuredClone(RESPOSTAS_PADRAO)
  const [q] = regrasDaPergunta('quantidade', regras)
  if (q && q.acao.tipo === 'desconto' && q.acao.faixas?.length) {
    r.quantidade = {
      ligado: q.ativa,
      faixas: [...q.acao.faixas].sort((a, b) => Number(a.minimo) - Number(b.minimo)).map((f) => ({ aPartirDe: f.minimo, percentual: f.valor })),
      modoUso: modo(q, 'sugerir'),
    }
  }
  const [v] = regrasDaPergunta('aVista', regras)
  if (v && v.acao.tipo === 'desconto') r.aVista = { ligado: v.ativa, percentual: v.acao.valor, modoUso: modo(v, 'sugerir') }
  const especiais = regrasDaPergunta('especiais', regras)
  const ligadas = especiais.filter((e) => e.ativa)
  const mostrar = ligadas.length ? ligadas : especiais
  if (mostrar.length) {
    r.especiais = {
      ligado: ligadas.length > 0,
      lista: mostrar.map((e) => ({ etiqueta: e.condicoes.etiquetas![0]!, percentual: e.acao.tipo === 'desconto' ? e.acao.valor : '0' })),
      modoUso: modo(mostrar[0]!, 'sugerir'),
    }
  }
  const [u] = regrasDaPergunta('urgencia', regras)
  if (u && u.acao.tipo === 'acrescimo') r.urgencia = { ligado: u.ativa, percentual: u.acao.valor, dias: String(u.condicoes.prazoMenorQueDias) }
  const [m] = regrasDaPergunta('minimo', regras)
  if (m && m.acao.tipo === 'pedido_minimo') r.minimo = { ligado: m.ativa, valor: m.acao.valor }
  const [l] = regrasDaPergunta('limite', regras)
  if (l && l.acao.tipo === 'limite_negociacao') r.limite = { ligado: l.ativa, percentual: l.acao.percentual }
  return r
}

/** A regra que a resposta pede (nova: nome, frase e "vale o maior" no padrão) */
function regraDaResposta(p: PerguntaRegra, resp: RespostasRegras, indice = 0): RegraComercialInput {
  switch (p) {
    case 'quantidade': {
      const faixas = resp.quantidade.faixas.map((f) => ({ minimo: f.aPartirDe, valor: f.percentual }))
      return {
        nome: 'Desconto por quantidade',
        tipo: 'desconto_quantidade',
        condicoes: {},
        combinacao: 'maior',
        modoUso: resp.quantidade.modoUso,
        acao: { tipo: 'desconto', modo: 'percentual', valor: faixas[0]?.valor ?? '0', nivel: 'item', faixasPor: 'quantidade', faixas, fraseCliente: 'Desconto de {valor} por quantidade' },
      }
    }
    case 'aVista':
      return {
        nome: 'Desconto à vista ou Pix',
        tipo: 'desconto_a_vista',
        condicoes: { pagamento: 'a_vista' },
        combinacao: 'maior',
        modoUso: resp.aVista.modoUso,
        acao: { tipo: 'desconto', modo: 'percentual', valor: resp.aVista.percentual, nivel: 'orcamento', fraseCliente: 'Desconto de {valor} para pagamento à vista ou Pix' },
      }
    case 'especiais': {
      const e = resp.especiais.lista[indice]!
      return {
        nome: `Preço especial: ${e.etiqueta.trim()}`,
        tipo: 'cliente_especial',
        condicoes: { etiquetas: [e.etiqueta.trim()] },
        combinacao: 'maior',
        modoUso: resp.especiais.modoUso,
        acao: { tipo: 'desconto', modo: 'percentual', valor: e.percentual, nivel: 'item', fraseCliente: 'Condição especial: {valor} de desconto' },
      }
    }
    case 'urgencia':
      return {
        nome: 'Taxa de urgência',
        tipo: 'urgencia',
        condicoes: { prazoMenorQueDias: Number(resp.urgencia.dias) },
        combinacao: 'soma',
        modoUso: 'sempre',
        acao: {
          tipo: 'acrescimo',
          modo: 'percentual',
          valor: resp.urgencia.percentual,
          nivel: 'orcamento',
          avisoEquipe: 'Pedido urgente: confirme a fila da produção antes de prometer o prazo.',
          fraseCliente: 'Taxa de urgência de {valor}',
        },
      }
    case 'minimo':
      return { nome: 'Pedido mínimo', tipo: 'pedido_minimo', condicoes: {}, combinacao: 'soma', modoUso: 'sempre', acao: { tipo: 'pedido_minimo', valor: resp.minimo.valor, modo: 'completar', fraseCliente: 'Pedido mínimo de {valor}' } }
    case 'limite':
      return { nome: 'Limite de desconto do vendedor', tipo: 'limite_negociacao', condicoes: {}, combinacao: 'soma', modoUso: 'sempre', acao: { tipo: 'limite_negociacao', percentual: resp.limite.percentual } }
  }
}

/**
 * Regra que já existe: troca só os números e o modo de uso (nome, frase, aviso e "junta ou não" que o dono mudou no
 * avançado ficam como estão)
 */
function mesclar(existente: Regra, nova: RegraComercialInput): RegraComercialInput {
  const a = existente.acao as Record<string, unknown>
  const extras = { fraseCliente: a.fraseCliente ?? null, avisoEquipe: a.avisoEquipe ?? null }
  const acao = nova.acao.tipo === 'limite_negociacao' ? nova.acao : { ...nova.acao, ...extras }
  return { ...nova, nome: existente.nome, combinacao: existente.combinacao, acao: acao as RegraComercialInput['acao'] }
}

export type OperacaoRegra =
  | { tipo: 'criar'; pergunta: PerguntaRegra; dados: RegraComercialDados }
  | { tipo: 'atualizar'; pergunta: PerguntaRegra; id: string; dados: RegraComercialDados }
  | { tipo: 'desligar'; pergunta: PerguntaRegra; id: string }

export interface PlanoRegras {
  operacoes: OperacaoRegra[]
  /** Respostas com número inválido (a pergunta e a mensagem, para a tela) */
  erros: { pergunta: PerguntaRegra; mensagem: string }[]
}

/** JSON comparável: sem campos vazios (null/undefined) e com as chaves em ordem */
function comparavel(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(comparavel)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== null && x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, comparavel(x)]),
    )
  }
  return v
}

const iguais = (r: Regra, d: RegraComercialDados) =>
  JSON.stringify(comparavel([r.nome, r.ativa, r.tipo, r.condicoes, r.acao, r.combinacao, r.modoUso])) === JSON.stringify(comparavel([d.nome, d.ativa, d.tipo, d.condicoes, d.acao, d.combinacao, d.modoUso]))

/** Confere as respostas que a tela não deixa passar (o schema confere o resto) */
function conferir(p: PerguntaRegra, resp: RespostasRegras): string | null {
  if (p === 'quantidade') {
    if (!resp.quantidade.faixas.length) return 'Informe ao menos uma faixa.'
    if (resp.quantidade.faixas.some((f) => !(Number(f.aPartirDe) > 0))) return 'Informe a partir de quantas unidades.'
  }
  if (p === 'especiais') {
    if (!resp.especiais.lista.length) return 'Informe ao menos uma etiqueta.'
    if (resp.especiais.lista.some((e) => !e.etiqueta.trim())) return 'Escreva a etiqueta do cliente.'
    const nomes = resp.especiais.lista.map((e) => normalizarEtiqueta(e.etiqueta))
    if (new Set(nomes).size !== nomes.length) return 'Há etiquetas repetidas.'
  }
  if (p === 'urgencia' && !(Number(resp.urgencia.dias) >= 1 && Number(resp.urgencia.dias) <= 60 && Number.isInteger(Number(resp.urgencia.dias)))) return 'Prazo entre 1 e 60 dias úteis.'
  return null
}

/** A regra nova ou atualizada, validada pelo mesmo schema da API (com o modo normalizado) */
function validar(p: PerguntaRegra, dados: RegraComercialInput, erros: PlanoRegras['erros']): RegraComercialDados | null {
  const v = regraComercialSchema.safeParse(dados)
  if (!v.success) {
    erros.push({ pergunta: p, mensagem: v.error.issues[0]?.message ?? 'Confira os números.' })
    return null
  }
  return v.data
}

/**
 * Respostas → o que gravar: cria a regra que falta, atualiza a que mudou e desliga a pergunta respondida com "não"
 * (desliga, não exclui: ligar de novo traz os números de volta). Perguntas sem mudança não geram operação.
 */
export function planoDasRespostas(resp: RespostasRegras, regras: Regra[]): PlanoRegras {
  const operacoes: OperacaoRegra[] = []
  const erros: PlanoRegras['erros'] = []

  for (const p of ['quantidade', 'aVista', 'urgencia', 'minimo', 'limite'] as const) {
    const [existente] = regrasDaPergunta(p, regras)
    if (!resp[p].ligado) {
      if (existente?.ativa) operacoes.push({ tipo: 'desligar', pergunta: p, id: existente.id })
      continue
    }
    const erro = conferir(p, resp)
    if (erro) {
      erros.push({ pergunta: p, mensagem: erro })
      continue
    }
    const nova = regraDaResposta(p, resp)
    const dados = validar(p, existente ? { ...mesclar(existente, nova), ativa: true } : { ...nova, ativa: true }, erros)
    if (!dados) continue
    if (!existente) operacoes.push({ tipo: 'criar', pergunta: p, dados })
    else if (!iguais(existente, dados)) operacoes.push({ tipo: 'atualizar', pergunta: p, id: existente.id, dados })
  }

  // Clientes especiais: uma regra por etiqueta (a mesma etiqueta, sem diferença de maiúsculas e acentos, é a mesma regra)
  const especiais = regrasDaPergunta('especiais', regras)
  const usadas = new Set<string>()
  if (resp.especiais.ligado) {
    const erro = conferir('especiais', resp)
    if (erro) erros.push({ pergunta: 'especiais', mensagem: erro })
    else {
      resp.especiais.lista.forEach((e, i) => {
        const existente = especiais.find((r) => !usadas.has(r.id) && normalizarEtiqueta(r.condicoes.etiquetas![0]!) === normalizarEtiqueta(e.etiqueta))
        if (existente) usadas.add(existente.id)
        const nova = regraDaResposta('especiais', resp, i)
        // A etiqueta escrita de outro jeito ("revenda" → "Revenda") passa a valer como o dono escreveu agora
        const base = existente ? { ...mesclar(existente, nova), condicoes: nova.condicoes } : nova
        const dados = validar('especiais', { ...base, ativa: true }, erros)
        if (!dados) return
        if (!existente) operacoes.push({ tipo: 'criar', pergunta: 'especiais', dados })
        else if (!iguais(existente, dados)) operacoes.push({ tipo: 'atualizar', pergunta: 'especiais', id: existente.id, dados })
      })
    }
  }
  if (!resp.especiais.ligado || !erros.some((e) => e.pergunta === 'especiais')) {
    for (const r of especiais) if (r.ativa && !usadas.has(r.id)) operacoes.push({ tipo: 'desligar', pergunta: 'especiais', id: r.id })
  }

  return { operacoes, erros }
}

// ─── "Explique com suas palavras" (Assistente) ───

/**
 * O que o Assistente entendeu do texto do dono, já no formato das perguntas: só o que o dono disse (null = não falou
 * disso; modo null = não disse quando usar). Nada é gravado: a tela preenche as perguntas para o dono revisar e salvar.
 */
export interface RegrasDeTexto {
  quantidade: { faixas: FaixaQuantidade[]; modoUso: ModoUsoRegra | null } | null
  aVista: { percentual: string; modoUso: ModoUsoRegra | null } | null
  especiais: { lista: { etiqueta: string; percentual: string }[]; modoUso: ModoUsoRegra | null } | null
  urgencia: { percentual: string; dias: string | null } | null
  minimo: { valor: string } | null
  limite: { percentual: string } | null
  /** Partes do texto que não cabem em nenhuma pergunta (o dono vê e decide no avançado) */
  naoEntendido: string[]
}

/** Respostas atuais + o que o Assistente entendeu: as perguntas citadas ligam com os números do texto */
export function respostasComTexto(atual: RespostasRegras, t: RegrasDeTexto): { respostas: RespostasRegras; mudadas: PerguntaRegra[] } {
  const r: RespostasRegras = structuredClone(atual)
  const mudadas: PerguntaRegra[] = []
  if (t.quantidade?.faixas.length) {
    r.quantidade = { ligado: true, faixas: t.quantidade.faixas, modoUso: t.quantidade.modoUso ?? r.quantidade.modoUso }
    mudadas.push('quantidade')
  }
  if (t.aVista) {
    r.aVista = { ligado: true, percentual: t.aVista.percentual, modoUso: t.aVista.modoUso ?? r.aVista.modoUso }
    mudadas.push('aVista')
  }
  if (t.especiais?.lista.length) {
    r.especiais = { ligado: true, lista: t.especiais.lista, modoUso: t.especiais.modoUso ?? r.especiais.modoUso }
    mudadas.push('especiais')
  }
  if (t.urgencia) {
    r.urgencia = { ligado: true, percentual: t.urgencia.percentual, dias: t.urgencia.dias ?? r.urgencia.dias }
    mudadas.push('urgencia')
  }
  if (t.minimo) {
    r.minimo = { ligado: true, valor: t.minimo.valor }
    mudadas.push('minimo')
  }
  if (t.limite) {
    r.limite = { ligado: true, percentual: t.limite.percentual }
    mudadas.push('limite')
  }
  return { respostas: r, mudadas }
}
