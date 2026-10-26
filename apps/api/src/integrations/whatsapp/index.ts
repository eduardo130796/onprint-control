import { randomBytes, randomUUID } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'
import { vaiComoImagem, type EstadoConexaoWhatsapp } from '@onprint/shared'
import type { Env } from '../../config/env'
import { identidadeDasCredenciais, leitorCredenciaisEvolution, urlDoBancoEvolution, type IdentidadeWhatsapp, type LeitorCredenciais } from './credenciais-evolution'

export type { IdentidadeWhatsapp } from './credenciais-evolution'

/**
 * WhatsApp da própria gráfica (conexão por QR code, como o WhatsApp Web). Uma instância por empresa
 * ("grafygo-{id da empresa}"). Trocável: Log (desenvolvimento/testes) ou Evolution API (self-hosted, Baileys).
 * Mensagens recebidas (o cliente responde o orçamento: voto na enquete ou texto) entram pelo webhook da Evolution
 * (POST /webhook/set/{instancia}, eventos CONNECTION_UPDATE e MESSAGES_UPSERT; ver modules/whatsapp/webhook.ts).
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
  /**
   * Enquete de uma escolha (renderiza no WhatsApp do celular, do computador e no Business). O voto chega cifrado
   * no webhook: `segredo` (messageSecret da enquete, base64) e `jid` (para quem saiu) servem para abri-lo.
   */
  enviarEnquete(instancia: string, numero: string, pergunta: string, opcoes: string[]): Promise<EnqueteEnviada>
  /** Liga o webhook da instância (mensagens recebidas e conexão) no endereço da API */
  configurarWebhook(instancia: string, url: string): Promise<void>
  /**
   * Número e LID da conta conectada (o LID não sai nas rotas da Evolution: vem das credenciais da instância, ver
   * credenciais-evolution.ts). null se não houver; lança se o banco da Evolution não responder.
   */
  identidade(instancia: string): Promise<IdentidadeWhatsapp | null>
  /**
   * Arquivo de uma mensagem recebida (foto, PDF ou XML da nota no canal "Você"), pela mensagem como veio no webhook.
   * null se não houver arquivo; lança ErroWhatsapp se a Evolution não conseguir baixar.
   */
  baixarMidia(instancia: string, mensagem: { key: Record<string, unknown>; message: Record<string, unknown> }): Promise<MidiaBaixada | null>
  /**
   * Reação (emoji) numa mensagem da conversa: a confirmação curta no canal "Você" ("ok" → ✅). `chave`: a mensagem
   * reagida como chegou no webhook (remoteJid e id). Lança ErroWhatsapp se não sair (quem chama manda o texto).
   */
  reagir(instancia: string, chave: { remoteJid: string; fromMe: boolean; id: string }, emoji: string): Promise<{ id: string | null }>
  /** Fecha conexões próprias (banco da Evolution) ao desligar a API */
  fechar?(): Promise<void>
}

export interface MidiaBaixada {
  conteudo: Buffer
  mime: string | null
  nomeArquivo: string | null
}

export interface EnqueteEnviada {
  id: string | null
  /** messageContextInfo.messageSecret da enquete (base64): sem ele o voto não abre */
  segredo: string | null
  /** Jid do cliente usado no envio (a Evolution acerta o 9º dígito): entra no cálculo da chave do voto */
  jid: string | null
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
  readonly enquetes: { instancia: string; numero: string; pergunta: string; opcoes: string[]; id: string; segredo: string }[] = []
  readonly webhooks: { instancia: string; url: string }[] = []

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

  /** Como a Evolution: id e segredo de verdade (um voto simulado cifrado com eles abre igual ao real) */
  async enviarEnquete(instancia: string, numero: string, pergunta: string, opcoes: string[]): Promise<EnqueteEnviada> {
    const registro = { instancia, numero, pergunta, opcoes, id: `log-${randomUUID()}`, segredo: randomBytes(32).toString('base64') }
    this.enquetes.push(registro)
    if (this.enquetes.length > 50) this.enquetes.shift()
    this.log?.info({ whatsapp: { instancia, numero, pergunta, opcoes, id: registro.id } }, 'Enquete do WhatsApp não enviada (WHATSAPP_PROVEDOR=log), registrada no log')
    return { id: registro.id, segredo: registro.segredo, jid: `${numero}@s.whatsapp.net` }
  }

