import type { UseFormSetValue } from 'react-hook-form'
import { enderecoSchema, formatarCep, type DadosCnpj, type EnderecoCep } from '@onprint/shared'
import { mascaraCep, mascaraTelefone } from './mascaras'

export interface CampoPreenchido {
  campo: string
  rotulo: string
  valor: string
}

/** Só entram os campos vazios no formulário para os quais a consulta trouxe valor (nunca sobrescreve). */
export function camposVazios(atuais: Record<string, unknown>, candidatos: CampoPreenchido[]): CampoPreenchido[] {
  return candidatos.filter((c) => c.valor.trim() !== '' && String(atuais[c.campo] ?? '').trim() === '')
}

/** Nomes dos campos do formulário que recebem cada dado do CNPJ. */
export interface MapaCamposCnpj {
  razaoSocial: string
  nomeFantasia?: string
  email?: string
  telefone?: string
  ie?: string
}

/** Dados do CNPJ → candidatos ao preenchimento (com máscara, como o usuário digitaria). */
export function candidatosCnpj(d: DadosCnpj, mapa: MapaCamposCnpj): CampoPreenchido[] {
  const lista: (CampoPreenchido | null)[] = [
    { campo: mapa.razaoSocial, rotulo: 'razão social', valor: d.razaoSocial },
    mapa.nomeFantasia ? { campo: mapa.nomeFantasia, rotulo: 'nome fantasia', valor: d.nomeFantasia } : null,
    mapa.email ? { campo: mapa.email, rotulo: 'e-mail', valor: d.email } : null,
    mapa.telefone ? { campo: mapa.telefone, rotulo: 'telefone', valor: mascaraTelefone(d.telefone) } : null,
    mapa.ie ? { campo: mapa.ie, rotulo: 'inscrição estadual', valor: d.inscricaoEstadual ?? '' } : null,
  ]
  return lista.filter((c): c is CampoPreenchido => c !== null)
}

/** Endereço do CNPJ nos campos padrão (cep, logradouro…): só quando o bloco de endereço está vazio. */
export function candidatosEndereco(d: DadosCnpj, atuais: Record<string, unknown>): CampoPreenchido[] {
  const vazio = (c: string) => String(atuais[c] ?? '').trim() === ''
  if (!vazio('cep') || !vazio('logradouro')) return []
  const e = d.endereco
  return camposVazios(atuais, [
    { campo: 'cep', rotulo: 'endereço', valor: mascaraCep(e.cep) },
    { campo: 'logradouro', rotulo: 'endereço', valor: e.logradouro },
    { campo: 'numero', rotulo: 'endereço', valor: e.numero },
    { campo: 'complemento', rotulo: 'endereço', valor: e.complemento },
    { campo: 'bairro', rotulo: 'endereço', valor: e.bairro },
    { campo: 'cidade', rotulo: 'endereço', valor: e.cidade },
    { campo: 'uf', rotulo: 'endereço', valor: e.uf },
  ])
}

/** "razão social, e-mail e endereço" (sem repetir). */
export function listarRotulos(rotulos: string[]): string {
  const unicos = [...new Set(rotulos)]
  if (unicos.length <= 1) return unicos.join('')
  return `${unicos.slice(0, -1).join(', ')} e ${unicos[unicos.length - 1]}`
}

export type EnderecoReceita = DadosCnpj['endereco'] & { tipo: 'principal'; referencia: string }

/** Endereço da Receita como endereço principal do cliente (só se tiver o mínimo que o cadastro de endereço exige). */
export function enderecoPrincipalDaReceita(e: DadosCnpj['endereco']): EnderecoReceita | null {
  const dados: EnderecoReceita = { tipo: 'principal', ...e, referencia: '' }
  return enderecoSchema.safeParse(dados).success ? dados : null
}

/** Endereço em texto livre: "Avenida Paulista - Bela Vista, São Paulo/SP - CEP 01310-100"; o número entra logo depois da rua. */
export function textoEnderecoCep(e: EnderecoCep) {
  const local = [e.bairro, `${e.cidade}/${e.uf}`].filter(Boolean).join(', ')
  return { texto: [e.logradouro, local, `CEP ${formatarCep(e.cep)}`].filter(Boolean).join(' - '), posicaoNumero: e.logradouro.length }
}

/** Campos que o CEP define (número e complemento nunca são tocados). O CEP mudou: substitui os quatro. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aplicarEnderecoDoCep(setValue: UseFormSetValue<any>, e: EnderecoCep) {
  const opcoes = { shouldDirty: true }
  setValue('logradouro', e.logradouro, opcoes)
  setValue('bairro', e.bairro, opcoes)
  setValue('cidade', e.cidade, opcoes)
  setValue('uf', e.uf, opcoes)
}
