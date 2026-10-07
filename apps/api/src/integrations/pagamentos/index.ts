import type { FormaAssinatura } from '@onprint/shared'
import type { Env } from '../../config/env'
import { AsaasGateway } from './asaas'

export type SituacaoCobranca = 'pendente' | 'paga' | 'vencida' | 'cancelada' | 'estornada'
export type SituacaoNotaFiscal = 'agendada' | 'emitida' | 'erro' | 'cancelada'
export type { FormaAssinatura }

/** Cobrança como o gateway informa, já traduzida para o sistema. */
export interface CobrancaGateway {
  gatewayId: string
  assinaturaGatewayId: string | null
  clienteGatewayId: string | null
  valor: string
  vencimento: string
  situacao: SituacaoCobranca
  forma: string | null
  pagoEm: Date | null
  linkPagamento: string | null
}

export interface NotaFiscalGateway {
  cobrancaGatewayId: string
  situacao: SituacaoNotaFiscal
  numero: string | null
  linkPdf: string | null
  erro: string | null
}

/** Pagamento recorrente da mensalidade. Hoje: Asaas. Outro gateway implementa esta mesma interface. */
export interface GatewayPagamentos {
  readonly nome: 'asaas'
  criarCliente(d: { nome: string; email: string; cpfCnpj: string; telefone?: string | null; referencia: string }): Promise<string>
  criarAssinatura(d: { clienteId: string; valor: string; proximoVencimento: string; forma: FormaAssinatura; descricao: string; referencia: string }): Promise<string>
  /** Valor e/ou forma; as cobranças em aberto acompanham a mudança */
  alterarAssinatura(id: string, d: { valor?: string; forma?: FormaAssinatura }): Promise<void>
  cancelarAssinatura(id: string): Promise<void>
  cobrancasDaAssinatura(id: string): Promise<CobrancaGateway[]>
  notaFiscalDaCobranca(cobrancaGatewayId: string): Promise<NotaFiscalGateway | null>
  /** NFS-e automática para as cobranças da assinatura (se a emissão estiver configurada) */
  configurarNotaFiscal(assinaturaId: string): Promise<void>
}

export class ErroGateway extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ErroGateway'
  }
}

/** Sem ASAAS_API_KEY: null (modo manual, sem pagamento online). */
export function criarGateway(config: Env): GatewayPagamentos | null {
  return config.ASAAS_API_KEY ? new AsaasGateway(config) : null
}
