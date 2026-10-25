import { describe, expect, it } from 'vitest'
import {
  aplicarRegras,
  descreverRegra,
  diasUteisAte,
  lerRegrasDoOrcamento,
  motivosDeLiberacao,
  normalizarEtiqueta,
  regraDoPreset,
  resumoParaGravar,
  textosParaCliente,
  type EntradaRegras,
  type ItemParaRegras,
  type RegraComercialMotor,
} from './regras-comerciais'
import { PRESETS_REGRA, acaoRegraSchema, condicoesRegraSchema, modoUsoDaRegra, regraComercialSchema, type AcaoRegraInput, type CondicoesRegra } from './schemas/regras'

// ─── Montagem ───

let seq = 0
/** Regra já validada pelo schema (como sai do banco) */
function regra(acao: AcaoRegraInput, condicoes: Partial<CondicoesRegra> = {}, extra: Partial<RegraComercialMotor> = {}): RegraComercialMotor {
  seq++
  return {
    id: `r${String(seq).padStart(3, '0')}`,
    nome: extra.nome ?? `Regra ${seq}`,
    ativa: true,
    prioridade: seq,
    combinacao: 'soma',
    ...extra,
    condicoes: condicoesRegraSchema.parse(condicoes),
    acao: acaoRegraSchema.parse(acao),
  }
}

/** Item por unidade: quantidade × preço (sem acabamentos) */
function item(quantidade: string, preco: string, extra: Partial<ItemParaRegras> = {}): ItemParaRegras {
  const valor = (Number(quantidade) * Number(preco)).toFixed(2)
  return {
    produtoId: 'p-cartao',
    categoriaId: 'c-cartoes',
    descricao: 'Cartão',
    quantidade,
    quantidadeCobrada: quantidade,
    precoUnitario: preco,
    precoCatalogo: preco,
    valorProduto: valor,
    valorAcabamentos: '0',
    ...extra,
  }
}

function entrada(itens: ItemParaRegras[], extra: Partial<EntradaRegras> = {}): EntradaRegras {
  return {
    itens,
    clienteId: 'cli-1',
    etiquetasCliente: [],
    pagamento: { sinalPercentual: '50', parcelas: 1 },
    dataDesejada: null,
    // Segunda-feira
    hoje: '2026-10-26',
    origem: 'balcao',
    ...extra,
  }
}

const desconto = (valor: string, nivel: 'item' | 'orcamento' = 'item', modo: 'percentual' | 'valor' = 'percentual'): AcaoRegraInput => ({ tipo: 'desconto', modo, valor, nivel })
const acrescimo = (valor: string, nivel: 'item' | 'orcamento' = 'orcamento', modo: 'percentual' | 'valor' = 'percentual'): AcaoRegraInput => ({ tipo: 'acrescimo', modo, valor, nivel })

// ─── Condições ───

