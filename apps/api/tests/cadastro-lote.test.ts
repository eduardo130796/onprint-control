import { Prisma, type AssistenteConfig } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { cadastroLoteSchema, itemDaLinha, type LeituraCadastroLote, type LinhaCadastro } from '@onprint/shared'
import { carregarEnv } from '../src/config/env'
import { contextoEmpresa } from '../src/core/contexto-empresa'
import { SimuladoProvider, type PedidoEstruturado, type ProvedorIA } from '../src/integrations/ia'
import { criarAssistente, type RegistroUso } from '../src/modules/assistente/assistente'
import { pedidoTabelaProdutos, precoEscrito, valoresDoTexto } from '../src/modules/assistente/prompts-catalogo'
import { pedidoProdutoDeTexto } from '../src/modules/assistente/prompts-equipe'
import { marcarLeituraCriada, prontoParaOk } from '../src/modules/assistente/produtos-whatsapp'
import { criarCadastroLote, linhasDaLeitura } from '../src/modules/produtos/cadastro-lote.service'
import { legendaDeProdutos, textoProdutosLidos } from '../src/modules/whatsapp/copiloto'

// O recálculo do custo e o código automático têm testes próprios: aqui só se confere que são chamados
const recalcularCustos = vi.fn(async () => [])
vi.mock('../src/modules/produtos/custos.service', () => ({ criarCustosService: () => ({ recalcularCustos }) }))
let codigo = 100
vi.mock('../src/modules/produtos/produtos.service', () => ({ gerarCodigoProduto: async () => `PRD-0${++codigo}` }))
vi.mock('../src/modules/assistente/cerebro', () => ({ montarCerebro: async () => ({ grafica: 'Gráfica Aurora' }) }))

const env = carregarEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://x:x@localhost:1/x', JWT_ACCESS_SECRET: 'segredo-de-teste-jwt', JWT_REFRESH_SECRET: 'segredo-de-teste-2', LOG_LEVEL: 'silent' })
const EMPRESA = { id: '11111111-1111-4111-8111-111111111111', nome: 'Gráfica Aurora', slug: 'aurora', schema: 'emp_teste' }
const naEmpresa = <T>(fn: () => Promise<T>) => contextoEmpresa.com(EMPRESA, fn)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const CATEGORIAS = [{ id: id(1), nome: 'Comunicação visual' }]
const ACABAMENTOS = [{ id: id(10), nome: 'Ilhós a cada 50 cm', tipoCobranca: 'por_perimetro' as const, valor: new Prisma.Decimal(2) }]
const PRODUTOS = [{ id: id(20), nome: 'Banner em lona 440 g' }]

