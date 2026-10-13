import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  TEXTOS_PADRAO_WHATSAPP,
  formaEntregaPronto,
  formatarDataSimples,
  formatarMoeda,
  nomeCliente,
  nomeParaSaudacao,
  normalizarNumeroWhatsapp,
  preencherMensagem,
  proximoPassoPedido,
  valorEmAberto,
  type EventoWhatsapp,
  type StatusPedido,
} from '@onprint/shared'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { linkAcompanhamento } from '../../core/links'
import { EVENTO_DO_STATUS, JANELA_DUPLICADO_MS, RESPIRO_MAX_MS, RESPIRO_MS, motivoParaNaoAvisar } from './regras'

/*
 * Jornada do cliente no WhatsApp da gráfica (uma conversa só, do orçamento à entrega):
 *
 * 1. Orçamento — a equipe clica "Enviar orçamento" (tela do orçamento ou kanban): o diálogo "Enviar pelo WhatsApp"
 *    manda na hora pela conexão da gráfica (itens, total, validade e o link de aprovação no fim; o PDF pode ir
 *    junto), marca o orçamento como enviado e registra em mensagens_whatsapp (evento orcamento_enviado, manual).
 *    Sem conexão, o mesmo diálogo abre o WhatsApp (wa.me) com o texto pronto.
 * 2. Aprovação — o cliente aprova pelo link; a própria página confirma, sem mensagem a mais.
 * 3. Pedido confirmado — ao virar pedido: cita o orçamento aprovado e diz o próximo passo (a arte vem para aprovar,
 *    ou a produção começa) com a previsão de entrega e o link de acompanhamento.
 * 4. Arte para aprovação, pedido pronto, saiu para entrega, pagamento recebido, entregue — avisos automáticos.
 *
 * Todo aviso automático espera um "respiro" (RESPIRO_MS) na fila: avisos do mesmo pedido que se encontram ali
 * saem numa mensagem só (confirmação + link da arte; agrupar.ts). Continuam valendo os eventos ligados, o horário,
 * a pausa, o intervalo entre mensagens, o teto por hora e o "não repetir" (JANELA_DUPLICADO_MS) — inclusive
 * contra o mesmo envio feito à mão pela equipe.
 */

export interface AlvoAviso {
  pedidoId: string
  /** Arte enviada ao cliente (link de aprovação) */
  arteId?: string
  /** Pagamento (movimento financeiro) que gerou o aviso */
  movimentoId?: string
  /** Valor do pagamento (pagamento_recebido) */
  valorPago?: string
}

/** Configuração única da empresa (criada com os padrões no primeiro uso). */
export async function obterConfigWhatsapp(prisma: PrismaClient) {
  return (await prisma.whatsappConfig.findFirst({ orderBy: { createdAt: 'asc' } })) ?? prisma.whatsappConfig.create({ data: {} })
}

/** WhatsApp liberado no plano da empresa (o módulo "whatsapp") */
export const whatsappNoPlano = (empresa: EmpresaAtual | undefined) => !empresa?.assinatura || empresa.assinatura.modulos.includes('whatsapp')

/** Nome da gráfica na assinatura das mensagens */
export async function nomeDaEmpresa(prisma: PrismaClient, empresa: EmpresaAtual) {
  const c = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { nomeFantasia: true, razaoSocial: true } })
  return c?.nomeFantasia?.trim() || c?.razaoSocial?.trim() || empresa.nome
}

/** WhatsApp do cadastro; sem ele, o telefone serve se for celular */
export function numeroDoCliente(c: { whatsapp: string | null; telefone: string | null }): string | null {
  const telefone = normalizarNumeroWhatsapp(c.telefone)
  return normalizarNumeroWhatsapp(c.whatsapp) ?? (telefone?.length === 13 ? telefone : null)
}

/** Pedido ainda na etapa da arte (o "pedido confirmado" avisa que a arte vem para aprovar) */
const NA_ETAPA_DA_ARTE: readonly StatusPedido[] = ['aguardando_arte', 'arte_em_aprovacao']

/**
 * Coloca o aviso na fila (o envio é do job, respeitando horário e intervalo). Chamar DEPOIS do commit:
 * nunca lança erro, o aviso do WhatsApp não pode derrubar a operação do sistema.
 */
