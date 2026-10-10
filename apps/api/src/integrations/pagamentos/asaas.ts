import type { Env } from '../../config/env'
import { ErroGateway, type AutorizacaoPixNova, type CobrancaGateway, type SituacaoAutorizacaoPix, type FormaAssinatura, type GatewayPagamentos, type NotaFiscalGateway, type SituacaoCobranca, type SituacaoNotaFiscal } from './index'

const URLS = { sandbox: 'https://api-sandbox.asaas.com/v3', producao: 'https://api.asaas.com/v3' } as const
const tipoCobranca = (forma: FormaAssinatura) => (forma === 'cartao' ? 'CREDIT_CARD' : 'UNDEFINED')

/** "2026-10-10 14:30:00" (horário de Brasília) ou ISO completo → Date. */
export function dataHoraAsaas(texto: string): Date {
  return /[TZ]|[+-]\d{2}:\d{2}$/.test(texto) ? new Date(texto) : new Date(`${texto.replace(' ', 'T')}-03:00`)
}

/** Cobrança (payment) como o Asaas devolve na API e nos webhooks (só os campos usados). */
export interface PagamentoAsaas {
  id: string
  customer?: string
  subscription?: string | null
  value: number
  dueDate: string
  status: string
  billingType?: string
  paymentDate?: string | null
  clientPaymentDate?: string | null
  confirmedDate?: string | null
  invoiceUrl?: string | null
  deleted?: boolean
}

export interface NotaAsaas {
  id: string
  payment?: string | null
  status: string
  number?: string | null
  pdfUrl?: string | null
  statusDescription?: string | null
}

const PAGAS = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'])
const ESTORNADAS = new Set(['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'])

export function situacaoAsaas(status: string, removida = false): SituacaoCobranca {
  if (removida) return 'cancelada'
  if (PAGAS.has(status)) return 'paga'
  if (status === 'OVERDUE') return 'vencida'
  if (ESTORNADAS.has(status)) return 'estornada'
  return 'pendente'
}

/** Só links https do próprio Asaas (asaas.com e subdomínios, ex.: sandbox.asaas.com) vão para a tela; o resto vira null. */
export function urlAsaas(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    return u.protocol === 'https:' && (host === 'asaas.com' || host.endsWith('.asaas.com')) ? url : null
  } catch {
    return null
  }
}

export function cobrancaDoAsaas(p: PagamentoAsaas): CobrancaGateway {
  const pago = p.clientPaymentDate ?? p.paymentDate ?? p.confirmedDate
  const situacao = situacaoAsaas(p.status, p.deleted)
  return {
    gatewayId: p.id,
    assinaturaGatewayId: p.subscription ?? null,
    clienteGatewayId: p.customer ?? null,
    valor: Number(p.value).toFixed(2),
    vencimento: p.dueDate.slice(0, 10),
    situacao,
    forma: p.billingType ?? null,
    pagoEm: situacao === 'paga' && pago ? new Date(`${pago.slice(0, 10)}T12:00:00-03:00`) : null,
    linkPagamento: urlAsaas(p.invoiceUrl),
  }
}

export function situacaoNotaAsaas(status: string): SituacaoNotaFiscal {
  if (status === 'AUTHORIZED') return 'emitida'
  if (status === 'ERROR' || status === 'CANCELLATION_DENIED') return 'erro'
  if (status === 'CANCELED' || status === 'PROCESSING_CANCELLATION') return 'cancelada'
  return 'agendada'
}

export function notaDoAsaas(n: NotaAsaas): NotaFiscalGateway | null {
  if (!n.payment) return null
  const situacao = situacaoNotaAsaas(n.status)
  return { cobrancaGatewayId: n.payment, situacao, numero: n.number ?? null, linkPdf: urlAsaas(n.pdfUrl), erro: situacao === 'erro' ? (n.statusDescription ?? 'Erro na emissão') : null }
}

/** Autorização do PIX Automático (resposta da API e objeto `authorization` dos webhooks). */
export interface AutorizacaoAsaas {
  id: string
  status: string
  subscriptionId?: string | null
  customerId?: string | null
  cancellationReason?: string | null
}

export function situacaoAutorizacaoAsaas(status: string): SituacaoAutorizacaoPix {
  if (status === 'ACTIVE') return 'ativa'
  if (status === 'CREATED') return 'aguardando'
  return 'encerrada'
}

