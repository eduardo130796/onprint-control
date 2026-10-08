import { z } from 'zod'
import { MODULOS } from '../enums'
import { SENHA_MIN } from './auth'
import { telefoneOpcional, valorMonetario } from './campos'

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const email = z.string().trim().toLowerCase().min(1, 'Informe o e-mail.').email('E-mail inválido.')
const nome = (rotulo: string) => z.string().trim().min(2, `Informe ${rotulo}.`).max(160)

// ─── Planos ─────────────────────────────────────────────────────────────────

export const planoSchema = z
  .object({
    codigo: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/, 'Use letras minúsculas, números, - ou _ (2 a 40).'),
    nome: nome('o nome'),
    descricao: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(500).nullable().optional()),
    valorMensal: valorMonetario,
    modulos: z.array(z.enum(MODULOS)).max(MODULOS.length),
    /** null = sem limite */
    limiteUsuarios: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().min(1).max(10_000).nullable()),
    diasTeste: z.coerce.number().int().min(0).max(90),
    diasAteSomenteLeitura: z.coerce.number().int().min(1).max(60),
    diasAteBloqueio: z.coerce.number().int().min(1).max(120),
    publico: z.boolean(),
    ativo: z.boolean(),
    ordem: z.coerce.number().int().min(0).max(999),
  })
  .refine((p) => p.diasAteBloqueio > p.diasAteSomenteLeitura, { message: 'O bloqueio precisa vir depois do modo só leitura.', path: ['diasAteBloqueio'] })
export type PlanoInput = z.input<typeof planoSchema>

// ─── Ações do suporte numa assinatura ───────────────────────────────────────

export const acaoAssinaturaSchema = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('plano'), plano: z.string().min(1) }),
  z.object({ acao: z.literal('ativar'), proximoVencimento: data.optional() }),
  z.object({ acao: z.literal('teste_ate'), data }),
  z.object({ acao: z.literal('liberar_ate'), data: data.nullable() }),
  z.object({ acao: z.literal('atraso_desde'), data: data.nullable() }),
  z.object({ acao: z.literal('bloquear'), motivo: z.string().trim().min(3, 'Informe o motivo.').max(300) }),
  z.object({ acao: z.literal('desbloquear') }),
  z.object({ acao: z.literal('cancelar') }),
  z.object({ acao: z.literal('reativar') }),
  z.object({ acao: z.literal('modulos_extras'), modulos: z.array(z.enum(MODULOS)) }),
  z.object({ acao: z.literal('cobranca_manual'), vencimento: data, valor: valorMonetario.optional() }),
  z.object({ acao: z.literal('registrar_pagamento') }),
])
export type AcaoAssinatura = z.infer<typeof acaoAssinaturaSchema>

// ─── Empresas ───────────────────────────────────────────────────────────────

/** Empresa criada pelo suporte (o dono recebe o convite por e-mail ou a senha provisória). */
export const novaEmpresaSchema = z.object({
  nome: nome('o nome da empresa'),
  email,
  responsavel: nome('o nome do responsável'),
  senhaProvisoria: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(SENHA_MIN, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`).optional()),
  plano: z.string().min(1, 'Escolha o plano.'),
  situacao: z.enum(['teste', 'ativa']).default('teste'),
  exemplos: z.boolean().default(false),
})
export type NovaEmpresaInput = z.input<typeof novaEmpresaSchema>

export const empresasPlataformaQuerySchema = z.object({
  busca: z.string().trim().max(100).optional(),
  nivel: z.enum(['normal', 'aviso', 'somente_leitura', 'bloqueado']).optional(),
  situacao: z.enum(['teste', 'ativa', 'cancelada']).optional(),
  plano: z.string().max(40).optional(),
})
export type EmpresasPlataformaQuery = z.infer<typeof empresasPlataformaQuerySchema>

/** Cadastro público ("Criar conta"): teste grátis. `site` é armadilha para robôs (precisa vir vazio). */
export const cadastroPublicoSchema = z.object({
  empresa: nome('o nome da empresa'),
  nome: nome('seu nome'),
  email,
  telefone: telefoneOpcional,
  senha: z.string().min(SENHA_MIN, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`),
  plano: z.string().max(40).optional(),
  aceite: z.literal(true, { message: 'Aceite os termos de uso para continuar.' }),
  site: z.string().max(0).optional(),
})
export type CadastroPublicoInput = z.input<typeof cadastroPublicoSchema>
