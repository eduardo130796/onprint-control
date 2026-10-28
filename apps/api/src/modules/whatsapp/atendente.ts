import { FUSO_HORARIO, type ItemMensagem } from '@onprint/shared'
import { normalizarResposta } from './respostas'
import { listaNumerada, moedaCurta } from './copiloto'

/*
 * Atendente do WhatsApp: quando ninguém responde o cliente em alguns minutos, o Assistente GrafyGo atende pela gráfica
 * — confirma o que anotou, pergunta o que falta e deixa o rascunho do orçamento pronto para o dono só dar o "ok" no
 * "Você". Nunca passa valor, desconto ou prazo; sai de cena quando o dono (ou alguém da equipe) entra na conversa.
 * Aqui as regras puras (testáveis); o banco e o envio ficam em atendente.service.ts.
 */

/** Espera padrão (minutos sem resposta) antes de o atendente entrar */
export const ESPERA_ATENDENTE_PADRAO_MIN = 5
export const ESPERAS_ATENDENTE_MIN = [3, 5, 10, 15] as const
/** O dono (ou a equipe pelo sistema) falou com esse cliente há menos que isto: ele está atendendo, o atendente não entra */
export const DONO_NA_CONVERSA_MS = 2 * 3_600_000
/**
 * O atendente já está na conversa (respondeu esse número há pouco) e ninguém entrou: o dono não está disponível, então
 * a próxima resposta sai rápido — só o tempo de o cliente terminar de escrever (entre 15 e 35 segundos, sorteado)
 */
export const ESPERA_SEGUIDA_MIN_MS = 15_000
export const ESPERA_SEGUIDA_MS = 35_000

/** A espera da resposta seguinte, sorteada pela mensagem (a mesma em todas as conferências: não pula de um lado a outro) */
export function esperaSeguida(mensagemEm: Date): number {
  return ESPERA_SEGUIDA_MIN_MS + (mensagemEm.getTime() % (ESPERA_SEGUIDA_MS - ESPERA_SEGUIDA_MIN_MS))
}
/** Conversa parada há mais que isto (API fora do ar, conexão caída): não é atendida tarde demais */
export const ATENDER_ATE_MS = 12 * 3_600_000
/** Respostas do atendente na mesma conversa: na seguinte ele chama a equipe e para */
export const MAX_ATENDIMENTOS = 4
/** O atendente já se apresentou a esse número há menos que isto: não se apresenta de novo */
export const APRESENTACAO_VALE_MS = 12 * 3_600_000

/** Por que o atendente parou de vez nessa conversa: o cliente pediu uma pessoa, passou do limite ou não era cliente */
export type ParadaAtendente = 'pessoa' | 'limite' | 'pessoal'

/** A parada vale para o número, não só para a conversa: pessoa/limite por 12 horas; contato pessoal por 30 dias */
export const PARADA_VALE_MS: Record<ParadaAtendente, number> = { pessoa: 12 * 3_600_000, limite: 12 * 3_600_000, pessoal: 30 * 86_400_000 }

/** Alguma parada desse número ainda vale (a conversa mais nova do cliente herda a parada da anterior) */
export function paradaValendo(paradas: { motivo: string; em: Date }[], agora: Date): boolean {
  return paradas.some((p) => agora.getTime() - p.em.getTime() < (PARADA_VALE_MS[p.motivo as ParadaAtendente] ?? PARADA_VALE_MS.pessoa))
}

export interface ConversaParaAtender {
  situacao: string
  assunto: string
  assuntoVia: string
  classificar: boolean
  numero: string | null
  ultimaEm: Date
  /** A mensagem mais nova do cliente que ninguém tratou (aprovação e pedido de ajuste já têm resposta própria) */
  ultimaPendenteEm: Date | null
  /** O cliente só cumprimentou ("oi", "bom dia"): recebe o menu */
  saudacao?: boolean
  atendidaEm: Date | null
  atendenteParou: string | null
}

