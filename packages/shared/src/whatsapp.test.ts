import { describe, expect, it } from 'vitest'
import { resumoCondicoesPagamento } from './pagamento'
import { inserirAntesDoFim, linhaItemMensagem, listaArtesMensagem, listaItensMensagem, textoPrazoDias, valorEmAberto, valoresArtesAprovacao } from './mensagens'
import {
  ANEXOS_ARTE_MAX,
  OPCOES_ENQUETE_ORCAMENTO,
  FORMATOS_APROVACAO,
  textoParaFormato,
  textoPedeNumeros,
  TEXTOS_PADRAO_MENSAGEM,
  descreverRespostaWhatsapp,
  perguntaEnqueteOrcamento,
  textoSemEnquete,
  arquivoVisivelDaArte,
  escolherAnexosArte,
  vaiComoImagem,
  TEXTOS_PADRAO_WHATSAPP,
  envioWhatsappSchema,
  formatarNumeroWhatsapp,
  linkWaMe,
  normalizarNumeroWhatsapp,
  preencherMensagem,
  whatsappConfigSchema,
} from './whatsapp'

describe('normalizarNumeroWhatsapp', () => {
  it('celular com máscara, com +55 e com 0 do DDD', () => {
    expect(normalizarNumeroWhatsapp('(11) 98888-7777')).toBe('5511988887777')
    expect(normalizarNumeroWhatsapp('+55 11 98888-7777')).toBe('5511988887777')
    expect(normalizarNumeroWhatsapp('5511988887777')).toBe('5511988887777')
    expect(normalizarNumeroWhatsapp('011 98888-7777')).toBe('5511988887777')
  })
  it('fixo (WhatsApp Business) com 8 dígitos', () => {
    expect(normalizarNumeroWhatsapp('(48) 3333-4444')).toBe('554833334444')
    expect(normalizarNumeroWhatsapp('554833334444')).toBe('554833334444')
  })
  it('recusa o que não é telefone brasileiro válido', () => {
    expect(normalizarNumeroWhatsapp(null)).toBeNull()
    expect(normalizarNumeroWhatsapp('')).toBeNull()
    expect(normalizarNumeroWhatsapp('98888-7777')).toBeNull() // sem DDD
    expect(normalizarNumeroWhatsapp('(10) 98888-7777')).toBeNull() // DDD inválido
    expect(normalizarNumeroWhatsapp('(11) 88888-7777')).toBeNull() // 9 dígitos sem o 9 na frente
    expect(normalizarNumeroWhatsapp('(11) 8888-7777')).toBeNull() // celular antigo, sem o 9
    expect(normalizarNumeroWhatsapp('1234567890123456')).toBeNull()
  })
})

const LINK = 'https://app.x/pedido/grafica/tok'

