import type { FastifyInstance } from 'fastify'
import { conversaoSchema, nomeCliente, type Prioridade, type TipoEntrega } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import type { ContextoUsuario } from '../../core/escopo'
import type { criarConversaoService } from './conversao.service'
import { avisarOrcamento, type Autoria } from './tempo-real'

type DadosConversao = z.output<typeof conversaoSchema>

/** Padrões da empresa (Configurações → Empresa → Pedidos) */
export interface PadroesConversao {
  converterAoAprovar: boolean
  sinalPercentual: string
  parcelasPadrao: number
  intervaloDiasPadrao: number
  tipoEntregaPadrao: TipoEntrega
  prioridadePadrao: Prioridade
}

export type ResultadoConversaoAutomatica =
  /** Configuração desligada: o orçamento fica "Aprovado" e a equipe converte quando quiser */
  | { situacao: 'desligada' }
  /** Já tinha pedido (outra aprovação ou conversão manual chegou antes): nada a fazer */
  | { situacao: 'ja_convertido' }
  /** Não está mais aprovado (reaberto no meio do caminho) */
  | { situacao: 'ignorado' }
  | { situacao: 'convertido'; pedido: { id: string; numero: string } }
  /** A aprovação vale; a equipe converte à mão (o motivo vai na notificação) */
  | { situacao: 'falhou'; motivo: string }

export interface DependenciasConversao {
  padroes: () => Promise<PadroesConversao>
  orcamento: (id: string) => Promise<{ status: string; pedidoId: string | null; clienteId: string } | null>
  /** Endereço principal do cliente (null = sem endereço cadastrado) */
  enderecoPrincipal: (clienteId: string) => Promise<string | null>
  converter: (id: string, dados: DadosConversao) => Promise<{ id: string; numero: string }>
}

/** Condições do pedido pelos padrões da empresa; entrega/instalação só com endereço do cliente (senão, retirada). */
export function dadosDaConversaoPadrao(p: PadroesConversao, enderecoId: string | null): DadosConversao {
  const comEndereco = p.tipoEntregaPadrao !== 'retirada' && Boolean(enderecoId)
  return conversaoSchema.parse({
    sinalPercentual: p.sinalPercentual,
    parcelas: p.parcelasPadrao,
    intervaloDias: p.intervaloDiasPadrao,
    tipoEntrega: comEndereco ? p.tipoEntregaPadrao : 'retirada',
    enderecoEntregaId: comEndereco ? enderecoId : null,
    prioridade: p.prioridadePadrao,
  })
}

/**
 * Decide e converte o orçamento recém-aprovado. Nunca lança: a aprovação já foi gravada
 * e não pode falhar por causa da conversão.
 */
export async function converterAoAprovar(deps: DependenciasConversao, orcamentoId: string): Promise<ResultadoConversaoAutomatica> {
  try {
    const padroes = await deps.padroes()
    if (!padroes.converterAoAprovar) return { situacao: 'desligada' }
    const o = await deps.orcamento(orcamentoId)
    if (!o) return { situacao: 'falhou', motivo: 'orçamento não encontrado.' }
    if (o.pedidoId || o.status === 'convertido') return { situacao: 'ja_convertido' }
    if (o.status !== 'aprovado') return { situacao: 'ignorado' }
    const enderecoId = padroes.tipoEntregaPadrao === 'retirada' ? null : await deps.enderecoPrincipal(o.clienteId)
    const pedido = await deps.converter(orcamentoId, dadosDaConversaoPadrao(padroes, enderecoId))
    return { situacao: 'convertido', pedido: { id: pedido.id, numero: pedido.numero } }
  } catch (erro) {
    // Conversão ao mesmo tempo (clique duplo, conversão manual): o pedido da outra vale
    if (erro instanceof AppError && erro.statusCode === 409) return { situacao: 'ja_convertido' }
    return { situacao: 'falhou', motivo: erro instanceof AppError ? erro.message : 'erro inesperado ao criar o pedido.' }
  }
}

interface OrcamentoAprovado {
  id: string
  numero: string
  vendedorId: string | null
  createdBy: string | null
  cliente: { nome: string; fantasia: string | null }
}

/** Como o orçamento foi aprovado: pelo cliente no link ou registrado pela equipe. */
export interface Aprovacao extends Autoria {
  /** Nome de quem aprovou (cliente) */
  nome: string
}

/**
 * Depois do commit da aprovação (link público ou "Registrar aprovação"): converte com os padrões
 * da empresa se a configuração estiver ligada, avisa o vendedor (e os administradores, se falhar)
 * e as telas abertas. Autor no pedido e na auditoria: quem registrou ou, na aprovação do cliente,
 * o vendedor do orçamento (um usuário real; a auditoria diz que foi a aprovação do cliente).
 */
