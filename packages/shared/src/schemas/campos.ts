import { z } from 'zod'
import { cpfCnpjValido } from '../documentos'
import { somenteDigitos } from '../format'

/**
 * Campos reutilizáveis. Strings vazias viram null (o front envia '' em campos não preenchidos).
 * Documentos, telefones e CEP são gravados só com dígitos.
 */
const vazioParaNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

export const textoOpcional = z.preprocess(vazioParaNull, z.string().trim().max(2000).nullable().optional())

export const emailOpcional = z.preprocess(
  vazioParaNull,
  z.string().trim().toLowerCase().email('E-mail inválido.').nullable().optional(),
)

export const telefoneOpcional = z.preprocess(
  (v) => (typeof v === 'string' ? somenteDigitos(v) || null : v),
  z
    .string()
    .regex(/^\d{10,11}$/, 'Telefone deve ter DDD + 8 ou 9 dígitos.')
    .nullable()
    .optional(),
)

export const cpfCnpjOpcional = z.preprocess(
  (v) => (typeof v === 'string' ? somenteDigitos(v) || null : v),
  z
    .string()
    .refine((v) => v.length === 11 || v.length === 14, 'Informe 11 dígitos (CPF) ou 14 (CNPJ).')
    .refine(cpfCnpjValido, 'CPF/CNPJ inválido.')
    .nullable()
    .optional(),
)

export const cepOpcional = z.preprocess(
  (v) => (typeof v === 'string' ? somenteDigitos(v) || null : v),
  z.string().regex(/^\d{8}$/, 'CEP deve ter 8 dígitos.').nullable().optional(),
)

export const ufOpcional = z.preprocess(
  vazioParaNull,
  z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF inválida.').nullable().optional(),
)

/** Valor monetário trafegado como string decimal ("1234.50"). */
/**
 * Aceita "1234.5" (formato da API) e "1.234,50" (digitado no padrão brasileiro).
 * Com vírgula, os pontos são separadores de milhar.
 */
export function normalizarDecimal(v: string | number): string {
  const texto = String(v).trim()
  if (!texto) return '0'
  return texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto
}

export const valorMonetario = z
  .union([z.string(), z.number()])
  .transform(normalizarDecimal)
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), 'Valor inválido.')

/** Percentual 0–100 com até 2 casas, trafegado como string. */
export const percentual = z
  .union([z.string(), z.number()])
  .transform(normalizarDecimal)
  .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, 'Percentual deve estar entre 0 e 100.')

/** Medida/área com até 3 casas decimais, trafegada como string. */
export const decimal3 = z
  .union([z.string(), z.number()])
  .transform(normalizarDecimal)
  .refine((v) => /^\d{1,7}(\.\d{1,3})?$/.test(v), 'Valor inválido.')

export const inteiroOpcional = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().int('Informe um número inteiro.').min(0).nullable().optional(),
)

export const uuidOpcional = z.preprocess(vazioParaNull, z.string().uuid().nullable().optional())

/** Campos de endereço usados por empresa e fornecedores. */
export const camposEndereco = {
  cep: cepOpcional,
  logradouro: textoOpcional,
  numero: textoOpcional,
  complemento: textoOpcional,
  bairro: textoOpcional,
  cidade: textoOpcional,
  uf: ufOpcional,
}
