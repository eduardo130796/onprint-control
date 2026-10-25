import { Prisma, type AssistenteConfig } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { calcularPreco } from '@onprint/shared'
import { carregarEnv } from '../src/config/env'
import { contextoEmpresa } from '../src/core/contexto-empresa'
import { SimuladoProvider, type PedidoEstruturado, type ProvedorIA } from '../src/integrations/ia'
import { palavras } from '../src/integrations/ia/texto'
import { criarAssistente, type RegistroUso, type RepositorioAssistente } from '../src/modules/assistente/assistente'
import { MAX_PRODUTOS_NO_PROMPT, criarAjudasAssistente, filtrarPorPalavras, telefonesDoTexto } from '../src/modules/assistente/ajudas.service'
import { controlesDasLinhas, mensagemSemResultado } from '../src/modules/assistente/empresa.service'
import {
  ESQUEMA_ORCAMENTO_TEXTO,
  ESQUEMA_PRODUTO_TEXTO,
  disseMargem,
  limparDescricao,
  pedidoDescricao,
  pedidoOrcamentoDeTexto,
  pedidoProdutoDeTexto,
  type ProdutoParaIA,
} from '../src/modules/assistente/prompts-equipe'
import { LEITURA_PRESA_MS, VIA_LENDO, recuperarLeiturasPresas } from '../src/modules/whatsapp/leituras-presas'

const env = carregarEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://x:x@localhost:1/x', JWT_ACCESS_SECRET: 'segredo-de-teste-jwt', JWT_REFRESH_SECRET: 'segredo-de-teste-2', LOG_LEVEL: 'silent' })
const log = { info: vi.fn(), warn: vi.fn() }
const agora = new Date('2026-10-24T15:00:00Z')
const D = (v: string | number) => new Prisma.Decimal(v)
const EMPRESA = { id: '11111111-1111-4111-8111-111111111111', nome: 'Gráfica Aurora', slug: 'aurora', schema: 'emp_teste' }

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ILHOS = { id: id(101), nome: 'Ilhós a cada 50 cm', tipoCobranca: 'por_perimetro' as const, valor: D('2.00'), custo: D('0.40'), ativo: true }
const BAINHA = { id: id(102), nome: 'Bainha', tipoCobranca: 'por_perimetro' as const, valor: D('3.00'), custo: D('0.50'), ativo: true }
const LAMINACAO = { id: id(103), nome: 'Laminação fosca', tipoCobranca: 'por_m2' as const, valor: D('15.00'), custo: D('4.00'), ativo: true }

/** Produto como o select do catálogo devolve */
function produto(n: number, nome: string, o: Record<string, unknown> = {}) {
  return {
    id: id(n),
    nome,
    codigo: `PRD-${n}`,
    modoCalculo: 'unidade',
    precisaArte: false,
    precoVenda: D('10'),
    precoMinimo: null,
    custo: D('4'),
    larguraPadrao: null,
    alturaPadrao: null,
    larguraMaxima: null,
    alturaMaxima: null,
    categoria: { nome: 'Diversos' },
    acabamentos: [] as { obrigatorio: boolean; padrao: boolean; acabamento: typeof ILHOS }[],
    ...o,
  }
}
const BANNER = produto(1, 'Banner em lona 440 g', {
  modoCalculo: 'm2',
  precoVenda: D('65'),
  larguraMaxima: D('3.2'),
  alturaMaxima: D('50'),
  categoria: { nome: 'Banners e lonas' },
  acabamentos: [
    { obrigatorio: false, padrao: false, acabamento: ILHOS },
    { obrigatorio: false, padrao: true, acabamento: BAINHA },
  ],
})
const CARTAO = produto(2, 'Cartão de visita 4×4 couché 300 g', { modoCalculo: 'milheiro', precoVenda: D('120'), categoria: { nome: 'Impressos' } })
const WIND = produto(3, 'Wind banner 2,5 m com base', { precoVenda: D('390'), categoria: { nome: 'Banners e lonas' } })
const ADESIVO = produto(4, 'Adesivo vinil impresso', { modoCalculo: 'm2', precoVenda: D('70'), larguraPadrao: D('1'), alturaPadrao: D('1'), categoria: { nome: 'Adesivos' }, acabamentos: [{ obrigatorio: true, padrao: true, acabamento: LAMINACAO }] })
const CATALOGO = [BANNER, CARTAO, WIND, ADESIVO]

