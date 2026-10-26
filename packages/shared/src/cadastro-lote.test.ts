import { describe, expect, it } from 'vitest'
import {
  acabamentoPeloNome,
  acharDuplicado,
  cadastroLoteSchema,
  impedimentoDaLinha,
  itemDaLinha,
  linhasDoCsv,
  modoDaUnidade,
  nomesParecidos,
  normalizarNomeProduto,
  textoDaPlanilha,
  valorDoTexto,
  type LinhaCadastro,
} from './cadastro-lote'

const linha = (l: Partial<LinhaCadastro> = {}): LinhaCadastro => ({
  chave: 'l1',
  nome: 'Banner lona 440g',
  tipo: 'produto',
  categoriaId: null,
  categoriaNova: 'Comunicação visual',
  modoCalculo: 'm2',
  unidadeSigla: 'm²',
  precoVenda: '65.00',
  larguraPadrao: null,
  alturaPadrao: null,
  larguraMaxima: null,
  alturaMaxima: null,
  prazoProducaoDias: null,
  precisaArte: true,
  acabamentos: [],
  materiais: [],
  descricao: null,
  conferir: [],
  duplicado: null,
  origem: 'texto',
  ...l,
})

describe('Cadastrar vários: normalização das linhas', () => {
  it('nome: uma linha, sem espaços sobrando, primeira letra maiúscula', () => {
    expect(normalizarNomeProduto('  banner   lona 440g \n')).toBe('Banner lona 440g')
    expect(normalizarNomeProduto('   ')).toBe('')
  })

  it('preço do texto: R$, milhar, vírgula; sem número ou zero = falta preço', () => {
    expect(valorDoTexto('R$ 65')).toBe('65.00')
    expect(valorDoTexto('R$ 1.250,50')).toBe('1250.50')
    expect(valorDoTexto('4,00 a unidade')).toBe('4.00')
    expect(valorDoTexto('R$1.250')).toBe('1250.00')
    expect(valorDoTexto('12.5')).toBe('12.50')
    expect(valorDoTexto('sob consulta')).toBeNull()
    expect(valorDoTexto('0,00')).toBeNull()
    expect(valorDoTexto(null)).toBeNull()
    expect(valorDoTexto(90)).toBe('90.00')
  })

  it('modo de cálculo pela unidade escrita na tabela', () => {
    expect(modoDaUnidade('m²')).toBe('m2')
    expect(modoDaUnidade('por m2')).toBe('m2')
    expect(modoDaUnidade('milheiro')).toBe('milheiro')
    expect(modoDaUnidade('o mil')).toBe('milheiro')
    expect(modoDaUnidade('metro linear')).toBe('metro_linear')
    expect(modoDaUnidade('hora')).toBe('hora')
    expect(modoDaUnidade('a unidade')).toBe('unidade')
    expect(modoDaUnidade('')).toBeNull()
    expect(modoDaUnidade('promoção')).toBeNull()
  })

  it('só cria com nome e preço', () => {
    expect(impedimentoDaLinha(linha())).toBeNull()
    expect(impedimentoDaLinha(linha({ precoVenda: null }))).toBe('Falta o preço.')
    expect(impedimentoDaLinha(linha({ nome: ' ' }))).toBe('Falta o nome.')
  })

  it('linha → item do POST: unidade do modo, categoria nova só sem a do cadastro, acabamento novo sem preço fica de fora', () => {
    const item = itemDaLinha(
      linha({
        unidadeSigla: null,
        categoriaId: '00000000-0000-4000-8000-000000000001',
        acabamentos: [
          { id: '00000000-0000-4000-8000-000000000002', nome: 'Ilhós', tipoCobranca: 'por_perimetro', valor: '2.00' },
          { id: null, nome: 'Bastão', tipoCobranca: 'por_metro_linear', valor: '12.00' },
          { id: null, nome: 'Bainha', tipoCobranca: 'por_perimetro', valor: null },
        ],
      }),
    )
    expect(item.unidadeSigla).toBe('m²')
    expect(item.categoriaNova).toBeNull()
    expect(item.acabamentos?.map((a) => a.nome)).toEqual(['Ilhós', 'Bastão'])
    const lote = cadastroLoteSchema.parse({ itens: [item] })
    expect(lote.itens[0]!.precoVenda).toBe('65.00')
    expect(lote.itens[0]!.permitirDuplicado).toBe(false)
  })

  it('o POST recusa produto sem preço e preço mínimo acima do de venda', () => {
    expect(cadastroLoteSchema.safeParse({ itens: [itemDaLinha(linha({ precoVenda: null }))] }).success).toBe(false)
    expect(cadastroLoteSchema.safeParse({ itens: [{ ...itemDaLinha(linha()), precoMinimo: '80' }] }).success).toBe(false)
    expect(cadastroLoteSchema.safeParse({ itens: [] }).success).toBe(false)
  })
})

