import { describe, expect, it } from 'vitest'
import { cnpjValido, cpfCnpjValido, cpfValido } from './documentos'
import { preencherTemplate } from './templates'

describe('documentos', () => {
  it('valida CPF', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('529.982.247-24')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
  })

  it('valida CNPJ', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11.222.333/0001-80')).toBe(false)
  })

  it('decide entre CPF e CNPJ pelo tamanho', () => {
    expect(cpfCnpjValido('52998224725')).toBe(true)
    expect(cpfCnpjValido('11222333000181')).toBe(true)
  })
})

describe('preencherTemplate', () => {
  it('substitui variáveis e ignora as desconhecidas', () => {
    const texto = 'Olá {{cliente_nome}}, total {{ valor_total }}. {{inexistente}}'
    expect(preencherTemplate(texto, { cliente_nome: 'Ana', valor_total: 'R$ 10,00' })).toBe(
      'Olá Ana, total R$ 10,00. ',
    )
  })
})
