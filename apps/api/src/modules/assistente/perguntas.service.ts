import { Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  PERGUNTA_RAPIDA_ROTULOS,
  STATUS_PADRAO,
  adicionarDias,
  formatarMoeda,
  hojeISO,
  type LinhaResposta,
  type PerguntaRapida,
  type PeriodoPergunta,
  type RespostaPergunta,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'

/*
 * Perguntas rápidas do "Peça ao Assistente" ("quem está devendo?", "quanto vendi este mês?"): respondidas pelo sistema
 * com consultas no banco — a IA só escolheu a pergunta e o período. As mesmas definições do painel (dashboard.service:
 * faturamento = pedidos não cancelados + balcão; atrasado = em aberto com a entrega prevista antes de hoje) e as mesmas
 * travas: cada pergunta exige a permissão do módulo, e sem "ver todos" só os orçamentos e pedidos da própria pessoa.
 */

const FUSO = 'America/Sao_Paulo'
const n = (v: unknown) => Number(v ?? 0)
const MAX_LINHAS = 8
const ABERTOS_PEDIDO = Prisma.sql`('aguardando_arte', 'arte_em_aprovacao', 'em_producao')`
const TITULO_ABERTO = Prisma.sql`('aberto', 'parcial', 'vencido')`
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const moeda = (v: number) => formatarMoeda(v.toFixed(2))
const plural = (q: number, um: string, varios: string) => `${q.toLocaleString('pt-BR')} ${q === 1 ? um : varios}`
const rotuloStatus = (entidade: 'pedido' | 'orcamento', codigo: string) => STATUS_PADRAO[entidade]?.find((s) => s.codigo === codigo)?.rotulo ?? codigo

/** Primeiro e último dia (AAAA-MM-DD) do período, e como dizer ("este mês") */
export function intervaloDoPeriodo(p: PeriodoPergunta, hoje = hojeISO()): { de: string; ate: string; rotulo: string } {
  switch (p) {
    case 'hoje':
      return { de: hoje, ate: hoje, rotulo: 'Hoje' }
    case 'ontem': {
      const ontem = adicionarDias(hoje, -1)
      return { de: ontem, ate: ontem, rotulo: 'Ontem' }
    }
    case 'semana': {
      // Semana de segunda a hoje
      const dia = new Date(`${hoje}T12:00:00Z`).getUTCDay()
      return { de: adicionarDias(hoje, -((dia + 6) % 7)), ate: hoje, rotulo: 'Esta semana' }
    }
    case 'mes_passado': {
      const fim = adicionarDias(`${hoje.slice(0, 7)}-01`, -1)
      return { de: `${fim.slice(0, 7)}-01`, ate: fim, rotulo: 'No mês passado' }
    }
    default:
      return { de: `${hoje.slice(0, 7)}-01`, ate: hoje, rotulo: 'Este mês' }
  }
}

export function criarPerguntasService(app: FastifyInstance) {
  const { prisma } = app
  const q = <T>(sql: Prisma.Sql) => prisma.$queryRaw<T[]>(sql)
  const dia = (col: Prisma.Sql) => Prisma.sql`(${col} AT TIME ZONE ${FUSO})::date`

  async function exigir(req: FastifyRequest, modulo: Parameters<FastifyInstance['temPermissao']>[1]) {
    if (!(await app.temPermissao(req, modulo, 'visualizar'))) throw AppError.semPermissao()
  }

  async function quemDeve(req: FastifyRequest): Promise<RespostaPergunta> {
    await exigir(req, 'financeiro')
    const hoje = hojeISO()
    const linhas = await q<{ id: string; nome: string; aberto: unknown; vencido: unknown; desde: Date | null }>(Prisma.sql`
      SELECT c.id, COALESCE(NULLIF(c.fantasia, ''), c.nome) AS nome,
             SUM(r.valor - r.valor_pago) AS aberto,
             COALESCE(SUM(r.valor - r.valor_pago) FILTER (WHERE r.vencimento < ${hoje}::date), 0) AS vencido,
             MIN(r.vencimento) FILTER (WHERE r.vencimento < ${hoje}::date) AS desde
      FROM contas_receber r JOIN clientes c ON c.id = r.cliente_id
      WHERE r.status IN ${TITULO_ABERTO} AND r.valor > r.valor_pago
      GROUP BY c.id, c.nome, c.fantasia
      ORDER BY vencido DESC, aberto DESC`)
    const total = linhas.reduce((s, l) => s + n(l.aberto), 0)
    const vencido = linhas.reduce((s, l) => s + n(l.vencido), 0)
    const resumo = linhas.length
      ? `${plural(linhas.length, 'cliente deve', 'clientes devem')} ${moeda(total)}${vencido > 0 ? `, ${moeda(vencido)} já vencidos` : ', nada vencido'}.`
      : 'Ninguém está devendo: não há contas a receber em aberto.'
    return {
      pergunta: 'quem_deve',
      titulo: 'Quem está devendo',
      resumo,
      linhas: linhas.slice(0, MAX_LINHAS).map((l) => ({
        titulo: l.nome,
        detalhe: n(l.vencido) > 0 ? `${moeda(n(l.vencido))} vencidos${l.desde ? ` desde ${dataBR(l.desde.toISOString().slice(0, 10))}` : ''}` : 'a vencer',
        valor: n(l.aberto).toFixed(2),
        link: `/clientes/${l.id}`,
      })),
      mais: Math.max(0, linhas.length - MAX_LINHAS),
      link: { rotulo: 'Abrir contas a receber', path: '/financeiro/receber' },
    }
  }

  async function vendas(req: FastifyRequest, periodo: PeriodoPergunta): Promise<RespostaPergunta> {
    await exigir(req, 'pedidos')
    const todos = await app.temPermissao(req, 'pedidos', 'ver_todos')
    const escopo = todos ? Prisma.empty : Prisma.sql`AND p.vendedor_id = ${req.user.sub}::uuid`
    const { de, ate, rotulo } = intervaloDoPeriodo(periodo)
    const noPeriodo = (col: Prisma.Sql) => Prisma.sql`${dia(col)} BETWEEN ${de}::date AND ${ate}::date`
    const [r] = await q<{ pedidos: unknown; qtd: unknown; balcao: unknown; vendas_balcao: unknown }>(Prisma.sql`
      SELECT
        (SELECT COALESCE(SUM(p.total), 0) FROM pedidos p WHERE p.status <> 'cancelado' AND ${noPeriodo(Prisma.sql`p.created_at`)} ${escopo}) AS pedidos,
        (SELECT COUNT(*) FROM pedidos p WHERE p.status <> 'cancelado' AND ${noPeriodo(Prisma.sql`p.created_at`)} ${escopo}) AS qtd,
        (SELECT COALESCE(SUM(v.total), 0) FROM vendas_pdv v WHERE v.status = 'concluida' AND ${noPeriodo(Prisma.sql`v.created_at`)} AND ${todos}) AS balcao,
        (SELECT COUNT(*) FROM vendas_pdv v WHERE v.status = 'concluida' AND ${noPeriodo(Prisma.sql`v.created_at`)} AND ${todos}) AS vendas_balcao`)
    const pedidos = n(r?.pedidos)
    const balcao = n(r?.balcao)
    const qtd = n(r?.qtd)
    const total = pedidos + balcao
    const quando = de === ate ? dataBR(de) : `${dataBR(de)} a ${dataBR(ate)}`
    const linhas: LinhaResposta[] = [
      { titulo: 'Pedidos', detalhe: plural(qtd, 'pedido', 'pedidos'), valor: pedidos.toFixed(2), link: '/pedidos' },
      ...(todos ? [{ titulo: 'Balcão (PDV)', detalhe: plural(n(r?.vendas_balcao), 'venda', 'vendas'), valor: balcao.toFixed(2), link: '/caixa' }] : []),
      ...(qtd ? [{ titulo: 'Ticket médio dos pedidos', detalhe: null, valor: (pedidos / qtd).toFixed(2), link: null }] : []),
    ]
    return {
      pergunta: 'vendas',
      titulo: `Vendas — ${rotulo.toLowerCase()}`,
      resumo: `${rotulo} (${quando}): ${moeda(total)} em vendas${todos ? '' : ' (só os seus pedidos)'} — ${plural(qtd, 'pedido', 'pedidos')}${todos && balcao ? ` e ${moeda(balcao)} no balcão` : ''}.`,
      linhas,
      mais: 0,
      link: { rotulo: 'Abrir o relatório de vendas', path: '/relatorios/vendas' },
    }
  }

  async function pedidos(req: FastifyRequest, tipo: 'pedidos_hoje' | 'pedidos_atrasados'): Promise<RespostaPergunta> {
    await exigir(req, 'pedidos')
    const todos = await app.temPermissao(req, 'pedidos', 'ver_todos')
    const escopo = todos ? Prisma.empty : Prisma.sql`AND p.vendedor_id = ${req.user.sub}::uuid`
    const hoje = hojeISO()
    const filtro =
      tipo === 'pedidos_hoje'
        ? Prisma.sql`p.status NOT IN ('entregue', 'cancelado') AND p.data_prevista_entrega = ${hoje}::date`
        : Prisma.sql`p.status IN ${ABERTOS_PEDIDO} AND p.data_prevista_entrega < ${hoje}::date`
    const linhas = await q<{ id: string; numero: string; cliente: string; data: Date; status: string; total: unknown }>(Prisma.sql`
      SELECT p.id, p.numero, COALESCE(NULLIF(c.fantasia, ''), c.nome) AS cliente, p.data_prevista_entrega AS data, p.status::text AS status, p.total
      FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE ${filtro} ${escopo} ORDER BY p.data_prevista_entrega, p.numero`)
    const hojeTxt = tipo === 'pedidos_hoje'
    const resumo = linhas.length
      ? hojeTxt
        ? `${plural(linhas.length, 'pedido para entregar hoje', 'pedidos para entregar hoje')}${linhas.filter((l) => l.status === 'pronto').length ? `; ${linhas.filter((l) => l.status === 'pronto').length} já pronto(s)` : ''}.`
        : `${plural(linhas.length, 'pedido atrasado', 'pedidos atrasados')}; o mais antigo era para ${dataBR(linhas[0]!.data.toISOString().slice(0, 10))}.`
      : hojeTxt
        ? 'Nenhum pedido para entregar hoje.'
        : 'Nenhum pedido atrasado.'
    return {
      pergunta: tipo,
      titulo: PERGUNTA_RAPIDA_ROTULOS[tipo],
      resumo,
      linhas: linhas.slice(0, MAX_LINHAS).map((l) => ({
        titulo: `${l.numero} · ${l.cliente}`,
        detalhe: `${rotuloStatus('pedido', l.status)}${hojeTxt ? '' : ` · entrega era ${dataBR(l.data.toISOString().slice(0, 10))}`}`,
        valor: n(l.total).toFixed(2),
        link: `/pedidos/${l.id}`,
      })),
      mais: Math.max(0, linhas.length - MAX_LINHAS),
      link: { rotulo: 'Abrir os pedidos', path: '/pedidos' },
    }
  }

  async function orcamentosEsperando(req: FastifyRequest): Promise<RespostaPergunta> {
    await exigir(req, 'orcamentos')
    const todos = await app.temPermissao(req, 'orcamentos', 'ver_todos')
    const lista = await prisma.orcamento.findMany({
      where: { status: { in: ['enviado', 'em_negociacao'] }, ...(todos ? {} : { vendedorId: req.user.sub }) },
      select: { id: true, numero: true, total: true, status: true, enviadoEm: true, createdAt: true, validade: true, cliente: { select: { nome: true, fantasia: true } } },
      orderBy: [{ enviadoEm: 'asc' }, { createdAt: 'asc' }],
    })
    const total = lista.reduce((s, o) => s + Number(o.total), 0)
    const agora = Date.now()
    const dias = (d: Date) => Math.max(0, Math.floor((agora - d.getTime()) / 86_400_000))
    return {
      pergunta: 'orcamentos_esperando',
      titulo: 'Orçamentos esperando resposta',
      resumo: lista.length ? `${plural(lista.length, 'orçamento esperando', 'orçamentos esperando')} a resposta do cliente, somando ${moeda(total)}.` : 'Nenhum orçamento esperando resposta.',
      linhas: lista.slice(0, MAX_LINHAS).map((o) => {
        const d = dias(o.enviadoEm ?? o.createdAt)
        return {
          titulo: `${o.numero} · ${o.cliente.fantasia || o.cliente.nome}`,
          detalhe: `${rotuloStatus('orcamento', o.status)} há ${d === 0 ? 'menos de 1 dia' : plural(d, 'dia', 'dias')} · vale até ${dataBR(o.validade.toISOString().slice(0, 10))}`,
          valor: Number(o.total).toFixed(2),
          link: `/orcamentos/${o.id}`,
        }
      }),
      mais: Math.max(0, lista.length - MAX_LINHAS),
      link: { rotulo: 'Abrir os orçamentos', path: '/orcamentos' },
    }
  }

  return {
    async responder(req: FastifyRequest, pergunta: PerguntaRapida, periodo: PeriodoPergunta | null): Promise<RespostaPergunta> {
      switch (pergunta) {
        case 'quem_deve':
          return quemDeve(req)
        case 'vendas':
          return vendas(req, periodo ?? 'mes')
        case 'pedidos_hoje':
        case 'pedidos_atrasados':
          return pedidos(req, pergunta)
        case 'orcamentos_esperando':
          return orcamentosEsperando(req)
      }
    },
  }
}
