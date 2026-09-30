import type { Prisma } from '@prisma/client'
import { FUSO_HORARIO } from '@onprint/shared'

export const PREFIXOS = {
  solicitacao: 'SOL',
  orcamento: 'ORC',
  pedido: 'PED',
  op: 'OP',
  entrada: 'ENT',
  caixa: 'CX',
  venda: 'PDV',
} as const
export type EntidadeNumerada = keyof typeof PREFIXOS

/** Códigos de cadastro sem ano (ex.: PRD-0001). */
export const PREFIXOS_CADASTRO = { produto: 'PRD' } as const
export type CadastroNumerado = keyof typeof PREFIXOS_CADASTRO

export function formatarNumero(prefixo: string, ano: number, sequencial: number): string {
  return `${prefixo}-${ano}-${String(sequencial).padStart(4, '0')}`
}

export function formatarCodigo(prefixo: string, sequencial: number): string {
  return `${prefixo}-${String(sequencial).padStart(4, '0')}`
}

export function anoAtual(data = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: FUSO_HORARIO, year: 'numeric' }).format(data))
}

/**
 * Incrementa a sequência (entidade, ano) com a linha travada (FOR UPDATE) até o commit,
 * então duas requisições simultâneas nunca recebem o mesmo número. Precisa rodar em prisma.$transaction.
 */
async function incrementar(tx: Prisma.TransactionClient, entidade: string, prefixo: string, ano: number) {
  await tx.$executeRaw`
    INSERT INTO numeracao (entidade, prefixo, ano, ultimo_numero)
    VALUES (${entidade}, ${prefixo}, ${ano}, 0)
    ON CONFLICT (entidade, ano) DO NOTHING`

  const [linha] = await tx.$queryRaw<{ id: string; ultimo_numero: number }[]>`
    SELECT id, ultimo_numero FROM numeracao
    WHERE entidade = ${entidade} AND ano = ${ano}
    FOR UPDATE`
  if (!linha) throw new Error(`Numeração não encontrada para ${entidade}/${ano}`)

  const proximo = linha.ultimo_numero + 1
  await tx.$executeRaw`
    UPDATE numeracao SET ultimo_numero = ${proximo}, updated_at = now()
    WHERE id = ${linha.id}::uuid`
  return proximo
}

/** Próximo número da entidade no ano (ex.: ORC-2026-0001). */
export async function proximoNumero(tx: Prisma.TransactionClient, entidade: EntidadeNumerada, data = new Date()) {
  const ano = anoAtual(data)
  const prefixo = PREFIXOS[entidade]
  return formatarNumero(prefixo, ano, await incrementar(tx, entidade, prefixo, ano))
}

/** Próximo código de cadastro, sem ano (ex.: PRD-0042). */
export async function proximoCodigo(tx: Prisma.TransactionClient, entidade: CadastroNumerado) {
  const prefixo = PREFIXOS_CADASTRO[entidade]
  return formatarCodigo(prefixo, await incrementar(tx, entidade, prefixo, 0))
}
