import { Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { adicionarDias, hojeISO, type Dashboard, type KpiDashboard } from '@onprint/shared'

const FUSO = 'America/Sao_Paulo'
const n = (v: unknown) => Number(v ?? 0)
const ABERTOS_PEDIDO = Prisma.sql`('aguardando_arte', 'arte_em_aprovacao', 'em_producao')`
const TITULO_ABERTO = Prisma.sql`('aberto', 'parcial', 'vencido')`
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Variação percentual (null sem base: dividir por zero não diz nada) */
function variacaoPct(atual: number, anterior: number, contra: string): KpiDashboard['variacao'] {
  if (!anterior) return null
  return { valor: Math.round(((atual - anterior) / anterior) * 1000) / 10, unidade: 'percentual', contra }
}

/**
 * Dashboard (seção 11) com agregações no banco. Cada bloco só aparece para quem tem o módulo;
 * sem "ver todos", orçamentos e pedidos se restringem aos do próprio vendedor (e o PDV fica de fora).
 * As definições de cada indicador estão em docs/DECISOES.md (D110).
 */
export function criarDashboardService(app: FastifyInstance) {
  const { prisma } = app
  const q = <T>(sql: Prisma.Sql) => prisma.$queryRaw<T[]>(sql)

  return {
    async montar(req: FastifyRequest): Promise<Dashboard> {
      const [verComercial, verPedidos, verProducao, verFinanceiro, verEstoque, todosOrc, todosPed] = await Promise.all([
        app.temPermissao(req, 'orcamentos', 'visualizar'),
        app.temPermissao(req, 'pedidos', 'visualizar'),
        app.temPermissao(req, 'producao', 'visualizar'),
        app.temPermissao(req, 'financeiro', 'visualizar'),
        app.temPermissao(req, 'estoque', 'visualizar'),
        app.temPermissao(req, 'orcamentos', 'ver_todos'),
        app.temPermissao(req, 'pedidos', 'ver_todos'),
      ])
      const uid = req.user.sub
      const escopoOrc = todosOrc ? Prisma.empty : Prisma.sql`AND o.vendedor_id = ${uid}::uuid`
      const escopoPed = todosPed ? Prisma.empty : Prisma.sql`AND p.vendedor_id = ${uid}::uuid`
      const hoje = hojeISO()
      const mes = hoje.slice(0, 7)
      const ha90 = adicionarDias(hoje, -89)
      const dia = (col: Prisma.Sql) => Prisma.sql`(${col} AT TIME ZONE ${FUSO})::date`
      const kpis: KpiDashboard[] = []
      const resultado: Dashboard = { hoje, kpis, faturamentoMensal: null, funil: null, pedidosPorStatus: null, producaoPorEtapa: null, topProdutos: null, proximasEntregas: null, atrasos: null }

      if (verPedidos) {
        // Mês até hoje x mesmo período do mês passado (ex.: 1º a 13/out x 1º a 13/set)
        const inicioAnterior = Prisma.sql`(date_trunc('month', ${hoje}::date) - interval '1 month')::date`
        const fimAnterior = Prisma.sql`(${hoje}::date - interval '1 month')::date`
        const noMes = (col: Prisma.Sql) => Prisma.sql`to_char(${dia(col)}, 'YYYY-MM') = ${mes}`
        const noAnterior = (col: Prisma.Sql) => Prisma.sql`${dia(col)} BETWEEN ${inicioAnterior} AND ${fimAnterior}`
        const [fat] = await q<{ pedidos: unknown; balcao: unknown; pedidos_ant: unknown; balcao_ant: unknown; qtd: unknown; qtd_ant: unknown }>(Prisma.sql`
          SELECT
            (SELECT COALESCE(SUM(p.total), 0) FROM pedidos p WHERE p.status <> 'cancelado' AND ${noMes(Prisma.sql`p.created_at`)} ${escopoPed}) AS pedidos,
            (SELECT COALESCE(SUM(v.total), 0) FROM vendas_pdv v WHERE v.status = 'concluida' AND ${noMes(Prisma.sql`v.created_at`)} AND ${todosPed}) AS balcao,
            (SELECT COALESCE(SUM(p.total), 0) FROM pedidos p WHERE p.status <> 'cancelado' AND ${noAnterior(Prisma.sql`p.created_at`)} ${escopoPed}) AS pedidos_ant,
            (SELECT COALESCE(SUM(v.total), 0) FROM vendas_pdv v WHERE v.status = 'concluida' AND ${noAnterior(Prisma.sql`v.created_at`)} AND ${todosPed}) AS balcao_ant,
            (SELECT COUNT(*) FROM pedidos p WHERE p.status <> 'cancelado' AND ${noMes(Prisma.sql`p.created_at`)} ${escopoPed}) AS qtd,
            (SELECT COUNT(*) FROM pedidos p WHERE p.status <> 'cancelado' AND ${noAnterior(Prisma.sql`p.created_at`)} ${escopoPed}) AS qtd_ant`)
        const mesAnterior = MESES[(Number(mes.slice(5, 7)) + 10) % 12]
        const contra = `mesmo período de ${mesAnterior}`
        const [ped] = await q<{ producao: unknown; atrasados: unknown }>(Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE p.status = 'em_producao') AS producao,
                 COUNT(*) FILTER (WHERE p.status IN ${ABERTOS_PEDIDO} AND p.data_prevista_entrega < ${hoje}::date) AS atrasados
          FROM pedidos p WHERE TRUE ${escopoPed}`)

        resultado.faturamentoMensal = (
          await q<{ mes: string; pedidos: unknown; balcao: unknown }>(Prisma.sql`
            WITH meses AS (SELECT to_char(generate_series(date_trunc('month', ${hoje}::date) - interval '11 months', date_trunc('month', ${hoje}::date), interval '1 month'), 'YYYY-MM') AS mes)
            SELECT m.mes,
              (SELECT COALESCE(SUM(p.total), 0) FROM pedidos p WHERE p.status <> 'cancelado' AND to_char(${dia(Prisma.sql`p.created_at`)}, 'YYYY-MM') = m.mes ${escopoPed}) AS pedidos,
              (SELECT COALESCE(SUM(v.total), 0) FROM vendas_pdv v WHERE v.status = 'concluida' AND to_char(${dia(Prisma.sql`v.created_at`)}, 'YYYY-MM') = m.mes AND ${todosPed}) AS balcao
            FROM meses m ORDER BY m.mes`)
        ).map((r) => ({ mes: r.mes, pedidos: n(r.pedidos), balcao: n(r.balcao) }))
        const faturamento = n(fat?.pedidos) + n(fat?.balcao)
        kpis.push({
          chave: 'faturamento_mes',
          rotulo: 'Faturamento do mês',
          valor: faturamento,
          formato: 'moeda',
          detalhe: 'pedidos + balcão',
          link: '/relatorios/vendas',
          grupo: 'indicador',
          variacao: variacaoPct(faturamento, n(fat?.pedidos_ant) + n(fat?.balcao_ant), contra),
          serie: resultado.faturamentoMensal.slice(-8).map((m) => m.pedidos + m.balcao),
        })
        kpis.push({ chave: 'pedidos_mes', rotulo: 'Pedidos no mês', valor: n(fat?.qtd), formato: 'numero', link: '/pedidos', grupo: 'indicador', variacao: variacaoPct(n(fat?.qtd), n(fat?.qtd_ant), contra) })
        // Ticket médio dos pedidos do mês (o balcão fica de fora: venda avulsa puxaria a média para baixo)
        const ticket = n(fat?.qtd) ? n(fat?.pedidos) / n(fat?.qtd) : 0
        const ticketAnt = n(fat?.qtd_ant) ? n(fat?.pedidos_ant) / n(fat?.qtd_ant) : 0
        kpis.push({ chave: 'ticket_medio', rotulo: 'Ticket médio', valor: Math.round(ticket * 100) / 100, formato: 'moeda', link: '/relatorios/vendas', grupo: 'indicador', variacao: variacaoPct(ticket, ticketAnt, contra) })
        kpis.push({ chave: 'pedidos_producao', rotulo: 'Pedidos em produção', valor: n(ped?.producao), formato: 'numero', link: '/pedidos/kanban', grupo: 'indicador' })
        kpis.push({ chave: 'pedidos_atrasados', rotulo: 'Pedidos atrasados', valor: n(ped?.atrasados), formato: 'numero', alerta: n(ped?.atrasados) > 0, link: '/pedidos', grupo: 'atencao' })
        resultado.pedidosPorStatus = (
          await q<{ status: string; quantidade: unknown }>(Prisma.sql`
            SELECT p.status::text AS status, COUNT(*) AS quantidade FROM pedidos p
            WHERE p.status NOT IN ('entregue', 'cancelado') ${escopoPed} GROUP BY p.status`)
        ).map((r) => ({ status: r.status, quantidade: n(r.quantidade) }))
        resultado.topProdutos = (
          await q<{ produto: string; quantidade: unknown; total: unknown }>(Prisma.sql`
            SELECT pr.nome AS produto, SUM(x.quantidade) AS quantidade, SUM(x.total) AS total FROM (
              SELECT i.produto_id, i.quantidade, i.total FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
              WHERE p.status <> 'cancelado' AND ${dia(Prisma.sql`p.created_at`)} >= ${ha90}::date ${escopoPed}
              UNION ALL
              SELECT vi.produto_id, vi.quantidade, vi.total FROM vendas_pdv_itens vi JOIN vendas_pdv v ON v.id = vi.venda_id
              WHERE v.status = 'concluida' AND ${dia(Prisma.sql`v.created_at`)} >= ${ha90}::date AND ${todosPed}
            ) x JOIN produtos pr ON pr.id = x.produto_id GROUP BY pr.nome ORDER BY SUM(x.total) DESC LIMIT 5`)
        ).map((r) => ({ produto: r.produto, quantidade: n(r.quantidade), total: n(r.total) }))
        const listaPedidos = (filtro: Prisma.Sql, ordem: Prisma.Sql) =>
          q<{ id: string; numero: string; cliente: string; data: Date; status: string }>(Prisma.sql`
            SELECT p.id, p.numero, c.nome AS cliente, p.data_prevista_entrega AS data, p.status::text AS status
            FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE ${filtro} ${escopoPed} ORDER BY ${ordem} LIMIT 8`)
        const fmt = (l: { id: string; numero: string; cliente: string; data: Date; status: string }[]) => l.map((r) => ({ ...r, data: r.data.toISOString().slice(0, 10) }))
        resultado.proximasEntregas = fmt(
          await listaPedidos(Prisma.sql`p.status NOT IN ('entregue', 'cancelado') AND p.data_prevista_entrega BETWEEN ${hoje}::date AND ${adicionarDias(hoje, 7)}::date`, Prisma.sql`p.data_prevista_entrega, p.numero`),
        )
        resultado.atrasos = fmt(await listaPedidos(Prisma.sql`p.status IN ${ABERTOS_PEDIDO} AND p.data_prevista_entrega < ${hoje}::date`, Prisma.sql`p.data_prevista_entrega, p.numero`))
      }

      if (verComercial) {
        const ha180 = adicionarDias(hoje, -179)
        const criado = dia(Prisma.sql`o.created_at`)
        const [orc] = await q<{ abertos: unknown; valor: unknown; base: unknown; convertidos: unknown; base_ant: unknown; convertidos_ant: unknown; vencendo: unknown }>(Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE o.status IN ('rascunho', 'enviado', 'em_negociacao')) AS abertos,
                 COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('rascunho', 'enviado', 'em_negociacao')), 0) AS valor,
                 COUNT(*) FILTER (WHERE o.status <> 'rascunho' AND ${criado} >= ${ha90}::date) AS base,
                 COUNT(*) FILTER (WHERE o.status = 'convertido' AND ${criado} >= ${ha90}::date) AS convertidos,
                 COUNT(*) FILTER (WHERE o.status <> 'rascunho' AND ${criado} >= ${ha180}::date AND ${criado} < ${ha90}::date) AS base_ant,
                 COUNT(*) FILTER (WHERE o.status = 'convertido' AND ${criado} >= ${ha180}::date AND ${criado} < ${ha90}::date) AS convertidos_ant,
                 COUNT(*) FILTER (WHERE o.status IN ('enviado', 'em_negociacao') AND o.validade BETWEEN ${hoje}::date AND ${adicionarDias(hoje, 3)}::date) AS vencendo
          FROM orcamentos o WHERE TRUE ${escopoOrc}`)
        kpis.push({ chave: 'orcamentos_abertos', rotulo: 'Orçamentos em aberto', valor: n(orc?.abertos), formato: 'numero', detalhe: `R$ ${n(orc?.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em negociação`, link: '/orcamentos', grupo: 'indicador' })
        const pct = (a: unknown, b: unknown) => (n(b) ? Math.round((n(a) / n(b)) * 1000) / 10 : 0)
        const taxa = pct(orc?.convertidos, orc?.base)
        kpis.push({
          chave: 'conversao',
          rotulo: 'Conversão (90 dias)',
          valor: taxa,
          formato: 'percentual',
          detalhe: `${n(orc?.convertidos)} de ${n(orc?.base)} enviados`,
          link: '/relatorios/orcamentos',
          grupo: 'indicador',
          // Em pontos percentuais contra os 90 dias anteriores
          variacao: n(orc?.base_ant) ? { valor: Math.round((taxa - pct(orc?.convertidos_ant, orc?.base_ant)) * 10) / 10, unidade: 'pontos', contra: '90 dias anteriores' } : null,
        })
        // Solicitações esperando orçamento (novas ou já em atendimento)
        const [sol] = await q<{ novas: unknown }>(Prisma.sql`SELECT COUNT(*) AS novas FROM solicitacoes_orcamento WHERE status IN ('nova', 'em_atendimento')`)
        kpis.push({ chave: 'solicitacoes_novas', rotulo: 'Solicitações a orçar', valor: n(sol?.novas), formato: 'numero', alerta: n(sol?.novas) > 0, link: '/orcamentos/solicitacoes', grupo: 'atencao' })
        kpis.push({ chave: 'orcamentos_vencendo', rotulo: 'Orçamentos vencendo em 3 dias', valor: n(orc?.vencendo), formato: 'numero', alerta: n(orc?.vencendo) > 0, link: '/orcamentos', grupo: 'atencao' })
        const [f] = await q<{ criados: unknown; enviados: unknown; aprovados: unknown; convertidos: unknown }>(Prisma.sql`
          SELECT COUNT(*) AS criados, COUNT(*) FILTER (WHERE o.status <> 'rascunho') AS enviados,
                 COUNT(*) FILTER (WHERE o.status IN ('aprovado', 'convertido')) AS aprovados, COUNT(*) FILTER (WHERE o.status = 'convertido') AS convertidos
          FROM orcamentos o WHERE ${dia(Prisma.sql`o.created_at`)} >= ${ha90}::date ${escopoOrc}`)
        resultado.funil = [
          { etapa: 'Criados', quantidade: n(f?.criados) },
          { etapa: 'Enviados', quantidade: n(f?.enviados) },
          { etapa: 'Aprovados', quantidade: n(f?.aprovados) },
          { etapa: 'Convertidos', quantidade: n(f?.convertidos) },
        ]
      }

      if (verProducao) {
        resultado.producaoPorEtapa = (
          await q<{ etapa: string; quantidade: unknown }>(Prisma.sql`
            SELECT etapa_atual::text AS etapa, COUNT(*) AS quantidade FROM ordens_producao
            WHERE cancelada = false AND etapa_atual <> 'concluido' GROUP BY etapa_atual`)
        ).map((r) => ({ etapa: r.etapa, quantidade: n(r.quantidade) }))
      }

      if (verFinanceiro) {
        const [fin] = await q<{ receber_hoje: unknown; vencidos: unknown; pagar_hoje: unknown }>(Prisma.sql`
          SELECT
            (SELECT COALESCE(SUM(valor - valor_pago), 0) FROM contas_receber WHERE status IN ${TITULO_ABERTO} AND vencimento = ${hoje}::date) AS receber_hoje,
            (SELECT COALESCE(SUM(valor - valor_pago), 0) FROM contas_receber WHERE status IN ${TITULO_ABERTO} AND vencimento < ${hoje}::date) AS vencidos,
            (SELECT COALESCE(SUM(valor - valor_pago), 0) FROM contas_pagar WHERE status IN ${TITULO_ABERTO} AND vencimento = ${hoje}::date) AS pagar_hoje`)
        kpis.push({ chave: 'receber_hoje', rotulo: 'A receber hoje', valor: n(fin?.receber_hoje), formato: 'moeda', link: '/financeiro/calendario', grupo: 'indicador' })
        kpis.push({ chave: 'pagar_hoje', rotulo: 'A pagar hoje', valor: n(fin?.pagar_hoje), formato: 'moeda', link: '/financeiro/pagar', grupo: 'indicador' })
        kpis.push({ chave: 'receber_vencido', rotulo: 'Recebíveis vencidos', valor: n(fin?.vencidos), formato: 'moeda', alerta: n(fin?.vencidos) > 0, link: '/financeiro/receber', grupo: 'atencao' })
      }

      if (verEstoque) {
        const [est] = await q<{ baixo: unknown }>(Prisma.sql`
          SELECT COUNT(*) AS baixo FROM produtos pr
          WHERE pr.controla_estoque AND pr.ativo
            AND COALESCE((SELECT SUM(s.quantidade) FROM estoque_saldos s WHERE s.produto_id = pr.id), 0) <= pr.estoque_minimo`)
        kpis.push({ chave: 'estoque_baixo', rotulo: 'Itens com estoque baixo', valor: n(est?.baixo), formato: 'numero', alerta: n(est?.baixo) > 0, link: '/estoque/alertas', grupo: 'atencao' })
      }
      return resultado
    },
  }
}
