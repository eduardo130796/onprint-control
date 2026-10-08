import { Prisma, type PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { adicionarMeses, formatarMoeda, hojeISO } from '@onprint/shared'
import { cobrancaDoAsaas, notaDoAsaas, situacaoAutorizacaoAsaas, type AutorizacaoAsaas, type NotaAsaas, type PagamentoAsaas } from '../integrations/pagamentos/asaas'
import type { CobrancaGateway, GatewayPagamentos, NotaFiscalGateway } from '../integrations/pagamentos'
import { diaISO, paraDia } from './assinaturas'

const ABERTAS = ['pendente', 'vencida']

/** Vencimento que conta para o atraso: o original, se a cobrança vencida foi reajustada (ganhou data nova no gateway). */
export const vencimentoQueConta = (c: { vencimento: Date; vencimentoOriginal: Date | null }) => diaISO(c.vencimentoOriginal ?? c.vencimento) as string
const FORMAS: Record<string, string> = { PIX: 'PIX', BOLETO: 'boleto', CREDIT_CARD: 'cartão', UNDEFINED: 'a definir' }

/** Grava (cria ou atualiza) a cobrança vinda do gateway; devolve como estava antes. */
export async function salvarCobranca(plataforma: PrismaClient, assinanteId: string, c: CobrancaGateway, extra: { falha?: string | null } = {}) {
  const antes = await plataforma.cobranca.findUnique({ where: { gatewayId: c.gatewayId } })
  const dados = { valor: c.valor, vencimento: paraDia(c.vencimento), situacao: c.situacao, forma: c.forma, pagoEm: c.pagoEm, linkPagamento: c.linkPagamento, ...extra }
  await plataforma.cobranca.upsert({ where: { gatewayId: c.gatewayId }, create: { assinanteId, gateway: 'asaas', gatewayId: c.gatewayId, ...dados }, update: dados })
  return antes
}

export async function salvarNotaFiscal(plataforma: PrismaClient, n: NotaFiscalGateway) {
  const r = await plataforma.cobranca.updateMany({
    where: { gatewayId: n.cobrancaGatewayId },
    data: { nfSituacao: n.situacao, nfNumero: n.numero, nfLinkPdf: n.linkPdf, nfErro: n.erro },
  })
  return r.count > 0
}

/**
 * Recalcula a assinatura a partir das cobranças: "em atraso desde" = vencimento da cobrança aberta mais antiga;
 * próximo vencimento; teste (ou cancelada) vira ativa no primeiro pagamento; cancelamento agendado vale na data.
 */
export async function recalcularAssinatura(plataforma: PrismaClient, assinanteId: string, hoje = hojeISO()) {
  const a = await plataforma.assinatura.findUnique({ where: { assinanteId } })
  if (!a) return null
  const cobrancas = await plataforma.cobranca.findMany({ where: { assinanteId }, orderBy: { vencimento: 'asc' } })
  // Atraso: qualquer cobrança em aberto (mensalidade ou diferença proporcional não paga)
  const abertas = cobrancas
    .filter((c) => ABERTAS.includes(c.situacao))
    .map(vencimentoQueConta)
    .sort()
  const atraso = abertas[0] ?? null
  // Próximo vencimento e período pago: só mensalidades
  const mensalidadesAbertas = cobrancas
    .filter((c) => c.tipo === 'mensalidade' && ABERTAS.includes(c.situacao))
    .map(vencimentoQueConta)
    .sort()
  // Sem cobrança em aberto, o próximo vencimento é um mês depois da última mensalidade paga (fim do período pago)
  const ultimaPaga = cobrancas
    .filter((c) => c.tipo === 'mensalidade' && c.situacao === 'paga')
    .map(vencimentoQueConta)
    .sort()
    .at(-1)
  const proximo = mensalidadesAbertas.find((v) => v >= hoje) ?? (mensalidadesAbertas.length === 0 && ultimaPaga ? adicionarMeses(ultimaPaga, 1) : undefined)
  const dados: Prisma.AssinaturaUncheckedUpdateInput = {}
  const eventos: { tipo: string; descricao: string }[] = []

  // Sem nenhuma cobrança registrada, o atraso é o lançado à mão pelo suporte (comando assinatura)
  if (cobrancas.length > 0 && diaISO(a.atrasoDesde) !== atraso) dados.atrasoDesde = atraso ? paraDia(atraso) : null
  if (proximo && diaISO(a.proximoVencimento) !== proximo) dados.proximoVencimento = paraDia(proximo)
  const pagouDepois = cobrancas.some((c) => c.situacao === 'paga' && (!a.canceladaEm || (c.pagoEm ?? c.updatedAt) > a.canceladaEm))
  if (pagouDepois && (a.situacao === 'teste' || (a.situacao === 'cancelada' && !a.cancelarEm))) {
    Object.assign(dados, { situacao: 'ativa', canceladaEm: null })
    eventos.push(a.situacao === 'teste' ? { tipo: 'ativacao', descricao: 'Primeiro pagamento: assinatura ativa' } : { tipo: 'reativacao', descricao: 'Pagamento recebido: assinatura reativada' })
  }
  // Downgrade agendado: o plano menor passa a valer no início do período seguinte
  const agendadoEm = diaISO(a.planoAgendadoEm)
  if (a.planoAgendadoId && agendadoEm && agendadoEm <= hoje) {
    Object.assign(dados, { planoId: a.planoAgendadoId, planoAgendadoId: null, planoAgendadoEm: null })
    eventos.push({ tipo: 'plano', descricao: 'Troca de plano agendada entrou em vigor' })
  }
  const cancelarEm = diaISO(a.cancelarEm)
  if (cancelarEm && cancelarEm <= hoje && a.situacao !== 'cancelada') {
    Object.assign(dados, { situacao: 'cancelada', canceladaEm: new Date(), cancelarEm: null })
    eventos.push({ tipo: 'cancelamento', descricao: 'Cancelamento agendado entrou em vigor' })
  }
  if (Object.keys(dados).length === 0) return a
  return plataforma.$transaction(async (tx) => {
    const nova = await tx.assinatura.update({ where: { assinanteId }, data: dados })
    for (const e of eventos) await tx.eventoAssinatura.create({ data: { assinanteId, ...e } })
    return nova
  })
}

async function registrarEvento(plataforma: PrismaClient, assinanteId: string, tipo: string, descricao: string, dados?: Prisma.InputJsonValue) {
  await plataforma.eventoAssinatura.create({ data: { assinanteId, tipo, descricao, dados } })
}

/** Aplica um aviso do Asaas (cobrança ou nota fiscal). Lança erro se não reconhecer a assinatura. */
const MOTIVO_FIM_AUTORIZACAO: Record<string, string> = {
  PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED: 'cancelada',
  PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED: 'recusada no banco',
  PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED: 'expirada (o QR Code não foi pago a tempo)',
}

/** PIX Automático: autorizada → guarda a assinatura criada pelo Asaas; encerrada → libera para autorizar de novo. */
async function aplicarAutorizacaoPix(plataforma: PrismaClient, tipo: string, aut: AutorizacaoAsaas) {
  const assinatura = await plataforma.assinatura.findUnique({ where: { gatewayAutorizacaoId: aut.id } })
  if (!assinatura) throw new Error(`Autorização do PIX Automático ${aut.id} que não está no sistema.`)
  const situacao = situacaoAutorizacaoAsaas(aut.status)
  if (situacao === 'ativa' || tipo === 'PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED') {
    await plataforma.assinatura.update({
      where: { id: assinatura.id },
      data: { gatewayAssinaturaId: aut.subscriptionId ?? assinatura.gatewayAssinaturaId, pixQrPayload: null, pixQrImagem: null, pixQrExpiraEm: null },
    })
    return registrarEvento(plataforma, assinatura.assinanteId, 'pix_automatico', 'PIX Automático autorizado no banco: as próximas mensalidades serão debitadas sozinhas')
  }
  if (situacao === 'encerrada') {
    await plataforma.assinatura.update({ where: { id: assinatura.id }, data: { gatewayAutorizacaoId: null, pixQrPayload: null, pixQrImagem: null, pixQrExpiraEm: null } })
    const motivo = MOTIVO_FIM_AUTORIZACAO[tipo] ?? 'encerrada'
    await registrarEvento(plataforma, assinatura.assinanteId, 'falha_pagamento', `Autorização do PIX Automático ${motivo}${aut.cancellationReason ? ` (${aut.cancellationReason})` : ''}`)
  }
}

export async function aplicarEventoAsaas(app: FastifyInstance, tipo: string, corpo: { payment?: PagamentoAsaas; invoice?: NotaAsaas; authorization?: AutorizacaoAsaas }) {
  const { plataforma } = app
  if (corpo.authorization && tipo.startsWith('PIX_AUTOMATIC_RECURRING_AUTHORIZATION')) await aplicarAutorizacaoPix(plataforma, tipo, corpo.authorization)
  if (corpo.payment) {
    const c = cobrancaDoAsaas(corpo.payment)
    if (tipo === 'PAYMENT_DELETED') c.situacao = 'cancelada'
    // Pela assinatura ou pelo cliente: a 1ª mensalidade do PIX Automático chega antes de a assinatura existir
    const assinatura = await plataforma.assinatura.findFirst({
      where: { OR: [...(c.assinaturaGatewayId ? [{ gatewayAssinaturaId: c.assinaturaGatewayId }] : []), ...(c.clienteGatewayId ? [{ gatewayClienteId: c.clienteGatewayId }] : [])] },
    })
    if (!assinatura) throw new Error(`Cobrança ${c.gatewayId} de uma assinatura que não está no sistema.`)
    const recusa =
      tipo === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' ? 'Cartão recusado pela operadora' : tipo === 'PAYMENT_REPROVED_BY_RISK_ANALYSIS' ? 'Pagamento reprovado na análise de risco' : undefined
    const antes = await salvarCobranca(plataforma, assinatura.assinanteId, c, recusa ? { falha: recusa } : c.situacao === 'paga' ? { falha: null } : {})
    const valor = formatarMoeda(c.valor)
    if (c.situacao === 'paga' && antes?.situacao !== 'paga') {
      await registrarEvento(plataforma, assinatura.assinanteId, 'pagamento', `Pagamento de ${valor} recebido (${FORMAS[c.forma ?? ''] ?? c.forma ?? '—'})`, { cobranca: c.gatewayId })
    }
    if (recusa) await registrarEvento(plataforma, assinatura.assinanteId, 'falha_pagamento', `${recusa} (${valor}, vencimento ${c.vencimento})`, { cobranca: c.gatewayId })
    if (c.situacao === 'estornada' && antes?.situacao !== 'estornada') await registrarEvento(plataforma, assinatura.assinanteId, 'estorno', `Cobrança de ${valor} estornada`, { cobranca: c.gatewayId })
    await recalcularAssinatura(plataforma, assinatura.assinanteId)
  }
  if (corpo.invoice) {
    const nota = notaDoAsaas(corpo.invoice)
    if (!nota) return
    const cobranca = await plataforma.cobranca.findUnique({ where: { gatewayId: nota.cobrancaGatewayId } })
    if (!cobranca) throw new Error(`Nota fiscal da cobrança ${nota.cobrancaGatewayId}, que não está no sistema.`)
    await salvarNotaFiscal(plataforma, nota)
    if (nota.situacao === 'erro') await registrarEvento(plataforma, cobranca.assinanteId, 'nota_fiscal_erro', `Falha na emissão da nota fiscal: ${nota.erro}`)
    if (nota.situacao === 'emitida') await registrarEvento(plataforma, cobranca.assinanteId, 'nota_fiscal', `Nota fiscal ${nota.numero ?? ''} emitida`.replace('  ', ' '))
  }
  app.empresas.esquecer()
}

/**
 * Webhook do Asaas: guarda o aviso (o id do evento impede processar duas vezes) e aplica.
 * Erro ao aplicar fica registrado no evento e a conferência diária corrige; o Asaas sempre recebe 200.
 */
export async function receberEventoAsaas(app: FastifyInstance, corpo: { id?: string; event?: string; payment?: PagamentoAsaas; invoice?: NotaAsaas; authorization?: AutorizacaoAsaas }) {
  const eventoId = String(corpo.id ?? '')
  const tipo = String(corpo.event ?? 'DESCONHECIDO')
  if (!eventoId) return { situacao: 'ignorado' as const }
  let registro
  try {
    registro = await app.plataforma.eventoGateway.create({ data: { gateway: 'asaas', eventoId, tipo, payload: corpo as Prisma.InputJsonValue } })
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') return { situacao: 'duplicado' as const }
    throw erro
  }
  try {
    await aplicarEventoAsaas(app, tipo, corpo)
    await app.plataforma.eventoGateway.update({ where: { id: registro.id }, data: { processadoEm: new Date() } })
    return { situacao: 'processado' as const }
  } catch (erro) {
    app.log.error({ err: erro, eventoId, tipo }, 'Falha ao aplicar aviso do Asaas')
    await app.plataforma.eventoGateway.update({ where: { id: registro.id }, data: { erro: (erro as Error).message.slice(0, 1000) } })
    return { situacao: 'erro' as const }
  }
}

/**
 * Conferência (diária e sob demanda): busca no Asaas as cobranças de cada assinatura e as notas das pagas,
 * corrige o que algum aviso perdido deixou para trás e recalcula todas as assinaturas.
 */
export async function conciliarAssinaturas(app: FastifyInstance) {
  const { plataforma, pagamentos } = app
  let cobrancas = 0
  const falhas: string[] = []
  if (pagamentos) {
    const comGateway = await plataforma.assinatura.findMany({ where: { gateway: 'asaas', gatewayClienteId: { not: null } } })
    for (const a of comGateway) {
      try {
        // PIX Automático ainda aguardando: confere se o pagador já autorizou (ou se a autorização acabou)
        if (a.gatewayAutorizacaoId && !a.gatewayAssinaturaId) {
          const aut = await pagamentos.consultarAutorizacaoPix(a.gatewayAutorizacaoId)
          if (aut.situacao !== 'aguardando') {
            const status = aut.situacao === 'ativa' ? 'ACTIVE' : 'CANCELLED'
            await aplicarAutorizacaoPix(plataforma, '', { id: a.gatewayAutorizacaoId, status, subscriptionId: aut.assinaturaId })
          }
        }
        // Por cliente: pega todas as mensalidades (inclusive a 1ª do PIX Automático e as de assinaturas anteriores)
        for (const c of await pagamentos.cobrancasDoCliente(a.gatewayClienteId as string)) {
          await salvarCobranca(plataforma, a.assinanteId, c)
          cobrancas++
        }
        if (app.config.ASAAS_NF_ATIVA) {
          const semNota = await plataforma.cobranca.findMany({ where: { assinanteId: a.assinanteId, situacao: 'paga', gatewayId: { not: null }, OR: [{ nfSituacao: null }, { nfSituacao: 'agendada' }] } })
          for (const c of semNota) {
            const nota = await pagamentos.notaFiscalDaCobranca(c.gatewayId as string)
            if (nota) await salvarNotaFiscal(plataforma, nota)
          }
        }
      } catch (erro) {
        falhas.push(`${a.assinanteId}: ${(erro as Error).message}`)
      }
    }
  }
  const todas = await plataforma.assinatura.findMany({ select: { assinanteId: true } })
  for (const { assinanteId } of todas) await recalcularAssinatura(plataforma, assinanteId)
  app.empresas.esquecer()
  return { cobrancas, assinaturas: todas.length, falhas }
}

/**
 * Troca de plano: só as mensalidades de períodos que AINDA NÃO COMEÇARAM (vencimento depois de hoje) vão para o
 * valor novo, mantendo a data. Vencidas e a do período em curso nunca mudam: são serviço já prestado no plano antigo.
 * Devolve as falhas (a troca segue; o suporte vê o evento no histórico).
 */
export async function reajustarCobrancasFuturas(plataforma: PrismaClient, pagamentos: GatewayPagamentos | null, assinanteId: string, valor: string, hoje = hojeISO()) {
  const futuras = await plataforma.cobranca.findMany({ where: { assinanteId, tipo: 'mensalidade', situacao: 'pendente', vencimento: { gt: paraDia(hoje) } } })
  const falhas: string[] = []
  for (const c of futuras) {
    if (c.valor.toFixed(2) === Number(valor).toFixed(2)) continue
    const vencimento = diaISO(c.vencimento) as string
    try {
      if (c.gatewayId && c.gateway === 'asaas') {
        if (!pagamentos) throw new Error('pagamento online desligado')
        await pagamentos.alterarCobranca(c.gatewayId, { valor, vencimento, tipo: c.forma ?? 'UNDEFINED' })
      }
      await plataforma.cobranca.update({ where: { id: c.id }, data: { valor } })
    } catch (erro) {
      falhas.push(`${vencimento}: ${(erro as Error).message}`)
    }
  }
  if (falhas.length) await registrarEvento(plataforma, assinanteId, 'falha_reajuste', `Mensalidade futura não foi para o valor novo (${falhas.join('; ')})`)
  return falhas
}

/** Início do período em curso: vencimento da última mensalidade (não cancelada) até hoje — paga ou não. */
export async function inicioPeriodoAtual(plataforma: PrismaClient, assinanteId: string, hoje = hojeISO()) {
  const mensalidades = await plataforma.cobranca.findMany({ where: { assinanteId, tipo: 'mensalidade', situacao: { notIn: ['cancelada', 'estornada'] } } })
  return (
    mensalidades
      .map(vencimentoQueConta)
      .filter((v) => v <= hoje)
      .sort()
      .at(-1) ?? null
  )
}

/** Modo manual (sem gateway): o suporte lança a cobrança e registra o pagamento. */
export async function lancarCobrancaManual(plataforma: PrismaClient, assinanteId: string, vencimento: string, valor: string) {
  const c = await plataforma.cobranca.create({ data: { assinanteId, gateway: 'manual', valor, vencimento: paraDia(vencimento), situacao: 'pendente' } })
  await registrarEvento(plataforma, assinanteId, 'cobranca', `Cobrança manual de ${formatarMoeda(valor)} com vencimento ${vencimento}`)
  await recalcularAssinatura(plataforma, assinanteId)
  return c
}

export async function registrarPagamentoManual(plataforma: PrismaClient, assinanteId: string) {
  const aberta = await plataforma.cobranca.findFirst({ where: { assinanteId, situacao: { in: ABERTAS } }, orderBy: { vencimento: 'asc' } })
  if (!aberta) throw new Error('Nenhuma cobrança em aberto.')
  await plataforma.cobranca.update({ where: { id: aberta.id }, data: { situacao: 'paga', pagoEm: new Date(), forma: aberta.forma ?? 'manual' } })
  await registrarEvento(plataforma, assinanteId, 'pagamento', `Pagamento manual de ${formatarMoeda(aberta.valor.toString())} registrado (vencimento ${diaISO(aberta.vencimento)})`)
  await recalcularAssinatura(plataforma, assinanteId)
  return aberta
}
