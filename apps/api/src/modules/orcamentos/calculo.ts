import type { Prisma, PrismaClient } from '@prisma/client'
import {
  Decimal,
  MODO_CALCULO_SUFIXO,
  acaoRegraSchema,
  aplicarRegras,
  calcularPreco,
  condicoesRegraSchema,
  custoDoAcabamento,
  hojeISO,
  type CustoVenda,
  type ItemParaRegras,
  type OrigemOrcamento,
  type ParametrosPreco,
  type RegraComercialMotor,
  type ResultadoRegras,
  type orcamentoItemSchema,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { acabamentoParaCusto, custoDoItemVendido, parametrosPreco } from '../produtos/custos'
import { incluirAcabamentoCusto, incluirComposicao } from '../produtos/custos.service'

type ItemEntrada = z.output<typeof orcamentoItemSchema>
type Db = PrismaClient | Prisma.TransactionClient

export interface ItemCalculado {
  produtoId: string
  descricao: string
  quantidade: string
  largura: string | null
  altura: string | null
  areaM2: string
  precoUnitario: string
  valorProduto: string
  valorAcabamentos: string
  /** Desconto manual (limitado ao valor do item) */
  desconto: string
  /** Regras comerciais no item, com sinal (0 até aplicarRegrasNoCalculo) */
  ajusteRegras: string
  total: string
  /** Custo direto com as medidas reais (composição + acabamentos com insumos) */
  custoEstimado: string
  /** Linhas do custo direto (JSON `custo_detalhe`) */
  custoDetalhe: CustoVenda
  prazoDias: number
  ordem: number
  observacao: string | null
  /** Espera a arte antes de produzir: o que o vendedor marcou no item ou, sem marcação, o padrão do produto */
  precisaArte: boolean
  precoLiberadoPorId: string | null
  acabamentos: { acabamentoId: string; nome: string; tipoCobranca: Prisma.AcabamentoCreateInput['tipoCobranca']; valorUnitario: string; base: string; valor: string; custo: string }[]
}

export interface Recalculo {
  itens: ItemCalculado[]
  subtotal: string
  custoEstimado: string
  prazoDias: number
  /** Precificação da empresa usada (percentuais, rateio, lucro mínimo) */
  parametros: ParametrosPreco
  /** Lucro mínimo de cada item (o do produto; null = o da empresa), na ordem dos itens */
  lucrosMinimos: (string | null)[]
  /** O que o motor das regras comerciais precisa de cada item (categoria, preço de tabela, quantidade cobrada…) */
  paraRegras: ItemParaRegras[]
}

/**
 * Recalcula todos os itens com os dados do banco (preço, medidas máximas, acabamentos, área mínima).
 * Os valores enviados pelo front são ignorados — vale sempre este cálculo (seção 9).
 * Preço: `calcularPreco` (área mínima de cobrança); custo: `custoDaVenda` com as medidas REAIS (fase 3 da
 * precificação) — composição do produto e insumos dos acabamentos ao custo atual.
 */
export async function recalcularItens(
  db: Db,
  itens: ItemEntrada[],
  ctx: { usuarioId: string; podeAprovar: boolean },
): Promise<Recalculo> {
  // Tudo em lote: produtos (com a composição), acabamentos (com os insumos) e a configuração da empresa
  const produtos = await db.produto.findMany({
    where: { id: { in: [...new Set(itens.map((i) => i.produtoId))] } },
    include: { acabamentos: true, ...incluirComposicao },
  })
  const idsAcab = new Set(itens.flatMap((i) => i.acabamentoIds))
  for (const p of produtos) for (const pa of p.acabamentos) if (pa.obrigatorio) idsAcab.add(pa.acabamentoId)
  const acabamentos = await db.acabamento.findMany({ where: { id: { in: [...idsAcab] } }, include: incluirAcabamentoCusto })
  const empresa = await db.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
  const parametros = parametrosPreco(empresa)

  const paraRegras: ItemParaRegras[] = []
  const calculados = itens.map((item, indice): ItemCalculado => {
    const rotulo = `Item ${indice + 1}`
    const produto = produtos.find((p) => p.id === item.produtoId)
    if (!produto?.ativo || produto.tipo === 'insumo') throw AppError.regraNegocio(`${rotulo}: produto inválido ou desativado.`)

    // Obrigatórios do produto sempre entram
    const ids = [...new Set([...produto.acabamentos.filter((a) => a.obrigatorio).map((a) => a.acabamentoId), ...item.acabamentoIds])]
    const acabs = ids.map((id) => {
      const a = acabamentos.find((x) => x.id === id)
      if (!a?.ativo) throw AppError.regraNegocio(`${rotulo}: acabamento inválido ou desativado.`)
      return a
    })

    const preco = item.precoUnitario ?? produto.precoVenda.toString()
    const r = calcularPreco({
      modoCalculo: produto.modoCalculo,
      precoUnitario: preco,
      custoUnitario: produto.custo.toString(),
      precoMinimo: produto.precoMinimo?.toString(),
      quantidade: item.quantidade,
      largura: item.largura,
      altura: item.altura,
      areaMinimaM2: empresa?.areaMinimaM2.toString(),
      medidasMaximas: { largura: produto.larguraMaxima?.toString(), altura: produto.alturaMaxima?.toString() },
      acabamentos: acabs.map((a) => ({ id: a.id, nome: a.nome, tipoCobranca: a.tipoCobranca, valor: a.valor.toString(), custo: a.custo.toString() })),
    })
    if (!r.ok) throw AppError.regraNegocio(`${rotulo} (${produto.nome}): ${r.erros.join(' ')}`, { item: indice, erros: r.erros })
    if (r.abaixoDoMinimo && !ctx.podeAprovar) {
      throw AppError.regraNegocio(
        `${rotulo} (${produto.nome}): preço abaixo do mínimo exige aprovação de um gerente.`,
        { item: indice, motivo: 'PRECO_ABAIXO_MINIMO' },
      )
    }

    // Custo com as medidas reais (a área mínima é só cobrança)
    const medidas = { quantidade: item.quantidade, largura: item.largura, altura: item.altura }
    const custo = custoDoItemVendido(produto, acabs, medidas, parametros)

    const bruto = new Decimal(r.total)
    const desconto = Decimal.min(new Decimal(item.desconto), bruto)
    paraRegras.push({
      produtoId: produto.id,
      categoriaId: produto.categoriaId,
      descricao: item.descricao || produto.nome,
      quantidade: item.quantidade,
      quantidadeCobrada: r.quantidadeCobrada,
      precoUnitario: preco,
      precoCatalogo: produto.precoVenda.toString(),
      precoMinimo: produto.precoMinimo?.toString() ?? null,
      valorProduto: r.valorProduto,
      valorAcabamentos: r.valorAcabamentos,
      desconto: item.desconto,
      unidade: MODO_CALCULO_SUFIXO[produto.modoCalculo],
    })
    return {
      produtoId: produto.id,
      descricao: item.descricao || produto.nome,
      quantidade: item.quantidade,
      largura: item.largura ?? null,
      altura: item.altura ?? null,
      areaM2: produto.modoCalculo === 'm2' ? r.quantidadeCobrada : new Decimal(r.areaUnitaria).mul(item.quantidade).toFixed(3),
      precoUnitario: new Decimal(preco).toFixed(2),
      valorProduto: r.valorProduto,
      valorAcabamentos: r.valorAcabamentos,
      desconto: desconto.toFixed(2),
      ajusteRegras: '0.00',
      total: bruto.minus(desconto).toFixed(2),
      custoEstimado: custo.custoDireto,
      custoDetalhe: custo,
      prazoDias: produto.prazoProducaoDias + Math.max(0, ...acabs.map((a) => a.prazoAdicionalDias)),
      ordem: indice + 1,
      observacao: item.observacao ?? null,
      precisaArte: item.precisaArte ?? produto.precisaArte,
      precoLiberadoPorId: r.abaixoDoMinimo ? ctx.usuarioId : null,
      acabamentos: r.acabamentos.map((a, i) => ({
        acabamentoId: acabs[i]!.id,
        nome: a.nome,
        tipoCobranca: a.tipoCobranca,
        valorUnitario: new Decimal(acabs[i]!.valor.toString()).toFixed(2),
        base: a.base,
        valor: a.valor,
        custo: custoDoAcabamento(acabamentoParaCusto(acabs[i]!), medidas).valor,
      })),
    }
  })

  const soma = (campo: 'total' | 'custoEstimado') => calculados.reduce((s, i) => s.plus(i[campo]), new Decimal(0)).toFixed(2)
  return {
    itens: calculados,
    subtotal: soma('total'),
    custoEstimado: soma('custoEstimado'),
    prazoDias: Math.max(0, ...calculados.map((i) => i.prazoDias)),
    parametros,
    lucrosMinimos: itens.map((i) => produtos.find((p) => p.id === i.produtoId)?.lucroMinimo?.toFixed(2) ?? null),
    paraRegras,
  }
}

// ─── Regras comerciais (o sistema aplica; a IA nunca) ───

/** O orçamento além dos itens: o que as condições das regras olham */
export interface ContextoRegras {
  clienteId: string | null
  /** null = ainda sem pagamento combinado (condição de pagamento não vale) */
  pagamento: { sinalPercentual: string; parcelas: number } | null
  dataDesejada: string | null
  origem: OrigemOrcamento
  desconto: string
  acrescimo: string
  frete: string
  /** Data do orçamento (padrão: hoje em São Paulo) */
  hoje?: string
}

/** Regras ativas da empresa, na ordem; regra com JSON que não passa no schema fica de fora (nunca quebra o orçamento) */
export async function carregarRegras(db: Db, apenasAtivas = true): Promise<RegraComercialMotor[]> {
  const linhas = await db.regraComercial.findMany({ where: apenasAtivas ? { ativa: true } : {}, orderBy: [{ prioridade: 'asc' }, { nome: 'asc' }] })
  return linhas.flatMap((r) => {
    const condicoes = condicoesRegraSchema.safeParse(r.condicoes)
    const acao = acaoRegraSchema.safeParse(r.acao)
    if (!condicoes.success || !acao.success) return []
    return [{ id: r.id, nome: r.nome, ativa: r.ativa, prioridade: r.prioridade, tipo: r.tipo, condicoes: condicoes.data, acao: acao.data, combinacao: r.combinacao === 'maior' ? 'maior' : 'soma' }]
  })
}

/** Etiquetas do cliente (condição "etiqueta do cliente") */
export async function etiquetasDoCliente(db: Db, clienteId: string | null): Promise<string[]> {
  if (!clienteId) return []
  const c = await db.cliente.findUnique({ where: { id: clienteId }, select: { tags: true } })
  return c?.tags ?? []
}

/**
 * Aplica as regras comerciais ao recálculo: o ajuste de cada item entra no item (total = bruto + ajuste − desconto
 * manual) e o do orçamento volta à parte (ajusteOrcamento), com o resumo de qual regra mudou o quê. Mesma função
 * pura do editor (@onprint/shared/regras-comerciais), então a tela mostra exatamente o que será gravado.
 */
export async function aplicarRegrasNoCalculo(
  db: Db,
  calculo: Recalculo,
  ctx: ContextoRegras,
  regras?: RegraComercialMotor[],
): Promise<{ calculo: Recalculo; regras: ResultadoRegras }> {
  const [lista, etiquetas] = await Promise.all([regras ?? carregarRegras(db), etiquetasDoCliente(db, ctx.clienteId)])
  const r = aplicarRegras(
    {
      itens: calculo.paraRegras,
      clienteId: ctx.clienteId,
      etiquetasCliente: etiquetas,
      pagamento: ctx.pagamento,
      dataDesejada: ctx.dataDesejada,
      hoje: ctx.hoje ?? hojeISO(),
      origem: ctx.origem,
      desconto: ctx.desconto,
      acrescimo: ctx.acrescimo,
      frete: ctx.frete,
    },
    lista,
  )
  const itens = calculo.itens.map((item, k) => ({ ...item, ajusteRegras: r.itens[k]!.ajuste, desconto: r.itens[k]!.desconto, total: r.itens[k]!.total }))
  return { calculo: { ...calculo, itens, subtotal: r.subtotal }, regras: r }
}

/** total = subtotal − desconto + acréscimo + frete + ajuste das regras no orçamento (nunca negativo). */
export function totalDoOrcamento(subtotal: string, desconto: string, acrescimo: string, frete: string, ajusteRegras = '0'): string {
  const total = new Decimal(subtotal).minus(desconto).plus(acrescimo).plus(frete).plus(ajusteRegras)
  if (total.lt(0)) throw AppError.regraNegocio('O desconto não pode ser maior que o valor do orçamento.')
  return total.toFixed(2)
}

/** Dados de criação aninhada dos itens (orçamento ou pedido). */
export function itensParaCriar(itens: ItemCalculado[]) {
  return itens.map(({ acabamentos, custoDetalhe, ...item }) => ({
    ...item,
    custoDetalhe: custoDetalhe as unknown as Prisma.InputJsonValue,
    acabamentos: { create: acabamentos },
  }))
}
