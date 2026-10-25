import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Prisma, type AssistenteConfig } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { NAO_SEI_FAZER, documentoDoTexto } from '@onprint/shared'
import { carregarEnv } from '../src/config/env'
import { contextoEmpresa } from '../src/core/contexto-empresa'
import { SimuladoProvider, type PedidoEstruturado, type ProvedorIA } from '../src/integrations/ia'
import { conteudoDaMensagem } from '../src/integrations/ia/anthropic'
import { NOTA_DEMO, intencaoSimulada } from '../src/integrations/ia/simulado-assistente'
import { orcamentoSimulado, partesDoPedido, quantidadeDoTexto } from '../src/integrations/ia/simulado-equipe'
import { criarAssistente, type RegistroUso } from '../src/modules/assistente/assistente'
import { clienteNovo, dadosDoTexto } from '../src/modules/assistente/ajudas.service'
import { contextoDoCerebro, linhasDaMemoria, type HistoricoCliente } from '../src/modules/assistente/cerebro'
import { ErroNfe, lerNfe } from '../src/modules/assistente/nfe'
import { conciliar, insumoPeloNome, type InsumoParaNota } from '../src/modules/assistente/nota-compra'
import { intervaloDoPeriodo } from '../src/modules/assistente/perguntas.service'
import { criarPedirService, notaDaLeitura, tipoDoArquivo } from '../src/modules/assistente/pedir.service'
import { ESQUEMA_INTENCAO, ESQUEMA_NOTA_COMPRA, pedidoIntencao, validarIntencao, validarNotaCompra } from '../src/modules/assistente/prompts-pedir'
import { lembrarCodigos } from '../src/modules/estoque/entradas.service'

const env = carregarEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://x:x@localhost:1/x', JWT_ACCESS_SECRET: 'segredo-de-teste-jwt', JWT_REFRESH_SECRET: 'segredo-de-teste-2', LOG_LEVEL: 'silent' })
const EMPRESA = { id: '11111111-1111-4111-8111-111111111111', nome: 'Gráfica Aurora', slug: 'aurora', schema: 'emp_teste' }
const naEmpresa = <T>(fn: () => Promise<T>) => contextoEmpresa.com(EMPRESA, fn)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const xml = (nome: string) => readFileSync(join(__dirname, 'fixtures', 'nfe', nome), 'utf8')

const INSUMOS: InsumoParaNota[] = [
  { id: id(1), nome: 'Lona 440 g (rolo 3,20 m)', codigo: 'PRD-0001', unidade: 'm²', embalagem: 'rolo' },
  { id: id(2), nome: 'Papel couché 300 g', codigo: 'PRD-0002', unidade: 'fl', embalagem: 'pacote' },
  { id: id(3), nome: 'Vinil adesivo branco brilho', codigo: 'PRD-0003', unidade: 'm²', embalagem: 'rolo' },
  { id: id(4), nome: 'Tinta eco solvente ciano', codigo: 'PRD-0004', unidade: 'l', embalagem: 'unidade' },
]

