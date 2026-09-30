import { Prisma } from '@prisma/client'
import { hojeISO, type Relatorio } from '@onprint/shared'
import { col, n, relatorio, soma, type Contexto } from './comum'

/**
 * Financeiro (regime de caixa, pelos movimentos realizados; transferências ficam de fora):
 * DRE simplificado por categoria, inadimplência (títulos vencidos hoje) e fluxo mensal.
 * Estornos entram com sinal contrário na mesma categoria, então se anulam.
 */
export async function relatorioFinanceiro({ prisma, de, ate }: Contexto, visao: string): Promise<Relatorio> {
  const periodo = { de, ate }
  const movs = Prisma.sql`movimentos_financeiros m WHERE m.transferencia_id IS NULL AND m.data BETWEEN ${de}::date AND ${ate}::date`

  if (visao === 'inadimplencia') {
    const hoje = hojeISO()
    const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT c.nome AS cliente, COUNT(*) AS titulos, SUM(t.valor - t.valor_pago) AS saldo, MAX(${hoje}::date - t.vencimento) AS maior_atraso,
             COALESCE(SUM(t.valor - t.valor_pago) FILTER (WHERE ${hoje}::date - t.vencimento <= 30), 0) AS ate_30,
             COALESCE(SUM(t.valor - t.valor_pago) FILTER (WHERE ${hoje}::date - t.vencimento BETWEEN 31 AND 60), 0) AS de_31_60,
             COALESCE(SUM(t.valor - t.valor_pago) FILTER (WHERE ${hoje}::date - t.vencimento BETWEEN 61 AND 90), 0) AS de_61_90,
             COALESCE(SUM(t.valor - t.valor_pago) FILTER (WHERE ${hoje}::date - t.vencimento > 90), 0) AS acima_90
      FROM contas_receber t JOIN clientes c ON c.id = t.cliente_id
      WHERE t.status IN ('aberto', 'parcial', 'vencido') AND t.vencimento < ${hoje}::date
      GROUP BY c.nome ORDER BY 3 DESC`)
    return relatorio({
      titulo: 'Inadimplência',
      periodo: null,
      resumo: [
        { rotulo: 'Total vencido', valor: soma(linhas, 'saldo'), formato: 'moeda' },
        { rotulo: 'Clientes em atraso', valor: linhas.length, formato: 'numero' },
        { rotulo: 'Acima de 90 dias', valor: soma(linhas, 'acima_90'), formato: 'moeda' },
      ],
      grafico: { tipo: 'barras_horizontais', rotulo: 'cliente', series: [{ chave: 'saldo', titulo: 'Em atraso' }], formato: 'moeda' },
      colunas: [
        col('cliente', 'Cliente'),
        col('titulos', 'Títulos', 'numero'),
        col('saldo', 'Em atraso', 'moeda'),
        col('maior_atraso', 'Maior atraso (dias)', 'numero'),
        col('ate_30', 'Até 30 dias', 'moeda'),
        col('de_31_60', '31–60', 'moeda'),
        col('de_61_90', '61–90', 'moeda'),
        col('acima_90', '+90', 'moeda'),
      ],
      linhas,
      observacao: 'Situação de hoje: títulos a receber em aberto com vencimento anterior a hoje (o período não se aplica).',
    })
  }

  if (visao === 'fluxo') {
    const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT to_char(m.data, 'YYYY-MM') AS mes,
             COALESCE(SUM(m.valor) FILTER (WHERE m.tipo = 'entrada'), 0) AS entradas,
             COALESCE(SUM(m.valor) FILTER (WHERE m.tipo = 'saida'), 0) AS saidas,
             COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE -m.valor END), 0) AS saldo
      FROM ${movs} GROUP BY 1 ORDER BY 1`)
    return relatorio({
      titulo: 'Fluxo mensal (realizado)',
      periodo,
      resumo: [
        { rotulo: 'Entradas', valor: soma(linhas, 'entradas'), formato: 'moeda' },
        { rotulo: 'Saídas', valor: soma(linhas, 'saidas'), formato: 'moeda' },
        { rotulo: 'Resultado do período', valor: soma(linhas, 'saldo'), formato: 'moeda' },
      ],
      grafico: { tipo: 'barras', rotulo: 'mes', series: [{ chave: 'entradas', titulo: 'Entradas' }, { chave: 'saidas', titulo: 'Saídas' }], formato: 'moeda' },
      colunas: [col('mes', 'Mês'), col('entradas', 'Entradas', 'moeda'), col('saidas', 'Saídas', 'moeda'), col('saldo', 'Saldo do mês', 'moeda')],
      linhas,
    })
  }

  // Receita: entradas − saídas na categoria; despesa: saídas − entradas. Sem categoria: pelo tipo do movimento.
  const natureza = Prisma.sql`COALESCE(c.tipo::text, CASE m.tipo WHEN 'entrada' THEN 'receita' ELSE 'despesa' END)`
  const linhas = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT CASE WHEN ${natureza} = 'receita' THEN 'Receitas' ELSE 'Despesas' END AS grupo,
           COALESCE(CASE WHEN p.nome IS NOT NULL THEN p.nome || ' › ' || c.nome ELSE c.nome END, 'Sem categoria') AS categoria,
           SUM(CASE WHEN ${natureza} = 'receita' THEN (CASE m.tipo WHEN 'entrada' THEN m.valor ELSE -m.valor END)
                    ELSE (CASE m.tipo WHEN 'saida' THEN m.valor ELSE -m.valor END) END) AS valor
    FROM movimentos_financeiros m
    LEFT JOIN categorias_financeiras c ON c.id = m.categoria_id LEFT JOIN categorias_financeiras p ON p.id = c.pai_id
    WHERE m.transferencia_id IS NULL AND m.data BETWEEN ${de}::date AND ${ate}::date
    GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC`)
  const receitas = soma(linhas.filter((l) => l.grupo === 'Receitas'), 'valor')
  const despesas = soma(linhas.filter((l) => l.grupo === 'Despesas'), 'valor')
  return relatorio({
    titulo: 'DRE simplificado',
    periodo,
    resumo: [
      { rotulo: 'Receitas', valor: receitas, formato: 'moeda' },
      { rotulo: 'Despesas', valor: despesas, formato: 'moeda' },
      { rotulo: 'Resultado', valor: n(receitas - despesas), formato: 'moeda' },
      { rotulo: 'Margem', valor: receitas ? n(((receitas - despesas) / receitas) * 100) : 0, formato: 'percentual' },
    ],
    grafico: { tipo: 'barras_horizontais', rotulo: 'categoria', series: [{ chave: 'valor', titulo: 'Valor' }], formato: 'moeda' },
    colunas: [col('grupo', 'Grupo'), col('categoria', 'Categoria'), col('valor', 'Valor', 'moeda')],
    linhas,
    observacao: 'Regime de caixa: considera o que entrou e saiu de fato (baixas, vendas no balcão, taxas, comissões pagas). Sangria e suprimento não entram.',
  })
}
