import { describe, expect, it } from 'vitest'
import { CATALOGO_INICIAL, linhaDoModelo, type LinhaCadastro } from '@onprint/shared'
import { marcadasIniciais, paraCriar, precoDoCampo } from './cadastroLote'

const linha = (l: Partial<LinhaCadastro>): LinhaCadastro => ({
  chave: 'x',
  nome: 'Caneca',
  tipo: 'produto',
  categoriaId: null,
  categoriaNova: null,
  modoCalculo: 'unidade',
  unidadeSigla: 'un',
  precoVenda: '32.00',
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

describe('Cadastrar vários: revisão', () => {
  it('a tabela vem marcada, menos o parecido com o cadastro; os modelos vêm desmarcados', () => {
    const linhas = [
      linha({ chave: 'a' }),
      linha({ chave: 'b', duplicado: { id: 'p1', nome: 'Caneca personalizada' } }),
      linhaDoModelo(CATALOGO_INICIAL[0]!, { categorias: [], acabamentos: [], produtos: [] }),
    ]
    expect([...marcadasIniciais(linhas)]).toEqual(['a'])
  })

  it('preço digitado: vírgula e milhar; vazio ou zero = falta preço', () => {
    expect(precoDoCampo('1.234,56')).toBe('1234.56')
    expect(precoDoCampo('65')).toBe('65.00')
    expect(precoDoCampo('0,00')).toBeNull()
    expect(precoDoCampo('')).toBeNull()
  })

  it('só as marcadas vão; sem preço impede o "Criar"; o parecido marcado vai com "criar mesmo assim"', () => {
    const linhas = [
      linha({ chave: 'a' }),
      linha({ chave: 'b', precoVenda: null }),
      linha({ chave: 'c', duplicado: { id: 'p1', nome: 'Caneca' } }),
      linha({ chave: 'd' }),
    ]
    const r = paraCriar(linhas, new Set(['a', 'b', 'c']))
    expect(r.impedidas.get('b')).toBe('Falta o preço.')
    expect(r.itens).toHaveLength(2)
    expect(r.itens.map((i) => i.permitirDuplicado)).toEqual([false, true])
  })
})