describe('condições', () => {
  it('sem condição: vale sempre', () => {
    const r = aplicarRegras(entrada([item('10', '10')]), [regra(desconto('10'))])
    expect(r.itens[0]!.ajuste).toBe('-10.00')
    expect(r.total).toBe('90.00')
  })

  it('produto e categoria escolhem os itens (lista vale com OU)', () => {
    const itens = [item('10', '10'), item('10', '10', { produtoId: 'p-banner', categoriaId: 'c-banners' })]
    const porProduto = aplicarRegras(entrada(itens), [regra(desconto('10'), { produtoIds: ['00000000-0000-4000-8000-000000000001'] })])
    expect(porProduto.aplicadas).toHaveLength(0)
    const uuid = '00000000-0000-4000-8000-00000000000a'
    const comUuid = [item('10', '10', { produtoId: uuid }), item('10', '10')]
    const r = aplicarRegras(entrada(comUuid), [regra(desconto('10'), { produtoIds: [uuid] })])
    expect(r.itens.map((i) => i.ajuste)).toEqual(['-10.00', '0.00'])
    const cat = '00000000-0000-4000-8000-0000000000c1'
    const r2 = aplicarRegras(entrada([item('10', '10', { categoriaId: cat }), item('10', '10')]), [regra(desconto('10'), { categoriaIds: [cat, '00000000-0000-4000-8000-0000000000c2'] })])
    expect(r2.itens.map((i) => i.ajuste)).toEqual(['-10.00', '0.00'])
  })

  it('quantidade ≥ e ≤ (inclusive), também com 1000 ou mais', () => {
    const regras = [regra(desconto('5'), { quantidadeMin: '1000', quantidadeMax: '5000' })]
    const r = aplicarRegras(entrada([item('999', '0.1'), item('1000', '0.1'), item('5000', '0.1'), item('5001', '0.1')]), regras)
    expect(r.itens.map((i) => i.ajuste)).toEqual(['0.00', '-5.00', '-25.00', '0.00'])
  })

  it('quantidade com vírgula e milhar ("1.500,5") vira 1500.5 no schema', () => {
    expect(condicoesRegraSchema.parse({ quantidadeMin: '1.500,5' }).quantidadeMin).toBe('1500.5')
    expect(condicoesRegraSchema.parse({ quantidadeMin: '1000' }).quantidadeMin).toBe('1000')
  })

  it('valor do item e valor total olham o valor antes das regras', () => {
    const itens = [item('1', '100'), item('1', '30')]
    const r = aplicarRegras(entrada(itens), [regra(desconto('10'), { valorItemMin: '50' }), regra(desconto('10'), { valorItemMax: '50' })])
    expect(r.itens.map((i) => i.ajuste)).toEqual(['-10.00', '-3.00'])
    expect(aplicarRegras(entrada(itens), [regra(desconto('10', 'orcamento'), { valorTotalMin: '130' })]).ajusteOrcamento).toBe('-13.00')
    expect(aplicarRegras(entrada(itens), [regra(desconto('10', 'orcamento'), { valorTotalMin: '130.01' })]).aplicadas).toHaveLength(0)
    expect(aplicarRegras(entrada(itens), [regra(desconto('10', 'orcamento'), { valorTotalMax: '129.99' })]).aplicadas).toHaveLength(0)
  })

  it('etiqueta do cliente sem diferença de maiúsculas e acentos; cliente específico', () => {
    const rg = [regra(desconto('10'), { etiquetas: ['Revenda', 'VIP'] })]
    expect(aplicarRegras(entrada([item('1', '100')], { etiquetasCliente: ['revenda'] }), rg).total).toBe('90.00')
    expect(aplicarRegras(entrada([item('1', '100')], { etiquetasCliente: ['Vip '] }), rg).total).toBe('90.00')
    expect(aplicarRegras(entrada([item('1', '100')], { etiquetasCliente: ['Atacado'] }), rg).total).toBe('100.00')
    expect(normalizarEtiqueta(' Gráfica ÉLITE ')).toBe('grafica elite')
    const cli = '00000000-0000-4000-8000-0000000000aa'
    expect(aplicarRegras(entrada([item('1', '100')], { clienteId: cli }), [regra(desconto('10'), { clienteIds: [cli] })]).total).toBe('90.00')
    expect(aplicarRegras(entrada([item('1', '100')], { clienteId: null }), [regra(desconto('10'), { clienteIds: [cli] })]).total).toBe('100.00')
  })

  it('pagamento: à vista = entrada de 100%; parcelado = o resto; sem plano, não vale', () => {
    const aVista = [regra(desconto('3', 'orcamento'), { pagamento: 'a_vista' })]
    const parcelado = [regra(acrescimo('2'), { pagamento: 'parcelado' })]
    expect(aplicarRegras(entrada([item('1', '100')], { pagamento: { sinalPercentual: '100', parcelas: 0 } }), aVista).total).toBe('97.00')
    expect(aplicarRegras(entrada([item('1', '100')], { pagamento: { sinalPercentual: '99.99', parcelas: 1 } }), aVista).total).toBe('100.00')
    expect(aplicarRegras(entrada([item('1', '100')], { pagamento: null }), aVista).total).toBe('100.00')
    expect(aplicarRegras(entrada([item('1', '100')], { pagamento: { sinalPercentual: '0', parcelas: 3 } }), parcelado).total).toBe('102.00')
    expect(aplicarRegras(entrada([item('1', '100')], { pagamento: { sinalPercentual: '100', parcelas: 0 } }), parcelado).total).toBe('100.00')
  })

  it('prazo pedido: menos de N dias úteis até a data desejada (fim de semana não conta)', () => {
    // Sexta 30/10 → segunda 02/11 = 1 dia útil
    expect(diasUteisAte('2026-10-30', '2026-11-02')).toBe(1)
    expect(diasUteisAte('2026-10-26', '2026-10-26')).toBe(0)
    expect(diasUteisAte('2026-10-26', '2026-10-20')).toBe(0)
    const urgente = [regra(acrescimo('20'), { prazoMenorQueDias: 2 })]
    expect(aplicarRegras(entrada([item('1', '100')], { hoje: '2026-10-26', dataDesejada: '2026-10-27' }), urgente).total).toBe('120.00')
    expect(aplicarRegras(entrada([item('1', '100')], { hoje: '2026-10-26', dataDesejada: '2026-10-28' }), urgente).total).toBe('100.00')
    expect(aplicarRegras(entrada([item('1', '100')], { hoje: '2026-10-30', dataDesejada: '2026-11-02' }), urgente).total).toBe('120.00')
    expect(aplicarRegras(entrada([item('1', '100')], { dataDesejada: null }), urgente).total).toBe('100.00')
  })

  it('período (inclusive) e dia da semana da data do orçamento', () => {
    const periodo = [regra(desconto('10'), { periodoInicio: '2026-11-01', periodoFim: '2026-11-30' })]
    expect(aplicarRegras(entrada([item('1', '100')], { hoje: '2026-10-31' }), periodo).total).toBe('100.00')
    expect(aplicarRegras(entrada([item('1', '100')], { hoje: '2026-11-01' }), periodo).total).toBe('90.00')
    expect(aplicarRegras(entrada([item('1', '100')], { hoje: '2026-11-30' }), periodo).total).toBe('90.00')
    expect(aplicarRegras(entrada([item('1', '100')], { hoje: '2026-12-01' }), periodo).total).toBe('100.00')
    // 26/10/2026 é segunda (1); 31/10 é sábado (6)
    const sabado = [regra(desconto('10'), { diasSemana: [6] })]
    expect(aplicarRegras(entrada([item('1', '100')], { hoje: '2026-10-26' }), sabado).total).toBe('100.00')
    expect(aplicarRegras(entrada([item('1', '100')], { hoje: '2026-10-31' }), sabado).total).toBe('90.00')
  })

  it('origem do orçamento', () => {
    const rg = [regra(desconto('5'), { origens: ['vitrine', 'whatsapp'] })]
    expect(aplicarRegras(entrada([item('1', '100')], { origem: 'vitrine' }), rg).total).toBe('95.00')
    expect(aplicarRegras(entrada([item('1', '100')], { origem: 'balcao' }), rg).total).toBe('100.00')
  })

  it('todas as condições somam com E', () => {
    const rg = [regra(desconto('10'), { etiquetas: ['Revenda'], quantidadeMin: '100', pagamento: 'a_vista' })]
    const base = { etiquetasCliente: ['Revenda'], pagamento: { sinalPercentual: '100', parcelas: 0 } }
    expect(aplicarRegras(entrada([item('100', '1')], base), rg).total).toBe('90.00')
    expect(aplicarRegras(entrada([item('99', '1')], base), rg).total).toBe('99.00')
    expect(aplicarRegras(entrada([item('100', '1')], { ...base, etiquetasCliente: [] }), rg).total).toBe('100.00')
  })

  it('regra desativada não vale', () => {
    expect(aplicarRegras(entrada([item('1', '100')]), [regra(desconto('10'), {}, { ativa: false })]).aplicadas).toHaveLength(0)
  })
})

