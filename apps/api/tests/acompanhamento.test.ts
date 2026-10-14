import { describe, expect, it } from 'vitest'
import {
  etapasDoPedido,
  linkDoCaminho,
  marcosPublicos,
  montarAcompanhamento,
  previaDoPedido,
  type ExtrasAcompanhamento,
  type PedidoParaAcompanhar,
  type RegistroAuditoria,
} from '../src/modules/publico/acompanhamento'

const d = (iso: string) => new Date(iso)
const TOKEN_ARTE = 'tokenDaArteComMaisDe20Caracteres'

/** Pedido como sai do banco, com campos internos que NÃO podem chegar ao cliente. */
function pedido(extra: Partial<PedidoParaAcompanhar> = {}): PedidoParaAcompanhar {
  return {
    numero: 'PED-2026-0042',
    status: 'arte_em_aprovacao',
    tipoEntrega: 'entrega',
    enderecoEntrega: 'Rua das Flores, 10 - Centro',
    dataPrevistaEntrega: d('2026-10-20T00:00:00Z'),
    total: '1000.00',
    valorPago: '500.00',
    observacoes: 'Entregar no período da manhã',
    canceladoEm: null,
    createdAt: d('2026-10-10T12:00:00Z'),
    cliente: { nome: 'Maria Silva', fantasia: null },
    itens: [
      {
        id: 'i1',
        descricao: 'Banner em lona 440 g',
        quantidade: '2.000',
        largura: '1.000',
        altura: '0.500',
        total: '600.00',
        acabamentos: [{ nome: 'Ilhós' }],
        artes: [
          { id: 'a2', versao: 2, status: 'enviada_cliente', tokenPublico: TOKEN_ARTE, miniaturaId: 'arq-mini', arquivo: { id: 'arq-pdf', nomeOriginal: 'banner.pdf', mime: 'application/pdf' } },
          { id: 'a1', versao: 1, status: 'ajuste_solicitado', tokenPublico: 'tokenAntigoDaArteVersao1xx', miniaturaId: null },
        ],
      },
      { id: 'i2', descricao: 'Adesivo vinil', quantidade: '100.000', largura: null, altura: null, total: '400.00', acabamentos: [], artes: [] },
    ],
    contasReceber: [
      { parcela: 1, totalParcelas: 2, descricao: 'PED-2026-0042 · Sinal', valor: '500.00', valorPago: '500.00', vencimento: d('2026-10-10T00:00:00Z'), status: 'pago', pagoEm: d('2026-10-10T00:00:00Z') },
      { parcela: 2, totalParcelas: 2, descricao: 'PED-2026-0042 · Parcela 2/2', valor: '500.00', valorPago: '0', vencimento: d('2026-10-25T00:00:00Z'), status: 'aberto', pagoEm: null },
      { parcela: 3, totalParcelas: 3, descricao: 'Cancelada', valor: '999.00', valorPago: '0', vencimento: d('2026-10-01T00:00:00Z'), status: 'cancelado', pagoEm: null },
    ],
    entregas: [],
    ...extra,
  }
}

const auditoria: RegistroAuditoria[] = [
  { tabela: 'pedidos', registroId: 'p1', acao: 'criar', antes: null, depois: { numero: 'PED-2026-0042', orcamento: 'ORC-1' }, createdAt: d('2026-10-10T12:00:00Z') },
  { tabela: 'artes', registroId: 'a1', acao: 'editar', antes: { status: 'enviada_cliente' }, depois: { status: 'ajuste_solicitado', via: 'link público', nome: 'Maria', ip: '10.0.0.1' }, createdAt: d('2026-10-11T09:00:00Z') },
  { tabela: 'pedidos', registroId: 'p1', acao: 'editar', antes: { status: 'aguardando_arte' }, depois: { status: 'arte_em_aprovacao', automatico: true }, createdAt: d('2026-10-12T10:00:00Z') },
  { tabela: 'artes', registroId: 'a2', acao: 'editar', antes: { status: 'em_criacao' }, depois: { status: 'enviada_cliente', designerId: 'u-designer' }, createdAt: d('2026-10-12T10:00:00Z') },
]

const extras: ExtrasAcompanhamento = {
  slug: 'ponto-visual',
  hoje: '2026-10-12',
  auditoria,
  urlArquivo: (id) => `/api/v1/arquivos/publico/${id}`,
  empresa: { nome: 'Ponto Visual', logoUrl: null, corTema: 'verde', whatsapp: '11999990000', telefone: null, email: null, endereco: 'Av. Brasil, 100 - Centro', horario: 'Seg a sex, 8h às 18h' },
}