describe('preencherMensagem', () => {
  it('saudação, blocos separados, negrito e link sozinho na última linha', () => {
    const texto = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.pedido_em_entrega, {
      cliente_nome: 'Ana',
      numero_pedido: 'PED-2026-0001',
      local_entrega: 'Entrega em: Rua A, 1',
      link_acompanhamento: LINK,
      empresa_nome: 'Gráfica Boa',
    })
    expect(texto).toBe(`Olá, Ana!\n\nSeu pedido *PED-2026-0001* *saiu para entrega* 🚚\nEntrega em: Rua A, 1\n\n— Gráfica Boa\n\nAcompanhe a entrega aqui:\n${LINK}`)
  })
  it('sem link e sem a gráfica: o rótulo, o link e a assinatura saem (sem sobrar linha em branco)', () => {
    const texto = preencherMensagem(TEXTOS_PADRAO_WHATSAPP.pedido_em_entrega, { cliente_nome: 'Ana', numero_pedido: 'P1' })
    expect(texto).toBe('Olá, Ana!\n\nSeu pedido *P1* *saiu para entrega* 🚚')
  })
  it('linha com o negrito vazio ou terminando em ":" some; sem nome fica "Olá!"', () => {
    const texto = preencherMensagem(TEXTOS_PADRAO_MENSAGEM.pedido_confirmado, { numero_pedido: 'PED-1', link_acompanhamento: LINK })
    expect(texto.startsWith('Olá!\n\n')).toBe(true)
    expect(texto).not.toContain('orçamento')
    expect(texto).not.toContain('Previsão')
    expect(texto).toContain('Seu pedido *PED-1* está confirmado ✅')
    expect(texto.endsWith(`Acompanhe o pedido aqui:\n${LINK}`)).toBe(true)
  })
  it('variável vazia no meio da frase não apaga a linha', () => {
    expect(preencherMensagem('Olá, {{cliente_nome}}! Pedido {{numero_pedido}} ok.', { cliente_nome: 'Ana' })).toBe('Olá, Ana! Pedido  ok.')
  })
  it('orçamento: itens em lista, total, pagamento, "responda APROVADO" e o link de aprovação no fim', () => {
    const itens = listaItensMensagem([
      { descricao: 'Banner em lona', quantidade: '2', largura: '2', altura: '1', total: '130' },
      { descricao: 'Cartão de visita', quantidade: '1000', total: '89.9' },
    ])
    const texto = preencherMensagem(TEXTOS_PADRAO_MENSAGEM.orcamento_enviado, {
      cliente_nome: 'Maria',
      numero_orcamento: 'ORC-2026-0042',
      itens_orcamento: itens,
      valor_total: 'R$ 219,90',
      condicoes_pagamento: resumoCondicoesPagamento({ total: '219.90', sinalPercentual: '50', parcelas: 1, intervaloDias: 30 }),
      prazo_producao: textoPrazoDias(5),
      validade: '20/10/2026',
      link_aprovacao: 'https://app.x/aprovar/g/t',
      empresa_nome: 'Ponto Visual',
    })
    expect(texto).toBe(
      [
        'Olá, Maria!',
        '',
        'Segue o seu orçamento *ORC-2026-0042*:',
        '• 2× Banner em lona 2,0 × 1,0 m — R$ 130,00',
        '• 1.000× Cartão de visita — R$ 89,90',
        '',
        'Total: *R$ 219,90*',
        'Pagamento: Entrada de R$ 109,95 (50%) na aprovação + 1× de R$ 109,95 em 30 dias',
        'Prazo de produção: *5 dias úteis*',
        'Válido até *20/10/2026*',
        '',
        'Toque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.',
        '',
        '— Ponto Visual',
        '',
        'Se preferir, veja e aprove pelo link:',
        'https://app.x/aprovar/g/t',
      ].join('\n'),
    )
    // Com o PDF anexado, o aviso entra antes da assinatura (depois do "responda APROVADO")
    expect(inserirAntesDoFim(texto, 'O orçamento em PDF vai logo abaixo.')).toContain(
      'Toque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.\n\nO orçamento em PDF vai logo abaixo.\n\n— Ponto Visual\n\nSe preferir',
    )
    // Sem a conexão (wa.me, copiar) não vai enquete: a linha volta a ser "Responda APROVADO..."
    const semEnquete = textoSemEnquete(texto)
    expect(semEnquete).toContain('Válido até *20/10/2026*\n\nResponda *APROVADO* aqui mesmo ou peça o ajuste que precisar.\n\n— Ponto Visual')
    expect(semEnquete).not.toContain('opção')
    expect(textoSemEnquete('texto editado sem a linha')).toBe('texto editado sem a linha')
  })
  it('formato da aprovação: a linha padrão vira a do formato (enquete, 1/2 ou texto); linha editada fica como está', () => {
    const base = TEXTOS_PADRAO_MENSAGEM.orcamento_enviado
    const numeros = textoParaFormato(base, 'numeros')
    expect(numeros).toContain('Válido até *{{validade}}*\n\nPara aprovar, responda *1*.\nPara pedir alguma mudança, responda *2*.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:')
    expect(numeros).not.toContain('opção')
    expect(textoPedeNumeros(numeros)).toBe(true)
    // De qualquer formato para qualquer outro (o texto já trocado no diálogo volta)
    expect(textoParaFormato(numeros, 'enquete')).toBe(base)
    expect(textoParaFormato(textoParaFormato(numeros, 'texto'), 'numeros')).toBe(numeros)
    expect(textoParaFormato(numeros, 'numeros')).toBe(numeros)
    expect(textoSemEnquete(numeros)).toContain('Responda *APROVADO* aqui mesmo ou peça o ajuste que precisar.')
    // Template com a linha editada: nada a trocar
    const editado = base.replace('Toque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.', 'Me diga se posso fazer!')
    expect(textoParaFormato(editado, 'numeros')).toBe(editado)
    expect(textoPedeNumeros(editado)).toBe(false)
    expect(textoPedeNumeros('Para fechar, responda 1. Para mudar, responda 2.')).toBe(true)
    expect(textoPedeNumeros(base)).toBe(false)
    expect(FORMATOS_APROVACAO).toEqual(['enquete', 'numeros'])
  })
  it('enquete do orçamento: pergunta com o número e duas opções; a resposta descrita para a equipe', () => {
    expect(perguntaEnqueteOrcamento('ORC-2026-0042')).toBe('Aprovar o orçamento ORC-2026-0042?')
    expect(Object.values(OPCOES_ENQUETE_ORCAMENTO)).toEqual(['✅ Aprovado', '✏️ Quero modificações'])
    expect(descreverRespostaWhatsapp({ tipo: 'aprovado', via: 'enquete', texto: '✅ Aprovado', em: '' })).toBe('Resposta: ✅ Aprovado (enquete)')
    expect(descreverRespostaWhatsapp({ tipo: 'modificacoes', via: 'texto', texto: 'quero mudar a cor', em: '' })).toBe('Resposta: ✏️ Quero modificações — “quero mudar a cor”')
    expect(descreverRespostaWhatsapp({ tipo: 'outra', via: 'texto', texto: 'bom dia', em: '' })).toBe('Resposta: “bom dia”')
  })
  it('todo texto padrão começa pela saudação, assina e tem no máximo um emoji e um link (no fim)', () => {
    for (const t of Object.values(TEXTOS_PADRAO_MENSAGEM)) {
      expect(t.startsWith('Olá, {{cliente_nome}}!\n\n')).toBe(true)
      expect(t).toContain('— {{empresa_nome}}')
      expect((t.match(/\p{Extended_Pictographic}/gu) ?? []).length).toBeLessThanOrEqual(1)
      const links = t.match(/\{\{link_[a-z_]+\}\}/g) ?? []
      expect(links.length).toBeLessThanOrEqual(1)
      if (links.length) expect(t.endsWith(`:\n${links[0]}`)).toBe(true)
    }
  })
})

