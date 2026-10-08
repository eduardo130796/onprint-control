import { describe, expect, it } from 'vitest'
import { carregarEnv } from '../src/config/env'
import { cobrancaDoAsaas, dataHoraAsaas, notaDoAsaas, situacaoAsaas, situacaoAutorizacaoAsaas, situacaoNotaAsaas } from '../src/integrations/pagamentos/asaas'
import { criarGateway } from '../src/integrations/pagamentos'

describe('Asaas: situação da cobrança', () => {
  it('pagas, vencidas, estornadas e removidas', () => {
    for (const s of ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']) expect(situacaoAsaas(s)).toBe('paga')
    expect(situacaoAsaas('OVERDUE')).toBe('vencida')
    for (const s of ['REFUNDED', 'CHARGEBACK_REQUESTED', 'REFUND_IN_PROGRESS']) expect(situacaoAsaas(s)).toBe('estornada')
    expect(situacaoAsaas('PENDING')).toBe('pendente')
    expect(situacaoAsaas('AWAITING_RISK_ANALYSIS')).toBe('pendente')
    expect(situacaoAsaas('RECEIVED', true)).toBe('cancelada')
  })

  it('traduz a cobrança (valor com 2 casas, data paga no dia do cliente)', () => {
    const c = cobrancaDoAsaas({
      id: 'pay_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      value: 279,
      dueDate: '2026-11-10',
      status: 'RECEIVED',
      billingType: 'PIX',
      paymentDate: '2026-11-09',
      clientPaymentDate: '2026-11-08',
      invoiceUrl: 'https://sandbox.asaas.com/i/abc',
    })
    expect(c).toMatchObject({ gatewayId: 'pay_1', assinaturaGatewayId: 'sub_1', valor: '279.00', vencimento: '2026-11-10', situacao: 'paga', forma: 'PIX', linkPagamento: 'https://sandbox.asaas.com/i/abc' })
    expect(c.pagoEm?.toISOString().slice(0, 10)).toBe('2026-11-08')
  })

  it('pendente não tem data de pagamento', () => {
    expect(cobrancaDoAsaas({ id: 'pay_2', value: 10.5, dueDate: '2026-11-10', status: 'PENDING', paymentDate: null }).pagoEm).toBeNull()
  })
})

describe('Asaas: nota fiscal', () => {
  it('situações', () => {
    expect(situacaoNotaAsaas('AUTHORIZED')).toBe('emitida')
    expect(situacaoNotaAsaas('ERROR')).toBe('erro')
    expect(situacaoNotaAsaas('SCHEDULED')).toBe('agendada')
    expect(situacaoNotaAsaas('CANCELED')).toBe('cancelada')
  })
  it('erro traz o motivo; nota sem cobrança é ignorada', () => {
    expect(notaDoAsaas({ id: 'inv_1', payment: 'pay_1', status: 'ERROR', statusDescription: 'Código de serviço inválido' })).toMatchObject({ situacao: 'erro', erro: 'Código de serviço inválido' })
    expect(notaDoAsaas({ id: 'inv_2', payment: 'pay_1', status: 'AUTHORIZED', number: '123', pdfUrl: 'https://x/nf.pdf' })).toMatchObject({ situacao: 'emitida', numero: '123', erro: null })
    expect(notaDoAsaas({ id: 'inv_3', status: 'AUTHORIZED' })).toBeNull()
  })
})

describe('Asaas: PIX Automático', () => {
  it('situação da autorização', () => {
    expect(situacaoAutorizacaoAsaas('CREATED')).toBe('aguardando')
    expect(situacaoAutorizacaoAsaas('ACTIVE')).toBe('ativa')
    for (const s of ['CANCELLED', 'REFUSED', 'EXPIRED']) expect(situacaoAutorizacaoAsaas(s)).toBe('encerrada')
  })
  it('validade do QR no horário de Brasília (ou ISO completo)', () => {
    expect(dataHoraAsaas('2026-10-10 14:30:00').toISOString()).toBe('2026-10-10T17:30:00.000Z')
    expect(dataHoraAsaas('2026-10-10T14:30:00Z').toISOString()).toBe('2026-10-10T14:30:00.000Z')
    expect(dataHoraAsaas('2026-10-10T14:30:00-03:00').toISOString()).toBe('2026-10-10T17:30:00.000Z')
  })
})

describe('gateway e segurança', () => {
  const base = { DATABASE_URL: 'postgresql://u:s@db:5432/x', JWT_ACCESS_SECRET: 'segredo-1', JWT_REFRESH_SECRET: 'segredo-2' }
  it('sem chave: modo manual (sem pagamento online)', () => {
    expect(criarGateway(carregarEnv(base))).toBeNull()
  })
  it('com chave: Asaas, e exige token forte no webhook', () => {
    expect(() => carregarEnv({ ...base, ASAAS_API_KEY: '$aact_x', ASAAS_WEBHOOK_TOKEN: 'curto' })).toThrow(/ASAAS_WEBHOOK_TOKEN/)
    expect(criarGateway(carregarEnv({ ...base, ASAAS_API_KEY: '$aact_x', ASAAS_WEBHOOK_TOKEN: 'x'.repeat(32) }))?.nome).toBe('asaas')
  })
})