export type MotivoSemAtender = 'parou' | 'resolvida' | 'sem_numero' | 'sem_assunto' | 'lendo' | 'ja_atendida' | 'cedo' | 'antiga' | 'dono' | 'equipe'

/**
 * O atendente entra nessa conversa agora? Só em conversa aberta de cliente (assunto lido pelo Assistente: orçamento,
 * pedido ou dúvida — nunca "outro", que pega família e amigos), parada há `esperaMs` desde a última mensagem do cliente
 * (cada mensagem nova recomeça a contagem) e sem o dono nem a equipe terem falado com esse número há pouco.
 */
export function quandoAtender(
  c: ConversaParaAtender,
  ctx: { agora: Date; esperaMs: number; ultimaDoDonoEm: Date | null; ultimoEnvioEquipeEm: Date | null; ultimaDoAtendenteEm?: Date | null; emAtendimento?: boolean },
): { atender: true } | { atender: false; motivo: MotivoSemAtender } {
  const nao = (motivo: MotivoSemAtender) => ({ atender: false as const, motivo })
  if (c.atendenteParou) return nao('parou')
  if (c.situacao !== 'aberta') return nao('resolvida')
  if (!c.numero) return nao('sem_numero')
  // Assunto lido pelo Assistente (orçamento, pedido, dúvida) ou só a saudação de quem chegou (vai o menu)
  // Com o atendente na conversa (respondeu esse número há pouco), toda mensagem do cliente é respondida ("1", "o catálogo")
  if (!c.saudacao && !ctx.emAtendimento && (c.assuntoVia !== 'assistente' || !['orcamento', 'pedido', 'duvida'].includes(c.assunto))) return nao('sem_assunto')
  if (c.classificar) return nao('lendo')
  // Nada novo e sem resposta desde a última dele (a aprovação depois de uma pergunta já tem a resposta própria)
  if (!c.ultimaPendenteEm || (c.atendidaEm && c.atendidaEm >= c.ultimaPendenteEm)) return nao('ja_atendida')
  const parada = ctx.agora.getTime() - c.ultimaEm.getTime()
  const recente = (d: Date | null | undefined) => Boolean(d && ctx.agora.getTime() - d.getTime() < DONO_NA_CONVERSA_MS)
  // Já atendendo e ninguém entrou: espera só o cliente terminar de escrever
  const espera = recente(ctx.ultimaDoAtendenteEm) ? Math.min(ctx.esperaMs, esperaSeguida(c.ultimaPendenteEm ?? c.ultimaEm)) : ctx.esperaMs
  if (parada < espera) return nao('cedo')
  if (parada > ATENDER_ATE_MS) return nao('antiga')
  if (recente(ctx.ultimaDoDonoEm)) return nao('dono')
  if (recente(ctx.ultimoEnvioEquipeEm)) return nao('equipe')
  return { atender: true }
}

/** Minutos de espera válidos (o que vier fora da lista volta ao padrão) */
export function esperaDoAtendente(min: number | null | undefined): number {
  return ESPERAS_ATENDENTE_MIN.includes(min as (typeof ESPERAS_ATENDENTE_MIN)[number]) ? (min as number) : ESPERA_ATENDENTE_PADRAO_MIN
}

const PESSOA =
  /\b(falar|fala|conversar|converso|falo) com (alguem|alguem ai|uma pessoa|pessoa|um atendente|atendente|um humano|humano|o dono|a dona|o responsavel|a responsavel|gente|o gerente|a gerente|voce|vc|vcs|voces)\b|\b(quero|queria|preciso de|chama) (um |uma )?(atendente|humano|pessoa de verdade)\b|\b(e|eh|isso e|voce e|vc e|to falando com) (um )?(robo|bot|maquina|ia|inteligencia artificial)\b|\bnao quero (falar com )?(robo|bot)\b/

/** O cliente pediu para falar com uma pessoa (ou perguntou se é robô): o atendente passa para a equipe e para */
export function pedePessoa(textos: string[]): boolean {
  return textos.some((t) => PESSOA.test(normalizarResposta(t)))
}

