import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { Decimal, adicionarDiasUteis, gerarParcelas, hojeISO, statusArtesQueContam, statusAutomaticoPedido, type StatusPedido, type conversaoSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import type { ContextoUsuario } from '../../core/escopo'
import { proximoNumero } from '../../core/numeracao'
import { dataBanco, gerarToken, type OrcamentosService } from './orcamentos.service'
import { categoriaPorCodigo } from '../financeiro/baixa'
import { gerarOpsDoPedido } from '../producao/geracao'

type Dados = z.output<typeof conversaoSchema>

function enderecoEmTexto(e: { logradouro: string; numero: string | null; complemento: string | null; bairro: string | null; cidade: string; uf: string; cep: string | null }) {
  return [[e.logradouro, e.numero, e.complemento].filter(Boolean).join(', '), e.bairro, `${e.cidade}/${e.uf}`, e.cep && `CEP ${e.cep}`]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Arte do item na conversão: o item do pedido segue o que foi decidido no item do orçamento. Precisando, nasce a arte v1
 * "aguardando arquivo"; sem arte, nenhuma (o item não trava o pedido nem a OP).
 */
export function arteDoItemNaConversao(precisaArte: boolean, token: () => string) {
  return {
    precisaArte,
    ...(precisaArte ? { artes: { create: { versao: 1, status: 'aguardando_arquivo' as const, tokenPublico: token() } } } : {}),
  }
}

/**
 * Contas a receber do pedido: a mesma regra do resumo do orçamento (resumoCondicoesPagamento), então o pedido cobra
 * exatamente o que a mensagem, o PDF e a página de aprovação prometeram. Parcelas = 0: o restante vence na previsão
 * de entrega ("na retirada/entrega").
 */
export function contasDaConversao(total: string, dados: Pick<Dados, 'sinalPercentual' | 'parcelas' | 'intervaloDias' | 'primeiroVencimento'>, hoje: string, previsao: string) {
  return gerarParcelas({
    total,
    sinalPercentual: dados.sinalPercentual,
    parcelas: dados.parcelas,
    intervaloDias: dados.intervaloDias,
    hoje,
    primeiroVencimento: dados.primeiroVencimento,
    vencimentoNaEntrega: previsao,
  })
}

/** Status do pedido recém-criado: sem nenhum item que precise de arte, já nasce em produção */
export function statusInicialDoPedido(itensPrecisamArte: boolean[]): StatusPedido {
  return statusAutomaticoPedido({ status: 'aguardando_arte', artes: statusArtesQueContam(itensPrecisamArte.map((precisaArte) => ({ precisaArte, artes: [] }))), ops: [] })
}

/**
 * Conversão transacional do orçamento aprovado em pedido (seção 9):
 * pedido + itens, data prevista em dias úteis, cliente promovido, contas a receber
 * (sinal + parcelas), comissão prevista e artes "aguardando arquivo" por item que precisa de arte.
 */
export function criarConversaoService(app: FastifyInstance, orcamentos: OrcamentosService) {
  const { prisma } = app

  return {
    /** `via`: origem gravada na auditoria (ex.: conversão automática na aprovação do cliente). */
    async converter(orcamentoId: string, dados: Dados, ctx: ContextoUsuario, opcoes: { via?: string } = {}) {
      const o = await orcamentos.obter(orcamentoId, ctx)
      if (o.pedidoId) throw AppError.conflito('Este orçamento já foi convertido em pedido.')
      if (o.status !== 'aprovado') throw AppError.regraNegocio('Só orçamentos aprovados podem virar pedido.')

      let enderecoEntrega: string | null = null
      if (dados.tipoEntrega !== 'retirada') {
        const endereco = dados.enderecoEntregaId
          ? await prisma.clienteEndereco.findFirst({ where: { id: dados.enderecoEntregaId, clienteId: o.clienteId } })
          : await prisma.clienteEndereco.findFirst({ where: { clienteId: o.clienteId }, orderBy: [{ tipo: 'asc' }, { createdAt: 'asc' }] })
        if (!endereco) throw AppError.regraNegocio('Cadastre um endereço do cliente para entrega ou instalação.')
        enderecoEntrega = enderecoEmTexto(endereco)
      }

      const hoje = hojeISO()
      const prazo = Math.max(0, ...o.itens.map((i) => i.prazoDias))
      const previsao = adicionarDiasUteis(hoje, prazo)
      const parcelas = contasDaConversao(o.total.toString(), dados, hoje, previsao)
      const vendedor = o.vendedorId ? await prisma.usuario.findUnique({ where: { id: o.vendedorId } }) : null

      const criado = await prisma.$transaction(async (tx) => {
        const numero = await proximoNumero(tx, 'pedido')
        const categoriaVendas = await categoriaPorCodigo(tx, 'vendas')
        const pedido = await tx.pedido.create({
          data: {
            numero,
            // Link "Acompanhe seu pedido" (/pedido/:empresa/:token)
            tokenPublico: gerarToken(),
            status: statusInicialDoPedido(o.itens.map((i) => i.precisaArte)),
            clienteId: o.clienteId,
            vendedorId: o.vendedorId,
            dataPrevistaEntrega: dataBanco(previsao),
            tipoEntrega: dados.tipoEntrega,
            enderecoEntrega,
            prioridade: dados.prioridade,
            subtotal: o.subtotal,
            desconto: o.desconto,
            acrescimo: o.acrescimo,
            frete: o.frete,
            total: o.total,
            observacoes: dados.observacoes ?? o.observacoes,
            observacoesInternas: o.observacoesInternas,
            createdBy: ctx.usuarioId,
            itens: {
              create: o.itens.map((i) => ({
                orcamentoItemId: i.id,
                produtoId: i.produtoId,
                descricao: i.descricao,
                quantidade: i.quantidade,
                largura: i.largura,
                altura: i.altura,
                areaM2: i.areaM2,
                precoUnitario: i.precoUnitario,
                valorProduto: i.valorProduto,
                valorAcabamentos: i.valorAcabamentos,
                desconto: i.desconto,
                total: i.total,
                custoEstimado: i.custoEstimado,
                // Custo detalhado do momento da venda (fase 3 da precificação)
                custoDetalhe: i.custoDetalhe ?? Prisma.DbNull,
                prazoDias: i.prazoDias,
                ordem: i.ordem,
                observacao: i.observacao,
                acabamentos: {
                  create: i.acabamentos.map(({ acabamentoId, nome, tipoCobranca, valorUnitario, base, valor, custo }) => ({
                    acabamentoId, nome, tipoCobranca, valorUnitario, base, valor, custo,
                  })),
                },
                // Uma arte por item que precisa de arte, aguardando o arquivo (versões na Fase 4)
                ...arteDoItemNaConversao(i.precisaArte, gerarToken),
              })),
            },
            contasReceber: {
              create: parcelas.map((p) => ({
                clienteId: o.clienteId,
                descricao: `${numero} · ${p.tipo === 'sinal' ? 'Sinal' : dados.parcelas === 0 ? 'Restante na retirada/entrega' : `Parcela ${p.parcela}/${p.totalParcelas}`}`,
                parcela: p.parcela,
                totalParcelas: p.totalParcelas,
                valor: p.valor,
                vencimento: dataBanco(p.vencimento),
                categoriaId: categoriaVendas,
                createdBy: ctx.usuarioId,
              })),
            },
          },
        })

        if (vendedor && Number(vendedor.comissaoPercentual) > 0) {
          await tx.comissao.create({
            data: {
              vendedorId: vendedor.id,
              pedidoId: pedido.id,
              base: o.total,
              percentual: vendedor.comissaoPercentual,
              valor: new Decimal(o.total.toString()).mul(vendedor.comissaoPercentual.toString()).div(100).toDecimalPlaces(2).toFixed(2),
            },
          })
        }
        if (o.cliente.situacao === 'pre_cadastro') {
          await tx.cliente.update({ where: { id: o.clienteId }, data: { situacao: 'ativo' } })
        }
        // Uma OP por item, na fila do kanban de produção
        await gerarOpsDoPedido(tx, pedido.id, ctx.usuarioId)
        // Transição atômica: duas conversões ao mesmo tempo (clique duplo, automática + manual)
        // não geram dois pedidos — a segunda desfaz tudo, inclusive o número do pedido
        const { count } = await tx.orcamento.updateMany({ where: { id: o.id, status: 'aprovado', pedidoId: null }, data: { status: 'convertido', pedidoId: pedido.id } })
        if (count !== 1) throw AppError.conflito('Este orçamento já foi convertido em pedido.')
        await registrarAuditoria(tx, {
          tabela: 'pedidos',
          registroId: pedido.id,
          acao: 'criar',
          depois: { ...pedido, orcamento: o.numero, parcelas, ...(opcoes.via ? { via: opcoes.via } : {}) },
          usuarioId: ctx.usuarioId,
        })
        return pedido
      })
      // "Pedido confirmado" com o link de acompanhamento pelo WhatsApp da gráfica, se ligado
      void app.whatsapp.avisar('pedido_confirmado', { pedidoId: criado.id })
      return criado
    },
  }
}
