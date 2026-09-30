import { Prisma } from '@prisma/client'
import type { Relatorio } from '@onprint/shared'
import { col, noPeriodo, relatorio, soma, type Contexto } from './comum'

/** Comissões dos pedidos criados no período, por vendedor e detalhadas (prevista, liberada, paga). */
export async function relatorioComissoes({ prisma, de, ate }: Contexto, visao: string): Promise<Relatorio> {
  const periodo = { de, ate }
  const filtro = Prisma.sql`p.status <> 'cancelado' AND ${noPeriodo(Prisma.sql`p.created_at`, de, ate)}`

  if (visao === 'detalhe') {
    const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT p.numero AS pedido, cl.nome AS cliente, u.nome AS vendedor, c.base, c.percentual, c.valor,
             CASE c.status WHEN 'prevista' THEN 'Prevista' WHEN 'liberada' THEN 'Liberada' ELSE 'Paga' END AS situacao,
             (c.liberada_em AT TIME ZONE 'America/Sao_Paulo')::date AS liberada_em, (c.paga_em AT TIME ZONE 'America/Sao_Paulo')::date AS paga_em
      FROM comissoes c JOIN pedidos p ON p.id = c.pedido_id JOIN clientes cl ON cl.id = p.cliente_id JOIN usuarios u ON u.id = c.vendedor_id
      WHERE ${filtro} ORDER BY p.numero`)
    return relatorio({
      titulo: 'Comissões detalhadas',
      periodo,
      resumo: [{ rotulo: 'Total de comissões', valor: soma(linhas, 'valor'), formato: 'moeda' }, { rotulo: 'Pedidos', valor: linhas.length, formato: 'numero' }],
      grafico: null,
      colunas: [
        col('pedido', 'Pedido'),
        col('cliente', 'Cliente'),
        col('vendedor', 'Vendedor'),
        col('base', 'Base', 'moeda'),
        col('percentual', '%', 'percentual'),
        col('valor', 'Comissão', 'moeda'),
        col('situacao', 'Situação'),
        col('liberada_em', 'Liberada em', 'data'),
        col('paga_em', 'Paga em', 'data'),
      ],
      linhas,
    })
  }

  const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT u.nome AS vendedor, COUNT(*) AS pedidos, SUM(c.base) AS vendido,
           COALESCE(SUM(c.valor) FILTER (WHERE c.status = 'prevista'), 0) AS prevista,
           COALESCE(SUM(c.valor) FILTER (WHERE c.status = 'liberada'), 0) AS liberada,
           COALESCE(SUM(c.valor) FILTER (WHERE c.status = 'paga'), 0) AS paga,
           SUM(c.valor) AS total
    FROM comissoes c JOIN pedidos p ON p.id = c.pedido_id JOIN usuarios u ON u.id = c.vendedor_id
    WHERE ${filtro} GROUP BY u.nome ORDER BY 7 DESC`)
  return relatorio({
    titulo: 'Comissões por vendedor',
    periodo,
    resumo: [
      { rotulo: 'Previstas', valor: soma(linhas, 'prevista'), formato: 'moeda' },
      { rotulo: 'Liberadas', valor: soma(linhas, 'liberada'), formato: 'moeda' },
      { rotulo: 'Pagas', valor: soma(linhas, 'paga'), formato: 'moeda' },
    ],
    grafico: { tipo: 'barras_horizontais', rotulo: 'vendedor', series: [{ chave: 'prevista', titulo: 'Prevista' }, { chave: 'liberada', titulo: 'Liberada' }, { chave: 'paga', titulo: 'Paga' }], formato: 'moeda' },
    colunas: [
      col('vendedor', 'Vendedor'),
      col('pedidos', 'Pedidos', 'numero'),
      col('vendido', 'Vendido', 'moeda'),
      col('prevista', 'Prevista', 'moeda'),
      col('liberada', 'Liberada', 'moeda'),
      col('paga', 'Paga', 'moeda'),
      col('total', 'Total', 'moeda'),
    ],
    linhas,
  })
}