describe('peças das mensagens', () => {
  it('linha do item com quantidade, medida e valor', () => {
    expect(linhaItemMensagem({ descricao: ' Adesivo ', quantidade: '3', largura: '0.5', altura: '0.25', total: '45' })).toBe('3× Adesivo 0,5 × 0,25 m — R$ 45,00')
    expect(linhaItemMensagem({ descricao: 'Arte', quantidade: 1, largura: null, altura: null, total: 0 })).toBe('1× Arte — R$ 0,00')
  })
  it('lista longa resume o resto', () => {
    const itens = Array.from({ length: 10 }, (_, i) => ({ descricao: `Item ${i + 1}`, quantidade: 1, total: 1 }))
    const lista = listaItensMensagem(itens, 4).split('\n')
    expect(lista).toHaveLength(4)
    expect(lista[3]).toBe('• e mais 7 itens')
  })
  it('prazo e valor em aberto', () => {
    expect([0, 1, 7].map((d) => textoPrazoDias(d))).toEqual(['', '1 dia útil', '7 dias úteis'])
    expect(valorEmAberto('300', '150')).toBe('R$ 150,00')
    expect(valorEmAberto('300', '300')).toBe('')
  })
  it('bloco extra entra antes da assinatura (o link continua no fim)', () => {
    const base = 'Olá!\n\nSegue.\n\n— Gráfica\n\nVeja aqui:\nhttps://x.y/z'
    expect(inserirAntesDoFim(base, 'O PDF vai logo abaixo.')).toBe('Olá!\n\nSegue.\n\nO PDF vai logo abaixo.\n\n— Gráfica\n\nVeja aqui:\nhttps://x.y/z')
    expect(inserirAntesDoFim('Olá!\n\nVeja aqui:\nhttps://x.y/z', 'Extra.')).toBe('Olá!\n\nExtra.\n\nVeja aqui:\nhttps://x.y/z')
    expect(inserirAntesDoFim('Olá!', 'Extra.')).toBe('Olá!\n\nExtra.')
  })
})

