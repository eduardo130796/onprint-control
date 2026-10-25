import type { PrismaClient } from '@prisma/client'
import { Decimal, formatarMoeda, type ItemNotaCompra, type NotaCompraLida } from '@onprint/shared'
import { palavras, pontuar } from '../../integrations/ia/texto'
import type { NotaBruta } from './nfe'

/*
 * Nota de compra → o que a entrada de estoque precisa, já conciliado com o cadastro (nada é salvo aqui):
 * - fornecedor pelo CNPJ (sem cadastro: os dados da nota, para cadastrar ao confirmar);
 * - cada item com o insumo: primeiro a memória (código do produto neste fornecedor, confirmado numa entrada anterior),
 *   depois o nome parecido (marcado "confira"); sem nenhum, a pessoa escolhe ou cadastra;
 * - custo unitário com o rateio da nota (frete, IPI, ST e descontos: vNF ÷ soma dos itens), o que a gráfica pagou;
 * - parcelas das duplicatas (contas a pagar ao confirmar).
 */

/** Unidades da nota que são embalagem (rolo, caixa, pacote…): a quantidade é de embalagens, não da unidade de uso */
const UNIDADES_EMBALAGEM = /^(RL|ROL|ROLO|CX|CAIXA|PC|PCT|PACOTE|CH|CHAPA|GL|GALAO|FD|FARDO|BD|BALDE|LT|LATA|BB|BOBINA|RESMA|RS)$/i

export interface InsumoParaNota {
  id: string
  nome: string
  codigo: string
  unidade: string | null
  /** Tipo de embalagem do cadastro (rolo, chapa, pacote…; "unidade" = sem embalagem) */
  embalagem: string | null
}

/**
 * Insumo de nome parecido com a descrição da nota ("LONA FRONT 440G BRANCA ROLO" → "Lona 440 g (rolo 3,20 m)"):
 * ao menos 2 palavras do nome em comum (ou a única, em nome de uma palavra) e metade do nome; empate = nenhum (não
 * chuta entre dois parecidos).
 */
export function insumoPeloNome(descricao: string, insumos: InsumoParaNota[]): InsumoParaNota | null {
  const pedido = palavras(descricao)
  let melhor: { insumo: InsumoParaNota; nota: number } | null = null
  let empate = false
  for (const i of insumos) {
    const alvo = palavras(i.nome)
    if (!alvo.length) continue
    const pontos = pontuar(pedido, alvo)
    if (pontos < Math.min(2, alvo.length) || pontos / alvo.length < 0.5) continue
    const nota = pontos + pontos / alvo.length
    if (!melhor || nota > melhor.nota) {
      melhor = { insumo: i, nota }
      empate = false
    } else if (nota === melhor.nota) empate = true
  }
  return melhor && !empate ? melhor.insumo : null
}

export interface MemoriaNota {
  codigo: string
  produtoId: string
  emEmbalagem: boolean
}

/**
 * Concilia a nota com o cadastro (função pura: os dados do banco vêm prontos). `origem` xml = exata; foto/pdf = lida
 * pela IA, tudo com "confira".
 */