// ─── Ações ───

describe('ações de valor', () => {
  it('desconto em R$ por item e no orçamento; nunca deixa negativo', () => {
    const r = aplicarRegras(entrada([item('1', '30'), item('1', '5')]), [regra(desconto('10', 'item', 'valor'))])
    expect(r.itens.map((i) => i.ajuste)).toEqual(['-10.00', '-5.00'])
    expect(r.itens.map((i) => i.total)).toEqual(['20.00', '0.00'])
    const o = aplicarRegras(entrada([item('1', '30')]), [regra(desconto('50', 'orcamento', 'valor'))])
    expect(o.ajusteOrcamento).toBe('-30.00')
    expect(o.total).toBe('0.00')
  })

  it('acréscimo % e R$, no item e no orçamento', () => {
    const r = aplicarRegras(entrada([item('2', '50')]), [regra(acrescimo('10', 'item')), regra(acrescimo('15', 'orcamento', 'valor'))])
    expect(r.itens[0]!.ajuste).toBe('10.00')
    expect(r.ajusteOrcamento).toBe('15.00')
    expect(r.total).toBe('125.00')
  })

  it('faixas por quantidade: vale a maior faixa alcançada; abaixo da primeira, nada', () => {
    const rg = [regra({ tipo: 'desconto', modo: 'percentual', valor: '0', nivel: 'item', faixasPor: 'quantidade', faixas: [{ minimo: '500', valor: '10' }, { minimo: '100', valor: '5' }] })]
    const r = aplicarRegras(entrada([item('99', '1'), item('100', '1'), item('499', '1'), item('1000', '1')]), rg)
    expect(r.itens.map((i) => i.ajuste)).toEqual(['0.00', '-5.00', '-24.95', '-100.00'])
    expect(r.itens[3]!.regras[0]!.efeito).toBe('−10%')
  })

  it('faixas por valor no orçamento', () => {
    const rg = [regra({ tipo: 'desconto', modo: 'percentual', valor: '0', nivel: 'orcamento', faixasPor: 'valor', faixas: [{ minimo: '500', valor: '5' }, { minimo: '1000', valor: '8' }] })]
    expect(aplicarRegras(entrada([item('1', '499.99')]), rg).ajusteOrcamento).toBe('0.00')
    expect(aplicarRegras(entrada([item('1', '500')]), rg).ajusteOrcamento).toBe('-25.00')
    expect(aplicarRegras(entrada([item('1', '1200')]), rg).ajusteOrcamento).toBe('-96.00')
  })

  it('ação de orçamento com condição de item: % sobre os itens que atendem', () => {
    const cat = '00000000-0000-4000-8000-0000000000c1'
    const r = aplicarRegras(entrada([item('1', '100', { categoriaId: cat }), item('1', '300')]), [regra(desconto('10', 'orcamento'), { categoriaIds: [cat] })])
    expect(r.ajusteOrcamento).toBe('-10.00')
    expect(r.aplicadas[0]!.explicacao).toBe('Regra ' + seq + ' (−10% = −R$ 10,00)')
  })

  it('preço especial troca o preço de tabela (por unidade de cálculo) e o selo diz o preço', () => {
    const r = aplicarRegras(entrada([item('1000', '0.45', { unidade: 'un' })]), [regra({ tipo: 'preco_especial', valor: '0.30' }, {}, { nome: 'Revenda' })])
    expect(r.itens[0]!.ajuste).toBe('-150.00')
    expect(r.itens[0]!.total).toBe('300.00')
    expect(r.itens[0]!.regras[0]!.efeito).toBe('Preço especial R$ 0,30/un')
  })

  it('preço especial: não vale com preço digitado; só o primeiro por item; mais caro vira acréscimo', () => {
    const digitado = item('10', '9', { precoCatalogo: '10' })
    const r = aplicarRegras(entrada([digitado]), [regra({ tipo: 'preco_especial', valor: '5' })])
    expect(r.itens[0]!.ajuste).toBe('0.00')
    expect(r.ignoradas[0]!.motivo).toContain('preço foi digitado')
    const dois = aplicarRegras(entrada([item('10', '10')]), [regra({ tipo: 'preco_especial', valor: '8' }), regra({ tipo: 'preco_especial', valor: '5' })])
    expect(dois.itens[0]!.ajuste).toBe('-20.00')
    const caro = aplicarRegras(entrada([item('10', '10')]), [regra({ tipo: 'preco_especial', valor: '12' })])
    expect(caro.itens[0]!.ajuste).toBe('20.00')
  })

  it('pedido mínimo: completa até o mínimo ou cobra a taxa; por último e sem o frete', () => {
    const completar = [regra({ tipo: 'pedido_minimo', valor: '50', modo: 'completar' })]
    const r = aplicarRegras(entrada([item('1', '38')], { frete: '20' }), completar)
    expect(r.ajusteOrcamento).toBe('12.00')
    expect(r.total).toBe('70.00')
    expect(aplicarRegras(entrada([item('1', '50')]), completar).aplicadas).toHaveLength(0)
    const taxa = [regra({ tipo: 'pedido_minimo', valor: '50', modo: 'taxa', taxa: '7.50' })]
    expect(aplicarRegras(entrada([item('1', '38')]), taxa).total).toBe('45.50')
    // Depois dos descontos (das regras e manual)
    const comDesconto = aplicarRegras(entrada([item('1', '60')], { desconto: '5' }), [regra(desconto('10')), ...completar])
    expect(comDesconto.ajusteOrcamento).toBe('1.00')
    expect(comDesconto.total).toBe('50.00')
    // Orçamento vazio não cobra mínimo
    expect(aplicarRegras(entrada([]), completar).total).toBe('0.00')
  })

  it('pedido mínimo: só o primeiro por prioridade', () => {
    const r = aplicarRegras(entrada([item('1', '10')]), [regra({ tipo: 'pedido_minimo', valor: '30', modo: 'completar' }), regra({ tipo: 'pedido_minimo', valor: '100', modo: 'completar' })])
    expect(r.total).toBe('30.00')
    expect(r.ignoradas).toHaveLength(1)
  })
})