function linhaCentral(c: Partial<AssistenteConfig> = {}): AssistenteConfig {
  return {
    id: 'cfg',
    ativo: true,
    provedor: 'simulado',
    modelo: 'claude-haiku-5-5',
    chaveCifrada: null,
    chaveFinal: null,
    limiteChamadasMes: 300,
    limiteUsdMes: null,
    precos: [{ modelo: 'claude-haiku-5-5', entrada: 0.1, saida: 0.5 }],
    cotacaoDolar: 5.5 as never,
    createdAt: agora,
    updatedAt: agora,
    ...c,
  }
}

interface Falso {
  central?: AssistenteConfig | null
  usoDoMes?: { chamadas: number; custoUsd: number }
  empresa?: Record<string, boolean>
  provedor?: ProvedorIA
  produtos?: unknown[]
}

/** App mínimo para as ajudas: prisma falso com o catálogo, o núcleo do Assistente de verdade com o provedor simulado */
function appFalso(o: Falso = {}) {
  const usos: RegistroUso[] = []
  const central = o.central === undefined ? linhaCentral() : o.central
  const repo: RepositorioAssistente = { config: async () => central, registrarUso: async (r) => void usos.push(r), usoDoMes: async () => o.usoDoMes ?? { chamadas: 0, custoUsd: 0 } }
  const enviados: PedidoEstruturado<unknown>[] = []
  const base = o.provedor ?? new SimuladoProvider()
  const provedor: ProvedorIA = { nome: 'simulado', modelo: 'x', estruturado: (p) => (enviados.push(p as PedidoEstruturado<unknown>), base.estruturado(p)) }
  const cliente = { findMany: vi.fn(async ({ where }: { where: { OR: Record<string, { in?: string[]; contains?: string }>[] } }) => {
    const telefones = where.OR.flatMap((c) => c.whatsapp?.in ?? [])
    if (telefones.includes('11988887777')) return [{ id: id(900), nome: 'Carlos Mendes', fantasia: null, tipoPessoa: 'PF' }]
    return []
  }) }
  const prisma = {
    produto: {
      findMany: async ({ where }: { where: { tipo: unknown } }) =>
        where.tipo === 'insumo'
          ? [
              { id: id(201), nome: 'Vinil adesivo branco brilho', modoCalculo: 'm2', custo: D('12.5'), unidadeMedida: { sigla: 'm²' } },
              { id: id(202), nome: 'Lona 440 g (rolo 3,20 m)', modoCalculo: 'm2', custo: D('9'), unidadeMedida: { sigla: 'm²' } },
              { id: id(203), nome: 'Caneca branca para sublimação', modoCalculo: 'unidade', custo: D('7'), unidadeMedida: { sigla: 'un' } },
            ]
          : (o.produtos ?? CATALOGO),
      findFirst: async () => ({
        nome: 'Banner em lona 440 g',
        vitrineNome: null,
        descricao: null,
        vitrineDescricao: null,
        modoCalculo: 'm2',
        larguraPadrao: D('1'),
        alturaPadrao: D('1'),
        larguraMaxima: D('3.2'),
        alturaMaxima: D('50'),
        prazoProducaoDias: 2,
        precisaArte: true,
        categoria: { nome: 'Banners e lonas' },
        acabamentos: [{ acabamento: { nome: 'Ilhós a cada 50 cm', ativo: true } }, { acabamento: { nome: 'Desativado', ativo: false } }],
        insumos: [{ insumo: { nome: 'Lona 440 g (rolo 3,20 m)' } }],
      }),
    },
    empresaConfig: {
      findFirst: async () => ({
        nomeFantasia: 'Gráfica Aurora',
        razaoSocial: 'Aurora Comunicação Visual LTDA',
        areaMinimaM2: D('0'),
        assistenteAtivo: true,
        assistenteOrcamentoTexto: true,
        assistenteProdutos: true,
        assistenteDescricoes: true,
        assistenteSemClientes: false,
        ...o.empresa,
      }),
    },
    whatsappConfig: { findFirst: async () => ({ assistenteRespostas: true }) },
    cliente,
    categoria: { findMany: async () => [{ id: id(301), nome: 'Comunicação visual', paiId: null }, { id: id(302), nome: 'Adesivos', paiId: id(301) }] },
    unidadeMedida: { findMany: async () => [{ id: id(401), sigla: 'm²', nome: 'Metro quadrado' }, { id: id(402), sigla: 'un', nome: 'Unidade' }] },
    acabamento: { findMany: async () => [{ id: id(501), nome: 'Recorte eletrônico', tipoCobranca: 'por_m2' }, { id: id(502), nome: 'Ilhós a cada 50 cm', tipoCobranca: 'por_perimetro' }] },
    processo: { findMany: async () => [{ id: id(601), nome: 'Impressão digital', maquinaPadraoId: id(701) }, { id: id(602), nome: 'Recorte', maquinaPadraoId: null }] },
    maquina: { findMany: async () => [{ id: id(701), nome: 'Plotter eco-solvente', tipo: 'impressora' }] },
  }
  const assistente = criarAssistente({ repositorio: repo, env, log, fabrica: () => provedor, cacheMs: 0 })
  const app = { prisma, assistente, log } as unknown as FastifyInstance
  return { ajudas: criarAjudasAssistente(app), usos, enviados, cliente }
}