/** Valor em dinheiro no texto ("R$ 50", "50 reais", "45,90") */
export function temValor(texto: string): boolean {
  return /r\$|\b\d+\s*(reais|real|conto|contos|pila)\b|\b\d{1,3}(\.\d{3})*,\d{2}\b/i.test(texto)
}

/** Os valores em dinheiro do texto, em número ("R$ 2.350,00" → 2350; "50 reais" → 50) */
export function valoresDoTexto(texto: string): number[] {
  const achados = texto.matchAll(/r\$\s*(\d[\d.]*(?:,\d{1,2})?)|(\d[\d.]*(?:,\d{1,2})?)\s*(?:reais|real)\b|\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/gi)
  return [...achados].map((m) => Number((m[1] ?? m[2] ?? m[3])!.replace(/\./g, '').replace(',', '.'))).filter((n) => Number.isFinite(n))
}

/**
 * O atendente nunca inventa valor: só pode repetir o que a gráfica já mandou na conversa (o total do orçamento enviado,
 * a entrada). Algum valor do texto que não está em nenhuma mensagem enviada: true (vai a recepção pronta no lugar).
 */
export function valorNovo(texto: string, jaEnviados: string[]): boolean {
  const conhecidos = new Set(jaEnviados.flatMap(valoresDoTexto).map((n) => n.toFixed(2)))
  return valoresDoTexto(texto).some((n) => !conhecidos.has(n.toFixed(2)))
}

/**
 * "segunda-feira, 26/10, 22:14 (amanhã é terça-feira, 27/10)" no horário de Brasília: com o horário da gráfica, o
 * atendente diz quando a equipe volta ("amanhã às 8h", "segunda às 8h") sem errar o dia
 */