describe('ações sem valor', () => {
  it('sugestão aparece (não entra sozinha) e some se o produto já está no orçamento', () => {
    const arte = '00000000-0000-4000-8000-0000000000a1'
    const rg = [regra({ tipo: 'sugerir_item', texto: 'oferecer a criação da arte', produtoId: arte, obrigatorio: false })]
    const r = aplicarRegras(entrada([item('1', '100')]), rg)
    expect(r.sugestoes).toEqual([{ regraId: rg[0]!.id, texto: 'oferecer a criação da arte', produtoId: arte, obrigatorio: false }])
    expect(r.total).toBe('100.00')
    expect(r.aprovacoes).toHaveLength(0)
    expect(aplicarRegras(entrada([item('1', '100'), item('1', '30', { produtoId: arte })]), rg).sugestoes).toHaveLength(0)
  })

  it('item obrigatório faltando pede aprovação', () => {
    const r = aplicarRegras(entrada([item('1', '100')]), [regra({ tipo: 'sugerir_item', texto: 'instalação', produtoId: '00000000-0000-4000-8000-0000000000b1', obrigatorio: true }, {}, { nome: 'Banner com instalação' })])
    expect(r.aprovacoes.map((a) => a.motivo)).toEqual(['Banner com instalação: falta instalação.'])
  })

  it('aprovação, bloqueio, aviso e frase', () => {
    const r = aplicarRegras(entrada([item('1', '100')]), [
      regra({ tipo: 'exigir_aprovacao', motivo: 'pedido acima de 5 m²' }, {}, { nome: 'Grande' }),
      regra({ tipo: 'bloquear', motivo: 'sem visita técnica' }, {}, { nome: 'Fachada' }),
      regra({ tipo: 'aviso', texto: 'Confirmar a cor Pantone.' }),
      regra({ tipo: 'frase_cliente', texto: 'Arte inclusa.' }),
    ])
    expect(r.aprovacoes.map((a) => a.motivo)).toEqual(['Grande: pedido acima de 5 m²'])
    expect(r.bloqueios.map((a) => a.motivo)).toEqual(['Fachada: sem visita técnica'])
    expect(r.avisos.map((a) => a.texto)).toEqual(['Confirmar a cor Pantone.'])
    expect(r.frasesCliente).toEqual(['Arte inclusa.'])
    expect(r.total).toBe('100.00')
    expect(motivosDeLiberacao(r)).toEqual(['Fachada: sem visita técnica', 'Grande: pedido acima de 5 m²'])
  })

  it('aviso para a equipe e frase do cliente junto do acréscimo ({valor} vira o percentual)', () => {
    const urg = regraComercialSchema.parse(regraDoPreset('urgencia'))
    const r = aplicarRegras(entrada([item('1', '100')], { dataDesejada: '2026-10-27' }), [{ ...urg, id: 'u', prioridade: 1 }])
    expect(r.total).toBe('120.00')
    expect(r.avisos[0]!.texto).toContain('urgente')
    expect(r.frasesCliente).toEqual(['Taxa de urgência de 20%'])
  })
})

// ─── Combinação e prioridade ───

