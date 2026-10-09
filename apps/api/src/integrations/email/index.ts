import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FastifyBaseLogger } from 'fastify'
import nodemailer, { type Transporter } from 'nodemailer'
import type { Env } from '../../config/env'

export interface EmailMensagem {
  para: string
  assunto: string
  /** Versão em texto puro (clientes de e-mail sem HTML e filtros de spam) */
  texto: string
  html?: string
}

export interface EmailProvider {
  enviar(mensagem: EmailMensagem): Promise<void>
}

/**
 * Sem SMTP configurado: registra o e-mail no log (o link de senha aparece em `make logs`).
 * Em produção só o destinatário e o assunto: o texto tem links de senha, que não podem ficar no log.
 */
export class LogEmailProvider implements EmailProvider {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly comTexto = true,
  ) {}

  async enviar({ para, assunto, texto }: EmailMensagem): Promise<void> {
    this.log.info({ email: this.comTexto ? { para, assunto, texto } : { para, assunto } }, 'E-mail não enviado (SMTP não configurado), registrado no log')
  }
}

/** SMTP de qualquer provedor (Gmail/Workspace, Hostinger, Zoho, SES, Brevo…). */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transporte: Transporter

  constructor(
    config: Pick<Env, 'SMTP_HOST' | 'SMTP_PORTA' | 'SMTP_SEGURO' | 'SMTP_USUARIO' | 'SMTP_SENHA'>,
    private readonly remetente: string,
  ) {
    this.transporte = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORTA,
      secure: config.SMTP_SEGURO,
      auth: config.SMTP_USUARIO ? { user: config.SMTP_USUARIO, pass: config.SMTP_SENHA } : undefined,
    })
  }

  async enviar({ para, assunto, texto, html }: EmailMensagem): Promise<void> {
    await this.transporte.sendMail({ from: this.remetente, to: para, subject: assunto, text: texto, html })
  }
}

/** Grava uma cópia de cada e-mail em JSON (desenvolvimento e testes ponta a ponta leem daqui). */
export class PastaEmailProvider implements EmailProvider {
  constructor(
    private readonly pasta: string,
    private readonly proximo: EmailProvider,
  ) {}

  async enviar(mensagem: EmailMensagem): Promise<void> {
    await mkdir(this.pasta, { recursive: true })
    await writeFile(join(this.pasta, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ ...mensagem, data: new Date().toISOString() }, null, 2))
    await this.proximo.enviar(mensagem)
  }
}

export function criarProvedorEmail(config: Env, log: FastifyBaseLogger): EmailProvider {
  const base: EmailProvider = config.SMTP_HOST ? new SmtpEmailProvider(config, config.EMAIL_REMETENTE) : new LogEmailProvider(log, config.NODE_ENV !== 'production')
  return config.EMAIL_PASTA ? new PastaEmailProvider(config.EMAIL_PASTA, base) : base
}