describe('Nota de compra: XML da NF-e (leitura exata, sem IA)', () => {
  it('nfeProc com 3 itens, frete e 2 duplicatas: emitente, itens, totais e parcelas', () => {
    const n = lerNfe(xml('nfe-lona-forte.xml'))
    expect(n).toMatchObject({ chave: '35261044555666000181550010000048211000048217', numero: '4821', serie: '1', emissao: '2026-10-20', totalProdutos: '3395.3', totalNota: '3440.3' })
    expect(n.emitente).toMatchObject({ documento: '44555666000181', nome: 'DISTRIBUIDORA LONA FORTE LTDA', fantasia: 'Lona Forte', ie: '244555666111', telefone: '1932320000' })
    expect(n.emitente.endereco).toEqual({ cep: '13050000', logradouro: 'RUA DAS INDUSTRIAS', numero: '1200', complemento: 'GALPAO 3', bairro: 'DISTRITO INDUSTRIAL', cidade: 'Campinas', uf: 'SP' })
    expect(n.itens).toHaveLength(3)
    // Quantidade e valor sem zeros sobrando; entidades decodificadas
    expect(n.itens[0]).toEqual({ codigo: 'LF-440', descricao: 'LONA FRONT 440G BRANCA ROLO 3,20X50M', ncm: '39219019', cfop: '5102', unidade: 'RL', quantidade: '2', valorUnitario: '1450', valorTotal: '2900' })
    expect(n.itens[1]!.descricao).toBe('ILHOS LATAO N10 CX 1000 & ARRUELAS')
    expect(n.parcelas).toEqual([
      { numero: '001', vencimento: '2026-11-19', valor: '1720.15' },
      { numero: '002', vencimento: '2026-12-19', valor: '1720.15' },
    ])
    expect(n.pagamentos).toEqual([{ forma: '15', valor: '3440.3' }])
  })

  it('NFe sem nfeProc, com prefixo de namespace e dEmi; pago à vista sem duplicatas', () => {
    const p = lerNfe(xml('nfe-prefixo-uma-parcela.xml'))
    expect(p).toMatchObject({ numero: '77', emissao: '2026-10-05', totalNota: '261.98', emitente: { documento: '11222333000181', nome: 'Tintas Minas Ltda', endereco: null } })
    expect(p.itens[0]).toMatchObject({ codigo: '9001', unidade: 'FR', quantidade: '4', valorUnitario: '62.375' })
    expect(p.parcelas).toEqual([{ numero: '1', vencimento: '2026-11-04', valor: '261.98' }])
    const sul = lerNfe(xml('nfe-papelaria-sul.xml'))
    expect(sul).toMatchObject({ numero: '912', serie: '2', totalProdutos: '1425', totalNota: '1405', parcelas: [], pagamentos: [{ forma: '17', valor: '1405' }] })
  })

  it('arquivo que não é NF-e: mensagem clara (ErroNfe)', () => {
    expect(() => lerNfe('<html><body>oi</body></html>')).toThrow(ErroNfe)
    expect(() => lerNfe('<NFe><infNFe><emit><xNome>X</xNome></emit></infNFe></NFe>')).toThrow(/não tem itens/)
    expect(tipoDoArquivo(Buffer.from(xml('nfe-papelaria-sul.xml')))).toBe('text/xml')
    expect(tipoDoArquivo(Buffer.from('%PDF-1.4 ...'))).toBe('application/pdf')
    expect(tipoDoArquivo(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(tipoDoArquivo(Buffer.from('MZ executável'))).toBeNull()
  })
})

describe('Nota de compra: conciliação com o cadastro e memória', () => {
  it('fornecedor novo: insumos pelo nome (confira), custo com o rateio do frete, embalagem pela unidade da nota', () => {
    const n = conciliar(lerNfe(xml('nfe-lona-forte.xml')), 'xml', { fornecedor: null, insumos: INSUMOS, memoria: [], jaLancada: null })
    expect(n.fornecedor).toMatchObject({ cnpj: '44555666000181', existente: null })
    const [lona, ilhos, tinta] = n.itens
    expect(lona).toMatchObject({ insumo: { id: id(1) }, comoAchou: 'nome', emEmbalagem: true, conferir: true })
    // R$ 45 de frete rateado: 2900 × (3440,30 ÷ 3395,30) ÷ 2
    expect(lona!.custoUnitario).toBe('1469.2177')
    expect(ilhos).toMatchObject({ insumo: null, comoAchou: null, conferir: true })
    // Tinta "UN" num insumo sem embalagem: unidade de uso direto
    expect(tinta).toMatchObject({ insumo: { id: id(4) }, emEmbalagem: false })
    expect(n.avisos.join(' ')).toMatch(/frete\/impostos/)
    expect(n.avisos.join(' ')).not.toMatch(/Fornecedor novo/)
    expect(n.avisos.join(' ')).toMatch(/1 item\(ns\) sem insumo/)
    expect(n).toMatchObject({ origem: 'xml', conferir: false, totalNota: '3440.30', parcelas: [{ valor: '1720.15' }, { valor: '1720.15' }] })
  })

  it('fornecedor existente com um código já lembrado: vem da memória (sem "confira"); desconto sai do custo', () => {
    const n = conciliar(lerNfe(xml('nfe-papelaria-sul.xml')), 'xml', {
      fornecedor: { id: id(50), nome: 'Papelaria Atacado Sul' },
      insumos: INSUMOS,
      memoria: [{ codigo: 'CP300', produtoId: id(2), emEmbalagem: true }],
      jaLancada: null,
    })
    expect(n.fornecedor.existente).toEqual({ id: id(50), nome: 'Papelaria Atacado Sul' })
    expect(n.itens[0]).toMatchObject({ codigo: 'CP300', insumo: { id: id(2) }, comoAchou: 'memoria', emEmbalagem: true, conferir: false })
    expect(n.itens[1]).toMatchObject({ insumo: { id: id(3) }, comoAchou: 'nome', conferir: true })
    // R$ 20 de desconto: 445 × (1405 ÷ 1425) ÷ 5
    expect(n.itens[0]!.custoUnitario).toBe('87.7509')
    expect(n.avisos.join(' ')).toMatch(/desconto/)
    expect(n.parcelas).toEqual([])
  })

  it('nota já lançada avisa; nome ambíguo não chuta; nota lida pela IA vem toda com "confira"', () => {
    const n = conciliar(lerNfe(xml('nfe-papelaria-sul.xml')), 'foto', { fornecedor: { id: id(50), nome: 'Sul' }, insumos: INSUMOS, memoria: [], jaLancada: { id: id(60), numero: 'ENT-2026-0003' } })
    expect(n.avisos[0]).toMatch(/já foi lançada na entrada ENT-2026-0003/)
    expect(n.conferir).toBe(true)
    expect(n.itens.every((i) => i.conferir)).toBe(true)
    const dois = [
      { id: id(7), nome: 'Lona fosca', codigo: 'A', unidade: 'm²', embalagem: 'rolo' },
      { id: id(8), nome: 'Lona brilho', codigo: 'B', unidade: 'm²', embalagem: 'rolo' },
    ]
    expect(insumoPeloNome('LONA 440G', dois)).toBeNull()
    expect(insumoPeloNome('LONA FOSCA 440G', dois)?.id).toBe(id(7))
  })

  it('memória: grava ao registrar a entrada (só insumos que entraram); o mesmo código passa a valer o insumo corrigido', async () => {
    const upsert = vi.fn(async () => ({}))
    const tx = { fornecedorProduto: { upsert } } as unknown as Prisma.TransactionClient
    await lembrarCodigos(tx, id(50), [
      { codigo: 'CP300', produtoId: id(2), descricao: 'PAPEL COUCHE', unidade: 'PCT', emEmbalagem: true },
      { codigo: 'XX', produtoId: id(99), emEmbalagem: false },
    ], new Set([id(2)]))
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({
      where: { fornecedorId_codigo: { fornecedorId: id(50), codigo: 'CP300' } },
      create: { fornecedorId: id(50), codigo: 'CP300', produtoId: id(2), descricao: 'PAPEL COUCHE', unidade: 'PCT', emEmbalagem: true },
      update: { produtoId: id(2), descricao: 'PAPEL COUCHE', unidade: 'PCT', emEmbalagem: true, usos: { increment: 1 } },
    })
  })
})

// ─── "Peça ao Assistente" com um app falso (nada de banco de verdade) ───

function linhaCentral(): AssistenteConfig {
  const agora = new Date()
  return { id: 'cfg', ativo: true, provedor: 'simulado', modelo: 'claude-haiku-5-5', chaveCifrada: null, chaveFinal: null, limiteChamadasMes: 300, limiteUsdMes: null, precos: [], cotacaoDolar: 5.5 as never, createdAt: agora, updatedAt: agora }
}

/** Escrever no banco é proibido aqui: ler a nota ou entender o pedido nunca salva nada */
const proibido = () => {
  throw new Error('a leitura tentou gravar no banco')
}

function appFalso(o: { permissoes?: boolean; provedor?: ProvedorIA } = {}) {
  const usos: RegistroUso[] = []
  const enviados: PedidoEstruturado<unknown>[] = []
  const base = o.provedor ?? new SimuladoProvider()
  const provedor: ProvedorIA = { nome: 'simulado', modelo: 'x', estruturado: (p) => (enviados.push(p as PedidoEstruturado<unknown>), base.estruturado(p)) }
  const tabela = (dados: Record<string, unknown> = {}) => ({ create: proibido, update: proibido, upsert: proibido, delete: proibido, createMany: proibido, ...dados })
  const queryRaw = vi.fn(async () => [
    { id: id(700), nome: 'Padaria Pão Quente', aberto: D(900), vencido: D(400), desde: new Date('2026-10-01T00:00:00Z') },
    { id: id(701), nome: 'Escola Arco-Íris', aberto: D(350.5), vencido: D(0), desde: null },
  ])
  const prisma = {
    $queryRaw: queryRaw,
    empresaConfig: tabela({ findFirst: async () => ({ nomeFantasia: 'Gráfica Aurora', assistenteAtivo: true, areaMinimaM2: D(0) }) }),
    whatsappConfig: tabela({ findFirst: async () => ({ assistenteRespostas: true }) }),
    cliente: tabela({ findFirst: async ({ where }: { where: { cpfCnpj?: string } }) => (where.cpfCnpj === '11222333000181' ? { id: id(800), nome: 'Tintas Minas', fantasia: null } : null) }),
    fornecedor: tabela({ findFirst: async ({ where }: { where: { cpfCnpj: string } }) => (where.cpfCnpj === '77888999000181' ? { id: id(50), nome: 'Papelaria Atacado Sul' } : null) }),
    fornecedorProduto: tabela({ findMany: async () => [{ codigo: 'CP300', produtoId: id(2), emEmbalagem: true }] }),
    estoqueEntrada: tabela({ findFirst: async () => null }),
    produto: tabela({ findMany: async () => INSUMOS.map((i) => ({ id: i.id, nome: i.nome, codigo: i.codigo, embalagem: i.embalagem, unidadeMedida: { sigla: i.unidade } })) }),
  }
  const assistente = criarAssistente({ repositorio: { config: async () => linhaCentral(), registrarUso: async (r) => void usos.push(r), usoDoMes: async () => ({ chamadas: 0, custoUsd: 0 }) }, env, log: { info: vi.fn(), warn: vi.fn() }, fabrica: () => provedor, cacheMs: 0 })
  const app = { prisma, assistente, log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() }, temPermissao: async () => o.permissoes ?? true } as unknown as FastifyInstance
  const req = { user: { sub: id(1000) } } as never
  return { pedir: criarPedirService(app), usos, enviados, req, queryRaw }
}
const D = (v: number) => new Prisma.Decimal(v)

describe('Peça ao Assistente: entender o pedido e fazer', () => {
  it('"quem está devendo?": a IA só escolhe a pergunta; os números vêm da consulta do sistema', async () => {
    const { pedir, req, usos, enviados } = appFalso()
    const r = await naEmpresa(() => pedir.pedir(req, 'quem está devendo?'))
    expect(r.tipo).toBe('pergunta')
    if (r.tipo !== 'pergunta') return
    expect(r.resposta).toMatchObject({ pergunta: 'quem_deve', resumo: '2 clientes devem R$ 1.250,50, R$ 400,00 já vencidos.', link: { path: '/financeiro/receber' } })
    expect(r.resposta.linhas[0]).toMatchObject({ titulo: 'Padaria Pão Quente', valor: '900.00', detalhe: 'R$ 400,00 vencidos desde 01/10', link: `/clientes/${id(700)}` })
    // Uma chamada barata ("intencao"), registrada como uso; nada de número no esquema da IA
    expect(usos).toMatchObject([{ recurso: 'intencao', situacao: 'ok' }])
    expect(enviados[0]).toMatchObject({ tarefa: 'intencao', esforco: 'low' })
    expect(JSON.stringify(ESQUEMA_INTENCAO)).not.toMatch(/valor|total|numero/i)
  })

  it('CPF/CNPJ sozinho vai direto para o cliente (sem IA); já cadastrado avisa; sem permissão explica', async () => {
    const { pedir, req, usos } = appFalso()
    expect(await naEmpresa(() => pedir.pedir(req, '11.222.333/0001-81'))).toEqual({ tipo: 'cliente', documento: '11222333000181', nome: null, existente: { id: id(800), rotulo: 'Tintas Minas' } })
    expect(usos).toHaveLength(0)
    const r = await naEmpresa(() => pedir.pedir(req, 'cadastrar cliente Padaria Pão Quente 44.555.666/0001-81'))
    expect(r).toEqual({ tipo: 'cliente', documento: '44555666000181', nome: 'Padaria Pão Quente', existente: null })
    const semPermissao = appFalso({ permissoes: false })
    expect(await naEmpresa(() => semPermissao.pedir.pedir(semPermissao.req, 'cadastrar cliente Ana'))).toMatchObject({ tipo: 'nao_sei', mensagem: expect.stringMatching(/permissão/) })
  })

  it('produto abre o cadastro com o texto; nota sem arquivo pede o anexo; o resto: "ainda não sei"', async () => {
    const { pedir, req, enviados } = appFalso()
    expect(await naEmpresa(() => pedir.pedir(req, 'criar produto adesivo vinil por m²'))).toEqual({ tipo: 'produto', texto: 'criar produto adesivo vinil por m²' })
    expect(await naEmpresa(() => pedir.pedir(req, 'lançar a nota da Lona Forte'))).toMatchObject({ tipo: 'anexar_nota' })
    expect(await naEmpresa(() => pedir.pedir(req, 'qual a previsão do tempo?'))).toEqual({ tipo: 'nao_sei', mensagem: NAO_SEI_FAZER })
    // O texto vai sem documento/telefone para a IA
    await naEmpresa(() => pedir.pedir(req, 'cadastrar cliente Ana zap 11 98888-7777'))
    expect(enviados.at(-1)!.conteudo).not.toMatch(/98888/)
  })

  it('XML da nota: lido e conciliado sem IA e sem gravar nada (o banco falso proíbe escrita)', async () => {
    const { pedir, req, usos } = appFalso()
    const nota = await naEmpresa(() => pedir.nota(req, { nome: 'nota.xml', mediaType: 'text/xml', conteudo: Buffer.from(xml('nfe-papelaria-sul.xml')) }))
    expect(nota).toMatchObject({ origem: 'xml', numero: '912', fornecedor: { existente: { id: id(50) } }, itens: [{ comoAchou: 'memoria' }, { comoAchou: 'nome' }] })
    expect(usos).toHaveLength(0)
  })

  it('foto/PDF: o Assistente lê (tarefa nota_compra, esforço médio, com o arquivo) e tudo volta com "confira"; simulador só lê o exemplo', async () => {
    const { pedir, req, usos, enviados } = appFalso()
    const nota = await naEmpresa(() => pedir.nota(req, { nome: 'nota-demo-danfe.pdf', mediaType: 'application/pdf', conteudo: Buffer.from('%PDF-1.4 demo') }))
    expect(nota).toMatchObject({ origem: 'pdf', conferir: true, numero: '4821', fornecedor: { cnpj: '44555666000181', existente: null }, totalNota: '3440.30' })
    expect(nota.itens).toHaveLength(3)
    expect(nota.itens.every((i) => i.conferir)).toBe(true)
    expect(nota.avisos[0]).toMatch(/confira cada valor/)
    expect(enviados[0]).toMatchObject({ tarefa: 'nota_compra', esforco: 'medium', anexos: [{ mediaType: 'application/pdf', nome: 'nota-demo-danfe.pdf' }] })
    expect(usos).toMatchObject([{ recurso: 'nota_compra', itens: 3 }])
    await expect(naEmpresa(() => pedir.nota(req, { nome: 'outra.jpg', mediaType: 'image/jpeg', conteudo: Buffer.from([0xff, 0xd8]) }))).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/Modo de demonstração/) })
  })
})

