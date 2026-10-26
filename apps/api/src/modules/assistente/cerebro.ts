import type { Prisma, PrismaClient } from '@prisma/client'
import { descreverRegra, formatarMoeda, hojeISO, nomeCliente } from '@onprint/shared'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { palavras, pontuar } from '../../integrations/ia/texto'
import { carregarRegras } from '../orcamentos/calculo'
import { nomesDasRegras } from '../regras/service'
import { MAX_MANUAL_NO_PROMPT, primeiroNome, semDadosPessoais } from './prompts'

/*
 * "Cérebro da gráfica": o que o Assistente GrafyGo sabe da gráfica, montado na hora e compacto, para qualquer tarefa —
 * dados da empresa (nome, cidade, horário, como recebe, padrões do orçamento), o catálogo (filtrado pelas palavras do
 * pedido quando é grande), as regras comerciais em português (o sistema aplica; a IA nunca dá preço), as orientações
 * do dono (manual do atendente) e, quando há um cliente, a memória dele tirada do histórico (últimos pedidos, o que
 * costuma pedir, como paga, quanto tem em aberto, observações) — sem ninguém digitar nada a mais.
 *
 * Privacidade: nunca telefone, CPF/CNPJ ou e-mail (nem da gráfica nem do cliente): textos livres passam por
 * semDadosPessoais; do cliente vai só o primeiro nome (pessoa física) ou o nome da empresa. A chave Pix não vai: só que
 * a gráfica recebe por Pix (o sistema manda a chave ao cliente).
 */

/** Acima disto o catálogo vai filtrado pelas palavras do pedido (prompt menor e mais barato) */
export const MAX_PRODUTOS_NO_PROMPT = 40
export const MAX_INSUMOS_NO_PROMPT = 60

/**
 * Catálogo grande: só os itens com mais palavras em comum com o pedido (nome e categoria), até `max`. Nenhum em
 * comum: os primeiros (o Assistente diz que não achou). Catálogo pequeno vai inteiro.
 */
export function filtrarPorPalavras<T>(lista: T[], texto: string, nome: (x: T) => string, max: number): T[] {
  if (lista.length <= max) return lista
  const pedido = palavras(texto)
  const comNota = lista.map((x, i) => ({ x, i, nota: pontuar(pedido, palavras(nome(x))) }))
  const achados = comNota.filter((c) => c.nota > 0).sort((a, b) => b.nota - a.nota || a.i - b.i)
  return (achados.length ? achados : comNota).slice(0, max).map((c) => c.x)
}

// ─── Produtos do catálogo (os mesmos campos para o prompt e para o cálculo do preço) ───

export const selecionarProduto = {
  id: true,
  nome: true,
  codigo: true,
  modoCalculo: true,
  precisaArte: true,
  precoVenda: true,
  precoMinimo: true,
  custo: true,
  larguraPadrao: true,
  alturaPadrao: true,
  larguraMaxima: true,
  alturaMaxima: true,
  categoria: { select: { nome: true } },
  acabamentos: {
    orderBy: { createdAt: 'asc' },
    select: { obrigatorio: true, padrao: true, acabamento: { select: { id: true, nome: true, tipoCobranca: true, valor: true, custo: true, ativo: true } } },
  },
} satisfies Prisma.ProdutoSelect

export type ProdutoCatalogo = Prisma.ProdutoGetPayload<{ select: typeof selecionarProduto }>

// ─── Memória do cliente ───

/** O que o histórico diz do cliente (montado pelo sistema; vira linhas curtas em português) */
export interface HistoricoCliente {
  /** Primeiro nome (pessoa física) ou nome da empresa */
  nome: string | null
  clienteDesde: string | null
  totalPedidos: number
  /** Do mais novo ao mais antigo (até 20) */
  ultimosPedidos: { numero: string; data: string; itens: { quantidade: number; descricao: string; acabamentos: string[] }[] }[]
  /** Formas de pagamento das contas já pagas (com repetição) */
  formasPagas: string[]
  emAberto: number
  vencido: number
  etiquetas: string[]
  observacoes: string | null
}

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/** Os mais repetidos (ao menos `minimo` vezes), do mais comum ao menos */
function maisComuns(lista: string[], max: number, minimo = 1): string[] {
  const contagem = new Map<string, number>()
  for (const x of lista) if (x.trim()) contagem.set(x, (contagem.get(x) ?? 0) + 1)
  return [...contagem.entries()].filter(([, n]) => n >= minimo).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, max).map(([x]) => x)
}

/**
 * Histórico → linhas da memória ("Costuma pedir: …"). Sem telefone, documento ou e-mail (semDadosPessoais nas
 * descrições e observações). Cliente sem histórico: só o que houver (etiquetas, observações; nada = sem memória).
 */
