import { Readable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { ANEXO_WHATSAPP_MAX_MB, TEXTOS_PADRAO_WHATSAPP, TIPOS_ENVIO_WHATSAPP, preencherMensagem, proximoPassoPedido, valoresArtesAprovacao, valoresPedidoCompleto } from '@onprint/shared'
import { carregarEnv } from '../src/config/env'
import { ErroWhatsapp, EvolutionWhatsappProvider, LogWhatsappProvider, criarProvedorWhatsapp, instanciaDaEmpresa } from '../src/integrations/whatsapp'
import { combinarAvisos } from '../src/modules/whatsapp/agrupar'
import { enviarAnexos, lerAnexos } from '../src/modules/whatsapp/anexos-arte'
import { PERMISSOES_ENVIO, validarPdf } from '../src/modules/whatsapp/manual'
import {
  EVENTO_DO_STATUS,
  INTERVALO_MAX_MS,
  INTERVALO_MIN_MS,
  RESPIRO_MAX_MS,
  RESPIRO_MS,
  dentroDoHorario,
  esperaDaTentativa,
  intervaloEntreEnvios,
  minutosLocais,
  motivoParaNaoAvisar,
  proximoEnvioPermitido,
  type SituacaoAviso,
} from '../src/modules/whatsapp/regras'

const ok: SituacaoAviso = { eventoLigado: true, simulado: false, conectou: true, clienteRecusa: false, numero: '5511988887777', duplicado: false }

describe('WhatsApp: quem recebe o aviso', () => {
  it('tudo certo: entra na fila', () => {
    expect(motivoParaNaoAvisar(ok)).toBeNull()
  })
  it('evento desligado, sem conexão ou repetido: descarta sem registrar', () => {
    expect(motivoParaNaoAvisar({ ...ok, eventoLigado: false })).toEqual({ motivo: 'Aviso desligado', registrar: false })
    expect(motivoParaNaoAvisar({ ...ok, conectou: false })?.registrar).toBe(false)
    expect(motivoParaNaoAvisar({ ...ok, duplicado: true })?.motivo).toBe('Aviso repetido')
  })
  it('modo de teste (log) não depende da conexão', () => {
    expect(motivoParaNaoAvisar({ ...ok, conectou: false, simulado: true })).toBeNull()
  })
  it('cliente que recusou ou sem número: registra o motivo para a gráfica ver', () => {
    expect(motivoParaNaoAvisar({ ...ok, clienteRecusa: true })).toEqual({ motivo: 'O cliente não quer receber avisos pelo WhatsApp.', registrar: true })
    expect(motivoParaNaoAvisar({ ...ok, numero: null })).toEqual({ motivo: 'Cliente sem WhatsApp válido no cadastro.', registrar: true })
  })
  it('evento desligado vale mais que o cliente sem número (nada é registrado)', () => {
    expect(motivoParaNaoAvisar({ ...ok, eventoLigado: false, numero: null })?.registrar).toBe(false)
  })
  it('só pronto, em entrega e entregue avisam pelo status', () => {
    expect(EVENTO_DO_STATUS.pronto).toBe('pedido_pronto')
    expect(EVENTO_DO_STATUS.em_entrega).toBe('pedido_em_entrega')
    expect(EVENTO_DO_STATUS.entregue).toBe('pedido_entregue')
    expect(EVENTO_DO_STATUS.em_producao).toBeUndefined()
    expect(EVENTO_DO_STATUS.cancelado).toBeUndefined()
  })
})

describe('WhatsApp: horário de envio (Brasília, UTC-3)', () => {
  // 10:30 em Brasília = 13:30 UTC
  const manha = new Date('2026-10-12T13:30:00Z')
  it('hora local no fuso de São Paulo', () => {
    expect(minutosLocais(manha)).toBe(10 * 60 + 30)
    expect(minutosLocais(new Date('2026-10-12T02:15:00Z'))).toBe(23 * 60 + 15)
  })
  it('dentro e fora da janela (fim exclusivo)', () => {
    expect(dentroDoHorario(manha, '08:00', '20:00')).toBe(true)
    expect(dentroDoHorario(new Date('2026-10-12T23:00:00Z'), '08:00', '20:00')).toBe(false) // 20:00
    expect(dentroDoHorario(new Date('2026-10-12T10:59:00Z'), '08:00', '20:00')).toBe(false) // 07:59
  })
  it('dentro do horário: envia agora', () => {
    expect(proximoEnvioPermitido(manha, '08:00', '20:00')).toBe(manha)
  })
  it('de madrugada: espera a abertura do mesmo dia', () => {
    expect(proximoEnvioPermitido(new Date('2026-10-12T09:00:00Z'), '08:00', '20:00').toISOString()).toBe('2026-10-12T11:00:00.000Z') // 06:00 → 08:00
  })
  it('depois do fim: abertura do dia seguinte', () => {
    expect(proximoEnvioPermitido(new Date('2026-10-12T23:30:00Z'), '08:00', '20:00').toISOString()).toBe('2026-10-13T11:00:00.000Z') // 20:30 → 08:00
  })
  it('intervalo sorteado entre 20 e 40 s e espera crescente entre tentativas', () => {
    expect(intervaloEntreEnvios(0)).toBe(INTERVALO_MIN_MS)
    expect(intervaloEntreEnvios(0.999999)).toBeLessThanOrEqual(INTERVALO_MAX_MS)
    expect(intervaloEntreEnvios(0.5)).toBe(30_000)
    expect([1, 2, 3, 9].map(esperaDaTentativa)).toEqual([60_000, 300_000, 900_000, 900_000])
  })
})

const ACOMPANHAMENTO = 'https://app.grafygo.com.br/pedido/ponto-visual/tok123'
const ARTE = `${ACOMPANHAMENTO}#artes`
const valores = {
  cliente_nome: 'Fernanda',
  numero_orcamento: 'ORC-2026-0042',
  numero_pedido: 'PED-2026-0007',
  ...valoresPedidoCompleto(
    {
      total: '130',
      valorPago: '65',
      tipoEntrega: 'retirada',
      enderecoEntrega: null,
      itens: [{ descricao: 'Banner em lona', quantidade: '1', largura: '2', altura: '1', total: '130' }],
      parcelas: [{ valor: '65', valorPago: '0', vencimento: '2026-10-20', status: 'aberto' }],
    },
    { endereco: 'Rua das Flores, 123 - Centro', horario: 'Seg a sex, 8h às 18h', chavePix: 'pix@pontovisual.com.br' },
    '2026-10-14',
    'pedido_confirmado',
  ),
  ...valoresArtesAprovacao([{ descricao: 'Banner em lona 2,0 × 1,0 m', versao: 1 }], ACOMPANHAMENTO),
  valor_total: 'R$ 130,00',
  data_entrega: '20/10/2026',
  link_acompanhamento: ACOMPANHAMENTO,
  empresa_nome: 'Ponto Visual',
}
const confirmado = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.pedido_confirmado, valores)
const arte = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.arte_aprovacao, valores)