describe('Leitura da tabela de preços (tarefa tabela_produtos)', () => {
  const bruto = (produtos: Record<string, unknown>[]) => ({ eh_tabela: true, produtos, ignorados: ['Pagamento no pix'] })
  const p = (o: Record<string, unknown>) => ({
    nome: 'Banner lona 440 g', tipo: 'produto', categoria: 'C1', categoria_nova: null, modo_cobranca: 'm2', preco: 65, preco_original: null,
    largura_padrao_m: null, altura_padrao_m: null, largura_maxima_m: null, altura_maxima_m: null, prazo_dias: null, precisa_arte: true, acabamentos: [], confianca: 0.9, duvida: null, ...o,
  })

  it('o preço precisa estar escrito: inventado ou calculado é descartado ("falta preço"); referências viram ids', () => {
    const pedido = pedidoTabelaProdutos({ grafica: 'Gráfica Aurora', texto: 'Banner lona 440g m² R$ 65\nPanfleto o cento R$ 35\nCaneca', categorias: CATEGORIAS, acabamentos: ACABAMENTOS })
    const l = pedido.validar(
      bruto([
        p({ acabamentos: [{ ref: 'A1', nome: 'Ilhós', tipo_cobranca: 'por_perimetro', preco: null }, { ref: null, nome: 'Bastão', tipo_cobranca: 'por_metro_linear', preco: 12 }] }),
        // 35 ÷ 100 = 0,35 (conta): fora
        p({ nome: 'Panfleto', categoria: null, categoria_nova: 'Impressos', modo_cobranca: 'unidade', preco: 0.35, preco_original: 'o cento R$ 35' }),
        p({ nome: 'Caneca', modo_cobranca: 'unidade', preco: 32 }),
        p({ nome: 'Caneca' }),
      ]),
    )
    expect(l.produtos).toHaveLength(3)
    const [banner, panfleto, caneca] = l.produtos
    expect(banner).toMatchObject({ categoriaId: id(1), precoVenda: '65.00', conferir: [], acabamentos: [{ id: id(10) }, { id: null, nome: 'Bastão', valor: null }] })
    expect(panfleto).toMatchObject({ precoVenda: null, categoriaNova: 'Impressos', conferir: ['na tabela: o cento R$ 35'] })
    expect(caneca).toMatchObject({ precoVenda: null, conferir: ['falta preço'] })
    expect(pedido).toMatchObject({ tarefa: 'tabela_produtos', tempoLimiteMs: 90_000 })
    expect(pedido.conteudo).toContain('<tabela_de_precos>')
  })

  it('foto: o preço não tem como ser conferido no texto, vai com "preço lido da imagem"', () => {
    const pedido = pedidoTabelaProdutos({ grafica: 'G', texto: null, anexo: { mediaType: 'image/png', dados: 'x', nome: 'tabela.png' }, categorias: [], acabamentos: [] })
    expect(pedido.anexos).toHaveLength(1)
    expect(pedido.validar(bruto([p({ categoria: null })])).produtos[0]).toMatchObject({ precoVenda: '65.00', conferir: ['preço lido da imagem'] })
  })

  it('valores do texto: R$, milhar e vírgula', () => {
    const v = valoresDoTexto('Banner R$ 65 · Fachada R$ 1.250,50 · cópia 0,50')
    expect(precoEscrito(65, v)).toBe(true)
    expect(precoEscrito(1250.5, v)).toBe(true)
    expect(precoEscrito(0.5, v)).toBe(true)
    expect(precoEscrito(70, v)).toBe(false)
  })

  it('produto de um texto: só o preço escrito, medidas máximas, materiais e acabamentos que faltam, vários produtos', () => {
    const pedido = pedidoProdutoDeTexto({
      grafica: 'G',
      descricao: 'adesivo de recorte, R$ 90 o m², faço até 1,20 de largura, usa vinil colorido a R$ 18 o m², com aplicação',
      categorias: [],
      unidades: [{ id: id(30), sigla: 'm²', nome: 'Metro quadrado' }],
      insumos: [],
      acabamentos: [],
      processos: [],
      maquinas: [],
    })
    const l = pedido.validar({
      nome: 'Adesivo de recorte', tipo: 'produto', categoria: null, categoria_nova: 'Adesivos', modo_cobranca: 'm2', unidade: 'U1', preco_venda: 90,
      largura_padrao_m: null, altura_padrao_m: null, largura_maxima_m: 1.2, altura_maxima_m: null, prazo_producao_dias: null, precisa_arte: true, insumos: [],
      insumos_nao_encontrados: [{ nome: 'Vinil colorido', unidade: 'm²', custo: 18, quantidade: 1, base: 'por_m2' }, { nome: 'Tinta', unidade: null, custo: 7, quantidade: 1, base: 'por_m2' }],
      etapas: [], acabamentos: [], acabamentos_novos: [{ nome: 'Aplicação', tipo_cobranca: 'por_m2', valor: 25 }], margem_percentual: null, descricao: 'Adesivo recortado.', varios_produtos: 1,
    })
    expect(l).toMatchObject({ precoVenda: 90, larguraMaxima: 1.2, variosProdutos: 1 })
    // Custo da tinta e valor da aplicação não estão no texto: ficam em branco
    expect(l.insumosFaltando).toEqual([
      { nome: 'Vinil colorido', unidadeSigla: 'm²', custo: 18, quantidade: 1, base: 'por_m2' },
      { nome: 'Tinta', unidadeSigla: null, custo: null, quantidade: 1, base: 'por_m2' },
    ])
    expect(l.acabamentosNovos).toEqual([{ nome: 'Aplicação', tipoCobranca: 'por_m2', valor: null }])
    // Preço que a pessoa não escreveu nunca passa
    expect(pedido.validar({ ...JSON.parse(JSON.stringify({})), nome: 'X1', tipo: 'produto', categoria: null, categoria_nova: null, modo_cobranca: 'm2', unidade: null, preco_venda: 99, largura_padrao_m: null, altura_padrao_m: null, prazo_producao_dias: null, precisa_arte: false, insumos: [], insumos_nao_encontrados: ['Lona'], etapas: [], acabamentos: [], margem_percentual: null, descricao: 'x x x' })).toMatchObject({ precoVenda: null, insumosFaltando: [{ nome: 'Lona', custo: null }] })
  })
})

