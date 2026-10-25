import { describe, expect, it } from 'vitest'
import { aplicarRegras, type RegraComercialMotor } from './regras-comerciais'
import { RESPOSTAS_PADRAO, planoDasRespostas, regrasAvancadas, respostasComTexto, respostasDasRegras, type RespostasRegras } from './regras-perguntas'
import { regraComercialSchema } from './schemas/regras'

/** O que o banco teria depois de gravar o plano (ids em sequência) */
function gravar(regras: RegraComercialMotor[], resp: RespostasRegras): RegraComercialMotor[] {
  const plano = planoDasRespostas(resp, regras)
  expect(plano.erros).toEqual([])
  let lista = [...regras]
  for (const op of plano.operacoes) {
    if (op.tipo === 'criar') lista.push({ ...op.dados, id: `n${lista.length + 1}`, prioridade: lista.length + 1 })
    if (op.tipo === 'atualizar') lista = lista.map((r) => (r.id === op.id ? { ...r, ...op.dados } : r))
    if (op.tipo === 'desligar') lista = lista.map((r) => (r.id === op.id ? { ...r, ativa: false } : r))
  }
  return lista
}

/** As respostas do teste ao vivo do dono */
function respostasDoDono(): RespostasRegras {
  const r = structuredClone(RESPOSTAS_PADRAO)
  r.quantidade = { ligado: true, faixas: [{ aPartirDe: '10', percentual: '5' }], modoUso: 'sugerir' }
  r.aVista = { ligado: true, percentual: '3', modoUso: 'se_pedir' }
  r.especiais = { ligado: true, lista: [{ etiqueta: 'Revenda', percentual: '10' }], modoUso: 'sugerir' }
  r.urgencia = { ligado: true, percentual: '20', dias: '2' }
  r.minimo = { ligado: true, valor: '50' }
  r.limite = { ligado: true, percentual: '5' }
  return r
}