describe('WhatsApp: texto dos avisos', () => {
  it('pedido confirmado traz tudo no corpo (itens, total, pagamento, parcela, previsão, retirada), sem falar da arte', () => {
    expect(confirmado).toBe(
      [
        'Olá, Fernanda!',
        '',
        'Seu pedido *PED-2026-0007* está confirmado ✅',
        '• 1× Banner em lona 2,0 × 1,0 m — R$ 130,00',
        '',
        'Total: *R$ 130,00*',
        'Pago: *R$ 65,00* · Falta: *R$ 65,00*',
        'Próxima parcela: *R$ 65,00* em *20/10*',
        'Previsão de entrega: *20/10/2026*',
        'Retirada: Rua das Flores, 123 - Centro · Seg a sex, 8h às 18h',
        '',
        'Avisamos por aqui quando estiver pronto.',
        '',
        '— Ponto Visual',
        '',
        'Acompanhe o pedido aqui:',
        ACOMPANHAMENTO,
      ].join('\n'),
    )
    expect(confirmado).not.toMatch(/arte/i)
  })
  it('template antigo editado com {{proximo_passo}} continua preenchido', () => {
    expect(preencherMensagem('Olá!\n\n{{proximo_passo}}', { proximo_passo: proximoPassoPedido(false) })).toBe('Olá!\n\nJá vamos começar a produção.')
  })
  it('todo evento tem texto padrão com a saudação e a assinatura', () => {
    for (const t of Object.values(TEXTOS_PADRAO_WHATSAPP)) {
      expect(t.startsWith('Olá, {{cliente_nome}}!\n\n')).toBe(true)
      expect(t).toContain('— {{empresa_nome}}')
    }
  })
  it('respiro curto antes de sair (e com teto)', () => {
    expect(RESPIRO_MS).toBe(2 * 60_000)
    expect(RESPIRO_MAX_MS).toBeGreaterThan(RESPIRO_MS)
  })
})