export function agoraPorExtenso(agora: Date): string {
  const formatar = (d: Date, comHora: boolean) => {
    const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_HORARIO, weekday: 'long', day: '2-digit', month: '2-digit', ...(comHora ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).formatToParts(d)
    const p = (t: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === t)?.value ?? ''
    return `${p('weekday')}, ${p('day')}/${p('month')}${comHora ? `, ${p('hour')}:${p('minute')}` : ''}`
  }
  return `${formatar(agora, true)} (amanhã é ${formatar(new Date(agora.getTime() + 86_400_000), false)})`
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const
const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/**
 * O horário da gráfica (texto livre da vitrine: "Seg a sex, 8h às 18h · Sáb, 9h às 13h") em faixas por dia da semana
 * (minutos do dia). O que não der para entender fica de fora; nada entendido = null
 */
export function lerHorario(texto: string | null): Map<number, [number, number][]> | null {
  if (!texto) return null
  const t = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const faixas = new Map<number, [number, number][]>()
  const padrao = /(dom|seg|ter|qua|qui|sex|sab)[a-z]*\.?(?:\s*(?:a|-|ate)\s*(dom|seg|ter|qua|qui|sex|sab)[a-z]*\.?)?[^0-9a-z]{0,6}(?:das\s*)?(\d{1,2})(?:[:h](\d{2}))?\s*h?\s*(?:as|a|-|ate)\s*(\d{1,2})(?:[:h](\d{2}))?\s*h?/g
  for (const m of t.matchAll(padrao)) {
    const de = DIAS.indexOf(m[1] as (typeof DIAS)[number])
    const ate = m[2] ? DIAS.indexOf(m[2] as (typeof DIAS)[number]) : de
    const ini = Number(m[3]) * 60 + Number(m[4] ?? 0)
    const fim = Number(m[5]) * 60 + Number(m[6] ?? 0)
    if (de < 0 || ate < 0 || fim <= ini) continue
    for (let d = de; ; d = (d + 1) % 7) {
      faixas.set(d, [...(faixas.get(d) ?? []), [ini, fim]])
      if (d === ate) break
    }
  }
  return faixas.size ? faixas : null
}

const horaCurta = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`

/**
 * A gráfica está aberta agora? E quando abre de novo? Pronto para o Assistente (ele não faz a conta do horário):
 * "aberta agora (até 18h)" ou "fechada agora; abre amanhã às 8h". Sem horário entendido: null (ele não fala de horário)
 */
export function funcionamentoAgora(horario: string | null, agora: Date): string | null {
  const faixas = lerHorario(horario)
  if (!faixas) return null
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: FUSO_HORARIO, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(agora)
  const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? ''
  const hoje = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p('weekday'))
  const minuto = (Number(p('hour')) % 24) * 60 + Number(p('minute'))
  const aberta = (faixas.get(hoje) ?? []).find(([ini, fim]) => minuto >= ini && minuto < fim)
  if (aberta) return `aberta agora (até ${horaCurta(aberta[1])})`
  for (let n = 0; n < 7; n++) {
    const dia = (hoje + n) % 7
    const proxima = (faixas.get(dia) ?? []).filter(([ini]) => n > 0 || ini > minuto).sort((a, b) => a[0] - b[0])[0]
    if (!proxima) continue
    const quando = n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `${dia === 6 || dia === 0 ? 'no' : 'na'} ${NOMES_DIAS[dia]}`
    return `fechada agora; abre ${quando} às ${horaCurta(proxima[0])}`
  }
  return null
}

/** Primeira linha quando o atendente se apresenta (só na primeira resposta ao número em 12 horas) */
export const apresentacao = (grafica: string, nome: string | null) => `Oi${nome ? `, ${nome}` : ''}! Aqui é o assistente da ${grafica} 😊`

/** O cliente pediu uma pessoa (ou passou do limite de respostas): o atendente avisa e para */
export function textoChamarPessoa(c: { grafica: string; nome: string | null; seApresentar: boolean }): string {
  const frase = 'Já avisei a equipe, logo alguém te responde por aqui.'
  return c.seApresentar ? `${apresentacao(c.grafica, c.nome)}\n\n${frase}` : `Claro! ${frase}`
}

/** Sem a leitura do Assistente (limite do mês, fora do ar) ou com valor no texto: a recepção segura */
export function textoRecepcao(c: { grafica: string; nome: string | null; seApresentar: boolean; assunto: string }): string {
  const frase = c.assunto === 'orcamento' ? 'Anotei o seu pedido! Já já a equipe te passa o valor por aqui.' : 'Recebemos sua mensagem! Logo a equipe te responde por aqui.'
  return c.seApresentar ? `${apresentacao(c.grafica, c.nome)}\n\n${frase}` : frase
}

/**
 * A primeira linha certa: na primeira resposta, a apresentação (se a IA esqueceu, entra no lugar da saudação dela);
 * nas seguintes, sem saudação de novo ("Boa noite, Carla! Anotei…" → "Anotei…"), porque a conversa já está andando
 */
export function ajustarAbertura(texto: string, c: { grafica: string; nome: string | null; seApresentar: boolean }): string {
  // A saudação e, logo depois, o nome do cliente ("Boa noite, Carla!"); nada além disso sai
  const saudacao = /^(oi|olá|ola|bom dia|boa tarde|boa noite)(?![\p{L}])/iu.exec(texto)
  let resto = saudacao ? texto.slice(saudacao[0].length) : texto
  if (saudacao && c.nome) resto = resto.replace(new RegExp(`^,?\\s*${c.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu'), '')
  const semSaudacao = (saudacao ? resto.replace(/^\s*[!.,]*\s*/, '') : resto).trim()
  const corpo = semSaudacao ? semSaudacao.charAt(0).toUpperCase() + semSaudacao.slice(1) : texto
  if (c.seApresentar) return /assistente/i.test(texto) ? texto : `${apresentacao(c.grafica, c.nome)}\n\n${corpo}`
  return corpo
}

/** Resposta pronta (pedido) com a apresentação na frente quando é a primeira do dia: a saudação dela sai */
export function comApresentacao(texto: string, c: { grafica: string; nome: string | null; seApresentar: boolean }): string {
  if (!c.seApresentar) return texto
  return `${apresentacao(c.grafica, c.nome)}\n\n${texto.replace(/^Olá[^\n]*\n+/, '')}`
}

/** "está em produção (previsão: amanhã)", "já está pronto ✅" — a situação do pedido numa frase, para o menu */
export function fraseDoPedido(status: string, previsao: string): string {
  switch (status) {
    case 'pronto':
      return 'já está pronto ✅'
    case 'em_entrega':
      return 'já saiu para entrega 🚚'
    case 'aguardando_arte':
      return 'está esperando a arte para entrar em produção'
    case 'arte_em_aprovacao':
      return 'está com a arte esperando a sua aprovação'
    default:
      return `está em produção (previsão: ${previsao})`
  }
}

/** "Bom dia", "Boa tarde" ou "Boa noite" pela hora de Brasília */
export function saudacaoDaHora(agora: Date): string {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_HORARIO, hour: '2-digit', hour12: false }).format(agora))
  return hora >= 5 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite'
}