const naEmpresa = <T>(fn: () => Promise<T>) => contextoEmpresa.com(EMPRESA, fn)
const PEDIDO = 'Oi, aqui é o Carlos Mendes. Preciso de 2 banners 3x1 com ilhós e 1.000 cartões frente e verso, entrega sexta. Meu zap (11) 98888-7777, CPF 123.456.789-09, carlos@exemplo.com'

describe('Assistente: orçamento a partir de texto', () => {
  it('monta os itens com produtos do catálogo, medidas, acabamentos e o cliente achado pelo telefone (no servidor)', async () => {
    const { ajudas, usos, cliente } = appFalso()
    const r = await naEmpresa(() => ajudas.orcamentoDeTexto(PEDIDO))
    expect(r.itens).toHaveLength(2)
    const [banner, cartao] = r.itens
    expect(banner).toMatchObject({ produto: { id: BANNER.id }, quantidade: '2', largura: '3', altura: '1', acabamentos: [{ id: ILHOS.id }] })
    // ≥ 1000 unidades ficam como número inteiro (nada de "1.000" virar 1)
    expect(cartao).toMatchObject({ produto: { id: CARTAO.id, modoCalculo: 'milheiro' }, quantidade: '1000', observacao: 'Frente e verso' })
    expect(r.prazoDesejado).toBe('sexta')
    expect(r.cliente).toEqual({ mencionado: 'Carlos Mendes', encontrado: { id: id(900), rotulo: 'Carlos Mendes' } })
    expect(cliente.findMany.mock.calls[0]![0].where.OR[0]).toEqual({ whatsapp: { in: ['11988887777', '5511988887777'] } })
    // Uso registrado com os itens montados
    expect(usos).toMatchObject([{ recurso: 'orcamento_texto', situacao: 'ok', itens: 2, assinanteId: EMPRESA.id }])
  })

  it('preço sempre do sistema (motor de preços), nunca da IA', async () => {
    // A "IA" tenta mandar preço: o schema não tem o campo e a validação descarta
    const provedor = new SimuladoProvider({
      orcamento_texto: () => ({
        itens: [{ produto: 'P1', descricao: '2 banners', quantidade: 2, largura_m: 3, altura_m: 1, acabamentos: ['A1'], observacao: null, confianca: 0.95, motivo: 'banner', preco: 1, total: 1, preco_unitario: 0.01 }],
        cliente_nome: null,
        prazo_desejado: null,
        observacoes: null,
        nao_identificados: [],
        total: 1,
      }),
    })
    const { ajudas } = appFalso({ provedor })
    const r = await naEmpresa(() => ajudas.orcamentoDeTexto('2 banners 3x1 com ilhós'))
    const esperado = calcularPreco({
      modoCalculo: 'm2',
      precoUnitario: '65',
      custoUnitario: '4',
      quantidade: '2',
      largura: '3',
      altura: '1',
      areaMinimaM2: '0',
      medidasMaximas: { largura: '3.2', altura: '50' },
      acabamentos: [{ id: ILHOS.id, nome: ILHOS.nome, tipoCobranca: 'por_perimetro', valor: '2.00' }],
    })
    expect(r.itens[0]!.preco).toEqual({ ok: true, precoUnitario: '65.00', total: esperado.total, erros: [] })
    expect(esperado.total).toBe('422.00')
    // Nem o schema pede preço, nem o catálogo enviado mostra preço ou custo
    expect(JSON.stringify(ESQUEMA_ORCAMENTO_TEXTO)).not.toMatch(/preco|preço|valor|price|total/i)
    expect(JSON.stringify(ESQUEMA_PRODUTO_TEXTO)).not.toMatch(/preco|preço|price/i)
    const pedido = pedidoOrcamentoDeTexto({ grafica: 'Gráfica Aurora', pedido: 'banner', catalogo: [{ ...paraIA(BANNER) }] })
    expect(pedido.conteudo).not.toMatch(/65|R\$/)
  })

  it('ids fora da lista viram null: referência inventada, id do banco "chutado", acabamento de outro produto', async () => {
    const provedor = new SimuladoProvider({
      orcamento_texto: () => ({
        itens: [
          { produto: 'P99', descricao: 'placa', quantidade: 1, largura_m: null, altura_m: null, acabamentos: [], observacao: null, confianca: 0.9, motivo: 'x' },
          { produto: WIND.id, descricao: 'wind', quantidade: 1, largura_m: null, altura_m: null, acabamentos: [], observacao: null, confianca: 0.9, motivo: 'x' },
          // A3 = laminação (do adesivo), pedida no banner; A77 não existe
          { produto: 'p1', descricao: 'banner', quantidade: 1, largura_m: 1, altura_m: 1, acabamentos: ['A3', 'A77'], observacao: null, confianca: 0.9, motivo: 'x' },
        ],
        cliente_nome: null,
        prazo_desejado: null,
        observacoes: null,
        nao_identificados: [],
      }),
    })
    const { ajudas } = appFalso({ provedor })
    const r = await naEmpresa(() => ajudas.orcamentoDeTexto('uma placa, um wind banner e um banner 1x1 laminado'))
    expect(r.itens[0]).toMatchObject({ produto: null, conferir: true, preco: null })
    expect(r.itens[0]!.confianca).toBeLessThanOrEqual(0.5)
    expect(r.itens[1]).toMatchObject({ produto: null, conferir: true })
    // Referência em minúsculas vale; o acabamento de outro produto e o inexistente ficam de fora (com aviso)
    expect(r.itens[2]!.produto?.id).toBe(BANNER.id)
    expect(r.itens[2]!.acabamentos).toEqual([{ id: BAINHA.id, nome: 'Bainha' }])
    expect(r.itens[2]!.avisos).toHaveLength(2)
    expect(r.itens[2]!.conferir).toBe(true)
  })

  it('confiança baixa ou medida faltando pede "conferir"; obrigatórios entram sempre', async () => {
    const provedor = new SimuladoProvider({
      orcamento_texto: () => ({
        itens: [{ produto: 'P4', descricao: 'adesivo', quantidade: 3, largura_m: null, altura_m: null, acabamentos: [], observacao: null, confianca: 0.95, motivo: 'x' }],
        cliente_nome: null,
        prazo_desejado: null,
        observacoes: null,
        nao_identificados: ['um brinde'],
      }),
    })
    const { ajudas } = appFalso({ provedor })
    const r = await naEmpresa(() => ajudas.orcamentoDeTexto('3 adesivos e um brinde'))
    expect(r.itens[0]).toMatchObject({ largura: '1', altura: '1', acabamentos: [{ id: LAMINACAO.id }], conferir: true })
    expect(r.itens[0]!.avisos[0]).toMatch(/medida padrão/)
    expect(r.naoIdentificados).toEqual(['um brinde'])
  })

  it('privacidade: o prompt não leva telefone, CPF nem e-mail (o servidor usa o telefone só para achar o cliente)', async () => {
    const { ajudas, enviados } = appFalso()
    await naEmpresa(() => ajudas.orcamentoDeTexto(PEDIDO))
    const tudo = `${enviados[0]!.sistema}\n${enviados[0]!.conteudo}`
    expect(tudo).toContain('Assistente GrafyGo da Gráfica Aurora')
    expect(tudo).not.toMatch(/98888|7777|123\.456|789-09|carlos@/)
    expect(tudo).toContain('[número omitido]')
    expect(telefonesDoTexto(PEDIDO)).toEqual(['11988887777'])
  })

  it('catálogo grande vai filtrado pelas palavras do pedido; pequeno vai inteiro', () => {
    const muitos = Array.from({ length: 120 }, (_, i) => ({ nome: `Produto genérico ${i}`, categoria: 'Diversos' }))
    muitos.push({ nome: 'Banner em lona 440 g', categoria: 'Banners' }, { nome: 'Cartão de visita', categoria: 'Impressos' })
    const filtrados = filtrarPorPalavras(muitos, '2 banners e 500 cartões', (p) => `${p.nome} ${p.categoria}`, MAX_PRODUTOS_NO_PROMPT)
    expect(filtrados.map((p) => p.nome)).toEqual(['Banner em lona 440 g', 'Cartão de visita'])
    expect(filtrarPorPalavras(muitos, 'xyz', (p) => p.nome, 40)).toHaveLength(40)
    expect(filtrarPorPalavras(muitos.slice(0, 10), 'banner', (p) => p.nome, 40)).toHaveLength(10)
    expect(palavras('Cartões de Visita, BANNERS')).toEqual(['cartao', 'visita', 'banner'])
  })
})

