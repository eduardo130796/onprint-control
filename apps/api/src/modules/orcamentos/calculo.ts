import type { Prisma, PrismaClient } from '@prisma/client'
import { Decimal, calcularPreco, custoDoAcabamento, type CustoVenda, type ParametrosPreco, type orcamentoItemSchema } from '@onprint/shared'
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
  desconto: string
  total: string
  /** Custo direto com as medidas reais (composição + acabamentos com insumos) */
  custoEstimado: string
  /** Linhas do custo direto (JSON `custo_detalhe`) */
  custoDetalhe: CustoVenda
  prazoDias: number
  ordem: number
  observacao: string | null
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
      total: bruto.minus(desconto).toFixed(2),
      custoEstimado: custo.custoDireto,
      custoDetalhe: custo,
      prazoDias: produto.prazoProducaoDias + Math.max(0, ...acabs.map((a) => a.prazoAdicionalDias)),
      ordem: indice + 1,
      observacao: item.observacao ?? null,
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
  }
}

/** total = subtotal − desconto + acréscimo + frete (nunca negativo). */
export function totalDoOrcamento(subtotal: string, desconto: string, acrescimo: string, frete: string): string {
  const total = new Decimal(subtotal).minus(desconto).plus(acrescimo).plus(frete)
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