const NUMEROS_MENU = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']

/** O que o atendente sabe fazer sozinho, sem depender da leitura da IA (as opções do menu) */
export type PedidoDoCliente = 'ver_orcamento' | 'ver_pedido' | 'novo_orcamento' | 'catalogo'

const ROTULO_OPCAO: Record<PedidoDoCliente, string> = {
  ver_orcamento: 'Ver o orçamento',
  ver_pedido: 'Ver como está o pedido',
  novo_orcamento: 'Fazer um orçamento',
  catalogo: 'Receber nosso catálogo',
}

/** As opções do menu, na ordem em que aparecem (o "1", "2"… do cliente aponta para elas) */
export function opcoesDoMenu(c: { orcamento: boolean; pedido: boolean; catalogo: boolean }): PedidoDoCliente[] {
  return [...(c.orcamento ? (['ver_orcamento'] as const) : []), ...(c.pedido ? (['ver_pedido'] as const) : []), 'novo_orcamento', ...(c.catalogo ? (['catalogo'] as const) : [])]
}

const CATALOGO = /\b(catalogo\w*|cardapio|portfolio|portifolio|o que (voces|vcs|vc|voce) (fazem|faz|produzem|produz|trabalham|vendem|tem)|quais (sao os )?(produtos|servicos)|ver (os )?(produtos|servicos)|seus produtos|lista de produtos|conhecer (mais )?(o que|os produtos|o trabalho))\b/
const VER_PEDIDO = /\b(meu pedido|o pedido|do pedido|status|andamento|ficou pronto|ta pronto|esta pronto|ja ficou|ja ta|previsao|quando fica pronto)\b/
const ORCAMENTO = /\b(orcamento|orcamentos|proposta)\b/
const VER = /\b(ver|veja|qual|quais|mostra|mostrar|manda|mande|me envia|envie|enviar|reenvia|reenviar|esse|essa|desse|dele|de novo|novamente|nao achei|nao recebi|abrir|detalhe\w*|valor|quanto deu|quanto ficou)\b/
const NOVO = /\b(novo|nova|outro|outra|fazer|faz|quero um|queria um|preciso de um|preciso fazer|orcar)\b/

/**
 * O que o cliente pediu, pelas palavras ou pelo número do menu ("1", "1️⃣", "opção 2"). Só os pedidos que o atendente
 * resolve sozinho e certo; o resto (null) vai à leitura da IA. Pedido de orçamento com o produto ("orçamento de 2
 * banners") não é "novo orçamento" vazio: segue o caminho do rascunho.
 */
