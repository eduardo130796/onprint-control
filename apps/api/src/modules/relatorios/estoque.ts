import { Prisma } from '@prisma/client'
import type { Relatorio } from '@onprint/shared'
import { col, noPeriodo, relatorio, soma, type Contexto } from './comum'

/** Saídas que contam como consumo (produção, balcão, saída manual e perda). */
const CONSUMO = Prisma.sql`('consumo_producao', 'venda_pdv', 'saida', 'perda')`

/**
 * Estoque: posição atual (saldo × custo médio), curva ABC pelo valor consumido no período
 * (A até 80% acumulado, B até 95%, C o resto) e consumo por tipo de saída.
 */
export async function relatorioEstoque({ prisma, de, ate }: Contexto, visao: string): Promise<Relatorio> {
  const periodo = { de, ate }

  if (visao === 'abc' || visao === 'consumo') {
    const base = Prisma.sql`
      SELECT m.produto_id, m.tipo, -m.quantidade AS quantidade, -m.quantidade * m.custo_unitario AS valor
      FROM estoque_movimentacoes m WHERE m.tipo IN ${CONSUMO} AND m.quantidade < 0 AND ${noPeriodo(Prisma.sql`m.created_at`, de, ate)}
      UNION ALL
      -- Devoluções (cancelamento de venda) abatem o consumo do balcão
      SELECT m.produto_id, m.tipo, -m.quantidade, -m.quantidade * m.custo_unitario FROM estoque_movimentacoes m
      WHERE m.tipo = 'venda_pdv' AND m.quantidade > 0 AND ${noPeriodo(Prisma.sql`m.created_at`, de, ate)}`

    if (visao === 'abc') {
      const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH c AS (SELECT produto_id, SUM(quantidade) AS quantidade, SUM(valor) AS valor FROM (${base}) b GROUP BY produto_id HAVING SUM(valor) > 0),
        t AS (SELECT SUM(valor) AS total FROM c),
        r AS (SELECT c.*, 100.0 * c.valor / t.total AS participacao, 100.0 * SUM(c.valor) OVER (ORDER BY c.valor DESC, c.produto_id) / t.total AS acumulado FROM c, t)
        SELECT pr.codigo, pr.nome, r.quantidade, r.valor, r.participacao, r.acumulado,
               CASE WHEN r.acumulado - r.participacao < 80 THEN 'A' WHEN r.acumulado - r.participacao < 95 THEN 'B' ELSE 'C' END AS classe
        FROM r JOIN produtos pr ON pr.id = r.produto_id ORDER BY r.valor DESC`)
      const classe = (c: string) => linhas.filter((l) => l.classe === c).length
      return relatorio({
        titulo: 'Curva ABC do consumo',
        periodo,
        resumo: [
          { rotulo: 'Valor consumido', valor: soma(linhas, 'valor'), formato: 'moeda' },
          { rotulo: 'Itens A / B / C', valor: `${classe('A')} / ${classe('B')} / ${classe('C')}`, formato: 'texto' },
        ],
        grafico: { tipo: 'barras_horizontais', rotulo: 'nome', series: [{ chave: 'valor', titulo: 'Valor consumido' }], formato: 'moeda' },
        colunas: [col('classe', 'Classe'), col('codigo', 'Código'), col('nome', 'Produto'), col('quantidade', 'Quantidade', 'numero'), col('valor', 'Valor', 'moeda'), col('participacao', 'Participação', 'percentual'), col('acumulado', 'Acumulado', 'percentual')],
        linhas,
        observacao: 'Valor = quantidade consumida × custo médio no momento da saída. A: até 80% do valor acumulado; B: até 95%; C: o restante.',
      })
    }

    const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT pr.nome AS produto, u.sigla AS unidade,
             COALESCE(SUM(b.quantidade) FILTER (WHERE b.tipo = 'consumo_producao'), 0) AS producao,
             COALESCE(SUM(b.quantidade) FILTER (WHERE b.tipo = 'venda_pdv'), 0) AS balcao,
             COALESCE(SUM(b.quantidade) FILTER (WHERE b.tipo IN ('saida', 'perda')), 0) AS saidas_perdas,
             SUM(b.quantidade) AS total, SUM(b.valor) AS valor
      FROM (${base}) b JOIN produtos pr ON pr.id = b.produto_id LEFT JOIN unidades_medida u ON u.id = pr.unidade_medida_id
      GROUP BY pr.nome, u.sigla ORDER BY 7 DESC`)
    return relatorio({
      titulo: 'Consumo de estoque',
      periodo,
      resumo: [{ rotulo: 'Valor consumido', valor: soma(linhas, 'valor'), formato: 'moeda' }, { rotulo: 'Itens consumidos', valor: linhas.length, formato: 'numero' }],
      grafico: { tipo: 'barras_horizontais', rotulo: 'produto', series: [{ chave: 'valor', titulo: 'Valor' }], formato: 'moeda' },
      colunas: [col('produto', 'Produto'), col('unidade', 'Un.'), col('producao', 'Produção', 'numero'), col('balcao', 'Balcão', 'numero'), col('saidas_perdas', 'Saídas e perdas', 'numero'), col('total', 'Total', 'numero'), col('valor', 'Valor', 'moeda')],
      linhas,
    })
  }

  const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT pr.codigo, pr.nome, u.sigla AS unidade, COALESCE(SUM(s.quantidade), 0) AS saldo, pr.estoque_minimo AS minimo,
           COALESCE(SUM(s.quantidade * s.custo_medio) FILTER (WHERE s.quantidade > 0), 0) AS valor,
           CASE WHEN COALESCE(SUM(s.quantidade), 0) <= 0 THEN 'Sem estoque' WHEN COALESCE(SUM(s.quantidade), 0) <= pr.estoque_minimo THEN 'Abaixo do mínimo' ELSE 'Normal' END AS situacao
    FROM produtos pr LEFT JOIN estoque_saldos s ON s.produto_id = pr.id LEFT JOIN unidades_medida u ON u.id = pr.unidade_medida_id
    WHERE pr.controla_estoque AND pr.ativo GROUP BY pr.id, pr.codigo, pr.nome, u.sigla, pr.estoque_minimo ORDER BY 6 DESC, pr.nome`)
  return relatorio({
    titulo: 'Posição de estoque',
    periodo: null,
    resumo: [
      { rotulo: 'Valor em estoque', valor: soma(linhas, 'valor'), formato: 'moeda' },
      { rotulo: 'Itens abaixo do mínimo', valor: linhas.filter((l) => l.situacao !== 'Normal').length, formato: 'numero' },
    ],
    grafico: { tipo: 'barras_horizontais', rotulo: 'nome', series: [{ chave: 'valor', titulo: 'Valor em estoque' }], formato: 'moeda' },
    colunas: [col('codigo', 'Código'), col('nome', 'Produto'), col('unidade', 'Un.'), col('saldo', 'Saldo', 'numero'), col('minimo', 'Mínimo', 'numero'), col('valor', 'Valor', 'moeda'), col('situacao', 'Situação')],
    linhas,
    observacao: 'Posição atual (o período não se aplica).',
  })
}
