import {
  STATUS_PEDIDO_SEM_ATRASO,
  TIPO_ENTREGA_ROTULOS,
  nomeCliente,
  nomeParaSaudacao,
  type CodigoEtapaAcompanhamento,
  type EtapaAcompanhamento,
  type PedidoAcompanhamento,
  type StatusArte,
  type StatusPedido,
  type TipoEntrega,
} from '@onprint/shared'

/**
 * "Acompanhe seu pedido" (/pedido/:empresa/:token): regras puras que transformam o pedido interno na visão do
 * cliente. Só sai o que o cliente pode ver: nada de custo, margem, observação interna, coluna própria do kanban,
 * nome da equipe ou comentário interno. Testadas em tests/acompanhamento.test.ts.
 */

const dia = (d: Date) => d.toISOString().slice(0, 10)

/** Etapa do cliente em que cada status do sistema está (colunas próprias do kanban contam pela base = status). */
function indiceDoStatus(status: StatusPedido): number {
  const indices: Record<Exclude<StatusPedido, 'cancelado'>, number> = {
    aguardando_arte: 1,
    arte_em_aprovacao: 1,
    em_producao: 2,
    pronto: 3,
    em_entrega: 3,
    entregue: 4,
  }
  return status === 'cancelado' ? 0 : indices[status]
}

const CODIGOS: CodigoEtapaAcompanhamento[] = ['confirmado', 'arte', 'producao', 'pronto', 'entregue']

/** Título e frase da etapa, no texto do cliente (depende do tipo de entrega e do status atual). */
function textoEtapa(codigo: CodigoEtapaAcompanhamento, ctx: { status: StatusPedido; tipoEntrega: TipoEntrega; arteAguardando: boolean; concluida: boolean }) {
  const { tipoEntrega, status } = ctx
  switch (codigo) {
    case 'confirmado':
      return { titulo: 'Pedido confirmado', descricao: 'Recebemos seu pedido.' }
    case 'arte':
      if (ctx.concluida) return { titulo: 'Arte aprovada', descricao: 'A arte foi aprovada.' }
      if (ctx.arteAguardando) return { titulo: 'Aprovação da arte', descricao: 'A arte está pronta e aguarda a sua aprovação.' }
      return { titulo: 'Criação da arte', descricao: 'Estamos preparando a arte do seu pedido.' }
    case 'producao':
      return { titulo: 'Em produção', descricao: ctx.concluida ? 'Produção concluída.' : 'Seu pedido está sendo produzido.' }
    case 'pronto':
      if (tipoEntrega === 'retirada') return { titulo: 'Pronto para retirada', descricao: 'Já pode retirar na loja.' }
      if (status === 'em_entrega' || (ctx.concluida && status !== 'pronto')) {
        return tipoEntrega === 'instalacao'
          ? { titulo: 'A caminho da instalação', descricao: 'Nossa equipe está a caminho para instalar.' }
          : { titulo: 'Saiu para entrega', descricao: 'Seu pedido está a caminho.' }
      }
      return tipoEntrega === 'instalacao'
        ? { titulo: 'Pronto para instalação', descricao: 'Vamos combinar a instalação com você.' }
        : { titulo: 'Pronto para entrega', descricao: 'Em breve sai para entrega.' }
    case 'entregue':
      if (tipoEntrega === 'retirada') return { titulo: 'Retirado', descricao: 'Pedido retirado. Obrigado pela preferência!' }
      if (tipoEntrega === 'instalacao') return { titulo: 'Instalado', descricao: 'Instalação concluída. Obrigado pela preferência!' }
      return { titulo: 'Entregue', descricao: 'Pedido entregue. Obrigado pela preferência!' }
  }
}

/** Registro de auditoria (só os campos usados; antes/depois são o JSON gravado). */
export interface RegistroAuditoria {
  tabela: string
  registroId: string | null
  acao: string
  antes: unknown
  depois: unknown
  createdAt: Date
}

const objeto = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** Marco do status do pedido na linha do tempo do cliente. */
function tituloMarcoStatus(status: string, tipoEntrega: TipoEntrega): string | null {
  switch (status) {
    case 'aguardando_arte':
      return 'Arte em preparação'
    case 'arte_em_aprovacao':
      return 'Arte enviada para sua aprovação'
    case 'em_producao':
      return 'Pedido em produção'
    case 'pronto':
      return tipoEntrega === 'retirada' ? 'Pronto para retirada' : tipoEntrega === 'instalacao' ? 'Pronto para instalação' : 'Pronto para entrega'
    case 'em_entrega':
      return tipoEntrega === 'instalacao' ? 'A caminho da instalação' : 'Saiu para entrega'
    case 'entregue':
      return tipoEntrega === 'retirada' ? 'Pedido retirado' : tipoEntrega === 'instalacao' ? 'Instalação concluída' : 'Pedido entregue'
    case 'cancelado':
      return 'Pedido cancelado'
    default:
      return null
  }
}

