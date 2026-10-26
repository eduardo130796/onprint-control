import { describe, expect, it } from 'vitest'
import { SimuladoProvider } from '../src/integrations/ia/simulado'
import { impedimentoDaNota, resumoDaNota, tituloDoAvisoDaNota } from '../src/modules/assistente/notas-whatsapp'
import { pedidoAjusteOrcamento } from '../src/modules/assistente/prompts-ajuste'
import {
  aplicarItens,
  descontoDaOperacao,
  editavelDoOrcamento,
  validarAjuste,
  type OperacaoAjuste,
  type OrcamentoEditavel,
  type OrcamentoParaAjuste,
} from '../src/modules/whatsapp/ajustes'
import {
  JANELA_ACRESCENTAR_MS,
  destinoDaReacao,
  escolherParaAjustar,
  interpretarVoce,
  linhaDoAnterior,
  textoAcrescimo,
  textoAjuste,
  textoNota,
  type RascunhoCanal,
} from '../src/modules/whatsapp/copiloto'

const agora = new Date('2026-10-26T17:00:00Z')
const antes = (ms: number) => new Date(agora.getTime() - ms)
const min = 60_000

function rascunho(p: Partial<RascunhoCanal> & { orcamentoId: string }): RascunhoCanal {
  return {
    numero: `ORC-2026-0${p.orcamentoId}`,
    cliente: 'Eduardo Júnior',
    total: '552.00',
    status: 'rascunho',
    criadoEm: antes(5 * min),
    avisadoEm: antes(5 * min),
    atualizadoEm: antes(5 * min),
    enviadoEm: null,
    enviadoNoSistemaEm: null,
    descartadoEm: null,
    liberacaoPendente: false,
    ...p,
  }
}

describe('Várias 📝 do mesmo cliente viram um orçamento só', () => {
  it('rascunho pendente das últimas 12 horas: acrescenta (mesmo editado no sistema depois do aviso)', () => {
    const r = rascunho({ orcamentoId: '110', criadoEm: antes(3 * 3_600_000), atualizadoEm: antes(min) })
    expect(destinoDaReacao([r], agora)).toEqual({ acao: 'acrescentar', rascunho: r })
  })
  it('o último já foi enviado, aprovado, convertido ou descartado: cria outro e diz o que houve', () => {
    for (const r of [
      rascunho({ orcamentoId: '112', status: 'enviado' }),
      rascunho({ orcamentoId: '112', enviadoEm: antes(min) }),
      rascunho({ orcamentoId: '112', status: 'aprovado' }),
      rascunho({ orcamentoId: '112', status: 'convertido' }),
      rascunho({ orcamentoId: '112', descartadoEm: antes(min) }),
    ]) {
      expect(destinoDaReacao([r], agora)).toEqual({ acao: 'criar', anterior: r })
    }
    expect(linhaDoAnterior(rascunho({ orcamentoId: '112', status: 'enviado' }))).toBe('O ORC-2026-0112 já foi enviado; montei um novo:')
    expect(linhaDoAnterior(rascunho({ orcamentoId: '112', status: 'convertido' }))).toBe('O ORC-2026-0112 já virou pedido; montei um novo:')
  })
  it('mais velho que 12 horas ou sem nenhum: cria (sem dizer nada do anterior)', () => {
    expect(destinoDaReacao([rascunho({ orcamentoId: '100', criadoEm: antes(JANELA_ACRESCENTAR_MS + min) })], agora)).toEqual({ acao: 'criar', anterior: null })
    expect(destinoDaReacao([], agora)).toEqual({ acao: 'criar', anterior: null })
  })
  it('um enviado e um pendente: o pendente recebe os itens', () => {
    const enviado = rascunho({ orcamentoId: '111', status: 'enviado', criadoEm: antes(30 * min) })
    const pendente = rascunho({ orcamentoId: '113', criadoEm: antes(60 * min) })
    expect(destinoDaReacao([enviado, pendente], agora)).toEqual({ acao: 'acrescentar', rascunho: pendente })
  })
  it('aviso do acréscimo: o que entrou e a lista completa numerada', () => {
    const texto = textoAcrescimo({
      numero: 'ORC-2026-0110',
      cliente: 'Eduardo Júnior',
      clienteNovo: false,
      novos: [{ descricao: 'Cartão de visita', quantidade: '500', total: '120' }],
      itens: [
        { descricao: 'Banner', quantidade: '2', largura: '2', altura: '1', total: '320' },
        { descricao: 'Panfleto', quantidade: '1000', total: '272' },
        { descricao: 'Cartão de visita', quantidade: '500', total: '120' },
      ],
      total: '712',
      conferir: [],
      link: 'http://x/orcamentos/1',
    })
    expect(texto).toBe(
      [
        '➕ Acrescentei ao ORC-2026-0110 (Eduardo Júnior): 500× Cartão de visita — R$ 120',
        '1) 2× Banner 2×1 m — R$ 320',
        '2) 1.000× Panfleto — R$ 272',
        '3) 500× Cartão de visita — R$ 120',
        'Total: *R$ 712*',
        'Responda *ok* para enviar · ou ajuste (ex.: "10% de desconto")',
        'http://x/orcamentos/1',
      ].join('\n'),
    )
  })
})