describe('etapasDoPedido', () => {
  const base = { tipoEntrega: 'retirada' as const, temArte: true, arteAguardando: false, criadoEm: d('2026-10-10T12:00:00Z'), entradas: {} }

  it('confirmado → arte → produção → pronto → entregue, com a etapa atual marcada', () => {
    const etapas = etapasDoPedido({ ...base, status: 'em_producao' })
    expect(etapas.map((e) => [e.codigo, e.situacao])).toEqual([
      ['confirmado', 'concluida'],
      ['arte', 'concluida'],
      ['producao', 'atual'],
      ['pronto', 'pendente'],
      ['entregue', 'pendente'],
    ])
    expect(etapas[3]!.titulo).toBe('Pronto para retirada')
  })

  it('sem arte, a etapa "Arte" some e "aguardando arte" ainda é pedido confirmado', () => {
    const etapas = etapasDoPedido({ ...base, temArte: false, status: 'aguardando_arte' })
    expect(etapas.map((e) => e.codigo)).toEqual(['confirmado', 'producao', 'pronto', 'entregue'])
    expect(etapas[0]!.situacao).toBe('atual')
  })

  it('em entrega: "Saiu para entrega"; instalação tem texto próprio', () => {
    expect(etapasDoPedido({ ...base, tipoEntrega: 'entrega', status: 'em_entrega' }).find((e) => e.situacao === 'atual')?.titulo).toBe('Saiu para entrega')
    expect(etapasDoPedido({ ...base, tipoEntrega: 'instalacao', status: 'pronto' }).find((e) => e.situacao === 'atual')?.titulo).toBe('Pronto para instalação')
  })

  it('entregue: tudo concluído, nenhuma etapa pendente', () => {
    const etapas = etapasDoPedido({ ...base, status: 'entregue', entradas: { entregue: d('2026-10-15T15:00:00Z') } })
    expect(etapas.every((e) => e.situacao === 'concluida')).toBe(true)
    expect(etapas.at(-1)).toMatchObject({ titulo: 'Retirado', quando: '2026-10-15T15:00:00.000Z' })
  })

  it('cancelado: concluídas só as etapas alcançadas antes do cancelamento', () => {
    const etapas = etapasDoPedido({ ...base, status: 'cancelado', statusAntesCancelar: 'em_producao' })
    expect(etapas.map((e) => e.situacao)).toEqual(['concluida', 'concluida', 'concluida', 'pendente', 'pendente'])
    expect(etapas.some((e) => e.situacao === 'atual')).toBe(false)
  })
})

describe('marcosPublicos', () => {
  const itemDaArte = new Map([
    ['a1', 'Banner'],
    ['a2', 'Banner'],
  ])

  it('só título e data, do mais recente ao mais antigo, sem nomes, IP ou motivo', () => {
    const marcos = marcosPublicos(
      [
        ...auditoria,
        { tabela: 'pedidos', registroId: 'p1', acao: 'editar', antes: { status: 'em_producao' }, depois: { status: 'cancelado', motivo: 'Cliente desistiu (inadimplente)' }, createdAt: d('2026-10-13T10:00:00Z') },
      ],
      { criadoEm: d('2026-10-10T12:00:00Z'), tipoEntrega: 'entrega', itemDaArte },
    )
    expect(marcos.map((m) => m.titulo)).toEqual(['Pedido cancelado', 'Arte enviada para sua aprovação: Banner', 'Arte enviada para sua aprovação', 'Ajuste na arte solicitado: Banner', 'Pedido confirmado'])
    const json = JSON.stringify(marcos)
    for (const proibido of ['inadimplente', 'Maria', '10.0.0.1', 'u-designer', 'ORC-1']) expect(json).not.toContain(proibido)
  })

  it('sem o registro de criação, usa a data do pedido; ignora alterações sem status e marcos repetidos', () => {
    const marcos = marcosPublicos(
      [
        { tabela: 'pedidos', registroId: 'p1', acao: 'editar', antes: { observacoesInternas: 'x' }, depois: { observacoesInternas: 'segredo' }, createdAt: d('2026-10-11T00:00:00Z') },
        { tabela: 'pedidos', registroId: 'p1', acao: 'editar', antes: { status: 'pronto' }, depois: { status: 'em_producao' }, createdAt: d('2026-10-12T00:00:00Z') },
        { tabela: 'pedidos', registroId: 'p1', acao: 'editar', antes: { status: 'arte_em_aprovacao' }, depois: { status: 'em_producao' }, createdAt: d('2026-10-12T00:00:01Z') },
      ],
      { criadoEm: d('2026-10-10T00:00:00Z'), tipoEntrega: 'retirada', itemDaArte },
    )
    expect(marcos).toEqual([
      { quando: '2026-10-12T00:00:00.000Z', titulo: 'Pedido em produção' },
      { quando: '2026-10-10T00:00:00.000Z', titulo: 'Pedido confirmado' },
    ])
  })
})