export function criarConversaoAutomatica(app: FastifyInstance, conversao: ReturnType<typeof criarConversaoService>) {
  const { prisma } = app

  async function autorDoSistema(o: OrcamentoAprovado, aprovacao: Aprovacao) {
    const candidato = aprovacao.atorId ?? o.vendedorId ?? o.createdBy
    if (candidato) return candidato
    const admin = await prisma.usuario.findFirst({ where: { ativo: true, papel: { codigo: 'admin' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
    return admin?.id ?? null
  }

  async function notificar(usuarios: string[], dados: { titulo: string; mensagem: string; link: string }, toast: boolean) {
    for (const usuarioId of usuarios) {
      await prisma.notificacao.create({ data: { usuarioId, ...dados } })
      // Aviso flutuante só quando o evento do orçamento não mostra um (falha da conversão)
      app.tempoReal.emitir(`usuario:${usuarioId}`, 'notificacao:nova', { titulo: dados.titulo, link: dados.link, toast })
    }
  }

  return {
    async aposAprovacao(o: OrcamentoAprovado, aprovacao: Aprovacao): Promise<ResultadoConversaoAutomatica> {
      const ator = await autorDoSistema(o, aprovacao)
      const via = aprovacao.origem === 'cliente' ? 'conversão automática · aprovação do cliente (link público)' : 'conversão automática · aprovação registrada pela equipe'
      const ctx: ContextoUsuario = { usuarioId: ator ?? '', veTodos: true, podeAprovar: true, veCustos: true }
      const resultado = await converterAoAprovar(
        {
          padroes: async () => {
            const e = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
            return {
              converterAoAprovar: e?.converterAoAprovar ?? true,
              sinalPercentual: e?.sinalPercentual.toString() ?? '50',
              parcelasPadrao: e?.parcelasPadrao ?? 1,
              intervaloDiasPadrao: e?.intervaloDiasPadrao ?? 30,
              tipoEntregaPadrao: e?.tipoEntregaPadrao ?? 'retirada',
              prioridadePadrao: e?.prioridadePadrao ?? 'normal',
            }
          },
          orcamento: (id) => prisma.orcamento.findUnique({ where: { id }, select: { status: true, pedidoId: true, clienteId: true } }),
          enderecoPrincipal: async (clienteId) =>
            (await prisma.clienteEndereco.findFirst({ where: { clienteId }, orderBy: [{ tipo: 'asc' }, { createdAt: 'asc' }], select: { id: true } }))?.id ?? null,
          converter: async (id, dados) => {
            if (!ator) throw AppError.regraNegocio('nenhum usuário ativo para registrar o pedido.')
            return conversao.converter(id, dados, ctx, { via })
          },
        },
        o.id,
      )

      const cliente = nomeCliente(o.cliente)
      try {
        if (resultado.situacao === 'convertido') {
          app.tempoReal.emitir('pedidos', 'pedido:atualizado', { id: resultado.pedido.id })
          app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId: resultado.pedido.id })
        }
        if (resultado.situacao === 'falhou') {
          app.log.warn({ orcamento: o.numero, motivo: resultado.motivo }, 'Orçamento aprovado, mas a conversão automática em pedido falhou')
          const admins = await prisma.usuario.findMany({ where: { ativo: true, papel: { codigo: 'admin' } }, select: { id: true } })
          const avisar = [...new Set([o.vendedorId, ...admins.map((a) => a.id)].filter((id): id is string => Boolean(id)))]
          await notificar(
            avisar,
            { titulo: `Orçamento ${o.numero} aprovado — converta em pedido manualmente`, mensagem: `Não deu para criar o pedido sozinho: ${resultado.motivo}`, link: `/orcamentos/${o.id}` },
            true,
          )
        } else if (o.vendedorId && o.vendedorId !== aprovacao.atorId) {
          // O vendedor fica sabendo da aprovação (o aviso flutuante vem do evento do orçamento)
          const pedido = resultado.situacao === 'convertido' ? resultado.pedido : null
          const quem = aprovacao.origem === 'cliente' ? `${cliente} aprovou pelo link (${aprovacao.nome}).` : `Aprovação registrada pela equipe (${aprovacao.nome}).`
          await notificar(
            [o.vendedorId],
            pedido
              ? { titulo: `Orçamento ${o.numero} aprovado pelo cliente · virou o pedido ${pedido.numero}`, mensagem: quem, link: `/pedidos/${pedido.id}` }
              : { titulo: `Orçamento ${o.numero} aprovado`, mensagem: quem, link: `/orcamentos/${o.id}` },
            false,
          )
        }
      } catch (erro) {
        app.log.error({ err: erro, orcamento: o.numero }, 'Falha ao avisar a aprovação do orçamento')
      }

      const atual = await prisma.orcamento.findUnique({ where: { id: o.id }, select: { id: true, numero: true, status: true, vendedorId: true, pedidoId: true, pedido: { select: { numero: true } } } })
      if (atual) avisarOrcamento(app, { ...atual, cliente: o.cliente }, resultado.situacao === 'convertido' ? 'convertido' : 'aprovado', aprovacao)
      return resultado
    },
  }
}

export type ConversaoAutomatica = ReturnType<typeof criarConversaoAutomatica>
