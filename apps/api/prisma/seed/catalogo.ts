import type { Prisma, PrismaClient } from '@prisma/client'
import { custoPorUnidadeDeUso, markupParaLucro } from '@onprint/shared'
import { parametrosPreco, referenciaDoProduto } from '../../src/modules/produtos/custos'
import { incluirComposicao } from '../../src/modules/produtos/custos.service'

export const UNIDADES = [
  { sigla: 'un', nome: 'Unidade' },
  { sigla: 'm²', nome: 'Metro quadrado' },
  { sigla: 'm', nome: 'Metro' },
  { sigla: 'mil', nome: 'Milheiro' },
  { sigla: 'h', nome: 'Hora' },
  { sigla: 'fl', nome: 'Folha' },
  { sigla: 'kg', nome: 'Quilo' },
  { sigla: 'l', nome: 'Litro' },
  { sigla: 'ml', nome: 'Mililitro' },
  { sigla: 'rl', nome: 'Rolo' },
  { sigla: 'cx', nome: 'Caixa' },
]

/**
 * Catálogo de exemplo para testar o fluxo (só é criado se ainda não houver nenhum produto).
 * Inclui o banner usado no critério de aceite da Fase 2: 2×1 m + ilhós + bainha = R$ 160,00.
 */
export async function criarCatalogoExemplo(prisma: PrismaClient) {
  if ((await prisma.produto.count()) > 0) return false

  const un = async (sigla: string) => (await prisma.unidadeMedida.findUniqueOrThrow({ where: { sigla } })).id
  const categoria = (nome: string, paiId?: string) => prisma.categoria.create({ data: { nome, paiId } })

  const comVisual = await categoria('Comunicação visual')
  const banners = await categoria('Banners e lonas', comVisual.id)
  const adesivos = await categoria('Adesivos', comVisual.id)
  const grafica = await categoria('Gráfica rápida')
  const personalizados = await categoria('Personalizados')
  const servicos = await categoria('Serviços')
  const materiais = await categoria('Materiais (insumos)')

  const plotter = await prisma.maquina.create({
    data: { nome: 'Plotter eco-solvente 1,60 m', tipo: 'Impressora de grande formato', larguraUtil: '1.6', velocidadeM2Hora: '12', custoHora: '45' },
  })
  const laser = await prisma.maquina.create({ data: { nome: 'Impressora laser colorida', tipo: 'Impressão digital', custoHora: '30' } })
  const prensa = await prisma.maquina.create({ data: { nome: 'Prensa térmica de caneca', tipo: 'Sublimação', custoHora: '15' } })

  const impressao = await prisma.processo.create({ data: { nome: 'Impressão digital', maquinaPadraoId: plotter.id } })
  const acabamento = await prisma.processo.create({ data: { nome: 'Acabamento', tempoPadraoMinutos: 20, custoHora: '25' } })
  const corte = await prisma.processo.create({ data: { nome: 'Corte e refile', tempoPadraoMinutos: 10, custoHora: '25' } })
  const sublimacao = await prisma.processo.create({ data: { nome: 'Sublimação', maquinaPadraoId: prensa.id, tempoPadraoMinutos: 5 } })
  await prisma.processo.create({ data: { nome: 'Instalação', custoHora: '40' } })

  const ilhos = await prisma.acabamento.create({
    data: { nome: 'Ilhós a cada 50 cm', tipoCobranca: 'por_perimetro', valor: '2.00', custo: '0.60' },
  })
  const bainha = await prisma.acabamento.create({ data: { nome: 'Bainha', tipoCobranca: 'por_perimetro', valor: '3.00', custo: '1.00' } })
  const bastao = await prisma.acabamento.create({
    data: { nome: 'Bastão e cordão', tipoCobranca: 'por_metro_linear', valor: '12.00', custo: '4.00', prazoAdicionalDias: 1 },
  })
  const laminacao = await prisma.acabamento.create({ data: { nome: 'Laminação fosca', tipoCobranca: 'por_m2', valor: '15.00', custo: '6.00' } })
  await prisma.acabamento.create({ data: { nome: 'Criação de arte', tipoCobranca: 'fixo', valor: '50.00', prazoAdicionalDias: 1 } })
  await prisma.acabamento.create({ data: { nome: 'Embalagem individual', tipoCobranca: 'por_unidade', valor: '1.50', custo: '0.50' } })

  let seq = 0
  const produto = (data: Omit<Prisma.ProdutoUncheckedCreateInput, 'codigo'>) =>
    prisma.produto.create({
      data: {
        ...data,
        // Margem antiga (markup) → lucro sobre o preço, como na migração
        lucroDesejado: data.lucroDesejado ?? (data.margem ? markupParaLucro(data.margem.toString()) : undefined),
        codigo: `PRD-${String(++seq).padStart(4, '0')}`,
      },
    })

  // Insumos: custo por unidade de uso = preço da embalagem ÷ o que vem nela
  const insumo = (data: Omit<Prisma.ProdutoUncheckedCreateInput, 'codigo' | 'tipo' | 'custo'> & { precoEmbalagem: string }, fator: number) =>
    produto({ ...data, tipo: 'insumo', categoriaId: materiais.id, controlaEstoque: true, custo: custoPorUnidadeDeUso(data.precoEmbalagem, fator) ?? '0' })
  const lona = await insumo(
    { nome: 'Lona 440 g (rolo 3,20 m)', modoCalculo: 'm2', unidadeMedidaId: await un('m²'), estoqueMinimo: '50', embalagem: 'rolo', embalagemLargura: '3.2', embalagemComprimento: '50', precoEmbalagem: '1450.00' },
    3.2 * 50,
  )
  const vinil = await insumo(
    { nome: 'Vinil adesivo branco', modoCalculo: 'm2', unidadeMedidaId: await un('m²'), estoqueMinimo: '30', embalagem: 'rolo', embalagemLargura: '1.27', embalagemComprimento: '50', precoEmbalagem: '762.00' },
    1.27 * 50,
  )
  const couche = await insumo({ nome: 'Papel couché 300 g (folha SRA3)', unidadeMedidaId: await un('fl'), estoqueMinimo: '500', embalagem: 'pacote', embalagemConteudo: '125', precoEmbalagem: '150.00' }, 125)
  const canecaBranca = await insumo({ nome: 'Caneca branca para sublimação', unidadeMedidaId: await un('un'), estoqueMinimo: '24', embalagem: 'caixa', embalagemConteudo: '36', precoEmbalagem: '288.00' }, 36)
  const tinta = await insumo({ nome: 'Tinta eco-solvente (galão 5 l)', unidadeMedidaId: await un('ml'), estoqueMinimo: '2000', embalagem: 'galao', embalagemConteudo: '5000', precoEmbalagem: '450.00' }, 5000)
  await insumo({ nome: 'Ilhós latão nº 0', unidadeMedidaId: await un('un'), estoqueMinimo: '500', embalagem: 'caixa', embalagemConteudo: '1000', precoEmbalagem: '60.00' }, 1000)

  // Produtos e serviços
  const banner = await produto({
    nome: 'Banner em lona 440 g',
    tipo: 'produto',
    modoCalculo: 'm2',
    precoVenda: '65.00',
    custo: '25.00',
    margem: '160',
    precoMinimo: '55.00',
    larguraMaxima: '3.2',
    alturaMaxima: '50',
    prazoProducaoDias: 2,
    unidadeMedidaId: await un('m²'),
    categoriaId: banners.id,
  })
  // Adesivo e caneca: custo montado pela composição (materiais + produção), recalculado no fim
  const adesivo = await produto({
    nome: 'Adesivo vinil impresso',
    modoCalculo: 'm2',
    modoCusto: 'composicao',
    precoVenda: '70.00',
    custo: '0',
    lucroDesejado: '50',
    precoMinimo: '60.00',
    larguraMaxima: '1.5',
    alturaMaxima: '50',
    prazoProducaoDias: 2,
    unidadeMedidaId: await un('m²'),
    categoriaId: adesivos.id,
  })
  const cartao = await produto({
    nome: 'Cartão de visita 4×4 couché 300 g',
    modoCalculo: 'milheiro',
    precoVenda: '120.00',
    custo: '45.00',
    margem: '166.67',
    prazoProducaoDias: 3,
    unidadeMedidaId: await un('mil'),
    categoriaId: grafica.id,
  })
  const caneca = await produto({
    nome: 'Caneca personalizada',
    modoCalculo: 'unidade',
    modoCusto: 'composicao',
    precoVenda: '35.00',
    custo: '0',
    lucroDesejado: '50',
    prazoProducaoDias: 2,
    unidadeMedidaId: await un('un'),
    categoriaId: personalizados.id,
  })
  await produto({
    nome: 'Instalação',
    tipo: 'servico',
    modoCalculo: 'hora',
    precoVenda: '90.00',
    custo: '40.00',
    margem: '125',
    unidadeMedidaId: await un('h'),
    categoriaId: servicos.id,
  })

  await prisma.produtoAcabamento.createMany({
    data: [
      { produtoId: banner.id, acabamentoId: ilhos.id, padrao: true },
      { produtoId: banner.id, acabamentoId: bainha.id, padrao: true },
      { produtoId: banner.id, acabamentoId: bastao.id },
      { produtoId: adesivo.id, acabamentoId: laminacao.id },
    ],
  })
  await prisma.produtoInsumo.createMany({
    data: [
      { produtoId: banner.id, insumoId: lona.id, quantidade: '1', base: 'por_m2', perdaPercentual: '5' },
      { produtoId: adesivo.id, insumoId: vinil.id, quantidade: '1', base: 'por_m2', perdaPercentual: '8' },
      { produtoId: adesivo.id, insumoId: tinta.id, quantidade: '10', base: 'por_m2', perdaPercentual: '5' },
      { produtoId: cartao.id, insumoId: couche.id, quantidade: '0.0417', base: 'por_unidade', perdaPercentual: '3' },
      { produtoId: caneca.id, insumoId: canecaBranca.id, quantidade: '1', base: 'por_unidade', perdaPercentual: '2' },
    ],
  })
  // Roteiro: sem minutos = tempo padrão do processo, por item; impressão por m² = pela velocidade da plotter
  await prisma.produtoProcesso.createMany({
    data: [
      { produtoId: banner.id, processoId: impressao.id, maquinaId: plotter.id, ordem: 1, base: 'por_item' },
      { produtoId: banner.id, processoId: acabamento.id, ordem: 2, base: 'por_item' },
      { produtoId: adesivo.id, processoId: impressao.id, maquinaId: plotter.id, ordem: 1, base: 'por_m2', setupMinutos: '5' },
      { produtoId: adesivo.id, processoId: corte.id, ordem: 2, base: 'por_m2', minutos: '2' },
      { produtoId: cartao.id, processoId: impressao.id, maquinaId: laser.id, ordem: 1, base: 'por_item' },
      { produtoId: cartao.id, processoId: corte.id, ordem: 2, base: 'por_item' },
      { produtoId: caneca.id, processoId: sublimacao.id, maquinaId: prensa.id, ordem: 1, base: 'por_unidade', minutos: '5' },
    ],
  })
  await prisma.produtoCustoExtra.create({ data: { produtoId: caneca.id, nome: 'Caixinha para presente', valor: '1.20', base: 'por_unidade', ordem: 1 } })

  // Custo de referência das composições (o mesmo cálculo da API, sem impostos nem rateio configurados)
  for (const p of await prisma.produto.findMany({ where: { modoCusto: 'composicao' }, include: incluirComposicao })) {
    const ref = referenciaDoProduto(p, parametrosPreco(null))
    await prisma.produto.update({ where: { id: p.id }, data: { custo: ref.porUnidade, custoDetalhe: ref as unknown as Prisma.InputJsonValue, custoCalculadoEm: new Date() } })
  }

  // A próxima numeração automática de produto continua de onde o exemplo parou
  await prisma.numeracao.upsert({
    where: { entidade_ano: { entidade: 'produto', ano: 0 } },
    update: { ultimoNumero: seq },
    create: { entidade: 'produto', prefixo: 'PRD', ano: 0, ultimoNumero: seq },
  })
  return true
}