describe('Peça ao Assistente: prompts, validação e provedor', () => {
  it('intenção: pergunta sem tipo vira desconhecido; nome sem telefone; período só nas vendas', () => {
    expect(validarIntencao({ intencao: 'pergunta', pergunta: null, periodo: null, nome_cliente: null, confianca: 0.9 }).intencao).toBe('desconhecido')
    expect(validarIntencao({ intencao: 'pergunta', pergunta: 'vendas', periodo: null, nome_cliente: 'x', confianca: 2 })).toEqual({ intencao: 'pergunta', pergunta: 'vendas', periodo: 'mes', nomeCliente: null, confianca: 1 })
    expect(validarIntencao({ intencao: 'cliente', pergunta: 'vendas', periodo: 'hoje', nome_cliente: 'Ana 11 98888-7777', confianca: 0.8 })).toMatchObject({ pergunta: null, periodo: null, nomeCliente: 'Ana' })
    const p = pedidoIntencao({ grafica: 'Gráfica Aurora', texto: 'cliente CPF 123.456.789-09 ana@x.com' })
    expect(p.conteudo).not.toMatch(/123\.456|ana@/)
  })

  it('nota pela IA: CNPJ inválido vira null com aviso; item ilegível fica de fora; esquema sem campos extras', () => {
    const l = validarNotaCompra({ ...NOTA_DEMO, fornecedor_cnpj: '11.111.111/1111-11', itens: [...NOTA_DEMO.itens, { codigo: null, descricao: 'borrado', unidade: null, quantidade: 0, valor_unitario: 0, valor_total: 0 }], parcelas: [{ vencimento: '19/11/2026', valor: 10 }] })
    expect(l.cnpj).toBeNull()
    expect(l.itens).toHaveLength(3)
    expect(l.parcelas).toEqual([])
    expect(l.avisos).toHaveLength(3)
    expect(notaDaLeitura(validarNotaCompra(NOTA_DEMO))).toMatchObject({ totalProdutos: '3395.30', totalNota: '3440.30', emitente: { documento: '44555666000181' } })
    expect(ESQUEMA_NOTA_COMPRA.additionalProperties).toBe(false)
  })

  it('Anthropic: foto vai em bloco "image" e PDF em "document", antes do texto', () => {
    expect(conteudoDaMensagem({ conteudo: 'oi' })).toBe('oi')
    expect(conteudoDaMensagem({ conteudo: 'leia', anexos: [{ mediaType: 'application/pdf', dados: 'QUJD', nome: 'a.pdf' }, { mediaType: 'image/png', dados: 'REVG', nome: 'b.png' }] })).toEqual([
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'REVG' } },
      { type: 'text', text: 'leia' },
    ])
  })

  it('período das vendas: hoje, ontem, semana (de segunda), mês e mês passado', () => {
    expect(intervaloDoPeriodo('mes', '2026-10-25')).toMatchObject({ de: '2026-10-01', ate: '2026-10-25' })
    expect(intervaloDoPeriodo('mes_passado', '2026-10-25')).toMatchObject({ de: '2026-09-01', ate: '2026-09-30' })
    expect(intervaloDoPeriodo('semana', '2026-10-25')).toMatchObject({ de: '2026-10-19', ate: '2026-10-25' })
    expect(intervaloDoPeriodo('ontem', '2026-10-01')).toMatchObject({ de: '2026-09-30', ate: '2026-09-30' })
  })
})

