import { describe, expect, it, vi } from 'vitest'
import { PRESETS_REGRA, aplicarRegras, descreverRegra, regraComercialSchema, regraDoPreset, type OrcamentoDetalhe, type ProdutoCatalogo, type RegraComercialMotor } from '@onprint/shared'
import { mensagemDoOrcamento } from '@/features/orcamentos/mensagem'
import { formDoOrcamento, itemVazio, payloadDoForm } from '@/features/orcamentos/components/editor/formOrcamento'
import { calcularItem, itemParaRegras } from '@/features/orcamentos/components/editor/useCalculoOrcamento'
import { rascunhoDaRegra, rascunhoNovo, regraDoRascunho, trocarAcao, validarRascunho } from './rascunho'

describe('rascunho da regra (editor "Quando… → Faça…")', () => {
  it('todo modelo pronto vai e volta igual (rascunho → API)', () => {
    for (const p of PRESETS_REGRA) {
      const gravada = regraComercialSchema.parse(regraDoPreset(p))
      const v = validarRascunho(rascunhoDaRegra(gravada))
      expect(v.ok, p).toBe(true)
      // Mesma regra ("500" e "500.00" são o mesmo mínimo): mesma frase, condições e combinação
      if (v.ok) {
        expect(descreverRegra(v.regra)).toBe(descreverRegra(gravada))
        expect({ ...v.regra, acao: undefined }).toEqual({ ...gravada, acao: undefined })
      }
    }
  })

  it('quantidades de 1000 ou mais continuam 1000 (sem separador de milhar no campo)', () => {
    const gravada = regraComercialSchema.parse({ ...regraDoPreset('desconto_quantidade'), condicoes: { quantidadeMin: '1000', quantidadeMax: '25000.5' } })
    const r = rascunhoDaRegra(gravada)
    expect(r.quantidadeMin).toBe('1000')
    expect(r.quantidadeMax).toBe('25000,5')
    expect(r.faixas.map((f) => f.minimo)).toEqual(['100', '500'])
    const v = validarRascunho({ ...r, faixas: [{ minimo: '1000', valor: '5' }, { minimo: '10000', valor: '7,5' }] })
    expect(v.ok && v.regra.condicoes).toMatchObject({ quantidadeMin: '1000', quantidadeMax: '25000.5' })
    expect(v.ok && v.regra.acao.tipo === 'desconto' && v.regra.acao.faixas).toEqual([
      { minimo: '1000', valor: '5' },
      { minimo: '10000', valor: '7.5' },
    ])
  })

  it('valores em reais no formato da tela ("1.234,56") viram decimais da API', () => {
    const r = { ...rascunhoNovo(), nome: 'Pedido grande', condicoes: ['valorTotal' as const], valorTotalMin: '1.234,56' }
    const v = validarRascunho(r)
    expect(v.ok && v.regra.condicoes.valorTotalMin).toBe('1234.56')
    const minimo = rascunhoDaRegra(regraComercialSchema.parse(regraDoPreset('pedido_minimo')))
    expect(minimo.valor).toBe('50,00')
  })

  it('condição desligada não vai para a API', () => {
    const r = { ...rascunhoNovo(), nome: 'Teste', etiquetas: ['VIP'], condicoes: [] }
    expect(regraDoRascunho(r).condicoes).toMatchObject({ etiquetas: undefined })
    expect(validarRascunho(r).ok && (validarRascunho(r) as { regra: { condicoes: object } }).regra.condicoes).toEqual({})
  })

  it('trocar a ação começa do padrão dela e mantém o aviso e a frase escritos', () => {
    const r = trocarAcao({ ...rascunhoNovo(), nome: 'X', avisoEquipe: 'Confirme a produção', fraseCliente: 'Oba' }, 'acrescimo')
    expect(r.acaoTipo).toBe('acrescimo')
    expect(r.avisoEquipe).toBe('Confirme a produção')
    expect(trocarAcao(r, 'limite_negociacao').valor).toBe('5')
  })

  it('erros em português para a tela', () => {
    expect(validarRascunho({ ...rascunhoNovo(), nome: '' })).toEqual({ ok: false, erro: 'Dê um nome à regra.' })
    expect(validarRascunho({ ...rascunhoNovo(), nome: 'Regra', valor: '150' })).toMatchObject({ ok: false, erro: 'Percentual entre 0,01 e 100.' })
  })
})

