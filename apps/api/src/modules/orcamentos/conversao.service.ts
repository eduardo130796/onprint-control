import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { Decimal, adicionarDiasUteis, gerarParcelas, hojeISO, type conversaoSchema } from '@onprint/shared'
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
 * Conversão transacional do orçamento aprovado em pedido (seção 9):
 * pedido + itens, data prevista em dias úteis, cliente promovido, contas a receber
 * (sinal + parcelas), comissão prevista e artes "aguardando arquivo" por item.
 */
export function criarConversaoService(app: FastifyInstance, orcamentos: OrcamentosService) {
  const { prisma } = app

  return {
    async converter(orcamentoId: string, dados: Dados, ctx: ContextoUsuario) {
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
      const parcelas = gerarParcelas({
        total: o.total.toString(),
        sinalPercentual: dados.sinalPercentual,
        parcelas: dados.parcelas,
        intervaloDias: dados.intervaloDias,
        hoje,
        primeiroVencimento: dados.primeiroVencimento,
      })
      const vendedor = o.vendedorId ? await prisma.usuario.findUnique({ where: { id: o.vendedorId } }) : null

      return prisma.$transaction(async (tx) => {
        const numero = await proximoNumero(tx, 'pedido')
        const categoriaVendas = await categoriaPorCodigo(tx, 'vendas')
        const pedido = await tx.pedido.create({
          data: {
            numero,
            clienteId: o.clienteId,
            vendedorId: o.vendedorId,
            dataPrevistaEntrega: dataBanco(adicionarDiasUteis(hoje, prazo)),
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
                // Uma arte por item, aguardando o arquivo (versões na Fase 4)
                artes: { create: { versao: 1, status: 'aguardando_arquivo', tokenPublico: gerarToken() } },
              })),
            },
            contasReceber: {
              create: parcelas.map((p) => ({
                clienteId: o.clienteId,
                descricao: `${numero} · ${p.tipo === 'sinal' ? 'Sinal' : `Parcela ${p.parcela}/${p.totalParcelas}`}`,
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
        await tx.orcamento.update({ where: { id: o.id }, data: { status: 'convertido', pedidoId: pedido.id } })
        await registrarAuditoria(tx, { tabela: 'pedidos', registroId: pedido.id, acao: 'criar', depois: { ...pedido, orcamento: o.numero, parcelas }, usuarioId: ctx.usuarioId })
        return pedido
      })
    },
  }
}