describe('WhatsApp: avisos do mesmo pedido numa mensagem só', () => {
  it('confirmação + arte: o bloco da confirmação, depois o da arte, o fechamento antes da assinatura e só o link da arte, no fim', () => {
    const texto = combinarAvisos([
      { texto: confirmado, linkDispensavel: ACOMPANHAMENTO },
      { texto: arte, linkDispensavel: ACOMPANHAMENTO },
    ])
    expect(texto).toBe(
      [
        'Olá, Fernanda!',
        '',
        'Seu pedido *PED-2026-0007* está confirmado ✅',
        '• 1× Banner em lona 2,0 × 1,0 m — R$ 130,00',
        '',
        'Total: *R$ 130,00*',
        'Pago: *R$ 65,00* · Falta: *R$ 65,00*',
        'Próxima parcela: *R$ 65,00* em *20/10*',
        'Previsão de entrega: *20/10/2026*',
        'Retirada: Rua das Flores, 123 - Centro · Seg a sex, 8h às 18h',
        '',
        'Segue a arte do pedido *PED-2026-0007* para a sua aprovação',
        '• Banner em lona 2,0 × 1,0 m — v1',
        '',
        'Confira textos, cores e medidas.',
        'Responda *APROVADO* aqui mesmo ou peça o ajuste que precisar.',
        '',
        'Avisamos por aqui quando estiver pronto.',
        '',
        '— Ponto Visual',
        '',
        'Se preferir, veja e aprove pelo link:',
        ARTE,
      ].join('\n'),
    )
    expect(texto.match(/Olá/g)).toHaveLength(1)
    expect(texto.match(/https:/g)).toHaveLength(1)
  })
  it('pagamento + pronto: o "Obrigado!" que dividia o bloco com a assinatura desce para o fim, assinatura uma vez só', () => {
    const pago = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.pagamento_recebido, { ...valores, valor_pago: 'R$ 65,00' })
    const pronto = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.pedido_pronto, valores)
    const texto = combinarAvisos([
      { texto: pago, linkDispensavel: ACOMPANHAMENTO },
      { texto: pronto, linkDispensavel: ACOMPANHAMENTO },
    ])
    expect(texto.match(/— Ponto Visual/g)).toHaveLength(1)
    expect(texto).toContain('Obrigado!\n\n— Ponto Visual\n\nDetalhes do pedido:\n' + ACOMPANHAMENTO)
    expect(texto.endsWith(ACOMPANHAMENTO)).toBe(true)
  })
  it('confirmação + pagamento: o pagamento mais novo vale (sem contradição) e o link de acompanhamento desce para o fim', () => {
    // O pagamento chegou depois da confirmação: os dados dele são os atuais
    const pago = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.pagamento_recebido, {
      ...valores,
      valor_pago: 'R$ 65,00',
      resumo_pagamento: 'Pagamento: *quitado* ✅',
      proximo_vencimento: '',
    })
    const texto = combinarAvisos([
      { texto: confirmado, linkDispensavel: ACOMPANHAMENTO },
      { texto: pago, linkDispensavel: ACOMPANHAMENTO },
    ])
    expect(texto).toBe(
      [
        'Olá, Fernanda!',
        '',
        'Seu pedido *PED-2026-0007* está confirmado ✅',
        '• 1× Banner em lona 2,0 × 1,0 m — R$ 130,00',
        '',
        'Total: *R$ 130,00*',
        'Previsão de entrega: *20/10/2026*',
        'Retirada: Rua das Flores, 123 - Centro · Seg a sex, 8h às 18h',
        '',
        'Recebemos o seu pagamento de *R$ 65,00* do pedido *PED-2026-0007*',
        'Pagamento: *quitado*',
        '',
        'Avisamos por aqui quando estiver pronto.',
        '',
        'Obrigado!',
        '— Ponto Visual',
        '',
        'Acompanhe o pedido aqui:',
        ACOMPANHAMENTO,
      ].join('\n'),
    )
  })
  it('dados repetidos só saem quando o aviso seguinte os traz de novo (a parcela conta como pagamento; o Pix fica enquanto falta pagar)', () => {
    const texto = combinarAvisos([
      { texto: 'Olá!\n\nA\nPróxima parcela: *R$ 10,00* em *20/10*\nPix para pagar: *x@y*\nTotal: *R$ 20,00*\nRetirada: Rua A\n\n— G' },
      { texto: 'Olá!\n\nB\nPago: *R$ 10,00* · Falta: *R$ 10,00*\n\n— G' },
    ])
    expect(texto).toBe('Olá!\n\nA\nPix para pagar: *x@y*\nTotal: *R$ 20,00*\nRetirada: Rua A\n\nB\nPago: *R$ 10,00* · Falta: *R$ 10,00*\n\n— G')
    expect(combinarAvisos([{ texto: 'Olá!\n\nA\nA pagar: *R$ 20,00*\nPix para pagar: *x@y*\n\n— G' }, { texto: 'Olá!\n\nB\nPagamento: *quitado*\n\n— G' }])).toBe(
      'Olá!\n\nA\n\nB\nPagamento: *quitado*\n\n— G',
    )
  })
  it('arte: duas artes do pedido numa mensagem só, com um link só (o das artes do pedido)', () => {
    const duas = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.arte_aprovacao, {
      ...valores,
      ...valoresArtesAprovacao(
        [
          { descricao: 'Banner em lona 2,0 × 1,0 m', versao: 1 },
          { descricao: 'Adesivo', versao: 2 },
        ],
        ACOMPANHAMENTO,
      ),
    })
    expect(duas).toContain('• Banner em lona 2,0 × 1,0 m — v1\n• Adesivo — v2')
    expect(duas.match(/https:/g)).toHaveLength(1)
    expect(duas.endsWith(ARTE)).toBe(true)
  })
  it('um aviso só sai como está', () => {
    expect(combinarAvisos([{ texto: `  ${arte}\n` }])).toBe(arte)
    expect(combinarAvisos([])).toBe('')
  })
})

