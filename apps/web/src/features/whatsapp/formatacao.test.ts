import { describe, expect, it, vi } from 'vitest'
import { textoSemEnquete, type OrcamentoDetalhe, type PedidoDetalhe } from '@onprint/shared'
import { definirEmpresaAtual } from '@/lib/empresaAtual'
import { mensagemDoOrcamento } from '@/features/orcamentos/mensagem'
import { mensagemRecibo } from '@/features/pedidos/mensagens'
import { categoriasEmDestaque } from '@/features/vitrine/useEnviarCatalogo'
import { linkDaPrevia, trechosWhatsapp } from './formatacao'
import { previaDoEvento } from './previa'

describe('formatação do WhatsApp na prévia', () => {
  it('negrito, itálico e riscado encostados no texto', () => {
    expect(trechosWhatsapp('Seu pedido *PED-1* está _pronto_ ~ontem~.')).toEqual([
      { texto: 'Seu pedido ' },
      { texto: 'PED-1', negrito: true },
      { texto: ' está ' },
      { texto: 'pronto', italico: true },
      { texto: ' ' },
      { texto: 'ontem', riscado: true },
      { texto: '.' },
    ])
  })
  it('marcador solto ou com espaço não formata', () => {
    expect(trechosWhatsapp('2 * 3 = 6')).toEqual([{ texto: '2 * 3 = 6' }])
    expect(trechosWhatsapp('* x *')).toEqual([{ texto: '* x *' }])
  })
  it('link vira link (o "_" do endereço não vira itálico) e é o da prévia', () => {
    const t = trechosWhatsapp('https://app.x/aprovar/minha_grafica/tok_1')
    expect(t).toEqual([{ texto: 'https://app.x/aprovar/minha_grafica/tok_1', link: 'https://app.x/aprovar/minha_grafica/tok_1' }])
    expect(linkDaPrevia('Olá!\n\nVeja aqui:\nhttps://x.y/z.')).toBe('https://x.y/z')
    expect(linkDaPrevia('Sem link')).toBeNull()
  })
  it('negrito com itálico dentro', () => {
    expect(trechosWhatsapp('*_oi_*')).toEqual([{ texto: 'oi', italico: true, negrito: true }])
  })
})

describe('mensagens da equipe', () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.grafygo.com.br' } })
  definirEmpresaAtual('ponto-visual')

  const orcamento = {
    id: 'o1',
    numero: 'ORC-2026-0042',
    tokenPublico: 'tok',
    total: '219.90',
    prazoDias: 5,
    validade: '2026-10-20',
    sinalPercentual: '50.00',
    parcelas: 2,
    intervaloDias: 30,
    cliente: { nome: 'MARIA DA SILVA', fantasia: null, cpfCnpj: null },
    itens: [
      { descricao: 'Banner em lona', quantidade: '2', largura: '2', altura: '1', total: '130' },
      { descricao: 'Cartão de visita', quantidade: '1000', largura: null, altura: null, total: '89.9' },
    ],
  } as unknown as OrcamentoDetalhe

  it('orçamento: itens, total, pagamento, "responda APROVADO", link de aprovação sozinho no fim; com PDF avisa antes da assinatura', () => {
    const texto = mensagemDoOrcamento(orcamento, [], 'Ponto Visual')
    expect(texto).toContain('Segue o seu orçamento *ORC-2026-0042*:\n• 2× Banner em lona 2,0 × 1,0 m — R$ 130,00\n• 1.000× Cartão de visita — R$ 89,90')
    expect(texto).toContain(
      'Total: *R$ 219,90*\nPagamento: Entrada de R$ 109,95 (50%) na aprovação + 1× de R$ 54,97 e 1× de R$ 54,98 a cada 30 dias\nPrazo de produção: *5 dias úteis*\nVálido até *20/10/2026*',
    )
    // Pela conexão da gráfica a enquete vai logo depois; sem ela (wa.me, copiar), "Responda APROVADO..."
    expect(texto).toContain('Válido até *20/10/2026*\n\nToque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.\n\n— Ponto Visual')
    expect(textoSemEnquete(texto)).toContain('Válido até *20/10/2026*\n\nResponda *APROVADO* aqui mesmo ou peça o ajuste que precisar.\n\n— Ponto Visual')
    expect(texto.endsWith('Se preferir, veja e aprove pelo link:\nhttps://app.grafygo.com.br/aprovar/ponto-visual/tok')).toBe(true)
    const comPdf = mensagemDoOrcamento(orcamento, [], 'Ponto Visual', true)
    expect(comPdf).toContain('responda *APROVADO* aqui mesmo.\n\nO orçamento em PDF vai logo abaixo.\n\n— Ponto Visual\n\n')
  })

  it('o template editado da empresa vale mais que o padrão', () => {
    const templates = [{ id: 't', nome: 'x', categoria: 'orcamento_enviado', conteudo: 'Oi {{cliente_nome}}, total {{valor_total}}', ativo: true, createdAt: '2026-01-01' }] as never
    expect(mensagemDoOrcamento(orcamento, templates, 'X')).toBe('Oi Maria, total R$ 219,90')
  })

  const pedido = {
    numero: 'PED-2026-0017',
    tokenPublico: 'tp',
    total: '300',
    valorPago: '100',
    dataPrevistaEntrega: '2026-10-15',
    tipoEntrega: 'retirada',
    cliente: { nome: 'Pet Feliz Ltda', fantasia: null, cpfCnpj: '12.345.678/0001-90' },
  } as unknown as PedidoDetalhe

  it('recibo com o valor recebido', () => {
    const recibo = mensagemRecibo(pedido, 100, 'Ponto Visual', true)
    expect(recibo.startsWith('Olá, Pet Feliz!\n\nRecebemos *R$ 100,00* do pedido *PED-2026-0017* ✅')).toBe(true)
    expect(recibo).toContain('O recibo em PDF vai logo abaixo.\n\n— Ponto Visual')
  })

  it('prévia do pedido pronto (editor de templates): itens, retirada, pagamento e Pix no corpo; link no fim', () => {
    const previa = previaDoEvento('pedido_pronto', [], { nome: 'Ponto Visual', slug: 'ponto-visual', origem: 'https://app.grafygo.com.br' })
    expect(previa).toContain('está *pronto* 📦\n• 2× Banner em lona 2,0 × 1,0 m — R$ 130,00\n• 1.000× Cartão de visita 4x4 — R$ 89,90\n\nRetirada: Rua das Flores, 123 - Centro · Seg a sex, 8h às 18h')
    expect(previa).toContain('Pago: *R$ 150,00* · Falta: *R$ 69,90*\nPix para pagar: *pix@suagrafica.com.br*')
    expect(previa.endsWith('Detalhes do pedido:\nhttps://app.grafygo.com.br/pedido/ponto-visual/exemplo')).toBe(true)
  })

  it('catálogo: as categorias com mais produtos publicados', () => {
    const p = (nome: string | null, publicado = true) => ({ publicado, categoria: nome ? { id: nome, nome } : null })
    expect(categoriasEmDestaque([p('Placas'), p('Banners'), p('Banners'), p('Adesivos'), p('Adesivos'), p('Cartões', false), p(null)])).toEqual(['Adesivos', 'Banners', 'Placas'])
  })
})