/**
 * Linha do tempo pública: criação, mudanças de status e respostas da arte, a partir da auditoria.
 * Sem nome de quem fez, motivo, IP ou comentário (só o título do marco e a data). Do mais recente ao mais antigo.
 */
export function marcosPublicos(
  auditoria: RegistroAuditoria[],
  opcoes: { criadoEm: Date; tipoEntrega: TipoEntrega; itemDaArte: Map<string, string> },
): { quando: string; titulo: string }[] {
  const marcos: { quando: Date; titulo: string }[] = []
  let criacao = false
  for (const a of auditoria) {
    const depois = objeto(a.depois)
    const antes = objeto(a.antes)
    if (a.tabela === 'pedidos') {
      if (a.acao === 'criar') {
        criacao = true
        marcos.push({ quando: a.createdAt, titulo: 'Pedido confirmado' })
      } else if (typeof depois.status === 'string' && depois.status !== antes.status) {
        const titulo = tituloMarcoStatus(depois.status, opcoes.tipoEntrega)
        if (titulo) marcos.push({ quando: a.createdAt, titulo })
      }
    } else if (a.tabela === 'artes' && typeof depois.status === 'string' && depois.status !== antes.status) {
      const item = opcoes.itemDaArte.get(a.registroId ?? '')
      if (!item) continue
      const titulo = { enviada_cliente: 'Arte enviada para sua aprovação', aprovada: 'Arte aprovada', ajuste_solicitado: 'Ajuste na arte solicitado' }[depois.status]
      if (titulo) marcos.push({ quando: a.createdAt, titulo: `${titulo}: ${item}` })
    }
  }
  if (!criacao) marcos.push({ quando: opcoes.criadoEm, titulo: 'Pedido confirmado' })
  marcos.sort((a, b) => a.quando.getTime() - b.quando.getTime())
  // O mesmo marco duas vezes seguidas (ex.: status automático e manual) aparece uma vez só
  const unicos = marcos.filter((m, i) => i === 0 || m.titulo !== marcos[i - 1]!.titulo)
  return unicos.reverse().map((m) => ({ quando: m.quando.toISOString(), titulo: m.titulo }))
}

/**
 * Etapas do cliente: Pedido confirmado → Arte (se algum item tem arte) → Em produção → Pronto/Saiu para entrega → Entregue.
 * Cancelado: as etapas alcançadas antes do cancelamento ficam concluídas e o resto pendente.
 */
export function etapasDoPedido(p: {
  status: StatusPedido
  /** Status antes do cancelamento (pela auditoria), para saber até onde o pedido chegou */
  statusAntesCancelar?: StatusPedido | null
  tipoEntrega: TipoEntrega
  temArte: boolean
  arteAguardando: boolean
  criadoEm: Date
  /** Última entrada do pedido em cada status (auditoria) */
  entradas: Partial<Record<StatusPedido, Date>>
}): EtapaAcompanhamento[] {
  const cancelado = p.status === 'cancelado'
  const base = cancelado ? (p.statusAntesCancelar ?? null) : p.status
  // Sem arte, "aguardando arte" ainda é só o pedido confirmado
  let atual = base && base !== 'cancelado' ? indiceDoStatus(base) : 0
  if (atual === 1 && !p.temArte) atual = 0
  const quando: Record<CodigoEtapaAcompanhamento, Date | undefined> = {
    confirmado: p.criadoEm,
    arte: p.entradas.arte_em_aprovacao ?? p.entradas.aguardando_arte,
    producao: p.entradas.em_producao,
    pronto: p.entradas.em_entrega ?? p.entradas.pronto,
    entregue: p.entradas.entregue,
  }
  return CODIGOS.flatMap((codigo, indice) => {
    if (codigo === 'arte' && !p.temArte) return []
    const situacao: EtapaAcompanhamento['situacao'] =
      indice < atual || (indice === atual && (cancelado || codigo === 'entregue')) ? 'concluida' : indice === atual ? 'atual' : 'pendente'
    const textos = textoEtapa(codigo, { status: base ?? 'aguardando_arte', tipoEntrega: p.tipoEntrega, arteAguardando: p.arteAguardando, concluida: situacao === 'concluida' })
    return [{ codigo, ...textos, situacao, quando: situacao === 'pendente' ? null : (quando[codigo]?.toISOString() ?? null) }]
  })
}