describe('Assistente: travas, limite e falhas das ajudas', () => {
  it('central desligada, chave geral ou a ajuda desligada na empresa: não chama a IA', async () => {
    const casos: [Falso, RegExp][] = [
      [{ central: linhaCentral({ ativo: false }) }, /ainda não foi liberado/],
      [{ empresa: { assistenteAtivo: false } }, /Assistente GrafyGo está desligado/],
      [{ empresa: { assistenteOrcamentoTexto: false } }, /Orçamento a partir de texto” está desligado/],
    ]
    for (const [o, msg] of casos) {
      const { ajudas, usos, enviados } = appFalso(o)
      await expect(naEmpresa(() => ajudas.orcamentoDeTexto(PEDIDO))).rejects.toThrow(msg)
      expect(enviados).toEqual([])
      expect(usos).toEqual([])
    }
    // Outras ajudas seguem com o orçamento desligado
    const { ajudas } = appFalso({ empresa: { assistenteOrcamentoTexto: false } })
    await expect(naEmpresa(() => ajudas.descricao({ produtoId: BANNER.id, destino: 'produto' }))).resolves.toHaveProperty('texto')
  })
  it('limite do mês: avisa a pessoa (422) e registra "limite"; erro do provedor: mensagem para tentar de novo', async () => {
    const limite = appFalso({ central: linhaCentral({ limiteChamadasMes: 5 }), usoDoMes: { chamadas: 5, custoUsd: 0 } })
    await expect(naEmpresa(() => limite.ajudas.orcamentoDeTexto(PEDIDO))).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/limite de uso/) })
    expect(limite.usos).toMatchObject([{ situacao: 'limite' }])
    const fora = appFalso()
    await expect(naEmpresa(() => fora.ajudas.orcamentoDeTexto('2 banners [simular-erro]'))).rejects.toThrow(/Tente de novo/)
    expect(fora.usos).toMatchObject([{ situacao: 'erro' }])
    expect(fora.usos[0]!.itens ?? 0).toBe(0)
    expect(mensagemSemResultado({ ok: false, motivo: 'desligado', erro: null })).toMatch(/não está disponível/)
  })
  it('controles da empresa: padrão tudo ligado; a leitura do WhatsApp vem de whatsapp_config', () => {
    expect(controlesDasLinhas(null, null)).toEqual({ ativo: true, respostasWhatsapp: true, orcamentoTexto: true, produtos: true, descricoes: true, semClientes: false })
    expect(controlesDasLinhas(null, { assistenteRespostas: false }).respostasWhatsapp).toBe(false)
  })
})