export function linhasDaMemoria(h: HistoricoCliente): string[] {
  const linhas: string[] = []
  if (h.totalPedidos) linhas.push(`${h.totalPedidos} pedido(s) na gráfica${h.clienteDesde ? `, cliente desde ${h.clienteDesde.slice(5, 7)}/${h.clienteDesde.slice(0, 4)}` : ''}.`)
  const itens = h.ultimosPedidos.flatMap((p) => p.itens)
  const costuma = maisComuns(itens.map((i) => i.descricao), 3, 2)
  if (costuma.length) linhas.push(`Costuma pedir: ${costuma.join('; ')}.`)
  const ultimo = h.ultimosPedidos[0]
  if (ultimo) {
    const resumo = ultimo.itens.slice(0, 3).map((i) => `${qtd(i.quantidade)} × ${i.descricao}${i.acabamentos.length ? ` (${i.acabamentos.join(', ')})` : ''}`)
    linhas.push(`Último pedido (${ultimo.data.slice(8, 10)}/${ultimo.data.slice(5, 7)}/${ultimo.data.slice(0, 4)}): ${resumo.join('; ')}${ultimo.itens.length > 3 ? '…' : ''}.`)
  }
  const acabamentos = maisComuns(itens.flatMap((i) => i.acabamentos), 3, 2)
  if (acabamentos.length) linhas.push(`Acabamentos de costume: ${acabamentos.join(', ')}.`)
  const forma = maisComuns(h.formasPagas, 1)[0]
  if (forma) linhas.push(`Costuma pagar com: ${forma}.`)
  if (h.emAberto > 0) linhas.push(`Em aberto: ${formatarMoeda(h.emAberto.toFixed(2))}${h.vencido > 0 ? ` (${formatarMoeda(h.vencido.toFixed(2))} vencidos)` : ''}.`)
  if (h.etiquetas.length) linhas.push(`Etiquetas: ${h.etiquetas.join(', ')}.`)
  if (h.observacoes) linhas.push(`Observações da equipe: ${h.observacoes}`)
  return linhas.map((l) => semDadosPessoais(l))
}