describe('Nota lida pelo WhatsApp esperando conferência', () => {
  const leitura = { numero: '000.023.456', fornecedor: { nome: 'GRAFPRINT LTDA', fantasia: 'GRAFPRINT', existente: null, cnpj: '1' }, itens: [{}, {}, {}], totalNota: '2885.00', jaLancada: null }
  it('resumo da faixa e do sino', () => {
    const r = resumoDaNota({ id: 'n1', leitura, createdAt: new Date('2026-10-26T13:00:00Z') })
    expect(r).toEqual({ id: 'n1', numero: '000.023.456', fornecedor: 'GRAFPRINT', total: '2885.00', itens: 3, recebidaEm: '2026-10-26T13:00:00.000Z', jaLancada: null })
    expect(tituloDoAvisoDaNota(r)).toBe('Nota 000.023.456 de GRAFPRINT lida pelo WhatsApp: confira e registre')
    // Já lançada por outro caminho (conferido agora): aparece na faixa
    expect(resumoDaNota({ id: 'n1', leitura, createdAt: new Date() }, { id: 'e1', numero: 'ENT-0007' }).jaLancada).toEqual({ id: 'e1', numero: 'ENT-0007' })
    // Leitura estranha não quebra a lista
    expect(resumoDaNota({ id: 'n2', leitura: null, createdAt: new Date() })).toMatchObject({ fornecedor: 'Fornecedor não identificado', total: '0.00', itens: 0 })
  })
  it('registrada não vira entrada de novo; pendente e descartada podem', () => {
    expect(impedimentoDaNota('registrada', 'ENT-0007')).toBe('Esta nota do WhatsApp já foi registrada na entrada ENT-0007.')
    expect(impedimentoDaNota('pendente', null)).toBeNull()
    expect(impedimentoDaNota('descartada', null)).toBeNull()
  })
  it('o texto do "Você" diz que a nota já está no sistema', () => {
    const t = textoNota(
      { origem: 'xml', conferir: false, chave: null, numero: '4821', serie: '1', emissao: null, fornecedor: { cnpj: null, nome: 'Lona Forte', fantasia: null, ie: null, telefone: null, endereco: null, existente: null }, itens: [], totalProdutos: '10', totalNota: '10', parcelas: [], jaLancada: null, avisos: [] },
      'http://x/estoque/entradas/novo?notaWhatsapp=1',
    )
    expect(t.split('\n').at(-1)).toBe('Ela já está no sistema em Estoque › Entradas, esperando sua conferência (nada entra no estoque sem você tocar em "Registrar entrada"): http://x/estoque/entradas/novo?notaWhatsapp=1')
  })
})

// ─── Ajuste pelo "Você" ───

const op = (o: Partial<OperacaoAjuste> & Pick<OperacaoAjuste, 'tipo'>): OperacaoAjuste => ({ item: null, numero: null, altura: null, texto: null, incluir: null, sinalPercentual: null, parcelas: null, forma: null, ...o })

