import type { Prisma, PrismaClient } from '@prisma/client'

export const UNIDADES = [
  { sigla: 'un', nome: 'Unidade' },
  { sigla: 'm²', nome: 'Metro quadrado' },
  { sigla: 'm', nome: 'Metro' },
  { sigla: 'mil', nome: 'Milheiro' },
  { sigla: 'h', nome: 'Hora' },
  { sigla: 'fl', nome: 'Folha' },
  { sigla: 'kg', nome: 'Quilo' },
  { sigla: 'l', nome: 'Litro' },
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
  const acabamento = await prisma.processo.create({ data: { nome: 'Acabamento', tempoPadraoMinutos: 20 } })
  const corte = await prisma.processo.create({ data: { nome: 'Corte e refile', tempoPadraoMinutos: 10 } })
  const sublimacao = await prisma.processo.create({ data: { nome: 'Sublimação', maquinaPadraoId: prensa.id, tempoPadraoMinutos: 5 } })
  await prisma.processo.create({ data: { nome: 'Instalação' } })

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
    prisma.produto.create({ data: { ...data, codigo: `PRD-${String(++seq).padStart(4, '0')}` } })

  // Insumos
  const lona = await produto({ nome: 'Lona 440 g (rolo 3,20 m)', tipo: 'insumo', modoCalculo: 'm2', custo: '9.50', unidadeMedidaId: await un('m²'), categoriaId: materiais.id, controlaEstoque: true, estoqueMinimo: '50' })
  const vinil = await produto({ nome: 'Vinil adesivo branco', tipo: 'insumo', modoCalculo: 'm2', custo: '12.00', unidadeMedidaId: await un('m²'), categoriaId: materiais.id, controlaEstoque: true, estoqueMinimo: '30' })
  const couche = await produto({ nome: 'Papel couché 300 g (folha SRA3)', tipo: 'insumo', custo: '1.20', unidadeMedidaId: await un('fl'), categoriaId: materiais.id, controlaEstoque: true, estoqueMinimo: '500' })
  const canecaBranca = await produto({ nome: 'Caneca branca para sublimação', tipo: 'insumo', custo: '8.00', unidadeMedidaId: await un('un'), categoriaId: materiais.id, controlaEstoque: true, estoqueMinimo: '24' })

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
  const adesivo = await produto({
    nome: 'Adesivo vinil impresso',
    modoCalculo: 'm2',
    precoVenda: '70.00',
    custo: '28.00',
    margem: '150',
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
    precoVenda: '35.00',
    custo: '12.00',
    margem: '191.67',
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
      { produtoId: cartao.id, insumoId: couche.id, quantidade: '0.0417', base: 'por_unidade', perdaPercentual: '3' },
      { produtoId: caneca.id, insumoId: canecaBranca.id, quantidade: '1', base: 'por_unidade', perdaPercentual: '2' },
    ],
  })
  await prisma.produtoProcesso.createMany({
    data: [
      { produtoId: banner.id, processoId: impressao.id, maquinaId: plotter.id, ordem: 1 },
      { produtoId: banner.id, processoId: acabamento.id, ordem: 2 },
      { produtoId: adesivo.id, processoId: impressao.id, maquinaId: plotter.id, ordem: 1 },
      { produtoId: adesivo.id, processoId: corte.id, ordem: 2 },
      { produtoId: cartao.id, processoId: impressao.id, maquinaId: laser.id, ordem: 1 },
      { produtoId: cartao.id, processoId: corte.id, ordem: 2 },
      { produtoId: caneca.id, processoId: sublimacao.id, maquinaId: prensa.id, ordem: 1 },
    ],
  })

  // A próxima numeração automática de produto continua de onde o exemplo parou
  await prisma.numeracao.upsert({
    where: { entidade_ano: { entidade: 'produto', ano: 0 } },
    update: { ultimoNumero: seq },
    create: { entidade: 'produto', prefixo: 'PRD', ano: 0, ultimoNumero: seq },
  })
  return true
}
