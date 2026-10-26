import type { PrismaClient } from '@prisma/client'
import {
  TEXTOS_PADRAO_MENSAGEM,
  contaDeEntrada,
  formaEntregaPronto,
  formatarDataSimples,
  formatarMoeda,
  hojeISO,
  nomeCliente,
  nomeParaSaudacao,
  preencherMensagem,
  proximoPassoPedido,
  valorEmAberto,
  valoresPedidoCompleto,
  type CategoriaMensagemPedido,
  type CategoriaTemplate,
  type StatusPedido,
  type VariavelTemplate,
} from '@onprint/shared'
import type { EmpresaAtual } from '../../core/contexto-empresa'
import { linkAcompanhamento } from '../../core/links'
import { enderecoEmLinha } from '../publico/acompanhamento'

/*
 * Texto das mensagens do pedido (confirmado, pronto, saiu para entrega, pagamento, entregue, acompanhamento) num
 * lugar só: os avisos automáticos (avisos.ts) e o diálogo "Enviar pelo WhatsApp" da equipe (GET
 * /whatsapp/pedidos/:id/mensagem) usam estas variáveis, então o cliente recebe o mesmo texto pelos dois caminhos.
 */

export type ValoresMensagem = Partial<Record<VariavelTemplate, string>>

/** Pedido ainda na etapa da arte ({{proximo_passo}} dos templates antigos) */
const NA_ETAPA_DA_ARTE: readonly StatusPedido[] = ['aguardando_arte', 'arte_em_aprovacao']

/** Nome da gráfica (assinatura), endereço e horário (retirada) e a chave Pix */
export async function dadosDaGrafica(prisma: PrismaClient, empresa: EmpresaAtual) {
  const [c, vitrine] = await Promise.all([
    prisma.empresaConfig.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { nomeFantasia: true, razaoSocial: true, chavePix: true, logradouro: true, numero: true, complemento: true, bairro: true, cidade: true, uf: true },
    }),
    prisma.vitrineConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { horario: true } }),
  ])
  return {
    nome: c?.nomeFantasia?.trim() || c?.razaoSocial?.trim() || empresa.nome,
    endereco: c ? enderecoEmLinha(c) : null,
    horario: vitrine?.horario ?? null,
    chavePix: c?.chavePix ?? null,
  }
}

/**
 * Variáveis do pedido para a mensagem da categoria (null se o pedido não existe). Tudo vai no corpo: itens,
 * total, pagamento, próxima parcela, previsão, retirada/entrega e Pix; o link fica para quem quiser ver mais.
 */
export async function valoresMensagemPedido(prisma: PrismaClient, empresa: EmpresaAtual, pedidoId: string, categoria: CategoriaTemplate): Promise<ValoresMensagem | null> {
  const [pedido, grafica] = await Promise.all([
    prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: {
        numero: true,
        status: true,
        tipoEntrega: true,
        enderecoEntrega: true,
        total: true,
        valorPago: true,
        tokenPublico: true,
        dataPrevistaEntrega: true,
        orcamento: { select: { numero: true } },
        cliente: { select: { nome: true, fantasia: true, cpfCnpj: true } },
        itens: { select: { descricao: true, quantidade: true, largura: true, altura: true, total: true }, orderBy: { ordem: 'asc' } },
        contasReceber: { select: { descricao: true, valor: true, valorPago: true, vencimento: true, status: true } },
        // A entrega registrada (a mais recente não cancelada) vale mais que o tipo e o endereço do pedido
        entregas: { where: { status: { not: 'cancelada' } }, orderBy: { createdAt: 'desc' }, take: 1, select: { tipo: true, endereco: true } },
      },
    }),
    dadosDaGrafica(prisma, empresa),
  ])
  if (!pedido) return null
  const total = pedido.total.toString()
  const pago = pedido.valorPago.toString()
  const entrega = pedido.entregas[0]
  return {
    cliente_nome: nomeParaSaudacao(nomeCliente(pedido.cliente), pedido.cliente.cpfCnpj),
    numero_pedido: pedido.numero,
    numero_orcamento: pedido.orcamento?.numero ?? '',
    data_entrega: formatarDataSimples(pedido.dataPrevistaEntrega.toISOString()),
    link_acompanhamento: linkAcompanhamento(pedido.tokenPublico, empresa.slug),
    valor_total: formatarMoeda(total),
    valor_em_aberto: valorEmAberto(total, pago),
    // Templates antigos (editados pela gráfica) continuam funcionando
    proximo_passo: proximoPassoPedido(NA_ETAPA_DA_ARTE.includes(pedido.status)),
    forma_entrega: formaEntregaPronto(entrega?.tipo ?? pedido.tipoEntrega),
    ...valoresPedidoCompleto(
      {
        total,
        valorPago: pago,
        tipoEntrega: entrega?.tipo ?? pedido.tipoEntrega,
        enderecoEntrega: entrega?.endereco?.trim() || pedido.enderecoEntrega,
        itens: pedido.itens.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade.toString(), largura: i.largura?.toString(), altura: i.altura?.toString(), total: i.total.toString() })),
        parcelas: pedido.contasReceber.map((c) => ({ valor: c.valor.toString(), valorPago: c.valorPago.toString(), vencimento: c.vencimento.toISOString().slice(0, 10), status: c.status, entrada: contaDeEntrada(c.descricao) })),
      },
      grafica,
      hojeISO(),
      categoria,
    ),
    empresa_nome: grafica.nome,
  }
}

/** Texto da categoria: o template ativo mais antigo (como a tela de templates mostra) ou o texto padrão */
export async function templateDaCategoria(prisma: PrismaClient, categoria: keyof typeof TEXTOS_PADRAO_MENSAGEM) {
  const t = await prisma.mensagemTemplate.findFirst({ where: { categoria, ativo: true }, orderBy: { createdAt: 'asc' }, select: { conteudo: true } })
  return t?.conteudo ?? TEXTOS_PADRAO_MENSAGEM[categoria]
}

/** Mensagem do pedido pronta para o diálogo "Enviar pelo WhatsApp" (mesmo texto do aviso automático) */
export async function textoMensagemPedido(prisma: PrismaClient, empresa: EmpresaAtual, pedidoId: string, categoria: CategoriaMensagemPedido): Promise<string | null> {
  const valores = await valoresMensagemPedido(prisma, empresa, pedidoId, categoria)
  return valores ? preencherMensagem(await templateDaCategoria(prisma, categoria), valores) : null
}
