import { z } from 'zod'
import { PRIORIDADES, STATUS_PEDIDO, TIPOS_ENTREGA } from '../enums-comercial'
import { ETAPAS_PRODUCAO } from '../enums-producao'
import { paginacaoQuerySchema } from './comum'
import { normalizarDecimal, textoOpcional, uuidOpcional } from './campos'

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).')
const dataOpcional = z.preprocess((v) => (v === '' ? null : v), dataISO.nullable().optional())
const dataHora = z.string().datetime({ offset: true, message: 'Data e hora inválidas.' })
const dataHoraOpcional = z.preprocess((v) => (v === '' ? null : v), dataHora.nullable().optional())
const booleanoQuery = z.enum(['true', 'false']).optional()

// ─── Pedidos ────────────────────────────────────────────────────────────────

export const pedidosQuerySchema = paginacaoQuerySchema.extend({
  status: z.enum(STATUS_PEDIDO).optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  clienteId: z.string().uuid().optional(),
  atrasados: booleanoQuery,
  /** Inclui os cancelados */
  incluirFinalizados: booleanoQuery,
  /** Kanban: entregues só dos últimos 7 dias */
  kanban: booleanoQuery,
})
export type PedidosQuery = z.input<typeof pedidosQuerySchema>

export const pedidoAtualizacaoSchema = z.object({
  dataPrevistaEntrega: dataISO,
  prioridade: z.enum(PRIORIDADES),
  tipoEntrega: z.enum(TIPOS_ENTREGA),
  enderecoEntrega: textoOpcional,
  observacoes: textoOpcional,
  observacoesInternas: textoOpcional,
})
export type PedidoAtualizacaoInput = z.input<typeof pedidoAtualizacaoSchema>

export const pedidoStatusSchema = z.object({ status: z.enum(STATUS_PEDIDO) })

export const cancelarPedidoSchema = z.object({
  motivo: z.string().trim().min(5, 'Explique o motivo do cancelamento.').max(1000),
  /** Devolve ao estoque os insumos já baixados pela produção deste pedido */
  estornarEstoque: z.boolean().default(false),
})

// ─── Entregas ───────────────────────────────────────────────────────────────

export const entregaSchema = z.object({
  tipo: z.enum(TIPOS_ENTREGA),
  dataAgendada: dataHoraOpcional,
  responsavelId: uuidOpcional,
  endereco: textoOpcional,
  observacao: textoOpcional,
})
export type EntregaInput = z.input<typeof entregaSchema>

export const realizarEntregaSchema = z.object({
  recebidoPor: z.string().trim().min(2, 'Informe quem recebeu.').max(160),
  dataRealizada: dataHoraOpcional,
  observacao: textoOpcional,
})
export type RealizarEntregaInput = z.input<typeof realizarEntregaSchema>

export const entregasQuerySchema = paginacaoQuerySchema.extend({
  status: z.enum(['pendente', 'agendada', 'realizada', 'cancelada']).optional(),
  de: dataOpcional,
  ate: dataOpcional,
})
export type EntregasQuery = z.input<typeof entregasQuerySchema>

// ─── Artes ──────────────────────────────────────────────────────────────────

export const arteComentarioSchema = z.object({ texto: z.string().trim().min(2, 'Escreva o comentário.').max(2000) })

export const arteAprovacaoInternaSchema = z.object({ nome: z.string().trim().min(2, 'Informe quem aprovou.').max(160) })

export const arteAprovacaoPublicaSchema = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome completo.').max(160),
  aceite: z.literal(true, { message: 'Confirme que conferiu a arte.' }),
})

export const arteAjustePublicoSchema = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome.').max(160),
  comentario: z.string().trim().min(5, 'Descreva o ajuste que precisa.').max(2000),
})

// ─── Ordens de produção ─────────────────────────────────────────────────────

export const opsQuerySchema = paginacaoQuerySchema.extend({
  /** Kanban: ativas + concluídas nos últimos 3 dias */
  kanban: booleanoQuery,
  etapa: z.enum(ETAPAS_PRODUCAO).optional(),
  maquinaId: z.string().uuid().optional(),
  responsavelId: z.string().uuid().optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  pedidoId: z.string().uuid().optional(),
  atrasadas: booleanoQuery,
  /** Por padrão só as não concluídas */
  incluirConcluidas: booleanoQuery,
})
export type OpsQuery = z.input<typeof opsQuerySchema>

/** Movimento no kanban: etapa de destino + a ordem completa da coluna depois do movimento. */
export const moverOpSchema = z.object({
  etapa: z.enum(ETAPAS_PRODUCAO),
  ordemIds: z.array(z.string().uuid()).max(500).default([]),
  /** Libera impressão sem arte aprovada (gerente, exige producao:aprovar) */
  override: z.boolean().default(false),
  motivo: textoOpcional,
})
export type MoverOpInput = z.input<typeof moverOpSchema>

export const opAtualizacaoSchema = z.object({
  maquinaId: uuidOpcional,
  responsavelId: uuidOpcional,
  prioridade: z.enum(PRIORIDADES),
  dataInicioPrevista: dataOpcional,
  dataFimPrevista: dataOpcional,
  observacoes: textoOpcional,
})
export type OpAtualizacaoInput = z.input<typeof opAtualizacaoSchema>

const quantidadeZeroOuMais = z
  .union([z.string(), z.number()])
  .transform(normalizarDecimal)
  .refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v), 'Quantidade inválida.')

export const apontamentoSchema = z
  .object({
    processoId: uuidOpcional,
    maquinaId: uuidOpcional,
    inicio: dataHora,
    fim: dataHoraOpcional,
    quantidadeProduzida: quantidadeZeroOuMais.default('0'),
    perda: quantidadeZeroOuMais.default('0'),
    observacao: textoOpcional,
  })
  .refine((a) => !a.fim || a.fim >= a.inicio, { message: 'O fim deve ser depois do início.', path: ['fim'] })
export type ApontamentoInput = z.input<typeof apontamentoSchema>