describe('Revisão: duplicados e o "ok" pelo WhatsApp', () => {
  const atual = { categorias: CATEGORIAS, acabamentos: [{ ...ACABAMENTOS[0]!, valor: '2.00' }], produtos: PRODUTOS }
  const lido = (nome: string, extra: Record<string, unknown> = {}) => ({
    nome, tipo: 'produto' as const, categoriaId: id(1), categoriaNova: null, modoCalculo: 'm2' as const, precoVenda: '65.00', precoOriginal: null, larguraPadrao: null, alturaPadrao: null,
    larguraMaxima: null, alturaMaxima: null, prazoDias: null, precisaArte: true, acabamentos: [{ id: id(10), nome: 'Ilhós a cada 50 cm', tipoCobranca: 'por_perimetro' as const, valor: null }], conferir: [], ...extra,
  })

  it('parecido com o cadastro e repetido na própria tabela; acabamento do cadastro com o preço de lá', () => {
    const linhas = linhasDaLeitura({ ehTabela: true, ignorados: [], produtos: [lido('Banner lona 440g'), lido('Faixa lona 440g'), lido('Faixa em lona 440 g')] }, atual, 'texto')
    expect(linhas.map((l) => l.duplicado?.nome ?? null)).toEqual(['Banner em lona 440 g', null, 'Faixa lona 440g (repetido na tabela)'])
    expect(linhas[1]!.acabamentos[0]!.valor).toBe('2.00')
    expect(linhas[1]!.unidadeSigla).toBe('m²')
  })

  it('o "ok" só cria um produto claro: sem conferir, sem parecido, com preço; texto do aviso', () => {
    const [claro, parecido] = linhasDaLeitura({ ehTabela: true, ignorados: [], produtos: [lido('Chaveiro acrílico 5x3 cm', { modoCalculo: 'unidade', precoVenda: '4.00', acabamentos: [] }), lido('Banner lona 440g')] }, atual, 'whatsapp')
    const um = (l: LinhaCadastro): LeituraCadastroLote => ({ linhas: [l], avisos: [] })
    expect(prontoParaOk(um(claro!))).toBe(true)
    expect(prontoParaOk(um(parecido!))).toBe(false)
    expect(prontoParaOk(um({ ...claro!, precoVenda: null }))).toBe(false)
    expect(prontoParaOk(um({ ...claro!, conferir: ['preço lido da imagem'] }))).toBe(false)
    expect(prontoParaOk({ linhas: [claro!, claro!], avisos: [] })).toBe(false)
    expect(textoProdutosLidos(um(claro!), 'https://x/p', true)).toBe('🏷️ Novo produto: *Chaveiro acrílico 5x3 cm*\nR$ 4 / un\nResponda *ok* a esta mensagem para criar, ou confira antes:\nhttps://x/p')
    const varios = textoProdutosLidos({ linhas: [claro!, { ...parecido!, precoVenda: null }], avisos: [] }, 'https://x/p', false)
    expect(varios).toContain('🏷️ Li 2 produtos:')
    expect(varios).toContain('• Banner lona 440g — falta preço')
    expect(varios).toContain('Confira: 1 sem preço; 1 parecido(s) com os que você já tem')
    expect(varios).toContain('Confira e crie todos de uma vez (nada é criado sem você):')
  })

  it('foto com legenda de produtos não é nota', () => {
    expect(legendaDeProdutos('tabela de preços')).toBe(true)
    expect(legendaDeProdutos('Cadastra esses produtos')).toBe(true)
    expect(legendaDeProdutos('nota da lona')).toBe(false)
    expect(legendaDeProdutos(null)).toBe(false)
  })

  it('a leitura do WhatsApp vira "criada" uma vez só (o segundo "ok" falha e desfaz)', async () => {
    let situacao = 'pendente'
    const tx = { leituraProdutosWhatsapp: { updateMany: async () => (situacao === 'criada' ? { count: 0 } : ((situacao = 'criada'), { count: 1 })) } } as unknown as Prisma.TransactionClient
    await marcarLeituraCriada(tx, id(1), [id(2)])
    await expect(marcarLeituraCriada(tx, id(1), [id(2)])).rejects.toMatchObject({ statusCode: 422 })
  })
})