export class AsaasGateway implements GatewayPagamentos {
  readonly nome = 'asaas' as const
  private readonly base: string

  constructor(private readonly config: Env) {
    this.base = config.ASAAS_API_URL || URLS[config.ASAAS_AMBIENTE]
  }

  private async chamar<T>(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', caminho: string, corpo?: unknown): Promise<T> {
    let resposta: Response
    try {
      resposta = await fetch(`${this.base}${caminho}`, {
        method: metodo,
        headers: { access_token: this.config.ASAAS_API_KEY, 'Content-Type': 'application/json', 'User-Agent': 'GrafyGo' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (erro) {
      throw new ErroGateway(`Asaas fora do ar ou sem conexão (${(erro as Error).message}). Tente de novo em instantes.`)
    }
    const texto = await resposta.text()
    const json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {}
    if (!resposta.ok) {
      const erros = (json.errors as { description?: string }[] | undefined)?.map((e) => e.description).filter(Boolean)
      const mensagem = erros?.length ? erros.join(' ') : typeof json.message === 'string' ? json.message : `respondeu ${resposta.status}`
      throw new ErroGateway(`Asaas: ${mensagem}`, resposta.status)
    }
    return json as T
  }

  async criarCliente(d: { nome: string; email: string; cpfCnpj: string; telefone?: string | null; referencia: string }) {
    const r = await this.chamar<{ id: string }>('POST', '/customers', {
      name: d.nome,
      email: d.email,
      cpfCnpj: d.cpfCnpj,
      mobilePhone: d.telefone ?? undefined,
      externalReference: d.referencia,
    })
    return r.id
  }

  async criarAssinatura(d: { clienteId: string; valor: string; proximoVencimento: string; forma: FormaAssinatura; descricao: string; referencia: string }) {
    const r = await this.chamar<{ id: string }>('POST', '/subscriptions', {
      customer: d.clienteId,
      // UNDEFINED: na fatura o cliente escolhe PIX, boleto ou cartão; CREDIT_CARD: o cartão fica salvo e as próximas são automáticas
      billingType: tipoCobranca(d.forma),
      value: Number(d.valor),
      nextDueDate: d.proximoVencimento,
      cycle: 'MONTHLY',
      description: d.descricao,
      externalReference: d.referencia,
    })
    return r.id
  }

  async alterarAssinatura(id: string, d: { valor?: string; forma?: FormaAssinatura; proximoVencimento?: string }) {
    await this.chamar('PUT', `/subscriptions/${id}`, {
      ...(d.valor ? { value: Number(d.valor) } : {}),
      ...(d.proximoVencimento ? { nextDueDate: d.proximoVencimento } : {}),
      ...(d.forma ? { billingType: tipoCobranca(d.forma) } : {}),
      // As cobranças já geradas ficam como estão: o sistema reajusta só as de períodos que ainda não começaram
      updatePendingPayments: false,
    })
  }

  async criarCobranca(d: { clienteId: string; valor: string; vencimento: string; descricao: string; referencia: string }) {
    const r = await this.chamar<PagamentoAsaas>('POST', '/payments', {
      customer: d.clienteId,
      billingType: 'UNDEFINED',
      value: Number(d.valor),
      dueDate: d.vencimento,
      description: d.descricao.slice(0, 500),
      externalReference: d.referencia,
    })
    return cobrancaDoAsaas(r)
  }

  async alterarCobranca(id: string, d: { valor: string; vencimento: string; tipo: string }) {
    // O Asaas exige tipo, valor e vencimento juntos; o vencimento original é mantido (o atraso continua contando)
    await this.chamar('PUT', `/payments/${id}`, { billingType: d.tipo, value: Number(d.valor), dueDate: d.vencimento })
  }

  async cancelarCobranca(id: string) {
    await this.chamar('DELETE', `/payments/${id}`)
  }

  async cancelarAssinatura(id: string) {
    await this.chamar('DELETE', `/subscriptions/${id}`)
  }

  async obterCobranca(id: string) {
    try {
      return cobrancaDoAsaas(await this.chamar<PagamentoAsaas>('GET', `/payments/${encodeURIComponent(id)}`))
    } catch (erro) {
      if (erro instanceof ErroGateway && erro.status === 404) return null
      throw erro
    }
  }

  async cobrancasDaAssinatura(id: string) {
    const r = await this.chamar<{ data: PagamentoAsaas[] }>('GET', `/subscriptions/${id}/payments?limit=100`)
    return r.data.map(cobrancaDoAsaas)
  }

  async cobrancasDoCliente(clienteId: string) {
    const r = await this.chamar<{ data: PagamentoAsaas[] }>('GET', `/payments?customer=${encodeURIComponent(clienteId)}&limit=100`)
    return r.data.map(cobrancaDoAsaas)
  }

  async criarAutorizacaoPix(d: { clienteId: string; valor: string; inicio: string; descricao: string; contrato: string }): Promise<AutorizacaoPixNova> {
    const r = await this.chamar<{ id: string; payload?: string; encodedImage?: string; immediateQrCode?: { expirationDate?: string; payload?: string; encodedImage?: string } }>(
      'POST',
      '/pix/automatic/authorizations',
      {
        customerId: d.clienteId,
        frequency: 'MONTHLY',
        contractId: d.contrato.slice(0, 35),
        startDate: d.inicio,
        value: Number(d.valor),
        description: d.descricao.slice(0, 35),
        // O Asaas cria a assinatura sozinho quando o pagador autoriza; as mensalidades vêm por ela
        paymentCreationMode: 'SUBSCRIPTION',
        // Saldo insuficiente no dia: o banco tenta de novo (até 3 vezes em 7 dias)
        retryPolicy: 'ALLOW_THREE_IN_SEVEN_DAYS',
        immediateQrCode: { originalValue: Number(d.valor), expirationSeconds: 2 * 86_400, description: d.descricao.slice(0, 35) },
      },
    )
    const payload = r.payload ?? r.immediateQrCode?.payload
    if (!payload) throw new ErroGateway('O Asaas não devolveu o QR Code do PIX Automático.')
    const imagem = r.encodedImage ?? r.immediateQrCode?.encodedImage ?? null
    const expira = r.immediateQrCode?.expirationDate
    return { id: r.id, copiaECola: payload, imagem, expiraEm: expira ? dataHoraAsaas(expira) : null }
  }

  async consultarAutorizacaoPix(id: string) {
    const r = await this.chamar<AutorizacaoAsaas>('GET', `/pix/automatic/authorizations/${id}`)
    return { situacao: situacaoAutorizacaoAsaas(r.status), assinaturaId: r.subscriptionId ?? null }
  }

  async cancelarAutorizacaoPix(id: string) {
    await this.chamar('DELETE', `/pix/automatic/authorizations/${id}`)
  }

  async notaFiscalDaCobranca(cobrancaGatewayId: string) {
    const r = await this.chamar<{ data: NotaAsaas[] }>('GET', `/invoices?payment=${encodeURIComponent(cobrancaGatewayId)}&limit=10`)
    const nota = r.data.find((n) => n.status !== 'CANCELED') ?? r.data[0]
    return nota ? notaDoAsaas(nota) : null
  }

  async configurarNotaFiscal(assinaturaId: string) {
    const c = this.config
    if (!c.ASAAS_NF_ATIVA) return
    await this.chamar('POST', `/subscriptions/${assinaturaId}/invoiceSettings`, {
      ...(c.ASAAS_NF_SERVICO_ID ? { municipalServiceId: c.ASAAS_NF_SERVICO_ID } : { municipalServiceCode: c.ASAAS_NF_SERVICO_CODIGO }),
      municipalServiceName: c.ASAAS_NF_SERVICO_NOME,
      // Nota só depois do pagamento confirmado: nada de nota para cobrança que não foi paga
      effectiveDatePeriod: 'ON_PAYMENT_CONFIRMATION',
      observations: c.ASAAS_NF_OBSERVACOES || undefined,
      deductions: 0,
      taxes: { retainIss: c.ASAAS_NF_RETER_ISS, iss: c.ASAAS_NF_ISS, pis: c.ASAAS_NF_PIS, cofins: c.ASAAS_NF_COFINS, csll: c.ASAAS_NF_CSLL, inss: c.ASAAS_NF_INSS, ir: c.ASAAS_NF_IR },
    })
  }
}