describe('Cérebro da gráfica: memória do cliente e cliente novo', () => {
  const historico: HistoricoCliente = {
    nome: 'Carlos',
    clienteDesde: '2025-03-01',
    totalPedidos: 3,
    ultimosPedidos: [
      { numero: 'PED-3', data: '2026-10-10', itens: [{ quantidade: 1000, descricao: 'Cartão de visita', acabamentos: ['Laminação fosca'] }] },
      { numero: 'PED-2', data: '2026-08-01', itens: [{ quantidade: 500, descricao: 'Cartão de visita', acabamentos: ['Laminação fosca'] }, { quantidade: 2, descricao: 'Banner', acabamentos: [] }] },
    ],
    formasPagas: ['Pix', 'Dinheiro', 'Pix'],
    emAberto: 150,
    vencido: 0,
    etiquetas: ['VIP'],
    observacoes: 'Mandar arte para carlos@exemplo.com, CPF 123.456.789-09',
  }

  it('linhas curtas e úteis, sem e-mail, telefone ou documento', () => {
    const linhas = linhasDaMemoria(historico)
    expect(linhas).toEqual([
      '3 pedido(s) na gráfica, cliente desde 03/2025.',
      'Costuma pedir: Cartão de visita.',
      'Último pedido (10/10/2026): 1.000 × Cartão de visita (Laminação fosca).',
      'Acabamentos de costume: Laminação fosca.',
      'Costuma pagar com: Pix.',
      'Em aberto: R$ 150,00.',
      'Etiquetas: VIP.',
      'Observações da equipe: Mandar arte para [e-mail omitido], CPF [número omitido]',
    ])
    const bloco = contextoDoCerebro({ grafica: 'G', empresa: ['Cidade: Centro, Campinas/SP'], regras: ['Quando o pagamento for à vista → 5% de desconto no orçamento'], manual: null, cliente: { nome: 'Carlos', linhas }, areaMinimaM2: null })
    expect(bloco).toContain('<sobre_a_grafica>\n- Cidade: Centro, Campinas/SP\n</sobre_a_grafica>')
    expect(bloco).toContain('<regras_comerciais aplicadas_pelo_sistema="sim">')
    expect(bloco).not.toMatch(/@|123\.456/)
  })

  it('cliente novo do texto: documento não vira telefone; celular = WhatsApp; empresa pelo CNPJ', () => {
    const d = dadosDoTexto('Padaria Pão Quente CNPJ 44.555.666/0001-81 fone (11) 3333-4444 contato@padaria.com')
    expect(d).toEqual({ documento: '44555666000181', telefones: ['1133334444'], email: 'contato@padaria.com' })
    expect(clienteNovo(d, null)).toEqual({ nome: null, tipoPessoa: 'PJ', documento: '44555666000181', whatsapp: null, telefone: '1133334444', email: 'contato@padaria.com' })
    expect(clienteNovo(dadosDoTexto('2 banners'), null)).toBeNull()
    expect(documentoDoTexto('CPF 123.456.789-00')).toBeNull()
  })
})

