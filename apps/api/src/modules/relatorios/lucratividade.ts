import { Prisma, type PrismaClient } from '@prisma/client'
import { Decimal, analisarPreco, type LinhaLucratividade, type LucratividadeQuery, type ParametrosPreco, type RelatorioLucratividade } from '@onprint/shared'
import { parametrosPreco } from '../produtos/custos'
import { noPeriodo } from './comum'

type Num = { toString(): string } | string | number | null | undefined
const dec = (v: Num) => new Decimal(v === null || v === undefined ? 0 : v.toString())

interface Agregado {
  id: string
  titulo: string
  subtitulo: string | null
  receita: Num
  custo: Num
  real: Num | null
  lucroMinimo: Num
}

/** Uma linha: despesas sobre o preço, lucro e situação pelo custo ESTIMADO (o real de materiais é comparativo). */
export function linhaLucratividade(a: Agregado, par: ParametrosPreco): LinhaLucratividade {
  const receita = dec(a.receita).toFixed(2)
  const custoEstimado = dec(a.custo).toFixed(2)
  const r = analisarPreco(receita, custoEstimado, par.percentuais, a.lucroMinimo?.toString() ?? par.lucroMinimoPadrao)
  return {
    id: a.id,
    titulo: a.titulo,
    subtitulo: a.subtitulo,
    receita,
    custoEstimado,
    custoMateriaisReal: a.real === null || a.real === undefined ? null : dec(a.real).toFixed(2),
    despesas: r.despesasSobrePreco,
    lucro: r.lucro,
    lucroPercentual: r.lucroPercentual,
    situacao: r.situacao,
  }
}

/**
 * Totais do relatório: receita e custos somam todas as linhas; lucro, % e situação só as que têm custo
 * informado — venda sem custo apareceria como 100% de lucro e inflaria o resultado (vai em `semCusto`).
 * O real de materiais soma só as linhas que tiveram baixa (null se nenhuma teve).
 */
export function totaisLucratividade(linhas: LinhaLucratividade[], par: ParametrosPreco): Pick<RelatorioLucratividade, 'totais' | 'semCusto'> {
  const soma = (ls: LinhaLucratividade[], f: (l: LinhaLucratividade) => string | null) => ls.reduce((s, l) => s.plus(f(l) ?? 0), new Decimal(0))
  const comCusto = linhas.filter((l) => l.situacao !== 'sem_custo')
  const semCusto = linhas.filter((l) => l.situacao === 'sem_custo')
  const comReal = linhas.filter((l) => l.custoMateriaisReal !== null)
  const t = linhaLucratividade({ id: '', titulo: '', subtitulo: null, receita: soma(comCusto, (l) => l.receita), custo: soma(comCusto, (l) => l.custoEstimado), real: null, lucroMinimo: null }, par)
  return {
    totais: {
      receita: soma(linhas, (l) => l.receita).toFixed(2),
      custoEstimado: soma(linhas, (l) => l.custoEstimado).toFixed(2),
      custoMateriaisReal: comReal.length ? soma(comReal, (l) => l.custoMateriaisReal).toFixed(2) : null,
      despesas: t.despesas,
      lucro: t.lucro,
      lucroPercentual: t.lucroPercentual,
      situacao: comCusto.length ? t.situacao : 'sem_custo',
    },
    semCusto: { quantidade: semCusto.length, receita: soma(semCusto, (l) => l.receita).toFixed(2) },
  }
}

/**
 * Lucratividade (fase 3 da precificação): pedidos não cancelados com data no período. Receita = total dos itens;
 * custo estimado = soma do `custoEstimado` dos itens; custo real de materiais = baixas `consumo_producao` ligadas
 * ao pedido (por produto: às OPs do produto) × custo da movimentação; despesas = receita × (impostos + comissão +
 * custo fixo %); lucro, % e situação pelo lucro mínimo (do produto, por produto; da empresa, por pedido).
 */
export async function relatorioLucratividade(prisma: PrismaClient, q: Required<Pick<LucratividadeQuery, 'inicio' | 'fim'>> & { agrupar: 'pedido' | 'produto' }): Promise<RelatorioLucratividade> {
  const par = parametrosPreco(await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } }))
  const pedidosDoPeriodo = Prisma.sql`SELECT p.id FROM pedidos p WHERE p.status <> 'cancelado' AND ${noPeriodo(Prisma.sql`p.created_at`, q.inicio, q.fim)}`

  let agregados: Agregado[]
  if (q.agrupar === 'produto') {
    const linhas = await prisma.$queryRaw<{ id: string; nome: string; codigo: string; lucro_minimo: Prisma.Decimal | null; receita: Prisma.Decimal; custo: Prisma.Decimal; real: Prisma.Decimal | null }[]>(Prisma.sql`
      WITH itens AS (
        SELECT i.produto_id, SUM(i.total) AS receita, SUM(i.custo_estimado) AS custo
        FROM pedido_itens i WHERE i.pedido_id IN (${pedidosDoPeriodo}) GROUP BY 1
      ), reais AS (
        SELECT i.produto_id, SUM(-m.quantidade * m.custo_unitario) AS real
        FROM estoque_movimentacoes m
        JOIN ordens_producao o ON o.id = m.op_id
        JOIN pedido_itens i ON i.id = o.pedido_item_id
        WHERE m.tipo = 'consumo_producao' AND i.pedido_id IN (${pedidosDoPeriodo}) GROUP BY 1
      )
      SELECT pr.id, pr.nome, pr.codigo, pr.lucro_minimo, it.receita, it.custo, r.real
      FROM itens it JOIN produtos pr ON pr.id = it.produto_id LEFT JOIN reais r ON r.produto_id = it.produto_id
      ORDER BY it.receita DESC, pr.nome`)
    agregados = linhas.map((l) => ({ id: l.id, titulo: l.nome, subtitulo: l.codigo, receita: l.receita, custo: l.custo, real: l.real, lucroMinimo: l.lucro_minimo }))
  } else {
    const linhas = await prisma.$queryRaw<{ id: string; numero: string; cliente: string; receita: Prisma.Decimal; custo: Prisma.Decimal; real: Prisma.Decimal | null }[]>(Prisma.sql`
      WITH itens AS (
        SELECT i.pedido_id, SUM(i.total) AS receita, SUM(i.custo_estimado) AS custo
        FROM pedido_itens i WHERE i.pedido_id IN (${pedidosDoPeriodo}) GROUP BY 1
      ), reais AS (
        SELECT m.pedido_id, SUM(-m.quantidade * m.custo_unitario) AS real
        FROM estoque_movimentacoes m WHERE m.tipo = 'consumo_producao' AND m.pedido_id IN (${pedidosDoPeriodo}) GROUP BY 1
      )
      SELECT p.id, p.numero, c.nome AS cliente, it.receita, it.custo, r.real
      FROM itens it JOIN pedidos p ON p.id = it.pedido_id JOIN clientes c ON c.id = p.cliente_id LEFT JOIN reais r ON r.pedido_id = p.id
      ORDER BY p.created_at, p.numero`)
    agregados = linhas.map((l) => ({ id: l.id, titulo: l.numero, subtitulo: l.cliente, receita: l.receita, custo: l.custo, real: l.real, lucroMinimo: null }))
  }
  const linhas = agregados.map((a) => linhaLucratividade(a, par))
  return { linhas, ...totaisLucratividade(linhas, par) }
}