describe('combinação e prioridade', () => {
  it('"soma": percentuais somam sobre a mesma base (5% + 10% = 15%)', () => {
    const r = aplicarRegras(entrada([item('1', '100')]), [regra(desconto('5')), regra(desconto('10'))])
    expect(r.itens[0]!.ajuste).toBe('-15.00')
    expect(r.itens[0]!.regras.map((e) => e.efeito)).toEqual(['−5%', '−10%'])
  })

  it('"maior vence": o maior desconto não acumula; perde para a soma dos acumuláveis se ela for maior', () => {
    // Quantidade 5% (soma) = R$ 5 × Pix 3% (maior) = R$ 3 → valem os acumuláveis
    const qtd = regra(desconto('5'), { quantidadeMin: '10' }, { nome: 'Quantidade' })
    const pix = regra(desconto('3', 'orcamento'), { pagamento: 'a_vista' }, { nome: 'Pix', combinacao: 'maior' })
    const aVista = { pagamento: { sinalPercentual: '100', parcelas: 0 } }
    const r = aplicarRegras(entrada([item('10', '10')], aVista), [qtd, pix])
    expect(r.total).toBe('95.00')
    expect(r.ignoradas.map((i) => i.nome)).toEqual(['Pix'])
    expect(r.ignoradas[0]!.motivo).toContain('os outros descontos juntos dão mais')
    // Sem o desconto por quantidade (9 peças), o Pix vale
    const r2 = aplicarRegras(entrada([item('9', '10')], aVista), [qtd, pix])
    expect(r2.total).toBe('87.30')
    // Pix maior que a soma: vale só o Pix
    const pix10 = regra(desconto('10', 'orcamento'), { pagamento: 'a_vista' }, { nome: 'Pix 10', combinacao: 'maior' })
    const r3 = aplicarRegras(entrada([item('10', '10')], aVista), [qtd, pix10])
    expect(r3.total).toBe('90.00')
    expect(r3.ignoradas.map((i) => i.nome)).toEqual(['Quantidade'])
    expect(r3.ignoradas[0]!.motivo).toContain('vale “Pix 10”')
  })

  it('"maior vence" entre si: vale só o maior; empate fica com o primeiro por prioridade', () => {
    const a = regra(desconto('5'), {}, { combinacao: 'maior', nome: 'A' })
    const b = regra(desconto('8'), {}, { combinacao: 'maior', nome: 'B' })
    expect(aplicarRegras(entrada([item('1', '100')]), [a, b]).total).toBe('92.00')
    const c = regra(desconto('8'), {}, { combinacao: 'maior', nome: 'C' })
    const r = aplicarRegras(entrada([item('1', '100')]), [b, c])
    expect(r.aplicadas.map((x) => x.nome)).toEqual(['B'])
  })

  it('empate entre "maior" e a soma: ficam os acumuláveis', () => {
    const r = aplicarRegras(entrada([item('1', '100')]), [regra(desconto('5'), {}, { nome: 'S' }), regra(desconto('5'), {}, { combinacao: 'maior', nome: 'M' })])
    expect(r.aplicadas.map((x) => x.nome)).toEqual(['S'])
  })

  it('acréscimos sempre somam, mesmo com "maior"', () => {
    const r = aplicarRegras(entrada([item('1', '100')]), [regra(acrescimo('10'), {}, { combinacao: 'maior' }), regra(acrescimo('5'), {}, { combinacao: 'maior' })])
    expect(r.total).toBe('115.00')
  })

  it('ordem determinística por prioridade (depois nome); a lista de aplicadas segue a ordem', () => {
    const r1 = regra(desconto('1'), {}, { nome: 'Zeta', prioridade: 2 })
    const r2 = regra(desconto('2'), {}, { nome: 'Alfa', prioridade: 2 })
    const r3 = regra(desconto('3'), {}, { nome: 'Beta', prioridade: 1 })
    const a = aplicarRegras(entrada([item('1', '100')]), [r1, r2, r3])
    const b = aplicarRegras(entrada([item('1', '100')]), [r3, r1, r2])
    expect(a.aplicadas.map((x) => x.nome)).toEqual(['Beta', 'Alfa', 'Zeta'])
    expect(b).toEqual(a)
  })

  it('o limite de negociação e o desconto de item que zera o item seguem a prioridade', () => {
    const r = aplicarRegras(entrada([item('1', '10')]), [regra(desconto('8', 'item', 'valor')), regra(desconto('8', 'item', 'valor'))])
    expect(r.itens[0]!.ajuste).toBe('-10.00')
    expect(r.itens[0]!.regras.map((e) => e.valor)).toEqual(['-8.00', '-2.00'])
  })
})

// ─── Aprovação ───