const editavel: OrcamentoEditavel = {
  clienteId: 'c1',
  vendedorId: 'v1',
  validade: '2026-11-02',
  desconto: '0',
  acrescimo: '0',
  frete: '0',
  sinalPercentual: '50',
  parcelas: 1,
  intervaloDias: 30,
  regrasAceitas: [],
  condicoes: '',
  observacoes: '',
  observacoesInternas: 'nota do dono',
  dataDesejada: null,
  itens: [
    { produtoId: 'banner', descricao: '', quantidade: '2', largura: '2', altura: '1', precoUnitario: '80', acabamentoIds: [], desconto: '0', observacao: '', precisaArte: true },
    { produtoId: 'panfleto', descricao: '', quantidade: '1000', largura: null, altura: null, precoUnitario: '160', acabamentoIds: [], desconto: '0', observacao: '', precisaArte: true },
  ],
}
const paraAjuste: OrcamentoParaAjuste = {
  total: '480.00',
  desconto: '0',
  itens: [
    { descricao: '2× Banner em lona 2,0 × 1,0 m — R$ 320,00', acabamentosDoProduto: [{ id: 'ilhos', nome: 'Ilhós a cada 50 cm' }, { id: 'bastao', nome: 'Bastão e corda' }] },
    { descricao: '1.000× Panfleto — R$ 160,00', acabamentosDoProduto: [] },
  ],
}
const ctx = { formas: ['Cartão de crédito', 'Dinheiro', 'Pix'], hoje: '2026-10-26' }

describe('Ajuste pelo "Você": conferir as operações', () => {
  it('aceita o que faz sentido', () => {
    for (const ops of [
      [op({ tipo: 'desconto_percentual', numero: 10 })],
      [op({ tipo: 'desconto_valor', numero: 50 })],
      [op({ tipo: 'total_final', numero: 400 })],
      [op({ tipo: 'remover', item: 2 })],
      [op({ tipo: 'quantidade', item: 1, numero: 3 })],
      [op({ tipo: 'medidas', item: 1, numero: 3, altura: 1 })],
      [op({ tipo: 'acabamento', item: 1, texto: 'ilhós', incluir: true })],
      [op({ tipo: 'pagamento', sinalPercentual: 100, parcelas: 0, forma: 'pix' })],
      [op({ tipo: 'prazo', texto: 'sexta' })],
      [op({ tipo: 'acrescentar', texto: '1 wind banner' })],
    ]) {
      expect(validarAjuste(ops, paraAjuste, ctx)).toEqual({ ok: true })
    }
  })
  it('recusa tudo quando uma não faz sentido (nunca aplica pela metade)', () => {
    expect(validarAjuste([], paraAjuste, ctx).ok).toBe(false)
    expect(validarAjuste([op({ tipo: 'remover', item: 3 })], paraAjuste, ctx)).toEqual({ ok: false, motivo: 'o item 3 (o orçamento tem 2)' })
    expect(validarAjuste([op({ tipo: 'desconto_percentual', numero: 10 }), op({ tipo: 'remover', item: 9 })], paraAjuste, ctx).ok).toBe(false)
    expect(validarAjuste([op({ tipo: 'desconto_percentual', numero: 120 })], paraAjuste, ctx).ok).toBe(false)
    expect(validarAjuste([op({ tipo: 'total_final', numero: 500 })], paraAjuste, ctx)).toEqual({ ok: false, motivo: 'o total já é R$ 480,00 (para cobrar mais, ajuste no sistema)' })
    expect(validarAjuste([op({ tipo: 'acabamento', item: 2, texto: 'ilhós', incluir: true })], paraAjuste, ctx)).toEqual({ ok: false, motivo: 'o acabamento “ilhós” (esse produto não tem)' })
    expect(validarAjuste([op({ tipo: 'pagamento', forma: 'boleto' })], paraAjuste, ctx)).toEqual({ ok: false, motivo: 'a forma de pagamento “boleto” (cadastradas: Cartão de crédito, Dinheiro, Pix)' })
    expect(validarAjuste([op({ tipo: 'prazo', texto: 'semana que vem' })], paraAjuste, ctx).ok).toBe(false)
    expect(validarAjuste([op({ tipo: 'remover', item: 1 }), op({ tipo: 'remover', item: 2 })], paraAjuste, ctx).ok).toBe(false)
    expect(validarAjuste([op({ tipo: 'desconto_percentual', numero: 10 }), op({ tipo: 'desconto_valor', numero: 5 })], paraAjuste, ctx).ok).toBe(false)
  })
})