export function criarAvisosWhatsapp(app: FastifyInstance, aoEnfileirar: (empresaId: string) => void) {
  async function enfileirar(evento: EventoWhatsapp, alvo: AlvoAviso): Promise<string | null> {
    const empresa = contextoEmpresa.atual()
    if (!empresa || !whatsappNoPlano(empresa)) return null
    const { prisma } = app
    const config = await obterConfigWhatsapp(prisma)
    const pedido = await prisma.pedido.findUnique({
      where: { id: alvo.pedidoId },
      select: {
        id: true,
        numero: true,
        status: true,
        tipoEntrega: true,
        total: true,
        valorPago: true,
        tokenPublico: true,
        dataPrevistaEntrega: true,
        orcamento: { select: { numero: true } },
        cliente: { select: { id: true, nome: true, fantasia: true, cpfCnpj: true, whatsapp: true, telefone: true, receberAvisosWhatsapp: true } },
      },
    })
    if (!pedido) return null
    const referenciaId = alvo.arteId ?? alvo.movimentoId ?? null
    const repetido = await prisma.mensagemWhatsapp.findFirst({
      where: { evento, pedidoId: pedido.id, referenciaId, status: { in: ['pendente', 'enviada'] }, createdAt: { gte: new Date(Date.now() - JANELA_DUPLICADO_MS) } },
      select: { id: true },
    })
    const numero = numeroDoCliente(pedido.cliente)
    const motivo = motivoParaNaoAvisar({
      eventoLigado: config.eventos.includes(evento),
      simulado: app.whatsapp.provedor.simulado,
      conectou: Boolean(config.conectadoEm),
      clienteRecusa: !pedido.cliente.receberAvisosWhatsapp,
      numero,
      duplicado: Boolean(repetido),
    })
    if (motivo && !motivo.registrar) return null

    let linkArte = ''
    let item = ''
    if (alvo.arteId) {
      const arte = await prisma.arte.findUnique({ where: { id: alvo.arteId }, select: { tokenPublico: true, pedidoItem: { select: { descricao: true } } } })
      if (arte) {
        linkArte = `${app.config.APP_URL}/arte/${empresa.slug}/${arte.tokenPublico}`
        item = arte.pedidoItem.descricao
      }
    }
    const template = await prisma.mensagemTemplate.findFirst({ where: { categoria: evento, ativo: true }, orderBy: { createdAt: 'asc' } })
    const texto = preencherMensagem(template?.conteudo ?? TEXTOS_PADRAO_WHATSAPP[evento], {
      cliente_nome: nomeParaSaudacao(nomeCliente(pedido.cliente), pedido.cliente.cpfCnpj),
      numero_pedido: pedido.numero,
      numero_orcamento: pedido.orcamento?.numero ?? '',
      descricao_item: item,
      proximo_passo: proximoPassoPedido(NA_ETAPA_DA_ARTE.includes(pedido.status)),
      forma_entrega: formaEntregaPronto(pedido.tipoEntrega),
      data_entrega: formatarDataSimples(pedido.dataPrevistaEntrega.toISOString()),
      link_acompanhamento: linkAcompanhamento(pedido.tokenPublico, empresa.slug),
      link_aprovacao: linkArte,
      valor_total: formatarMoeda(pedido.total.toString()),
      valor_pago: alvo.valorPago ? formatarMoeda(alvo.valorPago) : '',
      valor_em_aberto: valorEmAberto(pedido.total.toString(), pedido.valorPago.toString()),
      empresa_nome: await nomeDaEmpresa(prisma, empresa),
    })
    const agora = Date.now()
    const fimDoRespiro = new Date(agora + RESPIRO_MS)
    const criada = await prisma.mensagemWhatsapp.create({
      data: {
        clienteId: pedido.cliente.id,
        pedidoId: pedido.id,
        referenciaId,
        evento,
        telefone: numero ?? pedido.cliente.whatsapp ?? pedido.cliente.telefone ?? '',
        texto,
        status: motivo ? 'ignorada' : 'pendente',
        erro: motivo?.motivo ?? null,
        proximaTentativaEm: motivo ? null : fimDoRespiro,
      },
      select: { id: true },
    })
    if (!motivo) {
      // Avisos do mesmo pedido ainda no respiro esperam este (saem juntos), até RESPIRO_MAX_MS do primeiro
      await prisma.mensagemWhatsapp.updateMany({
        where: { pedidoId: pedido.id, status: 'pendente', manual: false, tentativas: 0, id: { not: criada.id }, createdAt: { gte: new Date(agora - RESPIRO_MAX_MS) }, proximaTentativaEm: { gt: new Date(agora) } },
        data: { proximaTentativaEm: fimDoRespiro },
      })
      aoEnfileirar(empresa.id)
    }
    return criada.id
  }

  /** Enfileira (ou registra por que não) o aviso; erros vão para o log. */
  async function avisar(evento: EventoWhatsapp, alvo: AlvoAviso): Promise<string | null> {
    try {
      return await enfileirar(evento, alvo)
    } catch (erro) {
      app.log.warn({ err: erro, evento, pedidoId: alvo.pedidoId }, 'Aviso do WhatsApp não enfileirado')
      return null
    }
  }

  return {
    avisar,
    /** Pedido mudou de status: pronto, em entrega e entregue geram aviso */
    avisarStatusPedido(pedidoId: string, status: StatusPedido | undefined) {
      const evento = status ? EVENTO_DO_STATUS[status] : undefined
      return evento ? avisar(evento, { pedidoId }) : Promise.resolve(null)
    },
  }
}

export type AvisosWhatsapp = ReturnType<typeof criarAvisosWhatsapp>