describe('WhatsApp: envio da equipe', () => {
  const pdf = Buffer.from('%PDF-1.7\n...')
  it('PDF conferido pelo conteúdo, com nome seguro terminando em .pdf', () => {
    expect(validarPdf(pdf, 'ORC-2026-0042 - Maria/Silva.PDF')).toMatchObject({ nomeArquivo: 'ORC-2026-0042 - Maria Silva.pdf', mime: 'application/pdf' })
    expect(validarPdf(pdf, '').nomeArquivo).toBe('documento.pdf')
    expect(() => validarPdf(Buffer.from('<html>'), 'x.pdf')).toThrow(/PDF/)
    expect(() => validarPdf(Buffer.alloc(0), 'x.pdf')).toThrow(/vazio/)
    expect(() => validarPdf(Buffer.concat([pdf, Buffer.alloc(ANEXO_WHATSAPP_MAX_MB * 1024 * 1024)]), 'x.pdf')).toThrow(/MB/)
  })
  it('cada tipo de envio tem quem pode mandar', () => {
    for (const tipo of TIPOS_ENVIO_WHATSAPP) expect(PERMISSOES_ENVIO[tipo].length).toBeGreaterThan(0)
    expect(PERMISSOES_ENVIO.arte_aprovacao).toContainEqual(['artes', 'visualizar'])
  })
})