describe('Assistente: produto a partir de texto', () => {
  it('preenche cobrança, unidade, categoria, insumos e acabamentos do cadastro e a margem dita', async () => {
    const { ajudas, usos } = appFalso()
    const r = await naEmpresa(() => ajudas.produtoDeTexto('Adesivo vinil com recorte, cobro por m², vinil branco brilho, margem 60%'))
    expect(r).toMatchObject({
      nome: 'Adesivo vinil com recorte',
      modoCalculo: 'm2',
      unidadeMedidaId: id(401),
      categoria: { id: id(302), nome: 'Comunicação visual › Adesivos' },
      insumos: [{ insumoId: id(201), quantidade: '1', base: 'por_m2', unidade: 'm²', custoUnitario: '12.5' }],
      acabamentos: [{ id: id(501), nome: 'Recorte eletrônico' }],
      processos: [{ processoId: id(602), nome: 'Recorte', maquinaId: null }],
      margem: '60',
    })
    expect(usos).toMatchObject([{ recurso: 'produto_texto', itens: 1 }])
  })
  it('nunca inventa: ids fora das listas caem, margem só quando a pessoa disse, medida só com número no texto', async () => {
    const provedor = new SimuladoProvider({
      produto_texto: () => ({
        nome: 'Caneca',
        tipo: 'produto',
        categoria: 'C9',
        categoria_nova: 'Brindes',
        modo_cobranca: 'unidade',
        unidade: 'U9',
        largura_padrao_m: 0.1,
        altura_padrao_m: 0.1,
        prazo_producao_dias: 3,
        precisa_arte: true,
        insumos: [{ insumo: 'I3', quantidade: 1, base: 'por_unidade' }, { insumo: id(202), quantidade: 1, base: 'por_m2' }, { insumo: 'I1', quantidade: -2, base: 'por_m2' }],
        insumos_nao_encontrados: ['papel transfer'],
        etapas: [{ etapa: 'E9', maquina: null }],
        acabamentos: ['A9'],
        margem_percentual: 60,
        descricao: 'Caneca personalizada. Fale no (11) 98888-7777.',
      }),
    })
    const { ajudas } = appFalso({ provedor })
    const r = await naEmpresa(() => ajudas.produtoDeTexto('caneca branca personalizada com a arte do cliente'))
    expect(r).toMatchObject({ categoria: { id: null, nome: 'Brindes' }, larguraPadrao: null, alturaPadrao: null, prazoProducaoDias: null, margem: null, processos: [], acabamentos: [] })
    // Sem unidade válida: a que combina com a cobrança
    expect(r.unidadeMedidaId).toBe(id(402))
    expect(r.insumos.map((i) => i.insumoId)).toEqual([id(203)])
    expect(r.avisos.join(' ')).toMatch(/papel transfer/)
    expect(r.descricao).not.toMatch(/98888/)
    expect(disseMargem('margem 60%')).toBe(true)
    expect(disseMargem('lucro de 40')).toBe(true)
    expect(disseMargem('caneca branca')).toBe(false)
  })
})

