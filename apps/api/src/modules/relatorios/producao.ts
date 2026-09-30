import { Prisma } from '@prisma/client'
import type { Relatorio } from '@onprint/shared'
import { col, n, noPeriodo, relatorio, soma, type Contexto } from './comum'

const ROTULO_ETAPA = Prisma.sql`CASE etapa_de WHEN 'fila' THEN 'Fila' WHEN 'pre_impressao' THEN 'Pré-impressão' WHEN 'impressao' THEN 'Impressão'
  WHEN 'acabamento' THEN 'Acabamento' WHEN 'conferencia' THEN 'Conferência' ELSE etapa_de::text END`

/**
 * Produção: tempo médio em cada etapa (histórico do kanban), produtividade por máquina
 * (OPs concluídas no período + apontamentos) e perdas registradas nos apontamentos.
 */
export async function relatorioProducao({ prisma, de, ate }: Contexto, visao: string): Promise<Relatorio> {
  const periodo = { de, ate }

  if (visao === 'maquinas') {
    const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT m.nome AS maquina,
        (SELECT COUNT(*) FROM ordens_producao op WHERE op.maquina_id = m.id AND op.etapa_atual = 'concluido' AND op.cancelada = false
           AND ${noPeriodo(Prisma.sql`op.data_fim_real`, de, ate)}) AS ops_concluidas,
        (SELECT COALESCE(SUM(op.area_m2), 0) FROM ordens_producao op WHERE op.maquina_id = m.id AND op.etapa_atual = 'concluido' AND op.cancelada = false
           AND ${noPeriodo(Prisma.sql`op.data_fim_real`, de, ate)}) AS area_m2,
        (SELECT COALESCE(SUM(op.horas_estimadas), 0) FROM ordens_producao op WHERE op.maquina_id = m.id AND op.etapa_atual = 'concluido' AND op.cancelada = false
           AND ${noPeriodo(Prisma.sql`op.data_fim_real`, de, ate)}) AS horas_estimadas,
        (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (a.fim - a.inicio)) / 3600), 0) FROM op_apontamentos a WHERE a.maquina_id = m.id AND a.fim IS NOT NULL
           AND ${noPeriodo(Prisma.sql`a.inicio`, de, ate)}) AS horas_apontadas,
        (SELECT COALESCE(SUM(a.quantidade_produzida), 0) FROM op_apontamentos a WHERE a.maquina_id = m.id AND ${noPeriodo(Prisma.sql`a.inicio`, de, ate)}) AS produzido
      FROM maquinas m WHERE m.ativo ORDER BY 2 DESC, m.nome`)
    return relatorio({
      titulo: 'Produtividade por máquina',
      periodo,
      resumo: [
        { rotulo: 'OPs concluídas', valor: soma(linhas, 'ops_concluidas'), formato: 'numero' },
        { rotulo: 'Área produzida (m²)', valor: soma(linhas, 'area_m2'), formato: 'numero' },
        { rotulo: 'Horas apontadas', valor: soma(linhas, 'horas_apontadas'), formato: 'horas' },
      ],
      grafico: { tipo: 'barras_horizontais', rotulo: 'maquina', series: [{ chave: 'ops_concluidas', titulo: 'OPs concluídas' }], formato: 'numero' },
      colunas: [
        col('maquina', 'Máquina'),
        col('ops_concluidas', 'OPs concluídas', 'numero'),
        col('area_m2', 'Área (m²)', 'numero'),
        col('horas_estimadas', 'Horas estimadas', 'horas'),
        col('horas_apontadas', 'Horas apontadas', 'horas'),
        col('produzido', 'Qtd. apontada', 'numero'),
      ],
      linhas,
    })
  }

  if (visao === 'perdas') {
    const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT pr.nome AS produto, COUNT(DISTINCT a.op_id) AS ops, SUM(a.quantidade_produzida) AS produzido, SUM(a.perda) AS perda,
             CASE WHEN SUM(a.quantidade_produzida + a.perda) = 0 THEN 0 ELSE 100.0 * SUM(a.perda) / SUM(a.quantidade_produzida + a.perda) END AS percentual
      FROM op_apontamentos a JOIN ordens_producao op ON op.id = a.op_id JOIN pedido_itens i ON i.id = op.pedido_item_id JOIN produtos pr ON pr.id = i.produto_id
      WHERE ${noPeriodo(Prisma.sql`a.inicio`, de, ate)} GROUP BY pr.nome ORDER BY 4 DESC`)
    const produzido = soma(linhas, 'produzido')
    const perda = soma(linhas, 'perda')
    return relatorio({
      titulo: 'Perdas na produção',
      periodo,
      resumo: [
        { rotulo: 'Produzido (apontado)', valor: produzido, formato: 'numero' },
        { rotulo: 'Perda', valor: perda, formato: 'numero' },
        { rotulo: 'Perda sobre o total', valor: produzido + perda ? n((perda / (produzido + perda)) * 100) : 0, formato: 'percentual' },
      ],
      grafico: { tipo: 'barras_horizontais', rotulo: 'produto', series: [{ chave: 'percentual', titulo: 'Perda (%)' }], formato: 'percentual' },
      colunas: [col('produto', 'Produto'), col('ops', 'OPs', 'numero'), col('produzido', 'Produzido', 'numero'), col('perda', 'Perda', 'numero'), col('percentual', 'Perda (%)', 'percentual')],
      linhas,
      observacao: 'Baseado nos apontamentos de produção (quantidade e perda informadas pelo operador).',
    })
  }

  const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT ${ROTULO_ETAPA} AS etapa, COUNT(*) AS passagens, AVG(segundos_na_etapa) / 3600.0 AS media_horas, SUM(segundos_na_etapa) / 3600.0 AS total_horas
    FROM op_etapas_historico WHERE etapa_de IS NOT NULL AND ${noPeriodo(Prisma.sql`created_at`, de, ate)}
    GROUP BY etapa_de ORDER BY array_position(ARRAY['fila', 'pre_impressao', 'impressao', 'acabamento', 'conferencia']::text[], etapa_de::text)`)
  return relatorio({
    titulo: 'Tempo por etapa',
    periodo,
    resumo: [
      { rotulo: 'Passagens de etapa', valor: soma(linhas, 'passagens'), formato: 'numero' },
      { rotulo: 'Horas somadas', valor: soma(linhas, 'total_horas'), formato: 'horas' },
    ],
    grafico: { tipo: 'barras', rotulo: 'etapa', series: [{ chave: 'media_horas', titulo: 'Média (h)' }], formato: 'horas' },
    colunas: [col('etapa', 'Etapa'), col('passagens', 'OPs que passaram', 'numero'), col('media_horas', 'Tempo médio', 'horas'), col('total_horas', 'Tempo total', 'horas')],
    linhas,
    observacao: 'Tempo que as OPs ficaram em cada etapa antes de serem movidas no kanban.',
  })
}