  async configurarWebhook(instancia: string, url: string): Promise<void> {
    this.webhooks.push({ instancia, url })
  }

  /** Testes: a identidade "da conta" (número e LID) que o modo de teste devolve */
  identidadeTeste: IdentidadeWhatsapp | null = null

  async identidade(): Promise<IdentidadeWhatsapp | null> {
    return this.identidadeTeste
  }

  /** Testes: o arquivo que o modo de teste "baixa" (sem ele, a mídia vem só se a mensagem trouxer o base64) */
  midiaTeste: MidiaBaixada | null = null

  readonly reacoes: { instancia: string; numero: string; id: string; emoji: string }[] = []
  /** Testes: a reação falha (o copiloto manda o texto no lugar) */
  reacaoFalha = false

  async reagir(instancia: string, chave: { remoteJid: string; fromMe: boolean; id: string }, emoji: string) {
    if (this.reacaoFalha) throw new ErroWhatsapp('temporario', 'Reação recusada (teste).')
    this.reacoes.push({ instancia, numero: chave.remoteJid.split('@')[0]!, id: chave.id, emoji })
    if (this.reacoes.length > 200) this.reacoes.shift()
    this.log?.info({ whatsapp: { instancia, reacao: emoji, mensagem: chave.id } }, 'Reação do WhatsApp não enviada (WHATSAPP_PROVEDOR=log), registrada no log')
    return { id: `log-${randomUUID()}` }
  }

  async baixarMidia(_instancia: string, mensagem: { key: Record<string, unknown>; message: Record<string, unknown> }): Promise<MidiaBaixada | null> {
    if (this.midiaTeste) return this.midiaTeste
    const base64 = mensagem.message.base64
    return typeof base64 === 'string' && base64 ? { conteudo: Buffer.from(base64, 'base64'), mime: null, nomeArquivo: null } : null
  }
}

type Fetch = typeof globalThis.fetch

/**
 * Bytes como a Evolution manda no JSON (Buffer/Uint8Array do Baileys): base64, { type: "Buffer", data: [...] },
 * objeto indexado { "0": 12, "1": 200, ... } ou lista de números. null se não for nenhum desses.
 */
