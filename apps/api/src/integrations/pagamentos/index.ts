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

/** PIX Automático: autorização criada, aguardando o pagador ler o QR e autorizar no banco. */
export interface AutorizacaoPixNova {
  id: string
  copiaECola: string
  imagem: string | null
  expiraEm: Date | null
}

export type SituacaoAutorizacaoPix = 'aguardando' | 'ativa' | 'encerrada'

/** Pagamento recorrente da mensalidade. Hoje: Asaas. Outro gateway implementa esta mesma interface. */
export interface GatewayPagamentos {
  readonly nome: 'asaas'
  criarCliente(d: { nome: string; email: string; cpfCnpj: string; telefone?: string | null; referencia: string }): Promise<string>
  criarAssinatura(d: { clienteId: string; valor: string; proximoVencimento: string; forma: FormaAssinatura; descricao: string; referencia: string }): Promise<string>
  /** Valor, forma e/ou data da próxima cobrança a gerar (as já geradas não mudam: quem decide é o sistema) */
  alterarAssinatura(id: string, d: { valor?: string; forma?: FormaAssinatura; proximoVencimento?: string }): Promise<void>
  cancelarAssinatura(id: string): Promise<void>
  /** Cobrança avulsa (ex.: diferença proporcional de upgrade); o cliente escolhe a forma na fatura */
  criarCobranca(d: { clienteId: string; valor: string; vencimento: string; descricao: string; referencia: string }): Promise<CobrancaGateway>
  /** Novo valor de uma cobrança em aberto (inclusive vencida), mantendo vencimento e tipo */
  alterarCobranca(id: string, d: { valor: string; vencimento: string; tipo: string }): Promise<void>
  /** Remove uma cobrança em aberto (abono, mês grátis, cortesia) */
  cancelarCobranca(id: string): Promise<void>
  /** A cobrança como está no gateway agora (null se não existe mais, ex.: removida) */
  obterCobranca(id: string): Promise<CobrancaGateway | null>
  cobrancasDaAssinatura(id: string): Promise<CobrancaGateway[]>
  /** Todas as cobranças do cliente (inclui a 1ª do PIX Automático, que nasce antes da assinatura) */
  cobrancasDoCliente(clienteId: string): Promise<CobrancaGateway[]>
  /** PIX Automático: o 1º pagamento (agora) registra o consentimento; as próximas mensalidades começam em `inicio` */
  criarAutorizacaoPix(d: { clienteId: string; valor: string; inicio: string; descricao: string; contrato: string }): Promise<AutorizacaoPixNova>
  consultarAutorizacaoPix(id: string): Promise<{ situacao: SituacaoAutorizacaoPix; assinaturaId: string | null }>
  cancelarAutorizacaoPix(id: string): Promise<void>
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
