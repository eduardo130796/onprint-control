/* eslint-disable @typescript-eslint/no-explicit-any -- contas a receber e a pagar compartilham o mesmo fluxo; os delegates do Prisma diferem só no tipo */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { z } from 'zod'
import { Decimal, distribuirValor, gerarParcelas, hojeISO, statusTitulo, type baixaSchema, type receberPedidoSchema, type contaPagarSchema, type contaReceberSchema, type tituloAtualizacaoSchema, type titulosQuerySchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { paginacao, paginado } from '../../core/paginacao'
import type { ArquivosService } from '../arquivos/service'
import { baixarTitulo, categoriaPorCodigo, estornarMovimento, sincronizarFinanceiroPedido, type EfeitosFinanceiros, type TipoTitulo } from './baixa'
import { formatarMovimento, formatarTitulo, incluirMovimento, incluirPagar, incluirReceber, whereTitulos } from './titulos-consultas'

type Query = z.output<typeof titulosQuerySchema>
type NovoReceber = z.output<typeof contaReceberSchema>
type NovoPagar = z.output<typeof contaPagarSchema>
type Atualizacao = z.output<typeof tituloAtualizacaoSchema>
type Baixa = z.output<typeof baixaSchema>
type ReceberPedido = z.output<typeof receberPedidoSchema>

const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** Contas a receber ou a pagar: lista, criação parcelada, edição, cancelamento, baixa e estorno. */
export function criarTitulosService(app: FastifyInstance, tipo: TipoTitulo, arquivos: ArquivosService) {
  const { prisma } = app
  const db = (tx: any = prisma) => (tipo === 'receber' ? tx.contaReceber : tx.contaPagar)
  const incluir = tipo === 'receber' ? incluirReceber : incluirPagar
  const tabela = tipo === 'receber' ? 'contas_receber' : 'contas_pagar'
  const rotulo = tipo === 'receber' ? 'Conta a receber' : 'Conta a pagar'

  async function obter(id: string) {
    const t = await db().findUnique({ where: { id }, include: { ...incluir, movimentos: { include: incluirMovimento, orderBy: { createdAt: 'desc' } } } })
    if (!t) throw AppError.naoEncontrado(`${rotulo} não encontrada.`)
    const { movimentos, ...resto } = t
    return { ...formatarTitulo(resto), movimentos: movimentos.map(formatarMovimento) }
  }

  /** Avisos depois do commit: pedido mudou e comissões liberadas. */
  function avisar(e: EfeitosFinanceiros) {
    if (e.pedidoId) app.tempoReal.emitir('pedidos', 'pedido:atualizado', { id: e.pedidoId })
    for (const u of e.comissaoLiberadaPara) app.tempoReal.emitir(`usuario:${u}`, 'notificacao:nova', { titulo: 'Comissão liberada' })
  }

  return {
    obter,

    async listar(q: Query) {
      const where = whereTitulos(tipo, q)
      const pag = paginacao(q, ['vencimento', 'valor', 'createdAt'] as const, { campo: 'vencimento', direcao: 'asc' })
      const [total, data, soma] = await Promise.all([
        db().count({ where }),
        db().findMany({ where, ...pag, include: incluir }),
        db().aggregate({ where, _sum: { valor: true, valorPago: true } }),
      ])
      const valor = new Decimal(soma._sum.valor?.toString() ?? 0)
      const pago = new Decimal(soma._sum.valorPago?.toString() ?? 0)
      return { ...paginado(data.map((t: any) => formatarTitulo(t)), total, q), resumo: { valor: valor.toFixed(2), pago: pago.toFixed(2), saldo: valor.minus(pago).toFixed(2) } }
    },

    /** Lançamento manual, em uma ou mais parcelas iguais (centavos na última). */
    async criar(d: NovoReceber | NovoPagar, usuarioId: string) {
      const parcelas = gerarParcelas({ total: d.valor, sinalPercentual: 0, parcelas: d.parcelas, intervaloDias: d.intervaloDias, hoje: hojeISO(), primeiroVencimento: d.vencimento })
      const hoje = hojeISO()
      const ids = await prisma.$transaction(async (tx) => {
        const categoriaId = d.categoriaId ?? (await categoriaPorCodigo(tx, tipo === 'receber' ? 'outras_receitas' : 'outras_despesas'))
        const criados: string[] = []
        for (const p of parcelas) {
          const comum = {
            descricao: parcelas.length > 1 ? `${d.descricao} (${p.parcela}/${p.totalParcelas})` : d.descricao,
            parcela: p.parcela,
            totalParcelas: p.totalParcelas,
            valor: p.valor,
            vencimento: dataBanco(p.vencimento),
            status: statusTitulo(p.valor, 0, p.vencimento, hoje),
            categoriaId,
            formaPagamentoId: d.formaPagamentoId ?? null,
            observacao: d.observacao ?? null,
            createdBy: usuarioId,
          }
          const extra =
            'clienteId' in d
              ? { clienteId: d.clienteId }
              : { fornecedorId: d.fornecedorId ?? null, documento: d.documento ?? null, contaFinanceiraId: d.contaFinanceiraId ?? null }
          const t = await db(tx).create({ data: { ...comum, ...extra } })
          criados.push(t.id)
        }
        await registrarAuditoria(tx, { tabela, registroId: criados[0]!, acao: 'criar', depois: { descricao: d.descricao, valor: d.valor, parcelas: parcelas.length }, usuarioId })
        return criados
      })
      return Promise.all(ids.map(obter))
    },

    async atualizar(id: string, d: Atualizacao, usuarioId: string) {
      const antes = await obter(id)
      if (['pago', 'cancelado'].includes(antes.status)) throw AppError.regraNegocio('Título pago ou cancelado não pode ser alterado.')
      if (Number(antes.valorPago) > 0 && Number(d.valor) !== Number(antes.valor)) throw AppError.regraNegocio('O valor não pode mudar depois de um pagamento parcial.')
      await prisma.$transaction(async (tx) => {
        await db(tx).update({
          where: { id },
          data: {
            descricao: d.descricao,
            valor: d.valor,
            vencimento: dataBanco(d.vencimento),
            status: statusTitulo(d.valor, antes.valorPago, d.vencimento, hojeISO()),
            categoriaId: d.categoriaId ?? null,
            formaPagamentoId: d.formaPagamentoId ?? null,
            contaFinanceiraId: d.contaFinanceiraId ?? null,
            observacao: d.observacao ?? null,
            ...(tipo === 'pagar' ? { documento: d.documento ?? null } : {}),
          },
        })
        await registrarAuditoria(tx, { tabela, registroId: id, acao: 'editar', antes: { valor: antes.valor, vencimento: antes.vencimento }, depois: { valor: d.valor, vencimento: d.vencimento }, usuarioId })
        if (tipo === 'receber' && antes.pedido) await sincronizarFinanceiroPedido(tx, antes.pedido.id)
      })
      return obter(id)
    },

    /** Cancela um título sem pagamento (com motivo). Título de pedido atualiza o status financeiro do pedido. */
    async cancelar(id: string, motivo: string, usuarioId: string) {
      const antes = await obter(id)
      if (antes.status === 'cancelado') throw AppError.regraNegocio('Este título já está cancelado.')
      if (Number(antes.valorPago) > 0) throw AppError.regraNegocio('Estorne os pagamentos antes de cancelar o título.')
      await prisma.$transaction(async (tx) => {
        await db(tx).update({ where: { id }, data: { status: 'cancelado', motivoCancelamento: motivo } })
        await registrarAuditoria(tx, { tabela, registroId: id, acao: 'cancelar', antes: { status: antes.status }, depois: { status: 'cancelado', motivo }, usuarioId })
        if (tipo === 'receber' && antes.pedido) await sincronizarFinanceiroPedido(tx, antes.pedido.id)
      })
      return obter(id)
    },

    async baixar(id: string, d: Baixa, usuarioId: string) {
      const r = await prisma.$transaction(async (tx) => {
        const res = await baixarTitulo(tx, { tipo, tituloId: id, ...d, usuarioId })
        await registrarAuditoria(tx, { tabela, registroId: id, acao: 'baixa', depois: { valor: d.valorRecebido, data: d.data, movimento: res.movimentoId }, usuarioId })
        return res
      })
      avisar(r.efeitos)
      return obter(id)
    },

    /**
     * Valor avulso do pedido (só contas a receber): abate nas parcelas em aberto, da mais antiga à mais nova,
     * uma baixa por parcela, tudo na mesma transação (ou entra tudo, ou nada).
     */
    async receberDoPedido(pedidoId: string, d: ReceberPedido, usuarioId: string) {
      if (tipo !== 'receber') throw AppError.regraNegocio('Valor avulso só existe em contas a receber.')
      const efeitos = await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe('SELECT id FROM pedidos WHERE id = $1::uuid FOR UPDATE', pedidoId)
        const titulos = await tx.contaReceber.findMany({
          where: { pedidoId, status: { in: ['aberto', 'parcial', 'vencido'] } },
          orderBy: [{ vencimento: 'asc' }, { parcela: 'asc' }],
          select: { id: true, valor: true, valorPago: true },
        })
        const r = distribuirValor(titulos.map((t) => ({ id: t.id, saldo: new Decimal(t.valor.toString()).minus(t.valorPago.toString()) })), d.valorRecebido)
        if (!r.ok) throw AppError.regraNegocio(r.erro)
        let ultimo: EfeitosFinanceiros = { pedidoId, comissaoLiberadaPara: [] }
        const liberadas: string[] = []
        for (const parte of r.partes) {
          const res = await baixarTitulo(tx, { tipo, tituloId: parte.id, valorRecebido: parte.valor, juros: '0', multa: '0', desconto: '0', data: d.data, formaPagamentoId: d.formaPagamentoId, contaFinanceiraId: d.contaFinanceiraId, observacao: d.observacao, usuarioId })
          await registrarAuditoria(tx, { tabela, registroId: parte.id, acao: 'baixa', depois: { valor: parte.valor, data: d.data, movimento: res.movimentoId, valorAvulso: d.valorRecebido }, usuarioId })
          liberadas.push(...res.efeitos.comissaoLiberadaPara)
          ultimo = res.efeitos
        }
        return { ...ultimo, comissaoLiberadaPara: liberadas, partes: r.partes.length }
      })
      avisar(efeitos)
      return { parcelasAbatidas: efeitos.partes }
    },

    async estornar(id: string, movimentoId: string, motivo: string, usuarioId: string) {
      const mov = await prisma.movimentoFinanceiro.findUnique({ where: { id: movimentoId } })
      if (!mov || (tipo === 'receber' ? mov.contaReceberId : mov.contaPagarId) !== id) throw AppError.naoEncontrado('Pagamento não encontrado neste título.')
      if (mov.caixaSessaoId) {
        const sessao = await prisma.caixaSessao.findUnique({ where: { id: mov.caixaSessaoId } })
        if (sessao?.status === 'fechada') throw AppError.regraNegocio('Este recebimento foi feito num caixa já fechado.')
      }
      const efeitos = await prisma.$transaction(async (tx) => {
        const e = await estornarMovimento(tx, movimentoId, motivo, usuarioId)
        await registrarAuditoria(tx, { tabela, registroId: id, acao: 'estorno', depois: { movimento: movimentoId, motivo }, usuarioId })
        return e
      })
      avisar(efeitos)
      return obter(id)
    },

    async anexar(request: FastifyRequest, id: string, usuarioId: string) {
      await obter(id)
      const entidade = tipo === 'receber' ? 'conta_receber' : 'conta_pagar'
      const arquivo = await arquivos.receberUpload(request, { entidade, entidadeId: id, categoria: 'anexo' }, usuarioId)
      await db().update({ where: { id }, data: { anexoId: arquivo.id } })
      return obter(id)
    },
  }
}

export type TitulosService = ReturnType<typeof criarTitulosService>