// ─── Criar em lote com um banco falso (grava em memória) ───

function bancoFalso() {
  const criados: Record<string, unknown[]> = { produto: [], categoria: [], acabamento: [], produtoAcabamento: [], produtoInsumo: [], auditoria: [] }
  let n = 500
  const cria = (tabela: string) => async ({ data }: { data: Record<string, unknown> }) => {
    const linha = { id: id(++n), ...data }
    criados[tabela]!.push(linha)
    return linha
  }
  const criaVarios = (tabela: string) => async ({ data }: { data: unknown[] }) => (criados[tabela]!.push(...data), { count: data.length })
  const tx = {
    produto: { create: cria('produto') },
    categoria: { create: cria('categoria') },
    acabamento: { create: cria('acabamento') },
    produtoAcabamento: { createMany: criaVarios('produtoAcabamento') },
    produtoInsumo: { createMany: criaVarios('produtoInsumo') },
    auditoria: { create: cria('auditoria') },
  }
  const prisma = {
    ...tx,
    categoria: { ...tx.categoria, findMany: async () => CATEGORIAS },
    acabamento: { ...tx.acabamento, findMany: async () => ACABAMENTOS },
    produto: { ...tx.produto, findMany: async () => PRODUTOS, count: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter((x) => x === id(40)).length },
    unidadeMedida: { findMany: async () => [{ id: id(30), sigla: 'm²' }, { id: id(31), sigla: 'un' }] },
    empresaConfig: { findFirst: async () => ({ assistenteAtivo: true, assistenteProdutos: true, nomeFantasia: 'Gráfica Aurora' }) },
    whatsappConfig: { findFirst: async () => ({ assistenteRespostas: true }) },
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  }
  return { prisma, criados }
}

function linhaCentral(): AssistenteConfig {
  const agora = new Date()
  return { id: 'cfg', ativo: true, provedor: 'simulado', modelo: 'claude-haiku-5-5', chaveCifrada: null, chaveFinal: null, limiteChamadasMes: 300, limiteUsdMes: null, precos: [], cotacaoDolar: 5.5 as never, createdAt: agora, updatedAt: agora }
}