describe('Cadastrar vários: duplicados e acabamentos pelo nome', () => {
  it('nomes do mesmo produto escritos de outro jeito', () => {
    expect(nomesParecidos('Banner lona 440g', 'Banner em lona 440 g')).toBe(true)
    expect(nomesParecidos('Cartão de visita 4x4 couché 300g', 'Cartão de Visita 4×4 Couche 300 g')).toBe(true)
    expect(nomesParecidos('Adesivo vinil impresso', 'Adesivo de vinil')).toBe(true)
    expect(nomesParecidos('Placa PVC 3mm com adesivo', 'Placa em PVC 3 mm adesivada')).toBe(true)
  })

  it('produtos diferentes não são duplicados', () => {
    expect(nomesParecidos('Banner lona 440g', 'Faixa lona 440g')).toBe(false)
    expect(nomesParecidos('Cartão de visita 4x4', 'Cartão de visita 4x0')).toBe(false)
    expect(nomesParecidos('Adesivo perfurado para vidro', 'Adesivo vinil impresso')).toBe(false)
    expect(nomesParecidos('Caneca', 'Camiseta')).toBe(false)
    expect(nomesParecidos('Adesivo vinil fosco', 'Adesivo vinil impresso')).toBe(false)
    expect(nomesParecidos('Caneca porcelana personalizada', 'Caneca personalizada')).toBe(false)
  })

  it('acha o duplicado no cadastro', () => {
    const cadastro = [
      { id: '1', nome: 'Banner em lona 440 g' },
      { id: '2', nome: 'Faixa em lona 440 g' },
    ]
    expect(acharDuplicado('banner lona 440g', cadastro)?.id).toBe('1')
    expect(acharDuplicado('Wind banner', cadastro)).toBeNull()
  })

  it('acabamento do cadastro pelo nome citado (um só candidato)', () => {
    const cadastro = [
      { id: 'a', nome: 'Ilhós a cada 50 cm' },
      { id: 'b', nome: 'Laminação fosca' },
      { id: 'c', nome: 'Laminação fosca frente' },
      { id: 'd', nome: 'Bainha' },
    ]
    expect(acabamentoPeloNome('ilhós', cadastro)?.id).toBe('a')
    expect(acabamentoPeloNome('Bainha', cadastro)?.id).toBe('d')
    expect(acabamentoPeloNome('laminação fosca', cadastro)?.id).toBe('b')
    // "laminação" sozinha combina com duas: não chuta
    expect(acabamentoPeloNome('laminação', cadastro)).toBeNull()
    expect(acabamentoPeloNome('verniz', cadastro)).toBeNull()
  })
})

describe('Cadastrar vários: planilha CSV', () => {
  it('separador ; com aspas e linhas vazias', () => {
    const csv = '﻿Produto;Unidade;Preço\r\n"Banner ""promo""";m²;65,00\r\n\r\nCartão 4x4;milheiro;120\n'
    expect(linhasDoCsv(csv)).toEqual([
      ['Produto', 'Unidade', 'Preço'],
      ['Banner "promo"', 'm²', '65,00'],
      ['Cartão 4x4', 'milheiro', '120'],
    ])
  })

  it('separador vírgula e texto para a leitura', () => {
    const linhas = linhasDoCsv('nome,preco\nCaneca,35\n')
    expect(linhas).toEqual([
      ['nome', 'preco'],
      ['Caneca', '35'],
    ])
    expect(textoDaPlanilha(linhas)).toBe('nome | preco\nCaneca | 35')
  })
})
