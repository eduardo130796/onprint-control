import type { Prisma, PrismaClient } from '@prisma/client'
import { formatarDataSimples, type AcaoAssinatura } from '@onprint/shared'
import type { GatewayPagamentos } from '../integrations/pagamentos'
import { alterarAssinatura, paraDia, planoPorCodigo } from './assinaturas'
import { lancarCobrancaManual, reajustarCobrancasFuturas, recalcularAssinatura, registrarPagamentoManual } from './cobrancas'

export interface DependenciasOperacao {
  plataforma: PrismaClient
  pagamentos: GatewayPagamentos | null
}

const data = (iso: string) => formatarDataSimples(iso)

/**
 * Ação do suporte numa assinatura (painel da plataforma e comando `assinatura`), sempre com evento no histórico.
 * Troca de plano e cancelamento também valem no gateway quando a empresa assina pelo pagamento online.
 */
export async function executarAcao(deps: DependenciasOperacao, assinanteId: string, acao: AcaoAssinatura, autor: string) {
  const { plataforma, pagamentos } = deps
  const a = await plataforma.assinatura.findUnique({ where: { assinanteId }, include: { plano: true } })
  if (!a) throw new Error('Empresa sem assinatura.')
  const alterar = (dados: Prisma.AssinaturaUncheckedUpdateInput, descricao: string) => alterarAssinatura(plataforma, assinanteId, dados, { tipo: `suporte_${acao.acao}`, descricao, autor })

  switch (acao.acao) {
    case 'plano': {
      const plano = await planoPorCodigo(plataforma, acao.plano)
      if (a.gatewayAssinaturaId && pagamentos) await pagamentos.alterarAssinatura(a.gatewayAssinaturaId, { valor: plano.valorMensal.toFixed(2) })
      // Suporte: troca na hora, sem proporcional; vencidas e o período em curso mantêm o valor
      const atualizada = await alterar({ planoId: plano.id, planoAgendadoId: null, planoAgendadoEm: null }, `Plano trocado de ${a.plano.nome} para ${plano.nome}`)
      await reajustarCobrancasFuturas(plataforma, pagamentos, assinanteId, plano.valorMensal.toFixed(2))
      return atualizada
    }
    case 'ativar':
      return alterar(
        { situacao: 'ativa', testeAte: null, atrasoDesde: null, canceladaEm: null, cancelarEm: null, ...(acao.proximoVencimento ? { proximoVencimento: paraDia(acao.proximoVencimento) } : {}) },
        `Assinatura ativada e em dia${acao.proximoVencimento ? `; próximo vencimento ${data(acao.proximoVencimento)}` : ''}`,
      )
    case 'teste_ate':
      return alterar({ situacao: 'teste', testeAte: paraDia(acao.data) }, `Teste grátis até ${data(acao.data)}`)
    case 'liberar_ate':
      return alterar({ liberadoAte: acao.data ? paraDia(acao.data) : null }, acao.data ? `Acesso liberado até ${data(acao.data)}` : 'Liberação manual removida')
    case 'atraso_desde':
      return alterar({ atrasoDesde: acao.data ? paraDia(acao.data) : null }, acao.data ? `Em atraso desde ${data(acao.data)}` : 'Atraso quitado')
    case 'bloquear':
      return alterar({ bloqueioManual: true, motivoBloqueio: acao.motivo }, `Bloqueio manual: ${acao.motivo}`)
    case 'desbloquear':
      return alterar({ bloqueioManual: false, motivoBloqueio: null }, 'Bloqueio manual removido')
    case 'cancelar': {
      if (a.gatewayAutorizacaoId && pagamentos) await pagamentos.cancelarAutorizacaoPix(a.gatewayAutorizacaoId).catch(() => undefined)
      if (a.gatewayAssinaturaId && pagamentos) {
        const cancelar = pagamentos.cancelarAssinatura(a.gatewayAssinaturaId)
        await (a.gatewayAutorizacaoId ? cancelar.catch(() => undefined) : cancelar)
      }
      await plataforma.cobranca.updateMany({ where: { assinanteId, situacao: { in: ['pendente', 'vencida'] } }, data: { situacao: 'cancelada' } })
      return alterar({ situacao: 'cancelada', canceladaEm: new Date(), cancelarEm: null, gatewayAssinaturaId: null, gatewayAutorizacaoId: null, pixQrPayload: null, pixQrImagem: null, pixQrExpiraEm: null }, 'Assinatura cancelada pelo suporte (vale na hora)')
    }
    case 'reativar':
      return alterar({ situacao: 'ativa', canceladaEm: null, cancelarEm: null }, 'Assinatura reativada pelo suporte')
    case 'modulos_extras':
      return alterar({ modulosExtras: acao.modulos }, acao.modulos.length ? `Módulos extras: ${acao.modulos.join(', ')}` : 'Sem módulos extras')
    case 'cobranca_manual':
      await lancarCobrancaManual(plataforma, assinanteId, acao.vencimento, acao.valor ?? a.plano.valorMensal.toFixed(2))
      return recalcularAssinatura(plataforma, assinanteId)
    case 'registrar_pagamento':
      await registrarPagamentoManual(plataforma, assinanteId)
      return recalcularAssinatura(plataforma, assinanteId)
  }
}