/** Rótulo do status da arte para o cliente. */
export const ARTE_ROTULO_CLIENTE: Record<StatusArte, string> = {
  aguardando_arquivo: 'Aguardando arquivo',
  em_criacao: 'Em criação',
  enviada_cliente: 'Aguardando sua aprovação',
  ajuste_solicitado: 'Ajuste em andamento',
  aprovada: 'Aprovada',
}

type Num = { toString(): string }

/** Pedido como vem do banco (include do service): campos internos chegam aqui e não podem sair. */
export interface PedidoParaAcompanhar {
  numero: string
  status: StatusPedido
  tipoEntrega: TipoEntrega
  enderecoEntrega: string | null
  dataPrevistaEntrega: Date
  total: Num
  valorPago: Num
  observacoes: string | null
  canceladoEm: Date | null
  createdAt: Date
  cliente: { nome: string; fantasia: string | null; cpfCnpj?: string | null }
  itens: {
    id: string
    descricao: string
    quantidade: Num
    largura: Num | null
    altura: Num | null
    total: Num
    acabamentos: { nome: string }[]
    /** Versões da arte, da mais nova para a mais antiga */
    artes: { id: string; versao: number; status: StatusArte; tokenPublico: string; miniaturaId: string | null }[]
  }[]
  contasReceber: { parcela: number; totalParcelas: number; descricao: string; valor: Num; valorPago: Num; vencimento: Date; status: string; pagoEm: Date | null }[]
  entregas: { dataAgendada: Date | null; dataRealizada: Date | null; status: string; createdAt: Date }[]
}

export interface ExtrasAcompanhamento {
  slug: string
  hoje: string
  empresa: PedidoAcompanhamento['empresa']
  auditoria: RegistroAuditoria[]
  urlArquivo: (id: string) => string
}

const valor = (n: Num) => Number(n.toString())
const dinheiro = (n: number) => (Math.round(n * 100) / 100).toFixed(2)