function respostaJson(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

describe('WhatsApp: Evolution API', () => {
  const inst = instanciaDaEmpresa('e1')

  it('nome da instância pela empresa', () => {
    expect(inst).toBe('grafygo-e1')
  })

  it('envia texto: POST /message/sendText/{instância} com apikey, número e texto', async () => {
    const fetcher = vi.fn(async () => respostaJson(201, { key: { id: 'ABC123', remoteJid: '5511988887777@s.whatsapp.net', fromMe: true }, status: 'PENDING' }))
    const p = new EvolutionWhatsappProvider('http://evolution:8080/', 'chave', fetcher)
    expect(await p.enviarTexto(inst, '5511988887777', 'Olá!')).toEqual({ id: 'ABC123' })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://evolution:8080/message/sendText/grafygo-e1')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).apikey).toBe('chave')
    expect(JSON.parse(init.body as string)).toEqual({ number: '5511988887777', text: 'Olá!', linkPreview: true })
  })

  it('envia PDF: POST /message/sendMedia/{instância} como documento em base64, com o nome do arquivo', async () => {
    const fetcher = vi.fn(async () => respostaJson(201, { key: { id: 'DOC1' }, status: 'PENDING' }))
    const p = new EvolutionWhatsappProvider('http://evolution:8080', 'chave', fetcher)
    const conteudo = Buffer.from('%PDF-1.7 orçamento')
    expect(await p.enviarDocumento(inst, '5511988887777', { conteudo, nomeArquivo: 'ORC-2026-0042.pdf', mime: 'application/pdf' })).toEqual({ id: 'DOC1' })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://evolution:8080/message/sendMedia/grafygo-e1')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).apikey).toBe('chave')
    const corpo = JSON.parse(init.body as string)
    expect(corpo).toEqual({ number: '5511988887777', mediatype: 'document', mimetype: 'application/pdf', media: conteudo.toString('base64'), fileName: 'ORC-2026-0042.pdf' })
    // Sem o prefixo "data:" (a Evolution quer o base64 puro)
    expect(Buffer.from(corpo.media, 'base64').toString()).toBe('%PDF-1.7 orçamento')
  })

  it('artes do pedido: depois do texto, imagem vai como imagem (com a legenda do item) e PDF como documento', async () => {
    const fetcher = vi.fn(async () => respostaJson(201, { key: { id: 'M' } }))
    const provedor = new EvolutionWhatsappProvider('http://evo', 'k', fetcher)
    const arquivos: Record<string, { caminho: string; conteudo: string }> = {
      png: { caminho: 'e1/arte/banner.png', conteudo: 'PNG-BYTES' },
      pdf: { caminho: 'e1/arte/cartao.pdf', conteudo: '%PDF-1.7 cartão' },
    }
    const app = {
      prisma: { arquivo: { findUnique: async ({ where }: { where: { id: string } }) => (arquivos[where.id] ? { caminho: arquivos[where.id]!.caminho } : null) } },
      storage: { abrir: (caminho: string) => Readable.from([Buffer.from(Object.values(arquivos).find((a) => a.caminho === caminho)!.conteudo)]) },
      log: { warn: vi.fn() },
    } as unknown as FastifyInstance
    const anexos = [
      { arquivoId: 'png', nome: 'banner.png', mime: 'image/png', tamanho: 9, legenda: 'Banner em lona — v2' },
      { arquivoId: 'pdf', nome: 'cartao.pdf', mime: 'application/pdf', tamanho: 15, legenda: 'Cartão de visita — v1' },
    ]
    expect(await enviarAnexos(app, provedor, inst, '5511988887777', anexos)).toBeNull()
    const corpos = fetcher.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string))
    expect(fetcher.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['http://evo/message/sendMedia/grafygo-e1', 'http://evo/message/sendMedia/grafygo-e1'])
    expect(corpos[0]).toEqual({ number: '5511988887777', mediatype: 'image', mimetype: 'image/png', media: Buffer.from('PNG-BYTES').toString('base64'), fileName: 'banner.png', caption: 'Banner em lona — v2' })
    expect(corpos[1]).toMatchObject({ mediatype: 'document', mimetype: 'application/pdf', fileName: 'cartao.pdf', caption: 'Cartão de visita — v1' })
    expect(Buffer.from(corpos[1].media, 'base64').toString()).toBe('%PDF-1.7 cartão')
  })

  it('arquivo de arte que falha não derruba o envio: volta o aviso com o nome', async () => {
    let n = 0
    const provedor = new EvolutionWhatsappProvider('http://evo', 'k', async () => (n++ === 0 ? respostaJson(500, { response: { message: 'boom' } }) : respostaJson(201, { key: { id: 'M' } })))
    const app = {
      prisma: { arquivo: { findUnique: async () => ({ caminho: 'x' }) } },
      storage: { abrir: () => Readable.from([Buffer.from('x')]) },
      log: { warn: vi.fn() },
    } as unknown as FastifyInstance
    const anexos = ['a.png', 'b.pdf'].map((nome) => ({ arquivoId: nome, nome, mime: nome.endsWith('png') ? 'image/png' : 'application/pdf', tamanho: 1, legenda: nome }))
    expect(await enviarAnexos(app, provedor, inst, '5511988887777', anexos)).toBe('A mensagem foi, mas este arquivo não: a.png.')
  })

  it('lista de arquivos gravada na mensagem: ignora o que não tem o formato', () => {
    expect(lerAnexos(null)).toEqual([])
    expect(lerAnexos([{ arquivoId: 'a', nome: 'a.png', mime: 'image/png', tamanho: 1, legenda: 'A' }, { x: 1 }, 'lixo'])).toHaveLength(1)
  })

  it('PDF com legenda; instância fechada no envio do PDF vira desconectado', async () => {
    const fetcher = vi.fn(async () => respostaJson(201, { key: { id: 'D2' } }))
    await new EvolutionWhatsappProvider('http://evo', 'k', fetcher).enviarDocumento(inst, '5511988887777', { conteudo: Buffer.from('%PDF-'), nomeArquivo: 'a.pdf', mime: 'application/pdf', legenda: 'Recibo' })
    expect(JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).caption).toBe('Recibo')
    const fechada = new EvolutionWhatsappProvider('http://evo', 'k', async () => respostaJson(404, { status: 404, response: { message: ['instance does not exist'] } }))
    await expect(fechada.enviarDocumento(inst, '5511988887777', { conteudo: Buffer.from('%PDF-'), nomeArquivo: 'a.pdf', mime: 'application/pdf' })).rejects.toMatchObject({ tipo: 'desconectado' })
  })

  it('número sem WhatsApp vira numero_invalido; instância fechada vira desconectado; 500 é temporário', async () => {
    const semZap = new EvolutionWhatsappProvider('http://evo', 'k', async () =>
      respostaJson(400, { status: 400, error: 'Bad Request', response: { message: [{ jid: '5511988887777@s.whatsapp.net', exists: false, number: '5511988887777' }] } }),
    )
    await expect(semZap.enviarTexto(inst, '5511988887777', 'x')).rejects.toMatchObject({ tipo: 'numero_invalido' })
    const fechada = new EvolutionWhatsappProvider('http://evo', 'k', async () => respostaJson(404, { status: 404, error: 'Not Found', response: { message: ['The "grafygo-e1" instance does not exist'] } }))
    await expect(fechada.enviarTexto(inst, '5511988887777', 'x')).rejects.toMatchObject({ tipo: 'desconectado' })
    const fora = new EvolutionWhatsappProvider('http://evo', 'k', async () => respostaJson(500, { status: 500, error: 'Internal', response: { message: 'boom' } }))
    await expect(fora.enviarTexto(inst, '5511988887777', 'x')).rejects.toMatchObject({ tipo: 'temporario' })
    const semRede = new EvolutionWhatsappProvider('http://evo', 'k', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(semRede.enviarTexto(inst, '5511988887777', 'x')).rejects.toBeInstanceOf(ErroWhatsapp)
  })

  it('conectar: instância nova é criada com o QR (Baileys)', async () => {
    const chamadas: { url: string; metodo?: string; corpo?: unknown }[] = []
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), metodo: init?.method, corpo: init?.body ? JSON.parse(init.body as string) : undefined })
      if (String(url).includes('/connectionState/')) return respostaJson(404, { status: 404, error: 'Not Found', response: { message: ['não existe'] } })
      return respostaJson(201, { instance: { instanceName: inst, status: 'connecting' }, hash: 'tok', qrcode: { code: '2@x', base64: 'data:image/png;base64,QR', count: 1 } })
    })
    const p = new EvolutionWhatsappProvider('http://evo', 'k', fetcher)
    expect(await p.conectar(inst)).toEqual({ estado: 'conectando', qrBase64: 'data:image/png;base64,QR' })
    expect(chamadas[1]).toMatchObject({ url: 'http://evo/instance/create', metodo: 'POST', corpo: { instanceName: inst, integration: 'WHATSAPP-BAILEYS', qrcode: true } })
  })

  it('conectar: instância existente desconectada pede o QR em /instance/connect', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/connectionState/') ? respostaJson(200, { instance: { instanceName: inst, state: 'close' } }) : respostaJson(200, { pairingCode: null, code: '2@y', base64: 'data:image/png;base64,QR2', count: 2 }),
    )
    const p = new EvolutionWhatsappProvider('http://evo', 'k', fetcher)
    expect(await p.conectar(inst)).toEqual({ estado: 'conectando', qrBase64: 'data:image/png;base64,QR2' })
    expect(String(fetcher.mock.calls[1]![0])).toBe('http://evo/instance/connect/grafygo-e1')
  })

  it('estado conectado traz o número do ownerJid', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/connectionState/')
        ? respostaJson(200, { instance: { instanceName: inst, state: 'open' } })
        : respostaJson(200, [{ name: inst, connectionStatus: 'open', ownerJid: '5548999990000@s.whatsapp.net', profileName: 'Ponto Visual' }]),
    )
    const p = new EvolutionWhatsappProvider('http://evo', 'k', fetcher)
    expect(await p.estado(inst)).toEqual({ estado: 'conectado', numero: '5548999990000', nomePerfil: 'Ponto Visual' })
    expect(String(fetcher.mock.calls[1]![0])).toBe('http://evo/instance/fetchInstances?instanceName=grafygo-e1')
  })

  it('desconectar apaga a instância (404 = já não existia)', async () => {
    const fetcher = vi.fn(async () => respostaJson(404, { status: 404 }))
    await new EvolutionWhatsappProvider('http://evo', 'k', fetcher).desconectar(inst)
    expect(fetcher.mock.calls[0]).toMatchObject(['http://evo/instance/delete/grafygo-e1', { method: 'DELETE' }])
  })
})

