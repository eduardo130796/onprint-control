import { z } from 'zod'
import { TIPOS_CUPOM } from '../beneficios'
import { MODULOS } from '../enums'
import { codigoCupom } from './assinatura'
import { SENHA_MAX, SENHA_MIN } from './auth'
import { telefoneOpcional, valorMonetario } from './campos'

const motivo = z.string().trim().min(3, 'Informe o motivo.').max(300)
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
  // Benefícios
  z.object({ acao: z.literal('cortesia'), ate: data.nullable(), motivo: motivo }),
  z.object({ acao: z.literal('encerrar_cortesia') }),
  z.object({ acao: z.literal('meses_gratis'), meses: z.coerce.number().int().min(1, 'Pelo menos 1 mês.').max(12, 'No máximo 12 meses.'), motivo: motivo }),
  z.object({ acao: z.literal('abonar'), cobrancaId: z.string().uuid(), motivo: motivo }),
  z.object({ acao: z.literal('aplicar_cupom'), codigo: z.string().trim().toUpperCase().min(3, 'Informe o cupom.') }),
  z.object({ acao: z.literal('remover_cupom') }),
])
export type AcaoAssinatura = z.infer<typeof acaoAssinaturaSchema>

// ─── Empresas ───────────────────────────────────────────────────────────────

/** Empresa criada pelo suporte (o dono recebe o convite por e-mail ou a senha provisória). */
export const novaEmpresaSchema = z.object({
  nome: nome('o nome da empresa'),
  email,
  responsavel: nome('o nome do responsável'),
  senhaProvisoria: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(SENHA_MIN, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`).max(SENHA_MAX).optional()),
  plano: z.string().min(1, 'Escolha o plano.'),
  situacao: z.enum(['teste', 'ativa', 'cortesia']).default('teste'),
  exemplos: z.boolean().default(false),
})
export type NovaEmpresaInput = z.input<typeof novaEmpresaSchema>

export const empresasPlataformaQuerySchema = z.object({
  busca: z.string().trim().max(100).optional(),
  nivel: z.enum(['normal', 'aviso', 'somente_leitura', 'bloqueado']).optional(),
  situacao: z.enum(['teste', 'ativa', 'cortesia', 'cancelada']).optional(),
  categoria: z.enum(['em_dia', 'teste', 'cortesia', 'aviso', 'somente_leitura', 'bloqueada', 'cancelada']).optional(),
  beneficio: z.enum(['cupom', 'cortesia', 'nenhum']).optional(),
  plano: z.string().max(40).optional(),
})
export type EmpresasPlataformaQuery = z.infer<typeof empresasPlataformaQuerySchema>

/** Cadastro público ("Criar conta"): teste grátis. `site` é armadilha para robôs (precisa vir vazio). */
export const cadastroPublicoSchema = z.object({
  empresa: nome('o nome da empresa'),
  nome: nome('seu nome'),
  email,
  telefone: telefoneOpcional,
  senha: z.string().min(SENHA_MIN, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`).max(SENHA_MAX),
  plano: z.string().max(40).optional(),
  cupom: codigoCupom,
  aceite: z.literal(true, { message: 'Aceite os termos de uso para continuar.' }),
  site: z.string().max(0).optional(),
})
export type CadastroPublicoInput = z.input<typeof cadastroPublicoSchema>

// ─── Cupons ─────────────────────────────────────────────────────────────────

export const cupomSchema = z
  .object({
    codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Use letras, números, - ou _ (3 a 30).'),
    descricao: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(200).nullable().optional()),
    tipo: z.enum(TIPOS_CUPOM),
    valor: valorMonetario.refine((v) => Number(v) > 0, 'Informe o desconto.'),
    /** null = para sempre */
    duracaoMeses: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().min(1).max(36).nullable()),
    /** Último dia em que o cupom pode ser usado (null = sem validade) */
    validoAte: z.preprocess((v) => (v === '' ? null : v), data.nullable().optional()),
    limiteUsos: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().min(1).max(100_000).nullable()),
    /** Códigos de plano; vazio = todos */
    planos: z.array(z.string()).default([]),
    ativo: z.boolean().default(true),
  })
  .refine((c) => c.tipo !== 'percentual' || Number(c.valor) < 100, { message: 'Para 100% use meses grátis ou cortesia.', path: ['valor'] })
export type CupomInput = z.input<typeof cupomSchema>