describe('Simulador: pedidos com vários itens não perdem nenhum', () => {
  const catalogo = ['P1 | Banner em lona | Banners | cobra por m² | acabamentos: A1 Ilhós, A2 Bainha', 'P2 | Cartão de visita | Impressos | cobra por milheiro | acabamentos: nenhum', 'P3 | Panfleto A5 | Impressos | cobra por milheiro | acabamentos: nenhum'].join('\n')
  const ler = (pedido: string) => orcamentoSimulado(`${catalogo}\n\n<pedido_do_cliente>\n${pedido}\n</pedido_do_cliente>`) as { itens: { produto: string; quantidade: number; largura_m: number | null; acabamentos: string[] }[]; nao_identificados: string[]; prazo_desejado: string | null }

  it('"e", vírgulas, quebras de linha, "mil" e "1k": 3 itens com quantidades e medidas', () => {
    const r = ler('2 banners 3x1 com ilhós e bainha, mil cartões de visita frente e verso e 1k panfletos, entrega sexta')
    expect(r.itens.map((i) => [i.produto, i.quantidade])).toEqual([['P1', 2], ['P2', 1000], ['P3', 1000]])
    expect(r.itens[0]).toMatchObject({ largura_m: 3, acabamentos: ['A1', 'A2'] })
    expect(r.prazo_desejado).toBe('sexta')
    const linhas = ler('1.000 cartões\n2 mil panfletos\num banner 2,5x1')
    expect(linhas.itens.map((i) => [i.produto, i.quantidade])).toEqual([['P2', 1000], ['P3', 2000], ['P1', 1]])
    expect(linhas.itens[2]!.largura_m).toBe(2.5)
  })

  it('trecho com quantidade e sem produto não some: vai para "não entendi"', () => {
    const r = ler('500 cartões e 3 canecas personalizadas')
    expect(r.itens).toHaveLength(1)
    expect(r.nao_identificados).toEqual(['3 canecas personalizadas'])
    expect(quantidadeDoTexto('quinhentos panfletos')).toBe(500)
    expect(quantidadeDoTexto('dois mil')).toBe(2000)
    expect(quantidadeDoTexto('banner')).toBeNull()
    expect(partesDoPedido('banner frente e verso e cartão', (t) => /banner|cart/.test(t))).toEqual(['banner frente e verso', 'cartão'])
  })

  it('intenção simulada por palavras-chave', () => {
    const i = (t: string) => intencaoSimulada(`<pedido_da_pessoa>\n${t}\n</pedido_da_pessoa>`)
    expect(i('quanto vendi hoje?')).toMatchObject({ intencao: 'pergunta', pergunta: 'vendas', periodo: 'hoje' })
    expect(i('pedidos atrasados')).toMatchObject({ pergunta: 'pedidos_atrasados' })
    expect(i('orçamentos esperando resposta')).toMatchObject({ pergunta: 'orcamentos_esperando' })
    expect(i('2 banners e 500 cartões')).toMatchObject({ intencao: 'orcamento' })
  })
})
