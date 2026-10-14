import { randomUUID } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'
import { vaiComoImagem, type EstadoConexaoWhatsapp } from '@onprint/shared'
import type { Env } from '../../config/env'

/**
 * WhatsApp da própria gráfica (conexão por QR code, como o WhatsApp Web). Uma instância por empresa
 * ("grafygo-{id da empresa}"). Trocável: Log (desenvolvimento/testes) ou Evolution API (self-hosted, Baileys).
 * Mensagens recebidas (aprovar respondendo no WhatsApp) entram depois por um webhook da Evolution
 * (POST /webhook/set/{instancia}, eventos CONNECTION_UPDATE e MESSAGES_UPSERT).
 */
export interface SituacaoWhatsapp {
  estado: EstadoConexaoWhatsapp
  /** Número conectado (só dígitos, 55DDD…) */
  numero: string | null
  nomePerfil: string | null
}

export interface QrWhatsapp {
  estado: EstadoConexaoWhatsapp
  /** data:image/png;base64,... enquanto espera a leitura */
  qrBase64: string | null
}

/**
 * desconectado: a instância não está conectada (fica na fila até ler o QR de novo);
 * numero_invalido: o número não tem WhatsApp (não adianta tentar de novo);
 * temporario: rede, timeout, erro 5xx (tenta de novo mais tarde).
 */
export type TipoErroWhatsapp = 'desconectado' | 'numero_invalido' | 'temporario'

export class ErroWhatsapp extends Error {
  constructor(
    readonly tipo: TipoErroWhatsapp,
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'ErroWhatsapp'
  }
}

export interface ProvedorWhatsapp {
  readonly nome: 'log' | 'evolution'
  /** Só registra (não depende de conexão: os avisos "saem" na hora) */
  readonly simulado: boolean
  /** Cria a instância se preciso e devolve o QR (ou "conectado" se já estiver) */
  conectar(instancia: string): Promise<QrWhatsapp>
  estado(instancia: string): Promise<SituacaoWhatsapp>
  /** Sai do WhatsApp e apaga a instância (o próximo "Conectar" começa do zero) */
  desconectar(instancia: string): Promise<void>
  enviarTexto(instancia: string, numero: string, texto: string): Promise<{ id: string | null }>
  /** Arquivo com o nome que o cliente vê: imagem (JPEG/PNG/WebP, aparece na conversa) ou documento (PDF do orçamento, recibo, arte) */
  enviarDocumento(instancia: string, numero: string, documento: DocumentoWhatsapp): Promise<{ id: string | null }>
}

export interface DocumentoWhatsapp {
  conteudo: Buffer
  nomeArquivo: string
  mime: string
  /** Legenda abaixo do arquivo (opcional) */
  legenda?: string
}

/** Nome da instância na Evolution: um por empresa, sem guardar nada na plataforma. */
export const instanciaDaEmpresa = (empresaId: string) => `grafygo-${empresaId}`

/** Desenvolvimento e testes: registra no log e guarda a lista do que "enviou" (sem rede). */
export class LogWhatsappProvider implements ProvedorWhatsapp {
  readonly nome = 'log' as const
  readonly simulado = true
  readonly enviadas: { instancia: string; numero: string; texto: string }[] = []
  readonly documentos: { instancia: string; numero: string; nomeArquivo: string; mime: string; bytes: number }[] = []

  constructor(private readonly log?: FastifyBaseLogger) {}

  async conectar(): Promise<QrWhatsapp> {
    return { estado: 'conectado', qrBase64: null }
  }

  async estado(): Promise<SituacaoWhatsapp> {
    return { estado: 'conectado', numero: null, nomePerfil: 'Modo de teste' }
  }

  async desconectar(): Promise<void> {}

  async enviarTexto(instancia: string, numero: string, texto: string) {
    this.enviadas.push({ instancia, numero, texto })
    if (this.enviadas.length > 200) this.enviadas.shift()
    this.log?.info({ whatsapp: { instancia, numero, texto } }, 'WhatsApp não enviado (WHATSAPP_PROVEDOR=log), registrado no log')
    return { id: `log-${randomUUID()}` }
  }

  async enviarDocumento(instancia: string, numero: string, d: DocumentoWhatsapp) {
    const registro = { instancia, numero, nomeArquivo: d.nomeArquivo, mime: d.mime, bytes: d.conteudo.length }
    this.documentos.push(registro)
    if (this.documentos.length > 50) this.documentos.shift()
    this.log?.info({ whatsapp: registro }, 'Documento do WhatsApp não enviado (WHATSAPP_PROVEDOR=log), registrado no log')
    return { id: `log-${randomUUID()}` }
  }
}

