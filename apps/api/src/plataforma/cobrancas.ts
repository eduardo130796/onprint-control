import { Prisma, type PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { adicionarMeses, formatarMoeda, hojeISO } from '@onprint/shared'
import { situacaoAutorizacaoAsaas, type AutorizacaoAsaas, type NotaAsaas, type PagamentoAsaas } from '../integrations/pagamentos/asaas'
import type { CobrancaGateway, NotaFiscalGateway } from '../integrations/pagamentos'
import { diaISO, paraDia } from './assinaturas'
import { aplicarValores, descontoDaMensalidade } from './beneficios'

const ABERTAS = ['pendente', 'vencida']

/** Vencimento que conta para o atraso: o original, se a cobrança vencida foi reajustada (ganhou data nova no gateway). */
export const vencimentoQueConta = (c: { vencimento: Date; vencimentoOriginal: Date | null }) => diaISO(c.vencimentoOriginal ?? c.vencimento) as string
const FORMAS: Record<string, string> = { PIX: 'PIX', BOLETO: 'boleto', CREDIT_CARD: 'cartão', UNDEFINED: 'a definir' }

/**
 * Grava (cria ou atualiza) a cobrança vinda do gateway; devolve como estava antes (null = nova).
 * Abonada continua abonada (o gateway só avisa que ela foi removida). Mensalidade nova guarda o desconto do cupom.
 */
export async function salvarCobranca(plataforma: PrismaClient, assinanteId: string, c: CobrancaGateway, extra: { falha?: string | null } = {}) {
  const antes = await plataforma.cobranca.findUnique({ where: { gatewayId: c.gatewayId } })
  if (antes?.situacao === 'abonada' && c.situacao === 'cancelada') return antes
  const dados = { valor: c.valor, vencimento: paraDia(c.vencimento), situacao: c.situacao, forma: c.forma, pagoEm: c.pagoEm, linkPagamento: c.linkPagamento, ...extra }
  const desconto = !antes && c.assinaturaGatewayId ? await descontoDaMensalidade(plataforma, assinanteId, c.vencimento) : null
  await plataforma.cobranca.upsert({ where: { gatewayId: c.gatewayId }, create: { assinanteId, gateway: 'asaas', gatewayId: c.gatewayId, desconto, ...dados }, update: dados })
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
  // Sem cobrança em aberto, o próximo vencimento é um mês depois da última mensalidade paga ou abonada (fim do período coberto)
  const ultimaPaga = cobrancas
    .filter((c) => c.tipo === 'mensalidade' && (c.situacao === 'paga' || c.situacao === 'abonada'))
    .map(vencimentoQueConta)
    .sort()
    .at(-1)
  // Cortesia com prazo: a próxima cobrança é a do fim da cortesia
  const fimCortesiaPrevisto = a.situacao === 'cortesia' ? diaISO(a.cortesiaAte) : null
  const proximo =
    mensalidadesAbertas.find((v) => v >= hoje) ??
    (fimCortesiaPrevisto && fimCortesiaPrevisto >= hoje ? fimCortesiaPrevisto : mensalidadesAbertas.length === 0 && ultimaPaga ? adicionarMeses(ultimaPaga, 1) : undefined)
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
  // Cortesia com prazo que acabou: vira ativa quando paga a mensalidade de depois dela
  const fimCortesia = diaISO(a.cortesiaAte)
  if (a.situacao === 'cortesia' && fimCortesia && fimCortesia < hoje && cobrancas.some((c) => c.tipo === 'mensalidade' && c.situacao === 'paga' && vencimentoQueConta(c) >= fimCortesia)) {
    Object.assign(dados, { situacao: 'ativa', cortesiaAte: null, cortesiaMotivo: null })
    eventos.push({ tipo: 'ativacao', descricao: 'Cortesia terminou e a mensalidade foi paga: assinatura ativa' })
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

export async function registrarEvento(plataforma: PrismaClient, assinanteId: string, tipo: string, descricao: string, dados?: Prisma.InputJsonValue, autor = 'sistema') {
  await plataforma.eventoAssinatura.create({ data: { assinanteId, tipo, descricao, dados, autor } })
}

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
  if (situacao === 'ativa') {
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

/** Id que veio no aviso: só usado para consultar o gateway. */
function idDoAviso(id: unknown): string {
  if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw new Error('Aviso do Asaas com id inválido.')
  return id
}

/**
 * Aplica um aviso do Asaas (cobrança, nota fiscal ou autorização do PIX Automático). Lança erro se não reconhecer a assinatura.
 * O aviso é só o gatilho: os dados (situação, valor, links) vêm sempre de uma consulta ao Asaas, nunca do corpo recebido.
 */
export async function aplicarEventoAsaas(app: FastifyInstance, tipo: string, corpo: { payment?: Pick<PagamentoAsaas, 'id'>; invoice?: Pick<NotaAsaas, 'payment'>; authorization?: Pick<AutorizacaoAsaas, 'id'> }) {
  const { plataforma, pagamentos } = app
  if (!pagamentos) throw new Error('Pagamento online não configurado: aviso do Asaas ignorado.')
  if (corpo.authorization && tipo.startsWith('PIX_AUTOMATIC_RECURRING_AUTHORIZATION')) {
    const id = idDoAviso(corpo.authorization.id)
    const aut = await pagamentos.consultarAutorizacaoPix(id)
    const status = aut.situacao === 'ativa' ? 'ACTIVE' : aut.situacao === 'aguardando' ? 'CREATED' : 'CANCELLED'
    await aplicarAutorizacaoPix(plataforma, tipo, { id, status, subscriptionId: aut.assinaturaId })
  }
  if (corpo.payment) {
    const id = idDoAviso(corpo.payment.id)
    const consultada = await pagamentos.obterCobranca(id)
    if (!consultada) {
      // Removida no Asaas (a consulta não acha mais): vira cancelada, se estiver no sistema (abonada continua abonada)
      if (tipo !== 'PAYMENT_DELETED') throw new Error(`Cobrança ${id} não encontrada no Asaas.`)
      const salva = await plataforma.cobranca.findUnique({ where: { gatewayId: id } })
      if (salva && salva.situacao !== 'abonada' && salva.situacao !== 'cancelada') {
        await plataforma.cobranca.update({ where: { id: salva.id }, data: { situacao: 'cancelada' } })
        await recalcularAssinatura(plataforma, salva.assinanteId)
      }
      app.empresas.esquecer()
      return
    }
    const c = consultada
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
    // Mensalidade nova: confere o valor (fim da janela do cupom, downgrade) e o que o gateway vai gerar depois
    if (!antes && c.assinaturaGatewayId) await aplicarValores({ plataforma, pagamentos: app.pagamentos }, assinatura.assinanteId)
    await recalcularAssinatura(plataforma, assinatura.assinanteId)
  }
  if (corpo.invoice) {
    if (!corpo.invoice.payment) return
    const cobrancaId = idDoAviso(corpo.invoice.payment)
    const cobranca = await plataforma.cobranca.findUnique({ where: { gatewayId: cobrancaId } })
    if (!cobranca) throw new Error(`Nota fiscal da cobrança ${cobrancaId}, que não está no sistema.`)
    const nota = await pagamentos.notaFiscalDaCobranca(cobrancaId)
    if (!nota) throw new Error(`Nota fiscal da cobrança ${cobrancaId} não encontrada no Asaas.`)
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
        let novas = 0
        for (const c of await pagamentos.cobrancasDoCliente(a.gatewayClienteId as string)) {
          if (!(await salvarCobranca(plataforma, a.assinanteId, c))) novas++
          cobrancas++
        }
        // Mensalidade nova (aviso perdido) ou janela de cupom que terminou: valores certos
        if (novas > 0 || (await plataforma.cupomUso.count({ where: { assinanteId: a.assinanteId, encerradoEm: null, ate: { lt: paraDia(hojeISO()) } } }))) {
          await aplicarValores({ plataforma, pagamentos }, a.assinanteId)
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
export async function lancarCobrancaManual(plataforma: PrismaClient, assinanteId: string, vencimento: string, valor: string, desconto: string | null = null) {
  const c = await plataforma.cobranca.create({ data: { assinanteId, gateway: 'manual', valor, desconto, vencimento: paraDia(vencimento), situacao: 'pendente' } })
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