describe('Ajuste pelo "Você": aplicar sobre o orçamento em memória', () => {
  const novo = { item: { ...editavel.itens[0]!, produtoId: 'wind', quantidade: '1', largura: null, altura: null, precoUnitario: null }, rotulo: '1× Wind banner' }
  it('muda, tira e acrescenta pelo número do aviso (sem perder o resto)', () => {
    const r = aplicarItens(editavel, [op({ tipo: 'quantidade', item: 1, numero: 3 }), op({ tipo: 'remover', item: 2 }), op({ tipo: 'acrescentar', texto: '1 wind banner' })], { ...ctx, itens: paraAjuste.itens, novos: [novo] })
    expect(r.editavel.itens.map((i) => [i.produtoId, i.quantidade, i.precoUnitario])).toEqual([
      ['banner', '3', null],
      ['wind', '1', null],
    ])
    expect(r.editavel.observacoesInternas).toBe('nota do dono')
    expect(r.feito).toEqual(['item 1 (Banner em lona 2,0 × 1,0 m) com 3', 'tirei o item 2 (Panfleto)', 'acrescentei 1× Wind banner'])
    // O original não muda
    expect(editavel.itens).toHaveLength(2)
  })
  it('medidas, acabamento, à vista no Pix e prazo', () => {
    const r = aplicarItens(
      editavel,
      [
        op({ tipo: 'medidas', item: 1, numero: 3, altura: 1 }),
        op({ tipo: 'acabamento', item: 1, texto: 'ilhos', incluir: true }),
        op({ tipo: 'pagamento', sinalPercentual: 100, forma: 'Pix' }),
        op({ tipo: 'prazo', texto: 'pra sexta' }),
      ],
      { ...ctx, itens: paraAjuste.itens, novos: [] },
    )
    expect(r.editavel.itens[0]).toMatchObject({ largura: '3', altura: '1', acabamentoIds: ['ilhos'], precoUnitario: null })
    expect(r.editavel).toMatchObject({ sinalPercentual: '100', parcelas: 0, condicoes: 'Pagamento no Pix.', dataDesejada: '2026-10-30' })
    expect(r.feito).toEqual(['item 1: 3 × 1 m', 'item 1: com Ilhós a cada 50 cm', 'à vista no Pix', 'entrega até 30/10/2026'])
  })
  it('desconto: % sobre o total sem desconto, valor fixo e "faz por"', () => {
    expect(descontoDaOperacao(op({ tipo: 'desconto_percentual', numero: 10 }), { total: '712.00', desconto: '0' })).toEqual({ desconto: '71.20', feito: 'desconto de 10%' })
    expect(descontoDaOperacao(op({ tipo: 'desconto_percentual', numero: 10 }), { total: '690.00', desconto: '22.00' })).toEqual({ desconto: '71.20', feito: 'desconto de 10%' })
    expect(descontoDaOperacao(op({ tipo: 'desconto_valor', numero: 50 }), { total: '712.00', desconto: '0' })).toEqual({ desconto: '50.00', feito: 'desconto de R$ 50,00' })
    expect(descontoDaOperacao(op({ tipo: 'total_final', numero: 600 }), { total: '712.00', desconto: '10' })).toEqual({ desconto: '122.00', feito: 'total de R$ 600,00' })
    expect(descontoDaOperacao(op({ tipo: 'total_final', numero: 800 }), { total: '712.00', desconto: '0' })).toBeNull()
  })
  it('o orçamento salvo vira o formato do editor (preço e acabamentos como estão)', () => {
    const e = editavelDoOrcamento({
      clienteId: 'c1',
      vendedorId: null,
      validade: new Date('2026-11-02T00:00:00Z'),
      desconto: '0',
      acrescimo: '0',
      frete: '0',
      sinalPercentual: '50',
      parcelas: 1,
      intervaloDias: 30,
      condicoes: null,
      observacoes: null,
      observacoesInternas: 'x',
      dataDesejada: null,
      regrasAceitas: [],
      itens: [{ produtoId: 'p', descricao: 'Banner', quantidade: '2', largura: '2', altura: '1', precoUnitario: '80', desconto: '0', observacao: null, precisaArte: true, acabamentos: [{ acabamentoId: 'a' }], produto: { nome: 'Banner' } }],
    })
    expect(e.itens[0]).toEqual({ produtoId: 'p', descricao: '', quantidade: '2', largura: '2', altura: '1', precoUnitario: '80', acabamentoIds: ['a'], desconto: '0', observacao: '', precisaArte: true })
    expect(e.validade).toBe('2026-11-02')
  })
})