describe('envio pela equipe', () => {
  const base = { tipo: 'catalogo', telefone: '(11) 98888-7777', texto: 'Olá!' } as const
  const id = '7c1b0c5e-6d43-4c1e-9b0b-1f6f2d3a4b5c'
  it('número com DDD e texto obrigatórios', () => {
    expect(envioWhatsappSchema.safeParse(base).success).toBe(true)
    expect(envioWhatsappSchema.safeParse({ ...base, telefone: '98888-7777' }).success).toBe(false)
    expect(envioWhatsappSchema.safeParse({ ...base, texto: '  ' }).success).toBe(false)
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'qualquer' }).success).toBe(false)
  })
  it('orçamento, pedido e arte pedem o vínculo', () => {
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'orcamento_enviado' }).success).toBe(false)
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'orcamento_enviado', orcamentoId: id }).success).toBe(true)
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'pedido_pronto' }).success).toBe(false)
    // Arte: a mensagem é do pedido (todas as artes), não de uma arte
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'arte_aprovacao' }).success).toBe(false)
    expect(envioWhatsappSchema.safeParse({ ...base, tipo: 'arte_aprovacao', pedidoId: id }).success).toBe(true)
  })
  it('arquivos das artes: só na mensagem de arte do pedido e até 6', () => {
    const arte = { ...base, tipo: 'arte_aprovacao', pedidoId: id } as const
    expect(envioWhatsappSchema.safeParse({ ...arte, arquivoIds: [id, id] }).success).toBe(true)
    expect(envioWhatsappSchema.safeParse({ ...arte, arquivoIds: Array(7).fill(id) }).success).toBe(false)
    expect(envioWhatsappSchema.safeParse({ ...base, arquivoIds: [id] }).success).toBe(false)
  })
  it('número para mostrar', () => {
    expect(formatarNumeroWhatsapp('5511988887777')).toBe('(11) 98888-7777')
    expect(formatarNumeroWhatsapp('554833334444')).toBe('(48) 3333-4444')
  })
})

describe('configuração do WhatsApp', () => {
  it('horário de início antes do fim', () => {
    expect(whatsappConfigSchema.safeParse({ eventos: [], horarioInicio: '08:00', horarioFim: '20:00', pausado: false }).success).toBe(true)
    expect(whatsappConfigSchema.safeParse({ eventos: [], horarioInicio: '20:00', horarioFim: '08:00', pausado: false }).success).toBe(false)
    expect(whatsappConfigSchema.safeParse({ eventos: ['x'], horarioInicio: '08:00', horarioFim: '20:00', pausado: false }).success).toBe(false)
  })
  it('link wa.me com o texto codificado', () => {
    expect(linkWaMe('5511988887777', 'Olá & até')).toBe('https://wa.me/5511988887777?text=Ol%C3%A1%20%26%20at%C3%A9')
  })
})