describe('montarAcompanhamento', () => {
  it('monta a visão do cliente: etapa atual, arte com link de aprovação, financeiro e entrega', () => {
    const a = montarAcompanhamento(pedido(), extras)
    expect(a.situacao.titulo).toBe('Aprovação da arte')
    expect(a.etapas.find((e) => e.situacao === 'atual')?.codigo).toBe('arte')
    // Pessoa pelo primeiro nome; empresa pelo nome fantasia, e o documento nunca sai
    expect(a.cliente).toEqual({ nome: 'Maria' })
    const empresa = montarAcompanhamento(pedido({ cliente: { nome: 'Pet Feliz Banho e Tosa Ltda', fantasia: 'Pet Feliz', cpfCnpj: '12345678000190' } }), extras)
    expect(empresa.cliente).toEqual({ nome: 'Pet Feliz' })
    expect(a.itens[0]).toEqual({
      descricao: 'Banner em lona 440 g',
      quantidade: '2.000',
      largura: '1.000',
      altura: '0.500',
      acabamentos: ['Ilhós'],
      total: '600.00',
      arte: {
        id: 'a2',
        versao: 2,
        status: 'enviada_cliente',
        rotulo: 'Aguardando sua aprovação',
        aguardandoAprovacao: true,
        linkAprovacao: `/arte/ponto-visual/${TOKEN_ARTE}`,
        miniaturaUrl: '/api/v1/arquivos/publico/arq-mini',
        arquivo: { nome: 'banner.pdf', mime: 'application/pdf', url: '/api/v1/arquivos/publico/arq-pdf', visualizavel: true },
        ajustePedido: null,
      },
    })
    expect(a.aprovacaoArte).toEqual({ mostrar: true, pendentes: 1 })
    expect(a.itens[1]!.arte).toBeNull()
    expect(a.financeiro).toEqual({
      total: '1000.00',
      pago: '500.00',
      restante: '500.00',
      quitado: false,
      proximoVencimento: { data: '2026-10-25', valor: '500.00', vencida: false },
      parcelas: [
        { rotulo: 'Entrada (sinal)', valor: '500.00', vencimento: '2026-10-10', pago: true, vencida: false, pagoEm: '2026-10-10' },
        { rotulo: 'Parcela 2 de 2', valor: '500.00', vencimento: '2026-10-25', pago: false, vencida: false, pagoEm: null },
      ],
    })
    expect(a.entrega).toEqual({ tipo: 'entrega', rotulo: 'Entrega', endereco: 'Rua das Flores, 10 - Centro', agendadaPara: null, realizadaEm: null })
    expect(a.atrasado).toBe(false)
  })

  it('não expõe campos internos (custos, observações internas, tokens antigos, equipe, ids)', () => {
    const interno = {
      ...pedido(),
      id: 'pedido-id-interno',
      observacoesInternas: 'Cliente difícil, cobrar adiantado',
      vendedorId: 'u-vendedor',
      vendedor: { nome: 'João Vendedor' },
      custoEstimado: '123.45',
      comissoes: [{ valor: '50.00' }],
      statusPersonalizado: { rotulo: 'Esperando o cliente pagar' },
    }
    interno.itens = interno.itens.map((i) => Object.assign({}, i, { custoEstimado: '77.70', custoDetalhe: { linhas: [] }, precoUnitario: '300.00', observacao: 'interno do item' }))
    const json = JSON.stringify(montarAcompanhamento(interno as PedidoParaAcompanhar, extras))
    for (const proibido of [
      'pedido-id-interno',
      'Cliente difícil',
      'u-vendedor',
      'João Vendedor',
      '123.45',
      '77.70',
      'custo',
      'comissoes',
      'Esperando o cliente pagar',
      'interno do item',
      'tokenAntigoDaArteVersao1xx',
      '999.00',
      'u-designer',
      '10.0.0.1',
      'contaFinanceira',
    ]) {
      expect(json).not.toContain(proibido)
    }
  })

  it('cancelado: sem link de aprovação nem próximo vencimento', () => {
    const a = montarAcompanhamento(pedido({ status: 'cancelado', canceladoEm: d('2026-10-13T10:00:00Z') }), {
      ...extras,
      auditoria: [...auditoria, { tabela: 'pedidos', registroId: 'p1', acao: 'editar', antes: { status: 'arte_em_aprovacao' }, depois: { status: 'cancelado', motivo: 'x' }, createdAt: d('2026-10-13T10:00:00Z') }],
    })
    expect(a.cancelado).toBe(true)
    expect(a.situacao.titulo).toBe('Pedido cancelado')
    expect(a.itens[0]!.arte?.linkAprovacao).toBeNull()
    expect(a.financeiro.proximoVencimento).toBeNull()
    expect(a.etapas.map((e) => e.situacao)).toEqual(['concluida', 'concluida', 'pendente', 'pendente', 'pendente'])
  })

  it('retirada não mostra endereço de entrega; atraso e parcela vencida pela data de hoje', () => {
    const a = montarAcompanhamento(pedido({ tipoEntrega: 'retirada', status: 'em_producao' }), { ...extras, hoje: '2026-10-26' })
    expect(a.entrega.endereco).toBeNull()
    expect(a.atrasado).toBe(true)
    expect(a.financeiro.proximoVencimento).toEqual({ data: '2026-10-25', valor: '500.00', vencida: true })
    expect(a.financeiro.parcelas[1]!.vencida).toBe(true)
  })

  it('pedido que seguiu (produção, pronto, entregue) com a arte ainda "enviada": nada de pedir aprovação', () => {
    for (const status of ['em_producao', 'pronto', 'em_entrega', 'entregue'] as const) {
      const a = montarAcompanhamento(pedido({ status }), extras)
      expect(a.aprovacaoArte).toEqual({ mostrar: false, pendentes: 0 })
      expect(a.itens[0]!.arte).toMatchObject({ aguardandoAprovacao: false, linkAprovacao: null, rotulo: 'Aprovada' })
      expect(a.etapas.find((e) => e.codigo === 'arte')?.titulo).toBe('Arte aprovada')
    }
  })

  it('ajuste pedido aparece para o cliente enquanto a arte está em ajuste', () => {
    const p = pedido()
    p.itens[0]!.artes[0] = { ...p.itens[0]!.artes[0]!, status: 'ajuste_solicitado', comentarioCliente: 'Trocar o telefone' }
    const a = montarAcompanhamento(p, extras)
    expect(a.aprovacaoArte.mostrar).toBe(false)
    expect(a.itens[0]!.arte).toMatchObject({ ajustePedido: 'Trocar o telefone', rotulo: 'Ajuste em andamento' })
  })

  it('pago por completo: quitado', () => {
    const a = montarAcompanhamento(pedido({ valorPago: '1000.00' }), extras)
    expect(a.financeiro).toMatchObject({ restante: '0.00', quitado: true })
  })
})

describe('prévia do link (Open Graph)', () => {
  it('reconhece só /pedido/{empresa}/{token}', () => {
    expect(linkDoCaminho('/pedido/ponto-visual/abcdefghijklmnopqrstuvwxyz?x=1')).toEqual({ slug: 'ponto-visual', token: 'abcdefghijklmnopqrstuvwxyz' })
    expect(linkDoCaminho('/pedido/ponto-visual/curto')).toBeNull()
    expect(linkDoCaminho('/aprovar/ponto-visual/abcdefghijklmnopqrstuvwxyz')).toBeNull()
    expect(linkDoCaminho('/pedido/../abcdefghijklmnopqrstuvwxyz')).toBeNull()
  })

  it('título "Pedido PED-… · Gráfica" e a situação na descrição', () => {
    const previa = previaDoPedido(montarAcompanhamento(pedido({ status: 'em_producao' }), extras), 'https://app.grafygo.com.br/pedido/ponto-visual/x')
    expect(previa.titulo).toBe('Pedido PED-2026-0042 · Ponto Visual')
    expect(previa.descricao).toBe('Em produção. Previsão de entrega: 20/10/2026. Acompanhe o andamento do seu pedido.')
  })
})