/** Monta a resposta pública do link de acompanhamento (whitelist: cada campo é escolhido aqui). */
export function montarAcompanhamento(p: PedidoParaAcompanhar, x: ExtrasAcompanhamento): PedidoAcompanhamento {
  const ultimas = p.itens.map((i) => i.artes[0] ?? null)
  const temArte = ultimas.some(Boolean)
  const arteAguardando = ultimas.some((a) => a?.status === 'enviada_cliente')

  // Última entrada em cada status e o status de antes do cancelamento (auditoria do pedido)
  const entradas: Partial<Record<StatusPedido, Date>> = {}
  let statusAntesCancelar: StatusPedido | null = null
  for (const a of [...x.auditoria].sort((m, n) => m.createdAt.getTime() - n.createdAt.getTime())) {
    if (a.tabela !== 'pedidos') continue
    const depois = objeto(a.depois)
    if (typeof depois.status !== 'string') continue
    entradas[depois.status as StatusPedido] = a.createdAt
    if (depois.status === 'cancelado') {
      const antes = objeto(a.antes).status
      statusAntesCancelar = typeof antes === 'string' ? (antes as StatusPedido) : null
    }
  }
  const etapas = etapasDoPedido({ status: p.status, statusAntesCancelar, tipoEntrega: p.tipoEntrega, temArte, arteAguardando, criadoEm: p.createdAt, entradas })
  const atual = etapas.find((e) => e.situacao === 'atual') ?? etapas[etapas.length - 1]!
  const cancelado = p.status === 'cancelado'

  const contas = p.contasReceber.filter((c) => c.status !== 'cancelado').sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime() || a.parcela - b.parcela)
  const total = valor(p.total)
  const pago = valor(p.valorPago)
  const restante = Math.max(0, total - pago)
  const parcelas = contas.map((c) => {
    const quitada = c.status === 'pago'
    return {
      rotulo: /sinal/i.test(c.descricao) ? 'Entrada (sinal)' : c.totalParcelas > 1 ? `Parcela ${c.parcela} de ${c.totalParcelas}` : 'Pagamento',
      valor: dinheiro(valor(c.valor)),
      vencimento: dia(c.vencimento),
      pago: quitada,
      vencida: !quitada && dia(c.vencimento) < x.hoje,
      pagoEm: c.pagoEm ? dia(c.pagoEm) : null,
    }
  })
  const proxima = contas.find((c) => c.status !== 'pago')
  const entrega = [...p.entregas].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

  const itemDaArte = new Map(p.itens.flatMap((i) => i.artes.map((a) => [a.id, i.descricao] as const)))

  return {
    numero: p.numero,
    criadoEm: p.createdAt.toISOString(),
    dataPrevistaEntrega: dia(p.dataPrevistaEntrega),
    atrasado: !(STATUS_PEDIDO_SEM_ATRASO as readonly string[]).includes(p.status) && dia(p.dataPrevistaEntrega) < x.hoje,
    status: p.status,
    cancelado,
    canceladoEm: p.canceladoEm?.toISOString() ?? null,
    situacao: cancelado
      ? { titulo: 'Pedido cancelado', descricao: 'Este pedido foi cancelado. Em caso de dúvida, fale com a gente.' }
      : { titulo: atual.titulo, descricao: atual.descricao },
    etapas,
    // Só o nome para cumprimentar ("Olá, Pet Feliz!"); o documento não sai
    cliente: { nome: nomeParaSaudacao(nomeCliente(p.cliente), p.cliente.cpfCnpj) },
    empresa: x.empresa,
    itens: p.itens.map((i) => {
      const a = i.artes[0]
      const aguardando = a?.status === 'enviada_cliente'
      return {
        descricao: i.descricao,
        quantidade: i.quantidade.toString(),
        largura: i.largura?.toString() ?? null,
        altura: i.altura?.toString() ?? null,
        acabamentos: i.acabamentos.map((ac) => ac.nome),
        total: i.total.toString(),
        arte: a
          ? {
              versao: a.versao,
              status: a.status,
              rotulo: ARTE_ROTULO_CLIENTE[a.status],
              aguardandoAprovacao: aguardando && !cancelado,
              linkAprovacao: aguardando && !cancelado ? `/arte/${x.slug}/${a.tokenPublico}` : null,
              miniaturaUrl: a.miniaturaId ? x.urlArquivo(a.miniaturaId) : null,
            }
          : null,
      }
    }),
    financeiro: {
      total: dinheiro(total),
      pago: dinheiro(pago),
      restante: dinheiro(restante),
      quitado: total > 0 && restante <= 0.004,
      proximoVencimento: proxima && !cancelado
        ? { data: dia(proxima.vencimento), valor: dinheiro(Math.max(0, valor(proxima.valor) - valor(proxima.valorPago))), vencida: dia(proxima.vencimento) < x.hoje }
        : null,
      parcelas,
    },
    entrega: {
      tipo: p.tipoEntrega,
      rotulo: TIPO_ENTREGA_ROTULOS[p.tipoEntrega],
      endereco: p.tipoEntrega === 'retirada' ? null : p.enderecoEntrega,
      agendadaPara: entrega?.dataAgendada?.toISOString() ?? null,
      realizadaEm: entrega?.dataRealizada?.toISOString() ?? null,
    },
    observacoes: p.observacoes,
    historico: marcosPublicos(x.auditoria, { criadoEm: p.createdAt, tipoEntrega: p.tipoEntrega, itemDaArte }),
  }
}

/** "Rua X, 120 - Sala 2 - Centro - Cidade/UF" (endereço da loja para a retirada) */
export function enderecoEmLinha(e: { logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null }) {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ')
  const cidade = [e.cidade, e.uf].filter(Boolean).join('/')
  return [rua, e.complemento, e.bairro, cidade].filter(Boolean).join(' - ') || null
}

/** "/pedido/{slug}/{token}?x" → { slug, token } (prévia do link para o WhatsApp); null se não for o link do pedido */
export function linkDoCaminho(caminho: string): { slug: string; token: string } | null {
  const m = /^\/pedido\/([a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?)\/([A-Za-z0-9_-]{20,100})\/?$/.exec(caminho.split(/[?#]/)[0] ?? '')
  return m ? { slug: m[1]!, token: m[2]! } : null
}

/** Prévia do link (Open Graph): "Pedido PED-2026-0042 · Ponto Visual" + situação e previsão de entrega. */
export function previaDoPedido(a: PedidoAcompanhamento, url: string) {
  const [ano, mes, dia] = a.dataPrevistaEntrega.split('-')
  const previsao = a.cancelado || a.status === 'entregue' ? null : `Previsão de entrega: ${dia}/${mes}/${ano}.`
  const titulo = `Pedido ${a.numero} · ${a.empresa.nome}`
  return {
    titulo,
    tituloAba: titulo,
    descricao: [`${a.situacao.titulo}.`, previsao, 'Acompanhe o andamento do seu pedido.'].filter(Boolean).join(' '),
    url,
    siteNome: a.empresa.nome,
    imagem: null,
  }
}