describe('Ajuste pelo "Você": para qual orçamento', () => {
  it('o citado; sem citar, só com um pendente recente; enviado não altera', () => {
    const a = rascunho({ orcamentoId: '105' })
    const b = rascunho({ orcamentoId: '106', cliente: 'Ana' })
    expect(escolherParaAjustar({ citado: { orcamentoId: '106', em: antes(min) }, rascunhos: [a, b], agora })).toEqual({ acao: 'ajustar', rascunho: b })
    expect(escolherParaAjustar({ citado: null, rascunhos: [a], agora })).toEqual({ acao: 'ajustar', rascunho: a })
    expect(escolherParaAjustar({ citado: null, rascunhos: [a, b], agora }).acao).toBe('perguntar')
    expect(escolherParaAjustar({ citado: null, rascunhos: [], agora })).toEqual({ acao: 'nenhum' })
    expect(escolherParaAjustar({ citado: { orcamentoId: '105', em: antes(min) }, rascunhos: [{ ...a, status: 'enviado' }], agora }).acao).toBe('estado')
    expect(escolherParaAjustar({ citado: { orcamentoId: '999', em: antes(min) }, rascunhos: [a], agora })).toEqual({ acao: 'apagado' })
  })
  it('os comandos de ajuste são reconhecidos sem IA (o resto vai para o roteador)', () => {
    for (const t of ['10% de desconto', 'desconto de 50 reais', 'faz por 600', 'acrescenta 1 wind banner', 'mais 500 cartões', 'tira os panfletos', 'remove o item 2', 'muda os banners para 3', 'o banner é 3x1', 'com ilhós', 'à vista no Pix', 'entrega pra sexta']) {
      expect(interpretarVoce(t)).toEqual({ tipo: 'ajuste' })
    }
    for (const t of ['quem está devendo?', 'pedidos para entregar hoje', 'orçamento pra Ana: 2 banners 2x1']) expect(interpretarVoce(t)).toEqual({ tipo: 'outro' })
  })
  it('resposta do ajuste: o que foi feito, itens numerados, desconto e total', () => {
    const t = textoAjuste({
      numero: 'ORC-2026-0110',
      cliente: 'Eduardo',
      clienteNovo: false,
      feito: 'desconto de 10%',
      itens: [{ descricao: 'Banner', quantidade: '2', largura: '2', altura: '1', total: '712' }],
      desconto: '71.20',
      total: '640.80',
      conferir: [],
      link: 'http://x/orcamentos/1',
    })
    expect(t).toBe(
      [
        '✏️ ORC-2026-0110 atualizado (desconto de 10%):',
        '1) 2× Banner 2×1 m — R$ 712',
        'Desconto: −R$ 71,20',
        'Total: *R$ 640,80*',
        'Responda *ok* para enviar · ou ajuste (ex.: "10% de desconto")',
        'http://x/orcamentos/1',
      ].join('\n'),
    )
  })
})

describe('Ajuste pelo "Você": o provedor simulado entende os comandos básicos', () => {
  const ler = async (texto: string) => {
    const p = pedidoAjusteOrcamento({
      grafica: 'G',
      numero: 'ORC-1',
      itens: [
        { descricao: '2× Banner em lona — R$ 320,00', acabamentos: ['Ilhós'] },
        { descricao: '1.000× Panfleto — R$ 160,00', acabamentos: [] },
      ],
      pagamento: 'x',
      formas: ['Pix'],
      texto,
    })
    return (await new SimuladoProvider().estruturado(p)).dados
  }
  it('desconto, tirar pelo nome e pelo número, quantidade, acrescentar, à vista, prazo', async () => {
    expect((await ler('10% de desconto')).operacoes).toEqual([op({ tipo: 'desconto_percentual', numero: 10 })])
    expect((await ler('faz por 600')).operacoes).toEqual([op({ tipo: 'total_final', numero: 600 })])
    expect((await ler('tira os panfletos')).operacoes).toEqual([op({ tipo: 'remover', item: 2 })])
    expect((await ler('remove o item 1')).operacoes).toEqual([op({ tipo: 'remover', item: 1 })])
    expect((await ler('muda os banners para 3')).operacoes).toEqual([op({ tipo: 'quantidade', item: 1, numero: 3 })])
    expect((await ler('acrescenta 1 wind banner')).operacoes).toEqual([op({ tipo: 'acrescentar', texto: '1 wind banner' })])
    expect((await ler('à vista no Pix')).operacoes).toEqual([op({ tipo: 'pagamento', sinalPercentual: 100, parcelas: 0, forma: 'Pix' })])
    expect((await ler('à vista no boleto')).operacoes).toEqual([op({ tipo: 'pagamento', sinalPercentual: 100, parcelas: 0, forma: 'Boleto' })])
    expect((await ler('entrega pra sexta')).operacoes).toEqual([op({ tipo: 'prazo', texto: 'sexta' })])
    const confuso = await ler('deixa mais bonito')
    expect(confuso.confianca).toBeLessThan(0.7)
  })
})