describe('preço mínimo e limite de negociação', () => {
  it('regra que leva o preço abaixo do mínimo pede aprovação', () => {
    const r = aplicarRegras(entrada([item('100', '1', { precoMinimo: '0.95' })]), [regra(desconto('10'))])
    expect(r.itens[0]!.abaixoDoMinimo).toBe(true)
    expect(r.aprovacoes[0]!.motivo).toContain('abaixo do mínimo')
    expect(aplicarRegras(entrada([item('100', '1', { precoMinimo: '0.90' })]), [regra(desconto('10'))]).aprovacoes).toHaveLength(0)
  })

  it('preço digitado já abaixo do mínimo não é das regras (segue o fluxo do item)', () => {
    const r = aplicarRegras(entrada([item('10', '0.5', { precoCatalogo: '1', precoMinimo: '0.8' })]), [regra(desconto('10'))])
    expect(r.itens[0]!.abaixoDoMinimo).toBe(false)
  })

  it('desconto manual acima do limite pede aprovação (itens + orçamento + preço digitado)', () => {
    const limite = regra({ tipo: 'limite_negociacao', percentual: '5' })
    expect(aplicarRegras(entrada([item('1', '100', { desconto: '5' })]), [limite]).aprovacoes).toHaveLength(0)
    const r = aplicarRegras(entrada([item('1', '100', { desconto: '5' })], { desconto: '1' }), [limite])
    expect(r.descontoManualPercentual).toBe('6.00')
    expect(r.aprovacoes[0]!.motivo).toBe('Desconto manual de 6% passa do limite de negociação (5%).')
    const digitado = aplicarRegras(entrada([item('10', '9', { precoCatalogo: '10' })]), [limite])
    expect(digitado.descontoManualPercentual).toBe('10.00')
    expect(digitado.aprovacoes).toHaveLength(1)
  })

  it('o limite é sobre o valor já com as regras', () => {
    // 100 − 10% = 90; desconto manual de 4,50 = 5% → dentro
    const r = aplicarRegras(entrada([item('1', '100', { desconto: '4.5' })]), [regra(desconto('10')), regra({ tipo: 'limite_negociacao', percentual: '5' })])
    expect(r.descontoManualPercentual).toBe('5.00')
    expect(r.aprovacoes).toHaveLength(0)
    expect(r.total).toBe('85.50')
  })

  it('sem regra de limite, qualquer desconto manual passa', () => {
    expect(aplicarRegras(entrada([item('1', '100', { desconto: '50' })]), []).aprovacoes).toHaveLength(0)
  })
})

// ─── Arredondamento e números grandes ───

describe('arredondamento e quantidades grandes', () => {
  it('cada valor em centavos, meio para cima', () => {
    // 3% de 33,35 = 1,0005 → 1,00; 5% de 0,30 = 0,015 → 0,02
    expect(aplicarRegras(entrada([item('1', '33.35')]), [regra(desconto('3'))]).itens[0]!.ajuste).toBe('-1.00')
    expect(aplicarRegras(entrada([item('1', '0.30')]), [regra(desconto('5'))]).itens[0]!.ajuste).toBe('-0.02')
  })

  it('1000, 10.000 e 1.000.000 de peças sem perder casas', () => {
    const r = aplicarRegras(entrada([item('1000', '0.45'), item('10000', '0.12'), item('1000000', '0.013')]), [regra(desconto('7.5'), { quantidadeMin: '1000' })])
    expect(r.itens.map((i) => i.ajuste)).toEqual(['-33.75', '-90.00', '-975.00'])
    expect(r.subtotal).toBe('13551.25')
  })

  it('m² com área cobrada: o preço especial usa a quantidade cobrada', () => {
    // 3 peças de 2 × 1 m = 6 m² a R$ 50 = 300; especial R$ 40/m² = 240
    const banner = item('3', '50', { quantidadeCobrada: '6', valorProduto: '300.00', unidade: 'm²' })
    const r = aplicarRegras(entrada([banner]), [regra({ tipo: 'preco_especial', valor: '40' })])
    expect(r.itens[0]!.total).toBe('240.00')
    expect(r.itens[0]!.regras[0]!.efeito).toBe('Preço especial R$ 40,00/m²')
  })

  it('acabamentos entram no valor do item (base dos percentuais)', () => {
    const r = aplicarRegras(entrada([item('1', '100', { valorAcabamentos: '20' })]), [regra(desconto('10'))])
    expect(r.itens[0]!.bruto).toBe('120.00')
    expect(r.itens[0]!.ajuste).toBe('-12.00')
  })

  it('total = itens − desconto + acréscimo + frete + regras do orçamento', () => {
    const r = aplicarRegras(entrada([item('2', '50', { desconto: '10' })], { desconto: '5', acrescimo: '3', frete: '15' }), [regra(acrescimo('10', 'orcamento', 'valor'))])
    expect(r.subtotal).toBe('90.00')
    expect(r.total).toBe('113.00')
  })
})

// ─── Gravação, textos e modelos ───