describe('Assistente: descrições', () => {
  it('usa os dados reais do produto (acabamentos ativos, materiais sem embalagem) e nada de preço', async () => {
    const { ajudas, enviados } = appFalso()
    const r = await naEmpresa(() => ajudas.descricao({ produtoId: BANNER.id, destino: 'vitrine' }))
    expect(r.texto).toContain('Banner em lona 440 g')
    expect(r.texto).toContain('\n\n')
    const conteudo = enviados[0]!.conteudo
    expect(conteudo).toContain('Materiais: Lona 440 g')
    expect(conteudo).not.toContain('rolo 3,20')
    expect(conteudo).toContain('Acabamentos disponíveis: Ilhós a cada 50 cm')
    expect(conteudo).not.toContain('Desativado')
    expect(enviados[0]!.sistema).toMatch(/Não invente medidas/)
    // Produto ainda não salvo: só o que está no formulário
    const rascunho = pedidoDescricao({ grafica: 'G', destino: 'produto', produto: { nome: 'Placa PVC', categoria: null, modoCalculo: 'm2', medidaPadrao: null, medidaMaxima: null, acabamentos: [], materiais: [], prazoDias: null, precisaArte: null, descricaoAtual: null } })
    expect(rascunho.conteudo).toContain('Nome: Placa PVC')
    expect(rascunho.conteudo).not.toContain('Materiais')
  })
  it('limpa markdown e corta no fim de uma frase', () => {
    expect(limparDescricao('## Banner\n**Lona** resistente.', 400)).toBe('Banner\nLona resistente.'.replace('\n', ' '))
    const longo = `${'Frase curta e honesta. '.repeat(30)}`
    const t = limparDescricao(longo, 100)
    expect(t.length).toBeLessThanOrEqual(100)
    expect(t.endsWith('.')).toBe(true)
  })
  it('esforço e tamanho por tarefa: extrair pede "medium" e mais tokens; descrição e classificação ficam em "low"', async () => {
    const chamadas: Record<string, unknown>[] = []
    const cliente = {
      messages: {
        create: async (p: Record<string, unknown>) => {
          chamadas.push(p)
          return { model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify({ texto: 'Banner em lona para a sua fachada.' }) }] }
        },
      },
    }
    const { AnthropicProvider } = await import('../src/integrations/ia/anthropic')
    const p = new AnthropicProvider({ chave: 'k', modelo: 'claude-haiku-5-5', tempoLimiteMs: 15_000, cliente: cliente as never })
    await p.estruturado(pedidoDescricao({ grafica: 'G', destino: 'vitrine', produto: { nome: 'Banner', categoria: null, modoCalculo: null, medidaPadrao: null, medidaMaxima: null, acabamentos: [], materiais: [], prazoDias: null, precisaArte: null, descricaoAtual: null } }))
    await p.estruturado(pedidoOrcamentoDeTexto({ grafica: 'G', pedido: 'x', catalogo: [] })).catch(() => undefined)
    await p.estruturado(pedidoProdutoDeTexto({ grafica: 'G', descricao: 'x', categorias: [], unidades: [], insumos: [], acabamentos: [], processos: [], maquinas: [] })).catch(() => undefined)
    expect(chamadas.map((c) => [(c.output_config as { effort: string }).effort, c.max_tokens])).toEqual([
      ['low', 2048],
      ['medium', 4096],
      ['medium', 3072],
    ])
    expect(chamadas.every((c) => !('temperature' in c))).toBe(true)
  })
})

