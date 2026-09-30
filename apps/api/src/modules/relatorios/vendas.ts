import { Prisma } from '@prisma/client'
import type { Relatorio } from '@onprint/shared'
import { col, noPeriodo, relatorio, soma, type Contexto } from './comum'

/**
 * Vendas = pedidos não cancelados (data de criação) + vendas do balcão concluídas, no período.
 * Visões: por mês, por vendedor (no balcão, o operador), por produto e por cliente.
 */
export async function relatorioVendas({ prisma, de, ate }: Contexto, visao: string): Promise<Relatorio> {
  const periodo = { de, ate }
  const vendas = Prisma.sql`
    SELECT p.created_at AS quando, p.total, p.vendedor_id AS vendedor_id, p.cliente_id, 'pedido' AS origem
    FROM pedidos p WHERE p.status <> 'cancelado' AND ${noPeriodo(Prisma.sql`p.created_at`, de, ate)}
    UNION ALL
    SELECT v.created_at, v.total, v.usuario_id, v.cliente_id, 'balcao' FROM vendas_pdv v
    WHERE v.status = 'concluida' AND ${noPeriodo(Prisma.sql`v.created_at`, de, ate)}`
  const [tot] = await prisma.$queryRaw<{ total: unknown; qtd: unknown }[]>(Prisma.sql`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS qtd FROM (${vendas}) x`)
  const total = Number(tot?.total ?? 0)
  const qtd = Number(tot?.qtd ?? 0)
  const resumo = [
    { rotulo: 'Total vendido', valor: total, formato: 'moeda' as const },
    { rotulo: 'Vendas', valor: qtd, formato: 'numero' as const },
    { rotulo: 'Ticket médio', valor: qtd ? Math.round((total / qtd) * 100) / 100 : 0, formato: 'moeda' as const },
  ]

  if (visao === 'vendedor' || visao === 'cliente') {
    const porVendedor = visao === 'vendedor'
    const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(
      porVendedor
        ? Prisma.sql`SELECT COALESCE(u.nome, 'Sem vendedor') AS nome, COUNT(*) AS quantidade, SUM(x.total) AS total, AVG(x.total) AS ticket
                     FROM (${vendas}) x LEFT JOIN usuarios u ON u.id = x.vendedor_id GROUP BY 1 ORDER BY 3 DESC`
        : Prisma.sql`SELECT COALESCE(c.nome, 'Consumidor (balcão)') AS nome, COUNT(*) AS quantidade, SUM(x.total) AS total, AVG(x.total) AS ticket
                     FROM (${vendas}) x LEFT JOIN clientes c ON c.id = x.cliente_id GROUP BY 1 ORDER BY 3 DESC`,
    )
    return relatorio({
      titulo: porVendedor ? 'Vendas por vendedor' : 'Vendas por cliente',
      periodo,
      resumo,
      grafico: { tipo: 'barras_horizontais', rotulo: 'nome', series: [{ chave: 'total', titulo: 'Total' }], formato: 'moeda' },
      colunas: [col('nome', porVendedor ? 'Vendedor' : 'Cliente'), col('quantidade', 'Vendas', 'numero'), col('total', 'Total', 'moeda'), col('ticket', 'Ticket médio', 'moeda')],
      linhas,
    })
  }

  if (visao === 'produto') {
    const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT pr.codigo, pr.nome, SUM(x.quantidade) AS quantidade, SUM(x.total) AS total FROM (
        SELECT i.produto_id, i.quantidade, i.total FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
        WHERE p.status <> 'cancelado' AND ${noPeriodo(Prisma.sql`p.created_at`, de, ate)}
        UNION ALL
        SELECT vi.produto_id, vi.quantidade, vi.total FROM vendas_pdv_itens vi JOIN vendas_pdv v ON v.id = vi.venda_id
        WHERE v.status = 'concluida' AND ${noPeriodo(Prisma.sql`v.created_at`, de, ate)}
      ) x JOIN produtos pr ON pr.id = x.produto_id GROUP BY pr.codigo, pr.nome ORDER BY 4 DESC`)
    const totalItens = soma(linhas, 'total')
    return relatorio({
      titulo: 'Vendas por produto',
      periodo,
      resumo: [{ rotulo: 'Total dos itens', valor: totalItens, formato: 'moeda' }, { rotulo: 'Produtos vendidos', valor: linhas.length, formato: 'numero' }],
      grafico: { tipo: 'barras_horizontais', rotulo: 'nome', series: [{ chave: 'total', titulo: 'Total' }], formato: 'moeda' },
      colunas: [col('codigo', 'Código'), col('nome', 'Produto'), col('quantidade', 'Quantidade', 'numero'), col('total', 'Total', 'moeda')],
      linhas,
      observacao: 'Pedidos com desconto no total: a soma dos itens pode passar do total vendido.',
    })
  }

  const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT to_char(x.quando AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
      COUNT(*) FILTER (WHERE origem = 'pedido') AS pedidos, COALESCE(SUM(total) FILTER (WHERE origem = 'pedido'), 0) AS valor_pedidos,
      COUNT(*) FILTER (WHERE origem = 'balcao') AS balcao, COALESCE(SUM(total) FILTER (WHERE origem = 'balcao'), 0) AS valor_balcao,
      SUM(total) AS total
    FROM (${vendas}) x GROUP BY 1 ORDER BY 1`)
  return relatorio({
    titulo: 'Vendas por mês',
    periodo,
    resumo,
    grafico: { tipo: 'barras', rotulo: 'mes', series: [{ chave: 'valor_pedidos', titulo: 'Pedidos' }, { chave: 'valor_balcao', titulo: 'Balcão' }], formato: 'moeda' },
    colunas: [col('mes', 'Mês'), col('pedidos', 'Pedidos', 'numero'), col('valor_pedidos', 'Valor pedidos', 'moeda'), col('balcao', 'Vendas balcão', 'numero'), col('valor_balcao', 'Valor balcão', 'moeda'), col('total', 'Total', 'moeda')],
    linhas,
  })
}