describe('gravado no orçamento e textos', () => {
  it('resumo gravado e lido de volta; JSON vazio de orçamento antigo', () => {
    const r = aplicarRegras(entrada([item('100', '1')]), [regra(desconto('5'), {}, { nome: 'Quantidade' })])
    const gravado = JSON.parse(JSON.stringify(resumoParaGravar(r, new Date('2026-10-26T12:00:00Z'))))
    expect(lerRegrasDoOrcamento(gravado).itens[0]![0]!.efeito).toBe('−5%')
    expect(lerRegrasDoOrcamento({}).aplicadas).toEqual([])
    expect(lerRegrasDoOrcamento(null).limiteNegociacao).toBeNull()
  })

  it('para o cliente: a frase da regra; sem frase, um texto neutro (sem o nome interno)', () => {
    const comFrase = regra({ tipo: 'desconto', modo: 'percentual', valor: '5', nivel: 'item', fraseCliente: 'Desconto de {valor} por quantidade' })
    const semFrase = regra(acrescimo('20'), {}, { nome: 'Cliente chato' })
    const r = aplicarRegras(entrada([item('1', '100')]), [comFrase, semFrase])
    expect(textosParaCliente(r)).toEqual(['Desconto de 5% por quantidade', 'Acréscimo de 20%'])
  })

  it('explicação para a equipe', () => {
    const r = aplicarRegras(entrada([item('100', '1')]), [regra(desconto('5'), {}, { nome: 'Desconto por quantidade' })])
    expect(r.aplicadas[0]!.explicacao).toBe('Desconto por quantidade (−5%)')
  })

  it('descrição em português ("Quando… → …")', () => {
    const cat = '00000000-0000-4000-8000-0000000000c1'
    const d = descreverRegra(
      { condicoes: condicoesRegraSchema.parse({ categoriaIds: [cat], etiquetas: ['Revenda'] }), acao: acaoRegraSchema.parse(desconto('10')), combinacao: 'soma' },
      { categorias: { [cat]: 'Cartões' } },
    )
    expect(d).toBe('Quando a categoria for Cartões e o cliente tiver a etiqueta Revenda → 10% de desconto no item')
    expect(descreverRegra({ condicoes: {}, acao: acaoRegraSchema.parse({ tipo: 'limite_negociacao', percentual: '5' }) })).toBe('Em todo orçamento → desconto manual até 5% sem gerente')
    const pix = regraComercialSchema.parse(regraDoPreset('desconto_a_vista'))
    expect(descreverRegra(pix)).toBe('Quando o pagamento for à vista (entrada de 100%) → 3% de desconto no orçamento (não junta com outro desconto: vale o maior; o vendedor escolhe se aplica)')
  })

  it('todos os modelos prontos passam no schema', () => {
    for (const p of PRESETS_REGRA) expect(regraComercialSchema.safeParse(regraDoPreset(p)).success, p).toBe(true)
  })

  it('schema: percentual acima de 100, faixas repetidas e período invertido são recusados', () => {
    expect(acaoRegraSchema.safeParse(desconto('120')).success).toBe(false)
    expect(acaoRegraSchema.safeParse({ ...desconto('5'), faixasPor: 'quantidade', faixas: [{ minimo: '10', valor: '5' }, { minimo: '10', valor: '6' }] }).success).toBe(false)
    expect(acaoRegraSchema.safeParse({ ...desconto('5', 'orcamento'), faixasPor: 'quantidade', faixas: [{ minimo: '10', valor: '5' }] }).success).toBe(false)
    expect(condicoesRegraSchema.safeParse({ periodoInicio: '2026-12-01', periodoFim: '2026-11-01' }).success).toBe(false)
    expect(acaoRegraSchema.safeParse({ tipo: 'pedido_minimo', valor: '50', modo: 'taxa' }).success).toBe(false)
    // Condições vazias saem do JSON
    expect(condicoesRegraSchema.parse({ produtoIds: [], etiquetas: [], quantidadeMin: '', pagamento: null })).toEqual({})
  })
})

