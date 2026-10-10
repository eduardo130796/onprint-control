import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyBaseLogger } from 'fastify'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { carregarEnv } from '../src/config/env'
import { LogEmailProvider, PastaEmailProvider, SmtpEmailProvider, criarProvedorEmail } from '../src/integrations/email'
import { emailConviteUsuario, emailRedefinirSenha, emailSenhaAlterada, escaparHtml } from '../src/integrations/email/modelos'
import { hashTokenSenha } from '../src/plataforma/tokens-senha'

const base = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://u:s@db:5432/x', JWT_ACCESS_SECRET: 'segredo-1', JWT_REFRESH_SECRET: 'segredo-2' }
const log = { info: vi.fn() } as unknown as FastifyBaseLogger

describe('modelos de e-mail', () => {
  const link = 'https://erp.exemplo.com.br/redefinir-senha?token=abc123'

  it('redefinição: link no texto e no HTML, validade e primeiro nome', () => {
    const m = emailRedefinirSenha({ nome: 'Maria Souza', empresa: 'Gráfica Boa', link, validadeHoras: 1 })
    expect(m.assunto).toContain('Redefinição de senha')
    expect(m.texto).toContain(link)
    expect(m.texto).toContain('Olá, Maria!')
    expect(m.texto).toContain('1 hora')
    expect(m.html).toContain(`href="${link}"`)
    expect(m.html).toContain('Gráfica Boa')
  })

  it('convite: login do usuário e validade de 72 horas', () => {
    const m = emailConviteUsuario({ nome: 'João', empresa: 'Gráfica Boa', email: 'joao@x.com', link, validadeHoras: 72 })
    expect(m.assunto).toBe('Seu acesso a Gráfica Boa')
    expect(m.texto).toContain('joao@x.com')
    expect(m.html).toContain('72 horas')
  })

  it('escapa nome e empresa no HTML (sem injeção de tags)', () => {
    const m = emailSenhaAlterada({ nome: '<script>alert(1)</script>', empresa: 'A & B "Ltda"', quando: '07/10/2026 10:00' })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
    expect(m.html).toContain('A &amp; B &quot;Ltda&quot;')
    expect(escaparHtml(`'`)).toBe('&#39;')
  })
})

describe('link de senha', () => {
  it('só o hash vai para o banco; muda com o segredo', () => {
    expect(hashTokenSenha('tok', 's1')).toBe(hashTokenSenha('tok', 's1'))
    expect(hashTokenSenha('tok', 's1')).not.toBe(hashTokenSenha('tok', 's2'))
    expect(hashTokenSenha('tok', 's1')).not.toContain('tok')
  })
})

describe('provedor de e-mail', () => {
  const pastas: string[] = []
  afterAll(() => Promise.all(pastas.map((p) => rm(p, { recursive: true, force: true }))))

  it('sem SMTP: só registra no log', () => {
    expect(criarProvedorEmail(carregarEnv(base), log)).toBeInstanceOf(LogEmailProvider)
  })

  it('em produção o log não leva o texto (links de senha)', async () => {
    const info = vi.fn()
    await new LogEmailProvider({ info } as unknown as FastifyBaseLogger, false).enviar({ para: 'a@b.com', assunto: 'Nova senha', texto: 'https://x/redefinir-senha?token=segredo' })
    expect(JSON.stringify(info.mock.calls)).not.toContain('segredo')
    expect(info.mock.calls[0]?.[0]).toEqual({ email: { para: 'a@b.com', assunto: 'Nova senha' } })
  })

  it('com SMTP_HOST: usa SMTP', () => {
    expect(criarProvedorEmail(carregarEnv({ ...base, SMTP_HOST: 'smtp.exemplo.com', SMTP_PORTA: '465', SMTP_SEGURO: 'true' }), log)).toBeInstanceOf(SmtpEmailProvider)
  })

  it('EMAIL_PASTA grava uma cópia em JSON e repassa ao provedor', async () => {
    const pasta = await mkdtemp(join(tmpdir(), 'emails-'))
    pastas.push(pasta)
    const provedor = criarProvedorEmail(carregarEnv({ ...base, EMAIL_PASTA: pasta }), log)
    expect(provedor).toBeInstanceOf(PastaEmailProvider)
    await provedor.enviar({ para: 'a@b.com', assunto: 'Oi', texto: 'texto' })
    const [arquivo] = await readdir(pasta)
    expect(JSON.parse(await readFile(join(pasta, arquivo as string), 'utf8'))).toMatchObject({ para: 'a@b.com', assunto: 'Oi' })
    expect(log.info).toHaveBeenCalled()
  })
})