function appFalso() {
  const banco = bancoFalso()
  const usos: RegistroUso[] = []
  const enviados: PedidoEstruturado<unknown>[] = []
  const base = new SimuladoProvider()
  const provedor: ProvedorIA = { nome: 'simulado', modelo: 'x', estruturado: (p) => (enviados.push(p as PedidoEstruturado<unknown>), base.estruturado(p)) }
  const assistente = criarAssistente({ repositorio: { config: async () => linhaCentral(), registrarUso: async (r) => void usos.push(r), usoDoMes: async () => ({ chamadas: 0, custoUsd: 0 }) }, env, log: { info: vi.fn(), warn: vi.fn() }, fabrica: () => provedor, cacheMs: 0 })
  const app = { prisma: banco.prisma, assistente, plataforma: {}, log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } } as unknown as FastifyInstance
  return { lote: criarCadastroLote(app), ...banco, usos, enviados }
}

describe('Criar vários de uma vez', () => {
  const linha = (l: Partial<LinhaCadastro>): LinhaCadastro => ({
    chave: 'x', nome: 'Caneca', tipo: 'produto', categoriaId: null, categoriaNova: null, modoCalculo: 'unidade', unidadeSigla: 'un', precoVenda: '32.00', larguraPadrao: null,
    alturaPadrao: null, larguraMaxima: null, alturaMaxima: null, prazoProducaoDias: null, precisaArte: true, acabamentos: [], materiais: [], descricao: null, conferir: [], duplicado: null, origem: 'texto', ...l,
  })

  it('cria tudo numa transação: categoria e acabamento novos uma vez só, unidade pelo modo, materiais com custo pela composição, auditoria', async () => {
    const { lote, criados } = appFalso()
    const novoAcab = { id: null, nome: 'Bastão e cordão', tipoCobranca: 'por_metro_linear' as const, valor: '12.00' }
    const dados = cadastroLoteSchema.parse({
      itens: [
        itemDaLinha(linha({ nome: 'Faixa lona', modoCalculo: 'm2', unidadeSigla: 'm²', categoriaNova: 'Lonas', acabamentos: [{ id: id(10), nome: 'Ilhós', tipoCobranca: 'por_perimetro', valor: '2.00' }, novoAcab] })),
        itemDaLinha(linha({ nome: 'Wind banner', categoriaNova: 'lonas', acabamentos: [novoAcab, { id: null, nome: 'Bainha', tipoCobranca: 'por_perimetro', valor: null }] })),
        { ...itemDaLinha(linha({ nome: 'Caneca branca', categoriaId: id(1) })), materiais: [{ insumoId: id(40), quantidade: '1', base: 'por_unidade' }] },
      ],
    })
    const r = await naEmpresa(() => lote.criar(dados, id(99)))
    expect(r.criados.map((c) => c.nome)).toEqual(['Faixa lona', 'Wind banner', 'Caneca branca'])
    expect(r.categoriasNovas).toEqual(['Lonas'])
    expect(r.acabamentosNovos).toEqual(['Bastão e cordão'])
    expect(criados.categoria).toHaveLength(1)
    expect(criados.acabamento).toHaveLength(1)
    const [faixa, wind, caneca] = criados.produto as Record<string, unknown>[]
    const lonas = (criados.categoria![0] as { id: string }).id
    // Faixa por m² (unidade m²); wind banner por unidade (un); os dois na categoria nova "Lonas" (criada uma vez)
    expect(faixa).toMatchObject({ unidadeMedidaId: id(30), precoVenda: '32.00', modoCusto: 'simples', createdBy: id(99), categoriaId: lonas })
    expect(wind).toMatchObject({ unidadeMedidaId: id(31), categoriaId: lonas })
    expect(caneca).toMatchObject({ modoCusto: 'composicao', categoriaId: id(1) })
    // Faixa: ilhós (cadastro) + bastão (novo); wind: bastão (o mesmo, criado uma vez) e a bainha sem preço fica de fora
    expect(criados.produtoAcabamento).toHaveLength(3)
    expect(criados.produtoInsumo).toEqual([{ produtoId: (caneca as { id: string }).id, insumoId: id(40), quantidade: '1', base: 'por_unidade', perdaPercentual: '0' }])
    expect(recalcularCustos).toHaveBeenCalledWith([(caneca as { id: string }).id], expect.objectContaining({ db: expect.anything() }))
    // Auditoria: 3 produtos + 1 categoria + 1 acabamento
    expect(criados.auditoria).toHaveLength(5)
  })

  it('nome parecido com um produto do cadastro: recusa, a menos que a pessoa confirme', async () => {
    const { lote, criados } = appFalso()
    const parecido = itemDaLinha(linha({ nome: 'Banner lona 440g', modoCalculo: 'm2' }))
    await expect(naEmpresa(() => lote.criar(cadastroLoteSchema.parse({ itens: [parecido] }), id(99)))).rejects.toMatchObject({ statusCode: 422, details: { motivo: 'duplicado' } })
    expect(criados.produto).toHaveLength(0)
    await naEmpresa(() => lote.criar(cadastroLoteSchema.parse({ itens: [{ ...parecido, permitirDuplicado: true }] }), id(99)))
    expect(criados.produto).toHaveLength(1)
  })

  it('material que não é insumo ativo: recusa tudo', async () => {
    const { lote, criados } = appFalso()
    const dados = cadastroLoteSchema.parse({ itens: [{ ...itemDaLinha(linha({})), materiais: [{ insumoId: id(41), quantidade: '1', base: 'por_unidade' }] }] })
    await expect(naEmpresa(() => lote.criar(dados, id(99)))).rejects.toMatchObject({ statusCode: 422 })
    expect(criados.produto).toHaveLength(0)
  })

  it('ler o texto colado (simulador): uma chamada, linhas com preço e "falta preço", nada gravado', async () => {
    const { lote, criados, usos, enviados } = appFalso()
    const l = await naEmpresa(() => lote.lerTexto('Banner lona 440g m² R$ 65\nCaneca personalizada R$ 32\nPlaca PVC sob consulta'))
    expect(l.linhas.map((x) => [x.nome, x.modoCalculo, x.precoVenda])).toEqual([
      ['Banner lona 440g', 'm2', '65.00'],
      ['Caneca personalizada', 'unidade', '32.00'],
      ['Placa PVC sob consulta', 'unidade', null],
    ])
    expect(l.linhas[0]!.duplicado?.nome).toBe('Banner em lona 440 g')
    expect(l.linhas[2]!.conferir).toContain('falta preço')
    expect(usos).toMatchObject([{ recurso: 'produto_texto', situacao: 'ok', itens: 3 }])
    expect(enviados[0]).toMatchObject({ tarefa: 'tabela_produtos' })
    expect(Object.values(criados).every((t) => t.length === 0)).toBe(true)
    await expect(naEmpresa(() => lote.lerTexto('bom dia, tudo bem?'))).rejects.toMatchObject({ statusCode: 422, details: { motivo: 'nao_e_tabela' } })
  })

  it('planilha: CSV lido aqui (sem IA para ler o arquivo); XLSX pede o CSV', async () => {
    const { lote, enviados } = appFalso()
    const l = await naEmpresa(() => lote.lerArquivo({ nome: 'precos.csv', mediaType: null, conteudo: Buffer.from('Produto;Preço\nCaneca personalizada R$ 32;\n') }))
    expect(l.linhas[0]).toMatchObject({ nome: 'Caneca personalizada', precoVenda: '32.00', origem: 'planilha' })
    expect(enviados[0]!.conteudo).toContain('Caneca personalizada R$ 32')
    await expect(naEmpresa(() => lote.lerArquivo({ nome: 'precos.xlsx', mediaType: null, conteudo: Buffer.from('PK') }))).rejects.toMatchObject({ message: expect.stringMatching(/CSV/) })
  })
})