describe('WhatsApp: provedor e configuração', () => {
  const base = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://u:s@db:5432/x', JWT_ACCESS_SECRET: 'segredo-1', JWT_REFRESH_SECRET: 'segredo-2' }

  it('log por padrão: registra sem rede e conta como conectado', async () => {
    const p = criarProvedorWhatsapp(carregarEnv(base))
    expect(p).toBeInstanceOf(LogWhatsappProvider)
    expect(p.simulado).toBe(true)
    expect((await p.estado('x')).estado).toBe('conectado')
    expect((await p.enviarTexto('x', '5511988887777', 'oi')).id).toMatch(/^log-/)
    expect((p as LogWhatsappProvider).enviadas).toEqual([{ instancia: 'x', numero: '5511988887777', texto: 'oi' }])
    // PDF: só registra nome, tipo e tamanho
    expect((await p.enviarDocumento('x', '5511988887777', { conteudo: Buffer.from('%PDF-1'), nomeArquivo: 'a.pdf', mime: 'application/pdf' })).id).toMatch(/^log-/)
    expect((p as LogWhatsappProvider).documentos).toEqual([{ instancia: 'x', numero: '5511988887777', nomeArquivo: 'a.pdf', mime: 'application/pdf', bytes: 6 }])
  })

  it('evolution exige URL e chave', () => {
    expect(() => carregarEnv({ ...base, WHATSAPP_PROVEDOR: 'evolution' })).toThrow(/EVOLUTION_URL/)
    const p = criarProvedorWhatsapp(carregarEnv({ ...base, WHATSAPP_PROVEDOR: 'evolution', EVOLUTION_URL: 'http://evolution:8080', EVOLUTION_API_KEY: 'k' }))
    expect(p).toBeInstanceOf(EvolutionWhatsappProvider)
  })
})