describe('arte para aprovação: uma mensagem por pedido', () => {
  const link = 'https://app.grafygo.com.br/pedido/ponto-visual/tok123'
  const artes = [
    { descricao: 'Banner em lona 2,0 × 1,0 m', versao: 2 },
    { descricao: 'Cartão de visita 4x4', versao: 1 },
  ]
  const texto = preencherMensagem(TEXTOS_PADRAO_MENSAGEM.arte_aprovacao, {
    cliente_nome: 'Fernanda',
    numero_pedido: 'PED-2026-0007',
    empresa_nome: 'Ponto Visual',
    ...valoresArtesAprovacao(artes, link),
  })
  it('lista as artes, pede APROVADO por aqui e termina num link só (a seção das artes do pedido)', () => {
    expect(texto).toBe(
      [
        'Olá, Fernanda!',
        '',
        'Segue a arte do pedido *PED-2026-0007* para a sua aprovação 🎨',
        '• Banner em lona 2,0 × 1,0 m — v2',
        '• Cartão de visita 4x4 — v1',
        '',
        'Confira textos, cores e medidas.',
        'Responda *APROVADO* aqui mesmo ou peça o ajuste que precisar.',
        '',
        '— Ponto Visual',
        '',
        'Se preferir, veja e aprove pelo link:',
        `${link}#artes`,
      ].join('\n'),
    )
    expect(texto.match(/https?:/g)).toHaveLength(1)
    expect(texto.split('\n').pop()).toBe(`${link}#artes`)
  })
  it('lista e link', () => {
    expect(listaArtesMensagem([{ descricao: ' Adesivo ', versao: 3 }])).toBe('• Adesivo — v3')
    expect(valoresArtesAprovacao(artes, `${link}#outro`).link_aprovacao).toBe(`${link}#artes`)
    expect(valoresArtesAprovacao(artes, link).descricao_item).toBe('Banner em lona 2,0 × 1,0 m, Cartão de visita 4x4')
  })
  it('template antigo com {{descricao_item}} e {{link_aprovacao}} continua funcionando', () => {
    const antigo = preencherMensagem('Item: {{descricao_item}}\nAprove: {{link_aprovacao}}', valoresArtesAprovacao(artes, link))
    expect(antigo).toBe(`Item: Banner em lona 2,0 × 1,0 m, Cartão de visita 4x4\nAprove: ${link}#artes`)
  })
})

describe('arquivos das artes na mensagem', () => {
  const arq = (id: string, mime: string, mb: number) => ({ id, nome: id, mime, tamanho: mb * 1024 * 1024 })
  it('imagem vai como imagem; PDF como documento', () => {
    expect(vaiComoImagem('image/png')).toBe(true)
    expect(vaiComoImagem('image/jpeg')).toBe(true)
    expect(vaiComoImagem('application/pdf')).toBe(false)
  })
  it('CDR/AI/PSD vão pela miniatura; sem ela, só pelo link', () => {
    const mini = arq('mini', 'image/jpeg', 0.1)
    expect(arquivoVisivelDaArte({ arquivo: arq('a', 'application/pdf', 1), miniatura: mini })?.id).toBe('a')
    expect(arquivoVisivelDaArte({ arquivo: arq('a', 'application/postscript', 1), miniatura: mini })?.id).toBe('mini')
    expect(arquivoVisivelDaArte({ arquivo: arq('a', 'application/x-cdr', 1), miniatura: null })).toBeNull()
  })
  it('até 6 arquivos e 15 MB no total, na ordem; o resto fica pelo link', () => {
    const muitos = Array.from({ length: 8 }, (_, i) => arq(String(i), 'image/png', 1))
    const { anexos, ficaram } = escolherAnexosArte(muitos)
    expect(anexos.map((a) => a.id)).toEqual(['0', '1', '2', '3', '4', '5'])
    expect(ficaram).toHaveLength(2)
    expect(ANEXOS_ARTE_MAX).toBe(6)
    const grandes = escolherAnexosArte([arq('a', 'application/pdf', 10), arq('b', 'application/pdf', 8), arq('c', 'image/png', 2)])
    expect(grandes.anexos.map((a) => a.id)).toEqual(['a', 'c'])
    expect(grandes.ficaram.map((a) => a.id)).toEqual(['b'])
  })
})
