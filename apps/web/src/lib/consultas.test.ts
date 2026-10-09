import { describe, expect, it } from 'vitest'
import type { DadosCnpj } from '@onprint/shared'
import { camposVazios, candidatosCnpj, candidatosEndereco, enderecoPrincipalDaReceita, listarRotulos, textoEnderecoCep } from './consultas'

const DADOS: DadosCnpj = {
  cnpj: '33000167000101',
  razaoSocial: 'PETROLEO BRASILEIRO S A PETROBRAS',
  nomeFantasia: 'PETROBRAS - EDISE',
  situacao: 'ATIVA',
  ativa: true,
  email: '',
  telefone: '2121660000',
  endereco: { cep: '20031170', logradouro: 'Avenida Republica do Chile', numero: '65', complemento: '', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ' },
  inscricaoEstadual: '81281882',
}
const MAPA = { razaoSocial: 'nome', nomeFantasia: 'fantasia', email: 'email', telefone: 'telefone', ie: 'ie' }

describe('preenchimento pelo CNPJ', () => {
  it('só campos vazios recebem valor, e só quando a Receita tem o dado', () => {
    const atuais = { nome: 'Cliente já digitado', fantasia: '  ', email: '', telefone: '', ie: '123' }
    const r = camposVazios(atuais, candidatosCnpj(DADOS, MAPA))
    expect(r.map((c) => [c.campo, c.valor])).toEqual([
      ['fantasia', 'PETROBRAS - EDISE'],
      ['telefone', '(21) 2166-0000'],
    ])
  })

  it('endereço só entra com o bloco de endereço vazio (sem misturar dois endereços)', () => {
    expect(candidatosEndereco(DADOS, { cep: '01310-100', logradouro: '' })).toEqual([])
    expect(candidatosEndereco(DADOS, { cep: '', logradouro: 'Rua X' })).toEqual([])
    const r = candidatosEndereco(DADOS, { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' })
    expect(Object.fromEntries(r.map((c) => [c.campo, c.valor]))).toEqual({
      cep: '20031-170',
      logradouro: 'Avenida Republica do Chile',
      numero: '65',
      bairro: 'Centro',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
    })
  })

  it('lista os rótulos sem repetir', () => {
    expect(listarRotulos(['razão social', 'endereço', 'endereço', 'e-mail'])).toBe('razão social, endereço e e-mail')
    expect(listarRotulos(['endereço'])).toBe('endereço')
  })

  it('endereço principal do cliente exige logradouro, cidade e UF', () => {
    expect(enderecoPrincipalDaReceita(DADOS.endereco)).toMatchObject({ tipo: 'principal', logradouro: 'Avenida Republica do Chile', uf: 'RJ' })
    expect(enderecoPrincipalDaReceita({ ...DADOS.endereco, logradouro: '' })).toBeNull()
  })
})

describe('endereço em texto pelo CEP', () => {
  it('monta o texto com o cursor depois da rua', () => {
    const r = textoEnderecoCep({ cep: '01310100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' })
    expect(r.texto).toBe('Avenida Paulista - Bela Vista, São Paulo/SP - CEP 01310-100')
    expect(r.posicaoNumero).toBe('Avenida Paulista'.length)
    // CEP geral da cidade (sem rua)
    expect(textoEnderecoCep({ cep: '13560970', logradouro: '', bairro: '', cidade: 'São Carlos', uf: 'SP' }).texto).toBe('São Carlos/SP - CEP 13560-970')
  })
})