export function pedidoDoCliente(texto: string, c: { opcoes: PedidoDoCliente[] | null; orcamento: boolean; pedido: boolean }): PedidoDoCliente | null {
  // "de novo" é "novamente", não "orçamento novo"
  const t = normalizarResposta(texto).replace(/\bde novo\b/g, 'novamente')
  if (!t) return null
  const numero =/^(opcao |a |o |numero |n )?([1-5])$/.exec(t)
  if (numero) return c.opcoes?.[Number(numero[2]) - 1] ?? null
  if (CATALOGO.test(t)) return 'catalogo'
  if (c.pedido && VER_PEDIDO.test(t) && !NOVO.test(t)) return 'ver_pedido'
  if (ORCAMENTO.test(t)) {
    if (c.orcamento && VER.test(t) && !NOVO.test(t)) return 'ver_orcamento'
    // "quero fazer um orçamento" (sem dizer o quê): pergunta o que precisa; com produto ou número, o rascunho
    if (NOVO.test(t) && !/\d/.test(t) && t.split(' ').length <= 8) return 'novo_orcamento'
  }
  return null
}

/** Produto da gráfica para o atendente mostrar (código para a IA escolher; a foto vai na conversa) */
export interface ProdutoDoCatalogo {
  codigo: string
  nome: string
  categoria: string | null
  descricao: string | null
  imagemArquivoId: string | null
  /** A página do produto na vitrine (vai na legenda da foto); null = sem vitrine no ar */
  link: string | null
}

/** A linha do produto para a IA: "P3 · Adesivo perfurado · Comunicação visual · com foto · <descrição>" */
export const linhaDoProduto = (p: ProdutoDoCatalogo) => [p.codigo, p.nome, p.categoria, p.imagemArquivoId ? 'com foto' : 'sem foto', p.descricao?.slice(0, 100)].filter(Boolean).join(' · ')

/** A legenda da foto: o nome em negrito e a descrição curta */
export const legendaDoProduto = (p: ProdutoDoCatalogo) => [`*${p.nome}*`, p.descricao, p.link ? `Ver no site: ${p.link}` : null].filter(Boolean).join('\n')

/**
 * Depois de mostrar (as fotos ou o catálogo), o convite para o próximo passo: curto, sem empurrar — o cliente diz o
 * produto e a quantidade e o atendente já monta o orçamento
 */
export const textoConviteOrcamento = (depoisDe: 'fotos' | 'catalogo') =>
  depoisDe === 'fotos'
    ? 'Gostou de algum? Me diz qual e a quantidade que eu já preparo o orçamento 😊'
    : 'Viu algo que te interessou? É só me dizer o produto e a quantidade que eu já preparo o orçamento 😊'

/** As respostas prontas das opções (curtas, no meio da conversa) */
export const textoVerOrcamento = () => 'Claro! Segue o seu orçamento 👇'
export const textoNovoOrcamento = () => 'Ótimo! Me conta o que você precisa: o produto, a medida e a quantidade 😊'
/** O PDF vai direto na conversa (o principal); o link do site vai junto, como opção */
export const textoCatalogo = (link: string | null, comPdf: boolean) =>
  comPdf ? `Claro! Segue o nosso catálogo 👇${link ? `\nSe preferir, veja também pelo site: ${link}` : ''}` : `Claro! Aqui está o nosso catálogo: ${link}`

/** A resposta pronta no meio da conversa: sem o "Olá, Fulano!" do começo e sem a assinatura do fim */
export function semCabecalho(texto: string): string {
  return texto
    .replace(/^Olá[^\n]*\n+/, '')
    .replace(/\n+— [^\n]*$/, '')
    .trim()
}
/** O fim do menu: a resposta seguinte do cliente ("1", "o catálogo") é atendida mesmo sem assunto */
export const FIM_DO_MENU = 'Pode responder com o número ou me contar do seu jeito. Fico à disposição!'

/**
 * A resposta a quem só cumprimentou: curta, organizada, sem despejar informação. Diz que o pessoal não pode atender
 * agora, cita o que está em aberto (só o número) e oferece as opções numeradas — ver o orçamento, ver o pedido, fazer
 * um orçamento novo, receber o catálogo. Primeiro contato: fazer um orçamento e o catálogo. Texto pronto: sem IA.
 */