const cartao = {
  id: 'p-cartao',
  codigo: 'CV',
  nome: 'Cartão de visita',
  descricao: null,
  modoCalculo: 'unidade',
  precoVenda: '0.45',
  precoMinimo: '0.40',
  larguraPadrao: null,
  alturaPadrao: null,
  larguraMaxima: null,
  alturaMaxima: null,
  prazoProducaoDias: 3,
  precisaArte: true,
  categoriaId: 'c-cartoes',
  acabamentos: [],
} as unknown as ProdutoCatalogo

describe('regras ao vivo no editor (mesmo motor da API)', () => {
  it('item com 1000 peças: o motor recebe 1000 (não 1) e o desconto sai certo', () => {
    const item = { ...itemVazio(), produto: { id: 'p-cartao', rotulo: 'Cartão' }, quantidade: '1000' }
    const c = calcularItem(item, cartao)
    const e = itemParaRegras(item, c)!
    expect(e.quantidade).toBe('1000')
    const regra: RegraComercialMotor = { id: 'q', prioridade: 1, ...regraComercialSchema.parse({ ...regraDoPreset('desconto_quantidade'), acao: { tipo: 'desconto', modo: 'percentual', valor: '5', nivel: 'item', faixasPor: 'quantidade', faixas: [{ minimo: '1000', valor: '5' }] } }) }
    const r = aplicarRegras({ itens: [e], clienteId: null, etiquetasCliente: [], pagamento: null, dataDesejada: null, hoje: '2026-10-26', origem: 'balcao' }, [regra])
    expect(r.itens[0]!.total).toBe('427.50')
  })

  it('data desejada e origem do Assistente vão no corpo do orçamento', () => {
    const f = { ...formDoOrcamento(), dataDesejada: '2026-10-28', doAssistente: true }
    expect(payloadDoForm(f)).toMatchObject({ dataDesejada: '2026-10-28', origem: 'assistente' })
    expect(payloadDoForm({ ...f, dataDesejada: '', doAssistente: undefined })).toMatchObject({ dataDesejada: null })
    expect(payloadDoForm({ ...f, doAssistente: undefined })).not.toHaveProperty('origem')
  })
})

describe('mensagem do orçamento com as regras ({{descontos}})', () => {
  // O link de aprovação usa a origem da página
  vi.stubGlobal('window', { location: { origin: 'https://app.grafygo.test' } })
  const orcamento = {
    numero: 'ORC-2026-0100',
    cliente: { nome: 'Maria Souza', fantasia: null, cpfCnpj: null },
    itens: [{ descricao: 'Cartão de visita', quantidade: '1000.000', largura: null, altura: null, total: '427.50' }],
    total: '427.50',
    sinalPercentual: '100',
    parcelas: 0,
    intervaloDias: 30,
    prazoDias: 3,
    validade: '2026-11-02',
    tokenPublico: 'tok',
    regras: {
      aplicadas: [{ regraId: 'q', nome: 'Desconto por quantidade', tipo: 'desconto', nivel: 'item', itens: [0], efeito: '−5%', valor: '-22.50', explicacao: '', fraseCliente: 'Desconto de 5% por quantidade' }],
      frasesCliente: ['Desconto de 5% por quantidade'],
    },
  } as unknown as OrcamentoDetalhe

  it('o texto padrão traz a linha logo abaixo do total; a quantidade 1000 sai como 1.000', () => {
    const texto = mensagemDoOrcamento(orcamento, [], 'Ponto Visual')
    expect(texto).toContain('• 1.000× Cartão de visita — R$ 427,50')
    expect(texto).toContain('Total: *R$ 427,50*\nDesconto de 5% por quantidade\nPagamento: À vista na aprovação')
  })

  it('template editado sem a variável: a frase vai no fim da lista de itens', () => {
    const editado = { id: 't', categoria: 'orcamento_enviado', ativo: true, createdAt: '2026-01-01', conteudo: 'Oi!\n{{itens_orcamento}}\nTotal {{valor_total}}' }
    const texto = mensagemDoOrcamento(orcamento, [editado] as never, 'Ponto Visual')
    expect(texto).toBe('Oi!\n• 1.000× Cartão de visita — R$ 427,50\nDesconto de 5% por quantidade\nTotal R$ 427,50')
  })

  it('sem regra aplicada, a linha some', () => {
    const texto = mensagemDoOrcamento({ ...orcamento, regras: {} } as OrcamentoDetalhe, [], 'Ponto Visual')
    expect(texto).toContain('Total: *R$ 427,50*\nPagamento:')
  })
})