export function bytesDoWhatsapp(valor: unknown): Buffer | null {
  if (valor == null) return null
  if (typeof valor === 'string') return valor ? Buffer.from(valor, 'base64') : null
  if (Buffer.isBuffer(valor) || valor instanceof Uint8Array) return Buffer.from(valor)
  if (Array.isArray(valor)) return valor.every((n) => Number.isInteger(n) && n >= 0 && n < 256) ? Buffer.from(valor as number[]) : null
  if (typeof valor === 'object') {
    const o = valor as Record<string, unknown>
    if (o.type === 'Buffer' && Array.isArray(o.data)) return bytesDoWhatsapp(o.data)
    const chaves = Object.keys(o)
    if (chaves.length && chaves.every((k) => /^\d+$/.test(k))) return bytesDoWhatsapp(chaves.sort((a, b) => Number(a) - Number(b)).map((k) => o[k]))
  }
  return null
}

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
    /** Lê a coluna creds da instância no banco da Evolution (sem ele, o LID da conta fica desconhecido) */
    private readonly lerCredenciais: LeitorCredenciais | null = null,
  ) {
    this.base = url.replace(/\/+$/, '')
  }

  async identidade(instancia: string): Promise<IdentidadeWhatsapp | null> {
    if (!this.lerCredenciais) return null
    return identidadeDasCredenciais(await this.lerCredenciais(instancia))
  }

  async fechar(): Promise<void> {
    await this.lerCredenciais?.fechar?.().catch(() => undefined)
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

  async enviarEnquete(instancia: string, numero: string, pergunta: string, opcoes: string[]): Promise<EnqueteEnviada> {
    // POST /message/sendPoll/{i} { number, name, selectableCount: 1, values } → 201 { key: { remoteJid, id },
    // message: { messageContextInfo: { messageSecret }, pollCreationMessageV3: { name, options } } }
    // (o segredo vem como Uint8Array serializado: { "0": 12, "1": 200, ... })
    const r = await this.chamar('POST', `/message/sendPoll/${encodeURIComponent(instancia)}`, { number: numero, name: pergunta, selectableCount: 1, values: opcoes })
    const { id } = EvolutionWhatsappProvider.resultadoDoEnvio(r)
    const dados = r.dados as { key?: { remoteJid?: string }; message?: { messageContextInfo?: { messageSecret?: unknown } } } | null
    const segredo = bytesDoWhatsapp(dados?.message?.messageContextInfo?.messageSecret)
    return { id, segredo: segredo?.length ? segredo.toString('base64') : null, jid: dados?.key?.remoteJid ?? null }
  }

  async reagir(instancia: string, chave: { remoteJid: string; fromMe: boolean; id: string }, emoji: string) {
    // POST /message/sendReaction/{i} { key: { remoteJid, fromMe, id }, reaction } → 201 { key: { id }, ... } (SendReactionDto)
    const r = await this.chamar('POST', `/message/sendReaction/${encodeURIComponent(instancia)}`, { key: { remoteJid: chave.remoteJid, fromMe: chave.fromMe, id: chave.id }, reaction: emoji })
    return EvolutionWhatsappProvider.resultadoDoEnvio(r)
  }

  async baixarMidia(instancia: string, mensagem: { key: Record<string, unknown>; message: Record<string, unknown> }): Promise<MidiaBaixada | null> {
    // Com o webhook em base64 a mídia já vem na mensagem
    if (typeof mensagem.message.base64 === 'string' && mensagem.message.base64) return { conteudo: Buffer.from(mensagem.message.base64, 'base64'), mime: null, nomeArquivo: null }
    // POST /chat/getBase64FromMediaMessage/{i} { message: { key, message }, convertToMp4 } → { base64, mimetype, fileName }
    // A mensagem inteira vai junto (a Evolution não guarda as mensagens: DATABASE_SAVE_DATA_NEW_MESSAGE=false)
    const r = await this.chamar('POST', `/chat/getBase64FromMediaMessage/${encodeURIComponent(instancia)}`, { message: { key: mensagem.key, message: mensagem.message }, convertToMp4: false }, 60_000)
    if (r.status >= 400) throw new ErroWhatsapp('temporario', `Não foi possível baixar o arquivo: ${EvolutionWhatsappProvider.mensagemDeErro(r.dados)}`)
    const d = r.dados as { base64?: string; mimetype?: string; fileName?: string } | null
    if (!d?.base64) return null
    return { conteudo: Buffer.from(d.base64.replace(/^data:[^,]*,/, ''), 'base64'), mime: d.mimetype ?? null, nomeArquivo: d.fileName ?? null }
  }

  async configurarWebhook(instancia: string, url: string): Promise<void> {
    // POST /webhook/set/{i} { webhook: { enabled, url, events, byEvents, base64 } } (upsert: pode repetir)
    // Só mensagens recebidas (texto e voto da enquete) e a conexão; sem mídia em base64
    const r = await this.chamar('POST', `/webhook/set/${encodeURIComponent(instancia)}`, {
      webhook: { enabled: true, url, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'], byEvents: false, base64: false },
    })
    if (r.status >= 400) throw new ErroWhatsapp(r.status === 404 ? 'desconectado' : 'temporario', `Não foi possível ligar o webhook: ${EvolutionWhatsappProvider.mensagemDeErro(r.dados)}`)
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

export function criarProvedorWhatsapp(
  config: Pick<Env, 'WHATSAPP_PROVEDOR' | 'EVOLUTION_URL' | 'EVOLUTION_API_KEY' | 'DATABASE_URL' | 'EVOLUTION_DATABASE_URL'>,
  log?: FastifyBaseLogger,
): ProvedorWhatsapp {
  if (config.WHATSAPP_PROVEDOR !== 'evolution') return new LogWhatsappProvider(log)
  const urlBanco = urlDoBancoEvolution(config)
  return new EvolutionWhatsappProvider(config.EVOLUTION_URL, config.EVOLUTION_API_KEY, globalThis.fetch, 15_000, urlBanco ? leitorCredenciaisEvolution(urlBanco) : null)
}
