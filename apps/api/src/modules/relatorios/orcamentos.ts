import { Prisma } from '@prisma/client'
import type { Relatorio } from '@onprint/shared'
import { col, n, noPeriodo, relatorio, type Contexto } from './comum'

/**
 * Conversão de orçamentos criados no período. Enviados = todos menos rascunho;
 * aprovados = aprovado + convertido; taxa de conversão = convertidos ÷ enviados.
 */
export async function relatorioOrcamentos({ prisma, de, ate }: Contexto, visao: string): Promise<Relatorio> {
  const periodo = { de, ate }
  const filtro = noPeriodo(Prisma.sql`o.created_at`, de, ate)
  const [t] = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT COUNT(*) AS criados, COUNT(*) FILTER (WHERE status <> 'rascunho') AS enviados,
           COUNT(*) FILTER (WHERE status = 'convertido') AS convertidos, COALESCE(SUM(total) FILTER (WHERE status = 'convertido'), 0) AS valor_convertido
    FROM orcamentos o WHERE ${filtro}`)
  const enviados = Number(t?.enviados ?? 0)
  const convertidos = Number(t?.convertidos ?? 0)
  const resumo = [
    { rotulo: 'Orçamentos criados', valor: Number(t?.criados ?? 0), formato: 'numero' as const },
    { rotulo: 'Enviados', valor: enviados, formato: 'numero' as const },
    { rotulo: 'Taxa de conversão', valor: enviados ? n((convertidos / enviados) * 100) : 0, formato: 'percentual' as const },
    { rotulo: 'Valor convertido', valor: n(t?.valor_convertido), formato: 'moeda' as const },
  ]

  if (visao === 'vendedor') {
    const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT COALESCE(u.nome, 'Sem vendedor') AS vendedor, COUNT(*) AS criados, COUNT(*) FILTER (WHERE o.status <> 'rascunho') AS enviados,
             COUNT(*) FILTER (WHERE o.status = 'convertido') AS convertidos,
             CASE WHEN COUNT(*) FILTER (WHERE o.status <> 'rascunho') = 0 THEN 0
                  ELSE 100.0 * COUNT(*) FILTER (WHERE o.status = 'convertido') / COUNT(*) FILTER (WHERE o.status <> 'rascunho') END AS taxa,
             COALESCE(SUM(o.total) FILTER (WHERE o.status = 'convertido'), 0) AS valor_convertido
      FROM orcamentos o LEFT JOIN usuarios u ON u.id = o.vendedor_id WHERE ${filtro} GROUP BY 1 ORDER BY 6 DESC`)
    return relatorio({
      titulo: 'Conversão por vendedor',
      periodo,
      resumo,
      grafico: { tipo: 'barras_horizontais', rotulo: 'vendedor', series: [{ chave: 'taxa', titulo: 'Conversão (%)' }], formato: 'percentual' },
      colunas: [col('vendedor', 'Vendedor'), col('criados', 'Criados', 'numero'), col('enviados', 'Enviados', 'numero'), col('convertidos', 'Convertidos', 'numero'), col('taxa', 'Conversão', 'percentual'), col('valor_convertido', 'Valor convertido', 'moeda')],
      linhas,
    })
  }

  if (visao === 'recusas') {
    const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT COALESCE(NULLIF(TRIM(o.motivo_recusa), ''), 'Sem motivo informado') AS motivo, COUNT(*) AS quantidade, SUM(o.total) AS valor
      FROM orcamentos o WHERE o.status = 'recusado' AND ${filtro} GROUP BY 1 ORDER BY 2 DESC, 3 DESC`)
    return relatorio({
      titulo: 'Motivos de recusa',
      periodo,
      resumo,
      grafico: { tipo: 'barras_horizontais', rotulo: 'motivo', series: [{ chave: 'quantidade', titulo: 'Recusas' }], formato: 'numero' },
      colunas: [col('motivo', 'Motivo'), col('quantidade', 'Recusas', 'numero'), col('valor', 'Valor perdido', 'moeda')],
      linhas,
    })
  }

  const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT etapa, quantidade, valor FROM (
      SELECT 1 AS ordem, 'Criados' AS etapa, COUNT(*) AS quantidade, COALESCE(SUM(total), 0) AS valor FROM orcamentos o WHERE ${filtro}
      UNION ALL SELECT 2, 'Enviados', COUNT(*), COALESCE(SUM(total), 0) FROM orcamentos o WHERE o.status <> 'rascunho' AND ${filtro}
      UNION ALL SELECT 3, 'Aprovados', COUNT(*), COALESCE(SUM(total), 0) FROM orcamentos o WHERE o.status IN ('aprovado', 'convertido') AND ${filtro}
      UNION ALL SELECT 4, 'Convertidos em pedido', COUNT(*), COALESCE(SUM(total), 0) FROM orcamentos o WHERE o.status = 'convertido' AND ${filtro}
      UNION ALL SELECT 5, 'Recusados', COUNT(*), COALESCE(SUM(total), 0) FROM orcamentos o WHERE o.status = 'recusado' AND ${filtro}
      UNION ALL SELECT 6, 'Expirados', COUNT(*), COALESCE(SUM(total), 0) FROM orcamentos o WHERE o.status = 'expirado' AND ${filtro}
    ) f ORDER BY ordem`)
  return relatorio({
    titulo: 'Funil de orçamentos',
    periodo,
    resumo,
    grafico: { tipo: 'barras', rotulo: 'etapa', series: [{ chave: 'quantidade', titulo: 'Orçamentos' }], formato: 'numero' },
    colunas: [col('etapa', 'Etapa'), col('quantidade', 'Quantidade', 'numero'), col('valor', 'Valor', 'moeda')],
    linhas,
  })
}