export function textoMenuCliente(c: { grafica: string; nome: string | null; agora: Date; orcamentos: string[]; pedido: string | null; catalogo: boolean }): string {
  const emAberto = [...(c.orcamentos[0] ? [`o orçamento *${c.orcamentos[0]}* esperando sua aprovação`] : []), ...(c.pedido ? [`o pedido *${c.pedido}* em andamento`] : [])]
  const opcoes = opcoesDoMenu({ orcamento: Boolean(c.orcamentos[0]), pedido: Boolean(c.pedido), catalogo: c.catalogo }).map((o) =>
    o === 'novo_orcamento' && emAberto.length ? 'Fazer um novo orçamento' : ROTULO_OPCAO[o],
  )
  return [
    `${saudacaoDaHora(c.agora)}${c.nome ? `, ${c.nome}` : ''}! 😊 Aqui é o assistente da ${c.grafica}.`,
    emAberto.length ? `No momento o pessoal não pode atender, mas vi que você tem ${emAberto.join(' e ')}.` : 'No momento o pessoal não pode atender, mas já posso te ajudar.',
    '',
    'Posso te ajudar a:',
    ...opcoes.map((o, i) => `${NUMEROS_MENU[i]} ${o}`),
    '',
    FIM_DO_MENU,
  ].join('\n')
}

// ─── Avisos ao dono no "Você" (só quando há algo para ele fazer) ───

export const avisoPediuPessoa = (quem: string) => `🙋 ${quem} pediu para falar com uma pessoa no WhatsApp. Parei de responder: é com você.`
export const avisoLimite = (quem: string) => `🙋 Já respondi ${quem} algumas vezes e a conversa continua. Parei por aqui: é com você.`
export const avisoSemResposta = (quem: string, pergunta: string) => `❓ ${quem} perguntou no WhatsApp: “${pergunta.slice(0, 200)}”. Não sei responder isso; disse que a equipe retorna.`

// ─── Envio sozinho (a gráfica ligou e definiu o limite) ───

const NEGOCIACAO =
  /\b(desconto|descontinho|mais barato|mais em conta|abaixa|abaixar|baixa o preco|faz por|faria por|fecha por|melhor preco|melhor valor|negocia|negociar|negociavel|da pra fazer por|vi mais barato|concorrente|chorinho|pechincha)\b/

/** O cliente falou em desconto ou negociação: o orçamento nunca sai sozinho (é com o dono) */
export function negociando(textos: string[]): boolean {
  return textos.some((t) => NEGOCIACAO.test(normalizarResposta(t)))
}

/**
 * Por que o atendente NÃO envia o orçamento sozinho (null = pode enviar): só sai com tudo no catálogo, nada a confirmar
 * com o cliente, sem liberação de gerente pelas regras comerciais, total dentro do limite da gráfica e sem negociação.
 */
export function motivoSemEnvio(c: { negociando: boolean; fora: string[]; faltando: string[]; liberacaoPendente: boolean; total: string; limite: string | null }): string | null {
  if (c.negociando) return 'o cliente falou em desconto'
  if (c.fora.length) return 'tem item fora do catálogo'
  if (c.faltando.length) return 'falta confirmar detalhes com o cliente'
  if (c.liberacaoPendente) return 'as regras pedem a liberação de um gerente'
  if (!(Number(c.total) > 0)) return 'o total ficou zerado'
  if (c.limite !== null && Number(c.total) > Number(c.limite)) return `passou do seu limite de ${moedaCurta(c.limite)}`
  return null
}

/** Aviso no "Você" depois do envio sozinho: o que saiu, para quem e por quanto (o dono acompanha pelo link) */
export function textoEnviadoSozinho(a: { numero: string; cliente: string; total: string; itens: ItemMensagem[]; link: string; alerta: string | null }): string {
  return [
    `🤖 Ninguém respondeu ${a.cliente}, então enviei o ${a.numero} (${moedaCurta(a.total)}): tudo no catálogo e dentro do seu limite.`,
    listaNumerada(a.itens),
    ...(a.alerta ? [`⚠️ ${a.alerta}`] : []),
    a.link,
  ].join('\n')
}