/** Histórico do cliente no banco (últimos 5 pedidos para o resumo, 20 para o costume) */
export async function historicoDoCliente(prisma: PrismaClient, clienteId: string): Promise<HistoricoCliente | null> {
  const hoje = hojeISO()
  const [cliente, pedidos, totalPedidos, pagas, abertas] = await Promise.all([
    prisma.cliente.findFirst({ where: { id: clienteId }, select: { nome: true, fantasia: true, tipoPessoa: true, tags: true, observacoes: true, createdAt: true } }),
    prisma.pedido.findMany({
      where: { clienteId, status: { not: 'cancelado' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        numero: true,
        createdAt: true,
        itens: { orderBy: { ordem: 'asc' }, select: { descricao: true, quantidade: true, produto: { select: { nome: true } }, acabamentos: { select: { nome: true } } } },
      },
    }),
    prisma.pedido.count({ where: { clienteId, status: { not: 'cancelado' } } }),
    prisma.contaReceber.findMany({ where: { clienteId, status: 'pago', formaPagamentoId: { not: null } }, orderBy: { pagoEm: 'desc' }, take: 20, select: { formaPagamento: { select: { nome: true } } } }),
    prisma.contaReceber.findMany({ where: { clienteId, status: { in: ['aberto', 'parcial', 'vencido'] } }, select: { valor: true, valorPago: true, vencimento: true } }),
  ])
  if (!cliente) return null
  const itensDe = (p: (typeof pedidos)[number]) =>
    p.itens.map((i) => ({ quantidade: Number(i.quantidade), descricao: semDadosPessoais(i.produto?.nome || i.descricao).slice(0, 80), acabamentos: i.acabamentos.map((a) => a.nome) }))
  const saldo = (c: (typeof abertas)[number]) => Number(c.valor) - Number(c.valorPago)
  return {
    nome: cliente.tipoPessoa === 'PF' ? primeiroNome(cliente.nome) : semDadosPessoais(nomeCliente(cliente)).slice(0, 80),
    clienteDesde: hojeISO(cliente.createdAt),
    totalPedidos,
    // O último vira o resumo; o costume (itens e acabamentos repetidos) olha os 20
    ultimosPedidos: pedidos.map((p) => ({ numero: p.numero, data: hojeISO(p.createdAt), itens: itensDe(p) })),
    formasPagas: pagas.flatMap((c) => (c.formaPagamento ? [c.formaPagamento.nome] : [])),
    emAberto: abertas.reduce((s, c) => s + saldo(c), 0),
    vencido: abertas.filter((c) => c.vencimento.toISOString().slice(0, 10) < hoje).reduce((s, c) => s + saldo(c), 0),
    etiquetas: cliente.tags.slice(0, 5),
    observacoes: cliente.observacoes ? semDadosPessoais(cliente.observacoes).replace(/\s+/g, ' ').trim().slice(0, 200) || null : null,
  }
}

// ─── Dados da empresa ───

export interface Cerebro {
  /** Nome da gráfica (persona "Assistente GrafyGo da <gráfica>") */
  grafica: string
  /** Linhas curtas: cidade, horário, como recebe, padrões do orçamento */
  empresa: string[]
  /** Regras comerciais ativas em português ("Quando… → …"); o sistema aplica */
  regras: string[]
  /** Manual do atendente (orientações do dono) */
  manual: string | null
  /** Memória do cliente (quando a tarefa tem um cliente) */
  cliente: { nome: string | null; linhas: string[] } | null
  areaMinimaM2: string | null
}

export interface PartesCerebro {
  empresa?: boolean
  regras?: boolean
  manual?: boolean
  /** Cliente da tarefa (null/ausente = sem memória de cliente) */
  clienteId?: string | null
}

/** Monta só as partes pedidas (cada tarefa leva o que precisa: o prompt fica pequeno) */
export async function montarCerebro(prisma: PrismaClient, partes: PartesCerebro = {}): Promise<Cerebro> {
  const [config, vitrine, regras, historico] = await Promise.all([
    prisma.empresaConfig.findFirst({
      orderBy: { createdAt: 'asc' },
      select: {
        nomeFantasia: true,
        razaoSocial: true,
        bairro: true,
        cidade: true,
        uf: true,
        chavePix: true,
        validadeOrcamentoDias: true,
        sinalPercentual: true,
        parcelasPadrao: true,
        intervaloDiasPadrao: true,
        tipoEntregaPadrao: true,
        areaMinimaM2: true,
        manualAtendente: true,
      },
    }),
    partes.empresa ? prisma.vitrineConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { horario: true } }) : null,
    partes.regras ? carregarRegras(prisma) : [],
    partes.clienteId ? historicoDoCliente(prisma, partes.clienteId) : null,
  ])
  const grafica = config?.nomeFantasia || config?.razaoSocial || contextoEmpresa.atual()?.nome || 'gráfica'
  const empresa: string[] = []
  if (partes.empresa && config) {
    if (config.cidade) empresa.push(`Cidade: ${[config.bairro, `${config.cidade}${config.uf ? `/${config.uf}` : ''}`].filter(Boolean).join(', ')}`)
    if (vitrine?.horario) empresa.push(`Horário: ${semDadosPessoais(vitrine.horario).replace(/\s+/g, ' ').slice(0, 120)}`)
    const sinal = Number(config.sinalPercentual)
    empresa.push(
      `Pagamento padrão: ${sinal >= 100 ? 'à vista' : `entrada de ${sinal}%${config.parcelasPadrao ? ` e o saldo em ${config.parcelasPadrao}× a cada ${config.intervaloDiasPadrao} dias` : ' e o saldo na entrega'}`}${config.chavePix ? '; recebe por Pix' : ''}`,
    )
    empresa.push(`Orçamento vale ${config.validadeOrcamentoDias} dias; entrega padrão: ${config.tipoEntregaPadrao === 'retirada' ? 'retirada na gráfica' : config.tipoEntregaPadrao}`)
    empresa.push('Prazo de produção: o de cada produto (o sistema calcula a data)')
  }
  const nomes = regras.length ? await nomesDasRegras(prisma, regras) : {}
  const manual = partes.manual && config?.manualAtendente ? semDadosPessoais(config.manualAtendente).trim().slice(0, MAX_MANUAL_NO_PROMPT) || null : null
  return {
    grafica,
    empresa,
    regras: regras.slice(0, 15).map((r) => semDadosPessoais(descreverRegra(r, nomes))),
    manual,
    cliente: historico ? { nome: historico.nome, linhas: linhasDaMemoria(historico) } : null,
    areaMinimaM2: config?.areaMinimaM2.toString() ?? null,
  }
}

/**
 * O cérebro no conteúdo do prompt: blocos curtos e marcados (o modelo sabe que são dados, não instruções). Partes
 * vazias não aparecem.
 */
export function contextoDoCerebro(c: Cerebro): string {
  const blocos: string[] = []
  if (c.empresa.length) blocos.push(`<sobre_a_grafica>\n${c.empresa.map((l) => `- ${l}`).join('\n')}\n</sobre_a_grafica>`)
  if (c.regras.length) blocos.push(`<regras_comerciais aplicadas_pelo_sistema="sim">\n${c.regras.map((l) => `- ${l}`).join('\n')}\n</regras_comerciais>`)
  if (c.cliente?.linhas.length) blocos.push(`<memoria_do_cliente${c.cliente.nome ? ` nome="${c.cliente.nome.replace(/"/g, '')}"` : ''}>\n${c.cliente.linhas.map((l) => `- ${l}`).join('\n')}\n</memoria_do_cliente>`)
  return blocos.join('\n')
}