describe('WhatsApp: respostas presas em "lendo" (a API reiniciou no meio da leitura)', () => {
  function banco(linhas: { id: string; respostaVia: string; respostaEm: Date; respostaTexto: string | null; vendedorId: string | null }[]) {
    const notificacoes: { usuarioId: string; titulo: string; mensagem: string; link: string }[] = []
    const emitidos: string[] = []
    const prisma = {
      mensagemWhatsapp: {
        findMany: async ({ where }: { where: { respostaVia: string; respostaEm: { lt: Date } } }) =>
          linhas
            .filter((l) => l.respostaVia === where.respostaVia && l.respostaEm < where.respostaEm.lt)
            .map((l) => ({ id: l.id, respostaTexto: l.respostaTexto, orcamento: { id: `orc-${l.id}`, numero: `ORC-${l.id}`, vendedorId: l.vendedorId, cliente: { nome: 'Mariana Souza', fantasia: null, tipoPessoa: 'PF' } } })),
        updateMany: async ({ where, data }: { where: { id: string; respostaVia: string }; data: { respostaVia: string } }) => {
          const l = linhas.find((x) => x.id === where.id && x.respostaVia === where.respostaVia)
          if (l) l.respostaVia = data.respostaVia
          return { count: l ? 1 : 0 }
        },
      },
      usuario: {
        findUnique: async ({ where }: { where: { id: string } }) => ({ ativo: where.id !== 'inativo' }),
        findMany: async () => [{ id: 'admin-1' }],
      },
      notificacao: { create: async ({ data }: { data: (typeof notificacoes)[number] }) => void notificacoes.push(data) },
    }
    const app = { prisma, tempoReal: { emitir: (sala: string) => void emitidos.push(sala) }, log: { warn: vi.fn() } } as unknown as FastifyInstance
    return { app, linhas, notificacoes, emitidos }
  }

  it('mais de 2 minutos lendo: avisa o vendedor (ou os administradores) e marca como tratada, uma vez só', async () => {
    const velha = new Date(agora.getTime() - LEITURA_PRESA_MS - 1000)
    const nova = new Date(agora.getTime() - 30_000)
    const b = banco([
      { id: '1', respostaVia: VIA_LENDO, respostaEm: velha, respostaTexto: 'tá ótimo, pode mandar ver', vendedorId: 'vend-1' },
      { id: '2', respostaVia: VIA_LENDO, respostaEm: velha, respostaTexto: 'e a entrega?', vendedorId: 'inativo' },
      { id: '3', respostaVia: VIA_LENDO, respostaEm: nova, respostaTexto: 'oi', vendedorId: 'vend-1' },
      { id: '4', respostaVia: 'assistente', respostaEm: velha, respostaTexto: 'ok', vendedorId: 'vend-1' },
    ])
    expect(await recuperarLeiturasPresas(b.app, agora)).toBe(2)
    expect(b.notificacoes).toMatchObject([
      { usuarioId: 'vend-1', titulo: 'Mariana Souza respondeu o orçamento ORC-1 no WhatsApp', link: '/orcamentos/orc-1' },
      { usuarioId: 'admin-1', link: '/orcamentos/orc-2' },
    ])
    expect(b.notificacoes[0]!.mensagem).toMatch(/“tá ótimo, pode mandar ver”.*não terminou de ler/)
    expect(b.emitidos).toEqual(['usuario:vend-1', 'usuario:admin-1'])
    expect(b.linhas.map((l) => l.respostaVia)).toEqual(['texto', 'texto', VIA_LENDO, 'assistente'])
    // De novo: nada a fazer (e a recente só depois dos 2 minutos)
    expect(await recuperarLeiturasPresas(b.app, agora)).toBe(0)
    expect(await recuperarLeiturasPresas(b.app, new Date(agora.getTime() + LEITURA_PRESA_MS))).toBe(1)
    expect(b.notificacoes).toHaveLength(3)
  })
})

function paraIA(p: typeof BANNER): ProdutoParaIA {
  return {
    id: p.id,
    nome: p.nome,
    codigo: p.codigo,
    categoria: p.categoria.nome,
    modoCalculo: p.modoCalculo as ProdutoParaIA['modoCalculo'],
    precisaArte: p.precisaArte,
    larguraPadrao: null,
    alturaPadrao: null,
    larguraMaxima: '3.2',
    alturaMaxima: '50',
    acabamentos: p.acabamentos.map((a) => ({ id: a.acabamento.id, nome: a.acabamento.nome, obrigatorio: a.obrigatorio, padrao: a.padrao })),
  }
}
