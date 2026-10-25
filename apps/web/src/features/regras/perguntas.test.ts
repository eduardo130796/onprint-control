import { describe, expect, it } from 'vitest'
import { RESPOSTAS_PADRAO, aplicarRegras, planoDasRespostas, regraComercialSchema, regraDoPreset, respostasDasRegras, type ProdutoCatalogo, type RegraComercialMotor } from '@onprint/shared'
import { formDoOrcamento, itemVazio, payloadDoForm } from '@/features/orcamentos/components/editor/formOrcamento'
import { calcularItem, itemParaRegras, seloDeDesconto, totaisDasRegras } from '@/features/orcamentos/components/editor/useCalculoOrcamento'
import { respostasParaApi, respostasParaTela } from './perguntas'
import { rascunhoDaRegra, regraDoRascunho, trocarAcao } from './rascunho'

const cartao = {
  id: 'p-cartao',
  codigo: 'CRT',
  nome: 'Cartão',
  modoCalculo: 'unidade',
  precoVenda: '0.45',
  precoMinimo: null,
  custo: '0.10',
  larguraPadrao: null,
  alturaPadrao: null,
  larguraMaxima: null,
  alturaMaxima: null,
  prazoProducaoDias: 2,
  precisaArte: false,
  categoriaId: 'c-cartoes',
  acabamentos: [],
} as unknown as ProdutoCatalogo

describe('perguntas das regras na tela', () => {
  it('números vão e voltam sem separador de milhar (1000 un continua 1000) e o dinheiro em reais', () => {
    const api = structuredClone(RESPOSTAS_PADRAO)
    api.quantidade = { ligado: true, faixas: [{ aPartirDe: '1000', percentual: '2.5' }], modoUso: 'sugerir' }
    api.minimo = { ligado: true, valor: '1500.00' }
    const tela = respostasParaTela(api)
    expect(tela.quantidade.faixas).toEqual([{ aPartirDe: '1000', percentual: '2,5' }])
    expect(tela.minimo.valor).toBe('1.500,00')
    expect(respostasParaApi(tela).quantidade.faixas).toEqual([{ aPartirDe: '1000', percentual: '2.5' }])
    expect(respostasParaApi(tela).minimo.valor).toBe('1500.00')
    // Vazio vira "0" e a conferência recusa com a mensagem da pergunta
    tela.quantidade.faixas = [{ aPartirDe: '', percentual: '5' }]
    expect(planoDasRespostas(respostasParaApi(tela), []).erros).toEqual([{ pergunta: 'quantidade', mensagem: 'Informe a partir de quantas unidades.' }])
  })

  it('a regra salva pela pergunta abre igual no avançado (com o "Como usar")', () => {
    const r = structuredClone(RESPOSTAS_PADRAO)
    r.aVista = { ligado: true, percentual: '3', modoUso: 'se_pedir' }
    const [op] = planoDasRespostas(r, []).operacoes
    if (op?.tipo !== 'criar') throw new Error('esperava criar')
    const rascunho = rascunhoDaRegra(op.dados)
    expect(rascunho.modoUso).toBe('se_pedir')
    expect(regraComercialSchema.parse(regraDoRascunho(rascunho))).toMatchObject({ modoUso: 'se_pedir', combinacao: 'maior' })
    expect(respostasDasRegras([{ ...op.dados, id: 'x' }]).aVista).toEqual({ ligado: true, percentual: '3', modoUso: 'se_pedir' })
    // Trocar para acréscimo: "sempre"; voltar a desconto: "sugerir"
    const acrescimo = trocarAcao(rascunho, 'acrescimo')
    expect(regraDoRascunho(acrescimo).modoUso).toBe('sempre')
    expect(trocarAcao(acrescimo, 'desconto').modoUso).toBe('sugerir')
  })
})

describe('sugestões das regras no editor do orçamento', () => {
  const regra: RegraComercialMotor = {
    id: '11111111-1111-4111-8111-111111111111',
    prioridade: 1,
    ...regraComercialSchema.parse({ ...regraDoPreset('desconto_quantidade'), acao: { tipo: 'desconto', modo: 'percentual', valor: '5', nivel: 'item', faixasPor: 'quantidade', faixas: [{ minimo: '1000', valor: '5' }] } }),
  }
  const item = { ...itemVazio(), produto: { id: 'p-cartao', rotulo: 'Cartão' }, quantidade: '1000' }
  const entrada = (aceitas: string[]) => ({ itens: [itemParaRegras(item, calcularItem(item, cartao))!], clienteId: null, etiquetasCliente: [], pagamento: null, dataDesejada: null, hoje: '2026-10-26', origem: 'balcao' as const, aceitas })

  it('sugerida: não muda o total até aplicar; aplicada vai no corpo e o selo do item mostra o desconto', () => {
    const antes = aplicarRegras(entrada([]), [regra])
    expect(antes.total).toBe('450.00')
    expect(antes.ofertas).toMatchObject([{ texto: '5% por quantidade', valor: '22.50' }])
    expect(totaisDasRegras(antes).descontos).toBe('0.00')

    const depois = aplicarRegras(entrada([regra.id]), [regra])
    expect(depois.total).toBe('427.50')
    expect(depois.aplicadas[0]).toMatchObject({ aceita: true, texto: '5% por quantidade' })
    expect(totaisDasRegras(depois)).toEqual({ descontos: '22.50', acrescimos: '0.00', ajusteItens: '-22.50' })
    expect(seloDeDesconto({ regras: depois.itens[0] })).toEqual({ selo: '−5%', explicacao: 'Desconto por quantidade −R$ 22,50' })
    expect(seloDeDesconto({ regras: antes.itens[0] })).toBeNull()

    const form = { ...formDoOrcamento(), regrasAceitas: [regra.id] }
    expect(payloadDoForm(form).regrasAceitas).toEqual([regra.id])
    expect(formDoOrcamento().regrasAceitas).toEqual([])
  })
})