export function conciliar(
  nota: NotaBruta,
  origem: NotaCompraLida['origem'],
  cadastro: {
    fornecedor: { id: string; nome: string } | null
    insumos: InsumoParaNota[]
    memoria: MemoriaNota[]
    jaLancada: { id: string; numero: string } | null
  },
  avisosExtras: string[] = [],
): NotaCompraLida {
  const ia = origem !== 'xml'
  const avisos = [...avisosExtras]
  const totalProdutos = new Decimal(nota.totalProdutos)
  const totalNota = new Decimal(nota.totalNota)
  // Rateio: frete, impostos e descontos da nota entram no custo de cada item, na proporção do valor
  const fator = totalProdutos.gt(0) ? totalNota.div(totalProdutos) : new Decimal(1)
  const diferenca = totalNota.minus(totalProdutos)
  if (!diferenca.isZero()) {
    avisos.push(
      diferenca.gt(0)
        ? `A nota soma ${formatarMoeda(diferenca.toFixed(2))} de frete/impostos além dos produtos: entrou no custo de cada item, na proporção do valor.`
        : `A nota tem ${formatarMoeda(diferenca.abs().toFixed(2))} de desconto: saiu do custo de cada item, na proporção do valor.`,
    )
  }
  const porId = new Map(cadastro.insumos.map((i) => [i.id, i]))
  const itens: ItemNotaCompra[] = nota.itens.map((i) => {
    const lembrado = i.codigo ? cadastro.memoria.find((m) => m.codigo === i.codigo) : undefined
    const daMemoria = lembrado ? porId.get(lembrado.produtoId) : undefined
    const peloNome = daMemoria ? null : insumoPeloNome(i.descricao, cadastro.insumos)
    const insumo = daMemoria ?? peloNome
    const emEmbalagem = lembrado && daMemoria ? lembrado.emEmbalagem : Boolean(insumo && insumo.embalagem && insumo.embalagem !== 'unidade' && i.unidade && UNIDADES_EMBALAGEM.test(i.unidade))
    const custo = new Decimal(i.valorTotal).mul(fator).div(i.quantidade).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
    return {
      ...i,
      custoUnitario: custo.toFixed(4),
      insumo: insumo ? { id: insumo.id, nome: insumo.nome, codigo: insumo.codigo, unidade: insumo.unidade } : null,
      comoAchou: daMemoria ? 'memoria' : peloNome ? 'nome' : null,
      emEmbalagem,
      conferir: ia || !daMemoria,
    }
  })
  const somaParcelas = nota.parcelas.reduce((s, p) => s.plus(p.valor), new Decimal(0))
  if (nota.parcelas.length && !somaParcelas.eq(totalNota)) {
    avisos.push(`As parcelas somam ${formatarMoeda(somaParcelas.toFixed(2))} e a nota ${formatarMoeda(totalNota.toFixed(2))}: a última parcela fecha a diferença ao lançar.`)
  }
  if (cadastro.jaLancada) avisos.unshift(`Esta nota já foi lançada na entrada ${cadastro.jaLancada.numero}. Confira antes de lançar de novo.`)
  // Fornecedor novo com CNPJ: a tela mostra a linha "será cadastrado ao registrar"; sem CNPJ válido, a pessoa escolhe
  if (!cadastro.fornecedor && !nota.emitente.documento) avisos.push('Escolha o fornecedor (a nota não trouxe um CNPJ válido).')
  const semInsumo = itens.filter((i) => !i.insumo).length
  if (semInsumo) avisos.push(`${semInsumo} item(ns) sem insumo do cadastro: escolha um ou cadastre na hora.`)
  return {
    origem,
    conferir: ia,
    chave: nota.chave,
    numero: nota.numero,
    serie: nota.serie,
    emissao: nota.emissao,
    fornecedor: { cnpj: nota.emitente.documento, nome: nota.emitente.nome, fantasia: nota.emitente.fantasia, ie: nota.emitente.ie, telefone: nota.emitente.telefone, endereco: nota.emitente.endereco, existente: cadastro.fornecedor },
    itens,
    totalProdutos: totalProdutos.toFixed(2),
    totalNota: totalNota.toFixed(2),
    parcelas: nota.parcelas.map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: new Decimal(p.valor).toFixed(2) })),
    jaLancada: cadastro.jaLancada,
    avisos,
  }
}

/** Busca no banco o que a conciliação precisa (fornecedor, insumos, memória, nota repetida) e concilia */
export async function conciliarNota(prisma: PrismaClient, nota: NotaBruta, origem: NotaCompraLida['origem'], avisos: string[] = []): Promise<NotaCompraLida> {
  const fornecedor = nota.emitente.documento ? await prisma.fornecedor.findFirst({ where: { cpfCnpj: nota.emitente.documento }, select: { id: true, nome: true } }) : null
  const codigos = nota.itens.flatMap((i) => (i.codigo ? [i.codigo] : []))
  const [insumos, memoria, jaLancada] = await Promise.all([
    prisma.produto.findMany({
      where: { ativo: true, tipo: { in: ['insumo', 'revenda'] } },
      select: { id: true, nome: true, codigo: true, embalagem: true, unidadeMedida: { select: { sigla: true } } },
      orderBy: { nome: 'asc' },
      take: 2000,
    }),
    fornecedor && codigos.length ? prisma.fornecedorProduto.findMany({ where: { fornecedorId: fornecedor.id, codigo: { in: codigos } }, select: { codigo: true, produtoId: true, emEmbalagem: true } }) : [],
    fornecedor && nota.numero ? prisma.estoqueEntrada.findFirst({ where: { fornecedorId: fornecedor.id, notaFiscal: nota.numero }, select: { id: true, numero: true } }) : null,
  ])
  return conciliar(
    nota,
    origem,
    {
      fornecedor,
      insumos: insumos.map((i) => ({ id: i.id, nome: i.nome, codigo: i.codigo, unidade: i.unidadeMedida?.sigla ?? null, embalagem: i.embalagem })),
      memoria,
      jaLancada,
    },
    avisos,
  )
}