type Fetch = typeof globalThis.fetch

const estadoEvolution = (state: unknown): EstadoConexaoWhatsapp => (state === 'open' ? 'conectado' : state === 'connecting' ? 'conectando' : 'desconectado')

/**
 * Evolution API v2 (evoapicloud/evolution-api:v2.3.7). Autenticação pelo cabeçalho `apikey` (chave global).
 * Erros vêm como { status, error, response: { message } }.
 */
export class EvolutionWhatsappProvider implements ProvedorWhatsapp {
  readonly nome = 'evolution' as const
  readonly simulado = false
  private readonly base: string

  constructor(
    url: string,
    private readonly apiKey: string,
    private readonly fetcher: Fetch = globalThis.fetch,
    private readonly timeoutMs = 15_000,
  ) {
    this.base = url.replace(/\/+$/, '')
  }

  private async chamar(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown, timeoutMs = this.timeoutMs): Promise<{ status: number; dados: unknown }> {
    let resposta: Response
    try {
      resposta = await this.fetcher(`${this.base}${caminho}`, {
        method: metodo,
        headers: { apikey: this.apiKey, ...(corpo ? { 'content-type': 'application/json' } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (erro) {
      throw new ErroWhatsapp('temporario', `Evolution API fora do ar: ${(erro as Error).message}`)
    }
    const texto = await resposta.text()
    let dados: unknown = null
    try {
      dados = texto ? JSON.parse(texto) : null
    } catch {
      dados = texto
    }
    return { status: resposta.status, dados }
  }

  private static mensagemDeErro(dados: unknown): string {
    const msg = (dados as { response?: { message?: unknown } } | null)?.response?.message
    const texto = Array.isArray(msg) ? msg.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('; ') : typeof msg === 'string' ? msg : JSON.stringify(dados)
    return (texto ?? '').slice(0, 300)
  }

  async estado(instancia: string): Promise<SituacaoWhatsapp> {
    // GET /instance/connectionState/{i} → { instance: { instanceName, state: "open" | "close" | "connecting" } }; 404 se não existe
    const r = await this.chamar('GET', `/instance/connectionState/${encodeURIComponent(instancia)}`)
    if (r.status === 404) return { estado: 'desconectado', numero: null, nomePerfil: null }
    if (r.status >= 400) throw new ErroWhatsapp('temporario', `Evolution respondeu ${r.status}: ${EvolutionWhatsappProvider.mensagemDeErro(r.dados)}`)
    const estado = estadoEvolution((r.dados as { instance?: { state?: string } })?.instance?.state)
    if (estado !== 'conectado') return { estado, numero: null, nomePerfil: null }
    // GET /instance/fetchInstances?instanceName= → [{ ownerJid: "5511...@s.whatsapp.net", profileName, ... }]
    const info = await this.chamar('GET', `/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`)
    const linha = Array.isArray(info.dados) ? (info.dados[0] as { ownerJid?: string | null; profileName?: string | null } | undefined) : undefined
    const numero = linha?.ownerJid ? linha.ownerJid.split('@')[0]!.split(':')[0]!.replace(/\D/g, '') || null : null
    return { estado, numero, nomePerfil: linha?.profileName ?? null }
  }

  async conectar(instancia: string): Promise<QrWhatsapp> {
    const atual = await this.chamar('GET', `/instance/connectionState/${encodeURIComponent(instancia)}`)
    if (atual.status === 404) {
      // POST /instance/create { instanceName, integration, qrcode: true } → { instance, hash, qrcode: { code, base64, count } }
      const criada = await this.chamar('POST', '/instance/create', {
        instanceName: instancia,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        // Só avisos: não abre conversas nem marca como lidas, ignora grupos e não sincroniza o histórico
        groupsIgnore: true,
        readMessages: false,
        alwaysOnline: false,
        syncFullHistory: false,
      })
      if (criada.status >= 400) throw new ErroWhatsapp('temporario', `Não foi possível criar a conexão: ${EvolutionWhatsappProvider.mensagemDeErro(criada.dados)}`)
      const qr = (criada.dados as { qrcode?: { base64?: string } })?.qrcode?.base64
      if (qr) return { estado: 'conectando', qrBase64: qr }
    } else if (atual.status < 400 && estadoEvolution((atual.dados as { instance?: { state?: string } })?.instance?.state) === 'conectado') {
      return { estado: 'conectado', qrBase64: null }
    }
    // GET /instance/connect/{i} → { pairingCode, code, base64, count } (já conectada: { instance: { state: "open" } })
    const r = await this.chamar('GET', `/instance/connect/${encodeURIComponent(instancia)}`)
    if (r.status >= 400) throw new ErroWhatsapp('temporario', `Não foi possível gerar o QR code: ${EvolutionWhatsappProvider.mensagemDeErro(r.dados)}`)
    const dados = r.dados as { base64?: string; instance?: { state?: string } }
    if (dados?.instance?.state === 'open') return { estado: 'conectado', qrBase64: null }
    return { estado: 'conectando', qrBase64: dados?.base64 ?? null }
  }

  async desconectar(instancia: string): Promise<void> {
    // DELETE /instance/delete/{i} já faz o logout se estiver conectada; 404 = já não existe
    const r = await this.chamar('DELETE', `/instance/delete/${encodeURIComponent(instancia)}`)
    if (r.status >= 400 && r.status !== 404) throw new ErroWhatsapp('temporario', `Não foi possível desconectar: ${EvolutionWhatsappProvider.mensagemDeErro(r.dados)}`)
  }

  async enviarTexto(instancia: string, numero: string, texto: string) {
    // POST /message/sendText/{i} { number: "5511999999999", text } → 201 { key: { remoteJid, fromMe, id }, status, ... }
    // A Evolution acerta o 9º dígito dos celulares brasileiros (confere as duas formas no WhatsApp)
    const r = await this.chamar('POST', `/message/sendText/${encodeURIComponent(instancia)}`, { number: numero, text: texto, linkPreview: true })
    return EvolutionWhatsappProvider.resultadoDoEnvio(r)
  }

  async enviarDocumento(instancia: string, numero: string, d: DocumentoWhatsapp) {
    // POST /message/sendMedia/{i} { number, mediatype: "image" | "document", mimetype, media (base64 sem "data:"), fileName, caption? } → 201 { key: { id } }
    // JPEG/PNG/WebP vão como imagem (aparecem na conversa); PDF e o resto, como documento
    const r = await this.chamar('POST', `/message/sendMedia/${encodeURIComponent(instancia)}`, {
      number: numero,
      mediatype: vaiComoImagem(d.mime) ? 'image' : 'document',
      mimetype: d.mime,
      media: d.conteudo.toString('base64'),
      fileName: d.nomeArquivo,
      ...(d.legenda ? { caption: d.legenda } : {}),
    }, 60_000)
    return EvolutionWhatsappProvider.resultadoDoEnvio(r)
  }

  /** Resposta do envio (texto ou arquivo): id da mensagem ou o erro já classificado */
  private static resultadoDoEnvio(r: { status: number; dados: unknown }): { id: string | null } {
    if (r.status < 400) return { id: (r.dados as { key?: { id?: string } })?.key?.id ?? null }
    const detalhe = EvolutionWhatsappProvider.mensagemDeErro(r.dados)
    // Número sem WhatsApp: 400 { response: { message: [{ exists: false, jid, number }] } }
    const lista = (r.dados as { response?: { message?: unknown } })?.response?.message
    if (r.status === 400 && Array.isArray(lista) && lista.some((m) => (m as { exists?: boolean })?.exists === false)) {
      throw new ErroWhatsapp('numero_invalido', 'Este número não tem WhatsApp.')
    }
    if (r.status === 404 || /not connected|connection closed|não está conectad/i.test(detalhe)) throw new ErroWhatsapp('desconectado', 'WhatsApp desconectado.')
    if (r.status === 400) throw new ErroWhatsapp('numero_invalido', `Envio recusado: ${detalhe}`)
    throw new ErroWhatsapp('temporario', `Evolution respondeu ${r.status}: ${detalhe}`)
  }
}

export function criarProvedorWhatsapp(config: Pick<Env, 'WHATSAPP_PROVEDOR' | 'EVOLUTION_URL' | 'EVOLUTION_API_KEY'>, log?: FastifyBaseLogger): ProvedorWhatsapp {
  return config.WHATSAPP_PROVEDOR === 'evolution' ? new EvolutionWhatsappProvider(config.EVOLUTION_URL, config.EVOLUTION_API_KEY) : new LogWhatsappProvider(log)
}