describe('modo de uso dos descontos (sempre / sugerir / só se o cliente pedir)', () => {
  const faixasQtd = (minimo: string, valor: string): AcaoRegraInput => ({ tipo: 'desconto', modo: 'percentual', valor, nivel: 'item', faixasPor: 'quantidade', faixas: [{ minimo, valor }], fraseCliente: 'Desconto de {valor} por quantidade' })

  it('"sempre" aplica sozinho, como antes', () => {
    const r = aplicarRegras(entrada([item('10', '10')]), [regra(desconto('5'), {}, { modoUso: 'sempre' })])
    expect(r.total).toBe('95.00')
    expect(r.ofertas).toEqual([])
    expect(r.aplicadas[0]!.aceita).toBeUndefined()
  })

  it('"sugerir" não aplica: vira sugestão com o valor e o texto para o vendedor', () => {
    const q = regra(faixasQtd('10', '5'), {}, { modoUso: 'sugerir', tipo: 'desconto_quantidade', nome: 'Desconto por quantidade' })
    const r = aplicarRegras(entrada([item('10', '47')]), [q])
    expect(r.total).toBe('470.00')
    expect(r.aplicadas).toEqual([])
    expect(r.frasesCliente).toEqual([])
    expect(r.ofertas).toEqual([
      { regraId: q.id, nome: 'Desconto por quantidade', modo: 'sugerir', valor: '23.50', efeito: '5%', texto: '5% por quantidade', fraseCliente: 'Desconto de 5% por quantidade', itens: [0], condicao: null },
    ])
  })

  it('sugestão aceita aplica (marcada como aceita) e some das ofertas; ao recalcular continua valendo', () => {
    const q = regra(faixasQtd('10', '5'), {}, { modoUso: 'sugerir', tipo: 'desconto_quantidade' })
    const aceita = aplicarRegras(entrada([item('10', '47')], { aceitas: [q.id] }), [q])
    expect(aceita.total).toBe('446.50')
    expect(aceita.aplicadas[0]).toMatchObject({ regraId: q.id, aceita: true, valor: '-23.50' })
    expect(aceita.aceitas).toEqual([q.id])
    expect(aceita.ofertas).toEqual([])
    // Mais peças (recalcula): continua aplicada, sobre o valor novo
    expect(aplicarRegras(entrada([item('20', '47')], { aceitas: [q.id] }), [q]).total).toBe('893.00')
    // Abaixo da faixa: a regra deixa de servir e nada é aplicado (o aceite fica guardado, sem efeito)
    const abaixo = aplicarRegras(entrada([item('5', '47')], { aceitas: [q.id] }), [q])
    expect(abaixo.total).toBe('235.00')
    expect(abaixo.aceitas).toEqual([])
  })

  it('"se pedir" vira margem de negociação; com o pagamento errado, diz a condição', () => {
    const pix = regra({ ...desconto('3', 'orcamento') }, { pagamento: 'a_vista' }, { modoUso: 'se_pedir', tipo: 'desconto_a_vista' })
    const aVista = aplicarRegras(entrada([item('10', '10')], { pagamento: { sinalPercentual: '100', parcelas: 0 } }), [pix])
    expect(aVista.total).toBe('100.00')
    expect(aVista.ofertas).toMatchObject([{ regraId: pix.id, modo: 'se_pedir', valor: '3.00', texto: '3% à vista ou Pix', condicao: null }])
    const parcelado = aplicarRegras(entrada([item('10', '10')]), [pix])
    expect(parcelado.ofertas).toMatchObject([{ regraId: pix.id, modo: 'se_pedir', valor: '3.00', condicao: 'se pagar à vista ou Pix' }])
    // Aceito com o pagamento errado: não aplica (a condição continua valendo)
    expect(aplicarRegras(entrada([item('10', '10')], { aceitas: [pix.id] }), [pix]).total).toBe('100.00')
    expect(aplicarRegras(entrada([item('10', '10')], { aceitas: [pix.id], pagamento: { sinalPercentual: '100', parcelas: 0 } }), [pix]).total).toBe('97.00')
  })

  it('o valor da sugestão é a diferença real: "vale o maior" e pedido mínimo entram na conta', () => {
    const revenda = regra(desconto('10'), { etiquetas: ['Revenda'] }, { modoUso: 'sempre', combinacao: 'maior', tipo: 'cliente_especial' })
    const qtd = regra(faixasQtd('10', '5'), {}, { modoUso: 'sugerir', combinacao: 'maior', tipo: 'desconto_quantidade' })
    // Já vale 10% (maior): 5% por quantidade não muda nada — não é oferta
    expect(aplicarRegras(entrada([item('10', '10')], { etiquetasCliente: ['revenda'] }), [revenda, qtd]).ofertas).toEqual([])
    // Revenda sugerida e quantidade aceita: a revenda vale só a diferença (10% − 5%)
    const revSug = { ...revenda, modoUso: 'sugerir' as const }
    const r = aplicarRegras(entrada([item('10', '10')], { etiquetasCliente: ['Revenda'], aceitas: [qtd.id] }), [revSug, qtd])
    expect(r.total).toBe('95.00')
    expect(r.ofertas).toMatchObject([{ regraId: revenda.id, valor: '5.00', texto: '10% para Revenda' }])
    // Abaixo do pedido mínimo o desconto não muda o total: não é oferta
    const minimo = regra({ tipo: 'pedido_minimo', valor: '200', modo: 'completar' })
    expect(aplicarRegras(entrada([item('10', '10')]), [qtd, minimo]).ofertas).toEqual([])
  })

  it('desconto aceito é da regra: não conta no limite de negociação; o manual continua contando', () => {
    const q = regra(desconto('10'), {}, { modoUso: 'sugerir' })
    const limite = regra({ tipo: 'limite_negociacao', percentual: '5' })
    const aceita = aplicarRegras(entrada([item('10', '10')], { aceitas: [q.id] }), [q, limite])
    expect(aceita.total).toBe('90.00')
    expect(aceita.descontoManualPercentual).toBe('0.00')
    expect(aceita.aprovacoes).toEqual([])
    // + R$ 9 manual = 10% sobre os R$ 90 com a regra: passa do limite
    const comManual = aplicarRegras(entrada([item('10', '10')], { aceitas: [q.id], desconto: '9' }), [q, limite])
    expect(comManual.descontoManualPercentual).toBe('10.00')
    expect(comManual.aprovacoes).toHaveLength(1)
  })

  it('só desconto e preço especial têm modo: acréscimo "sugerir" vale sempre', () => {
    const urg = regra(acrescimo('20'), {}, { modoUso: 'sugerir' })
    expect(aplicarRegras(entrada([item('10', '10')]), [urg]).total).toBe('120.00')
  })

  it('aceites e ofertas vão para o resumo gravado e voltam iguais', () => {
    const q = regra(desconto('5'), {}, { modoUso: 'sugerir' })
    const p = regra(desconto('3', 'orcamento'), {}, { modoUso: 'se_pedir' })
    const r = aplicarRegras(entrada([item('10', '10')], { aceitas: [q.id] }), [q, p])
    const lido = lerRegrasDoOrcamento(JSON.parse(JSON.stringify(resumoParaGravar(r))))
    expect(lido.aceitas).toEqual([q.id])
    expect(lido.ofertas.map((o) => o.regraId)).toEqual([p.id])
    expect(lerRegrasDoOrcamento({}).ofertas).toEqual([])
  })

  it('schema: modo só nos descontos; sem modo, regra nova de desconto = sugerir', () => {
    expect(modoUsoDaRegra('desconto', undefined)).toBe('sugerir')
    expect(modoUsoDaRegra('desconto', 'se_pedir')).toBe('se_pedir')
    expect(modoUsoDaRegra('acrescimo', 'sugerir')).toBe('sempre')
    expect(modoUsoDaRegra('pedido_minimo', null)).toBe('sempre')
    expect(regraComercialSchema.parse(regraDoPreset('desconto_quantidade')).modoUso).toBe('sugerir')
    expect(regraComercialSchema.parse(regraDoPreset('urgencia')).modoUso).toBe('sempre')
  })
})

