import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { EXTENSOES_PERMITIDAS } from '@onprint/shared'
import { conteudoConfere, lerInicio } from '../src/modules/arquivos/conteudo'
import { cobrancaDoAsaas, notaDoAsaas, urlAsaas } from '../src/integrations/pagamentos/asaas'

const bytes = (...b: number[]) => Buffer.from(b)

describe('Upload: conteúdo confere com a extensão (magic bytes)', () => {
  it('aceita os tipos verdadeiros', () => {
    expect(conteudoConfere('pdf', Buffer.from('%PDF-1.7\n'))).toBe(true)
    expect(conteudoConfere('png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(true)
    expect(conteudoConfere('jpg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true)
    expect(conteudoConfere('JPEG', bytes(0xff, 0xd8, 0xff, 0xdb))).toBe(true)
    expect(conteudoConfere('tif', Buffer.from('II*\0'))).toBe(true)
    expect(conteudoConfere('tiff', Buffer.from('MM\0*'))).toBe(true)
    expect(conteudoConfere('zip', bytes(0x50, 0x4b, 0x03, 0x04))).toBe(true)
    expect(conteudoConfere('psd', Buffer.from('8BPS\0\x01'))).toBe(true)
    expect(conteudoConfere('ai', Buffer.from('%PDF-1.5'))).toBe(true)
    expect(conteudoConfere('ai', Buffer.from('%!PS-Adobe-3.0'))).toBe(true)
    expect(conteudoConfere('eps', Buffer.from('%!PS-Adobe-3.0 EPSF-3.0'))).toBe(true)
    expect(conteudoConfere('eps', bytes(0xc5, 0xd0, 0xd3, 0xc6))).toBe(true)
    expect(conteudoConfere('cdr', Buffer.from('RIFF\0\0\0\0CDR'))).toBe(true)
    expect(conteudoConfere('cdr', bytes(0x50, 0x4b, 0x03, 0x04))).toBe(true)
    expect(conteudoConfere('svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(true)
    expect(conteudoConfere('svg', Buffer.from('﻿  \n<?xml version="1.0"?><svg/>'))).toBe(true)
  })

  it('recusa conteúdo trocado (ex.: HTML renomeado para .png)', () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>')
    for (const ext of ['png', 'jpg', 'pdf', 'tif', 'zip', 'psd', 'ai', 'eps', 'cdr', 'svg']) expect(conteudoConfere(ext, html)).toBe(false)
    expect(conteudoConfere('png', Buffer.from('%PDF-1.4'))).toBe(false)
    expect(conteudoConfere('pdf', Buffer.alloc(0))).toBe(false)
  })

  it('todas as extensões permitidas têm verificação; desconhecida devolve null', () => {
    for (const ext of EXTENSOES_PERMITIDAS) expect(conteudoConfere(ext, Buffer.alloc(0))).not.toBeNull()
    expect(conteudoConfere('xyz', Buffer.from('qualquer'))).toBeNull()
  })

  it('lê só o começo do stream', async () => {
    const inicio = await lerInicio(Readable.from([Buffer.alloc(300, 1), Buffer.alloc(300, 2), Buffer.alloc(300, 3)]), 512)
    expect(inicio.length).toBe(512)
    expect(inicio[511]).toBe(2)
  })
})

describe('Asaas: só links do próprio Asaas', () => {
  it('aceita asaas.com e subdomínios em https', () => {
    expect(urlAsaas('https://sandbox.asaas.com/i/abc')).toBe('https://sandbox.asaas.com/i/abc')
    expect(urlAsaas('https://www.asaas.com/i/abc')).toBe('https://www.asaas.com/i/abc')
    expect(urlAsaas('https://asaas.com/i/abc')).toBe('https://asaas.com/i/abc')
  })

  it('recusa outros domínios, http e lixo', () => {
    for (const u of ['https://asaas.com.golpe.io/i/1', 'https://golpeasaas.com/i/1', 'http://sandbox.asaas.com/i/1', 'javascript:alert(1)', 'nada', '', null, undefined]) {
      expect(urlAsaas(u)).toBeNull()
    }
  })

  it('cobrança e nota com link de fora ficam sem link', () => {
    expect(cobrancaDoAsaas({ id: 'pay_1', value: 10, dueDate: '2026-11-10', status: 'PENDING', invoiceUrl: 'https://golpe.io/pagar' }).linkPagamento).toBeNull()
    expect(notaDoAsaas({ id: 'inv_1', payment: 'pay_1', status: 'AUTHORIZED', pdfUrl: 'https://golpe.io/nf.pdf' })?.linkPdf).toBeNull()
  })
})