describe('regras em perguntas', () => {
  it('sem regras: tudo desligado, com exemplos; nada a gravar', () => {
    expect(respostasDasRegras([])).toEqual(RESPOSTAS_PADRAO)
    expect(planoDasRespostas(RESPOSTAS_PADRAO, []).operacoes).toEqual([])
  })

  it('respostas viram regras válidas (não juntam, frase pronta, urgência sempre) e voltam iguais', () => {
    const regras = gravar([], respostasDoDono())
    expect(regras).toHaveLength(6)
    const qtd = regras.find((r) => r.tipo === 'desconto_quantidade')!
    expect(qtd).toMatchObject({ combinacao: 'maior', modoUso: 'sugerir', acao: { faixas: [{ minimo: '10', valor: '5' }], faixasPor: 'quantidade', nivel: 'item' } })
    expect(regras.find((r) => r.tipo === 'urgencia')).toMatchObject({ modoUso: 'sempre', condicoes: { prazoMenorQueDias: 2 }, acao: { avisoEquipe: expect.any(String) } })
    expect(regras.find((r) => r.tipo === 'desconto_a_vista')).toMatchObject({ modoUso: 'se_pedir', condicoes: { pagamento: 'a_vista' } })
    for (const r of regras) expect(regraComercialSchema.safeParse(r).success, r.nome).toBe(true)
    expect(respostasDasRegras(regras)).toEqual(respostasDoDono())
    // Nada mudou: nada a gravar
    expect(planoDasRespostas(respostasDoDono(), regras).operacoes).toEqual([])
    expect(regrasAvancadas(regras)).toEqual([])
  })

  it('o motor usa as regras das perguntas: sugere quantidade e revenda, aplica urgência e mínimo', () => {
    const regras = gravar([], respostasDoDono())
    const item = { produtoId: 'p', descricao: 'Cartão', quantidade: '1000', quantidadeCobrada: '1000', precoUnitario: '0.2', precoCatalogo: '0.2', valorProduto: '200.00', valorAcabamentos: '0' }
    const r = aplicarRegras({ itens: [item], clienteId: 'c', etiquetasCliente: ['Revenda'], pagamento: { sinalPercentual: '100', parcelas: 0 }, dataDesejada: '2026-10-27', hoje: '2026-10-26', origem: 'balcao' }, regras)
    // Urgência (+20%) aplicada sozinha; descontos esperam o vendedor
    expect(r.total).toBe('240.00')
    expect(r.ofertas.map((o) => [o.modo, o.texto, o.valor])).toEqual([
      ['sugerir', '5% por quantidade', '10.00'],
      ['se_pedir', '3% à vista ou Pix', '6.00'],
      ['sugerir', '10% para Revenda', '20.00'],
    ])
  })

  it('mudar um número atualiza só a regra da pergunta; "não" desliga (e ligar de novo traz os números)', () => {
    const regras = gravar([], respostasDoDono())
    const r = respostasDoDono()
    r.quantidade.faixas = [{ aPartirDe: '10', percentual: '5' }, { aPartirDe: '100', percentual: '8' }]
    r.minimo.ligado = false
    const plano = planoDasRespostas(r, regras)
    expect(plano.operacoes.map((o) => [o.tipo, o.pergunta])).toEqual([
      ['atualizar', 'quantidade'],
      ['desligar', 'minimo'],
    ])
    const depois = gravar(regras, r)
    expect(respostasDasRegras(depois).minimo).toEqual({ ligado: false, valor: '50' })
    r.minimo.ligado = true
    expect(planoDasRespostas(r, depois).operacoes.map((o) => o.tipo)).toEqual(['atualizar'])
  })

  it('clientes especiais: uma regra por etiqueta; tirar a etiqueta desliga a regra dela', () => {
    const r = respostasDoDono()
    r.especiais.lista = [
      { etiqueta: 'Revenda', percentual: '10' },
      { etiqueta: 'VIP', percentual: '7' },
    ]
    const regras = gravar([], r)
    expect(regras.filter((x) => x.tipo === 'cliente_especial').map((x) => x.nome)).toEqual(['Preço especial: Revenda', 'Preço especial: VIP'])
    r.especiais.lista = [{ etiqueta: 'revenda', percentual: '12' }]
    const plano = planoDasRespostas(r, regras)
    expect(plano.operacoes.map((o) => [o.tipo, o.pergunta])).toEqual([
      ['atualizar', 'especiais'],
      ['desligar', 'especiais'],
    ])
    expect(respostasDasRegras(gravar(regras, r)).especiais.lista).toEqual([{ etiqueta: 'revenda', percentual: '12' }])
  })

  it('regra do mesmo tipo com outra forma (feita no avançado) fica no avançado e a pergunta não mexe nela', () => {
    const avancada: RegraComercialMotor = {
      id: 'x1',
      nome: 'Quantidade só para cartões',
      ativa: true,
      prioridade: 1,
      tipo: 'desconto_quantidade',
      combinacao: 'soma',
      condicoes: { categoriaIds: ['00000000-0000-4000-8000-000000000001'] },
      acao: { tipo: 'desconto', modo: 'percentual', valor: '5', nivel: 'item', faixasPor: 'quantidade', faixas: [{ minimo: '100', valor: '5' }] },
    }
    expect(respostasDasRegras([avancada]).quantidade.ligado).toBe(false)
    expect(regrasAvancadas([avancada])).toEqual([avancada])
    const plano = planoDasRespostas(respostasDoDono(), [avancada])
    expect(plano.operacoes.some((o) => o.tipo !== 'criar')).toBe(false)
  })

  it('números inválidos voltam como erro da pergunta (nada é gravado dela)', () => {
    const r = respostasDoDono()
    r.aVista.percentual = '150'
    r.urgencia.dias = '0'
    r.quantidade.faixas = [{ aPartirDe: '', percentual: '5' }]
    const plano = planoDasRespostas(r, [])
    expect(plano.erros.map((e) => e.pergunta).sort()).toEqual(['aVista', 'quantidade', 'urgencia'])
    expect(plano.operacoes.map((o) => o.pergunta).sort()).toEqual(['especiais', 'limite', 'minimo'])
  })

  it('o que o Assistente entendeu liga só as perguntas citadas, sem mexer no resto', () => {
    const { respostas, mudadas } = respostasComTexto(RESPOSTAS_PADRAO, {
      quantidade: { faixas: [{ aPartirDe: '10', percentual: '5' }], modoUso: null },
      aVista: { percentual: '3', modoUso: 'se_pedir' },
      especiais: null,
      urgencia: null,
      minimo: { valor: '50' },
      limite: null,
      naoEntendido: [],
    })
    expect(mudadas).toEqual(['quantidade', 'aVista', 'minimo'])
    expect(respostas.quantidade).toEqual({ ligado: true, faixas: [{ aPartirDe: '10', percentual: '5' }], modoUso: 'sugerir' })
    expect(respostas.aVista.modoUso).toBe('se_pedir')
    expect(respostas.urgencia).toEqual(RESPOSTAS_PADRAO.urgencia)
  })
})
