import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { Decimal, calcularVendaPdv, consumoDeInsumo, hojeISO, type recebimentoCaixaSchema, type vendaPdvSchema, type vendasPdvQuerySchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { proximoNumero } from '../../core/numeracao'
import { paginacao, paginado } from '../../core/paginacao'
import { localPadrao } from '../estoque/consumo'
import { custoDoItemVendido, parametrosPreco } from '../produtos/custos'
import { incluirComposicao } from '../produtos/custos.service'
import { avisarAlertas, movimentar, type AlertaEstoque } from '../estoque/movimentacao'
import { baixarTitulo, categoriaPorCodigo, estornarMovimento, registrarTaxa } from '../financeiro/baixa'
import type { SessaoService } from './sessao.service'

const ref = { select: { id: true, nome: true } } as const
const incluirVenda = {
  cliente: ref,
  usuario: ref,
  // O custo da venda é só para os relatórios (quem opera o caixa não vê custo)
  itens: { orderBy: { id: 'asc' }, omit: { custo: true } },
  caixaMovimentos: { where: { tipo: 'venda' }, select: { valor: true, formaPagamento: { select: { nome: true } } } },
} satisfies Prisma.VendaPdvInclude
type VendaComRelacoes = Prisma.VendaPdvGetPayload<{ include: typeof incluirVenda }>
const formatarVenda = ({ caixaMovimentos, ...v }: VendaComRelacoes) => ({
  ...v,
  pagamentos: caixaMovimentos.map((m) => ({ forma: m.formaPagamento?.nome ?? 'Dinheiro', valor: m.valor.toFixed(2) })),
})
const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** Venda balcão (PDV) e recebimento de títulos no caixa. Tudo exige caixa aberto. */
export function criarPdvService(app: FastifyInstance, sessoes: SessaoService) {
  const { prisma } = app

  async function obter(id: string) {
    const v = await prisma.vendaPdv.findUnique({ where: { id }, include: incluirVenda })
    if (!v) throw AppError.naoEncontrado('Venda não encontrada.')
    return formatarVenda(v)
  }

  return {
    obter,

    /** Grade do PDV: produtos vendidos por unidade (sem medidas), com saldo quando controlam estoque. */
    async produtos(busca?: string) {
      const texto = busca ? { contains: busca, mode: 'insensitive' as const } : undefined
      const produtos = await prisma.produto.findMany({
        where: { ativo: true, modoCalculo: 'unidade', tipo: { in: ['produto', 'revenda', 'servico'] }, ...(texto ? { OR: [{ nome: texto }, { codigo: texto }] } : {}) },
        orderBy: { nome: 'asc' },
        take: 60,
        select: { id: true, codigo: true, nome: true, precoVenda: true, controlaEstoque: true, unidadeMedida: { select: { sigla: true } }, categoria: { select: { nome: true } }, saldosEstoque: { select: { quantidade: true } } },
      })
      return produtos.map(({ unidadeMedida, categoria, saldosEstoque, ...p }) => ({
        ...p,
        unidade: unidadeMedida?.sigla ?? null,
        categoria: categoria?.nome ?? null,
        saldo: p.controlaEstoque ? saldosEstoque.reduce((s, x) => s.plus(x.quantidade.toString()), new Decimal(0)).toFixed(3) : null,
      }))
    },

    /**
     * Venda (seção 9: exige caixa aberto), numa transação: itens pelo preço do cadastro, baixa de estoque,
     * entrada no financeiro por forma (dinheiro na conta do caixa, demais na conta da forma), taxa de cartão e gaveta.
     */
    async vender(d: z.output<typeof vendaPdvSchema>, usuarioId: string) {
      const sessao = await sessoes.exigirAberta(usuarioId)
      // Com a composição/ficha: custo da venda e baixa dos materiais (fase 3 da precificação)
      const produtos = await prisma.produto.findMany({ where: { id: { in: d.itens.map((i) => i.produtoId) }, ativo: true }, include: incluirComposicao })
      const parametros = parametrosPreco(await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } }))
      const formas = await prisma.formaPagamento.findMany({ where: { id: { in: d.pagamentos.map((p) => p.formaPagamentoId) }, ativo: true } })
      const itens = d.itens.map((i) => {
        const p = produtos.find((x) => x.id === i.produtoId)
        if (!p) throw AppError.regraNegocio('Produto inválido ou inativo na venda.')
        // Vendido por peça: as medidas padrão do produto valem para materiais por m²/metro
        const medidas = { quantidade: i.quantidade, largura: p.larguraPadrao?.toString(), altura: p.alturaPadrao?.toString() }
        return { produto: p, quantidade: i.quantidade, precoUnitario: p.precoVenda.toFixed(2), medidas, custo: custoDoItemVendido(p, [], medidas, parametros).custoDireto }
      })
      const pagamentos = d.pagamentos.map((p) => {
        const forma = formas.find((f) => f.id === p.formaPagamentoId)
        if (!forma) throw AppError.regraNegocio('Forma de pagamento inválida.')
        return { forma, valor: new Decimal(p.valor), dinheiro: forma.tipo === 'dinheiro' }
      })
      const calc = calcularVendaPdv(itens, d.desconto, pagamentos.map((p) => ({ valor: p.valor.toFixed(2), dinheiro: p.dinheiro })))
      if (!calc.ok) throw AppError.regraNegocio(calc.erro)

      const alertas: (AlertaEstoque | null)[] = []
      const id = await prisma.$transaction(async (tx) => {
        const numero = await proximoNumero(tx, 'venda')
        const venda = await tx.vendaPdv.create({
          data: {
            numero,
            sessaoId: sessao.id,
            clienteId: d.clienteId ?? null,
            usuarioId,
            subtotal: calc.subtotal,
            desconto: calc.desconto,
            total: calc.total,
            valorRecebido: calc.recebido,
            troco: calc.troco,
            itens: {
              create: itens.map((i) => ({
                produtoId: i.produto.id,
                descricao: i.produto.nome,
                quantidade: i.quantidade,
                precoUnitario: i.precoUnitario,
                total: new Decimal(i.quantidade).mul(i.precoUnitario).toDecimalPlaces(2).toFixed(2),
                custo: i.custo,
              })),
            },
          },
        })
        const local = await localPadrao(tx)
        // Produto com materiais (composição ou ficha): baixa os materiais; senão, se controla estoque, ele mesmo
        for (const i of itens) {
          const baixas = i.produto.insumos.length
            ? i.produto.insumos
                .filter((m) => m.insumo.controlaEstoque)
                .map((m) => ({
                  produtoId: m.insumoId,
                  quantidade: consumoDeInsumo({ base: m.base, quantidade: m.quantidade.toString(), perdaPercentual: m.perdaPercentual.toString() }, i.medidas),
                  material: true,
                }))
            : i.produto.controlaEstoque
              ? [{ produtoId: i.produto.id, quantidade: new Decimal(i.quantidade).toFixed(3), material: false }]
              : []
          for (const b of baixas) {
            if (new Decimal(b.quantidade).isZero()) continue
            if (!local) throw AppError.regraNegocio('Cadastre um local de estoque padrão.')
            const r = await movimentar(tx, {
              tipo: 'venda_pdv',
              produtoId: b.produtoId,
              localId: local.id,
              quantidade: new Decimal(b.quantidade).neg(),
              motivo: b.material ? `Venda ${numero} (material de ${i.produto.nome})` : `Venda ${numero}`,
              vendaPdvId: venda.id,
              usuarioId,
              // O material já foi usado: como na produção, o saldo pode ficar negativo
              permitirNegativo: b.material,
            })
            alertas.push(r.alerta)
          }
        }
        // O troco sai do pagamento em dinheiro: entra no financeiro só o valor líquido
        let troco = new Decimal(calc.troco)
        const categoriaId = await categoriaPorCodigo(tx, 'vendas_balcao')
        for (const p of pagamentos) {
          const abate = p.dinheiro ? Decimal.min(troco, p.valor) : new Decimal(0)
          troco = troco.minus(abate)
          const liquido = p.valor.minus(abate)
          if (liquido.lte(0)) continue
          const contaId = p.dinheiro ? sessao.contaFinanceiraId : (p.forma.contaFinanceiraId ?? sessao.contaFinanceiraId)
          const mov = await tx.movimentoFinanceiro.create({
            data: { tipo: 'entrada', valor: liquido.toFixed(2), data: dataBanco(hojeISO()), descricao: `Venda ${numero}`, contaFinanceiraId: contaId, categoriaId, formaPagamentoId: p.forma.id, caixaSessaoId: sessao.id, vendaPdvId: venda.id, usuarioId },
          })
          await registrarTaxa(tx, mov.id, p.forma, liquido.toFixed(2), contaId, hojeISO(), `Venda ${numero}`, usuarioId)
          await tx.caixaMovimento.create({ data: { sessaoId: sessao.id, tipo: 'venda', formaPagamentoId: p.forma.id, valor: liquido.toFixed(2), vendaPdvId: venda.id, movimentoFinanceiroId: mov.id, usuarioId } })
        }
        return venda.id
      })
      avisarAlertas(app, alertas)
      return obter(id)
    },

    /** Cancela a venda enquanto o caixa está aberto: estorna financeiro, gaveta e estoque. */
    async cancelar(id: string, motivo: string, usuarioId: string) {
      const venda = await prisma.vendaPdv.findUnique({ where: { id }, include: { sessao: true, itens: true, movimentos: { where: { estornoDeId: null, baixaDeId: null } }, caixaMovimentos: true } })
      if (!venda) throw AppError.naoEncontrado('Venda não encontrada.')
      if (venda.status === 'cancelada') throw AppError.regraNegocio('Esta venda já foi cancelada.')
      if (venda.sessao.status !== 'aberta') throw AppError.regraNegocio('Só dá para cancelar vendas de um caixa aberto.')
      await prisma.$transaction(async (tx) => {
        for (const m of venda.movimentos) await estornarMovimento(tx, m.id, `cancelamento da venda ${venda.numero}`, usuarioId)
        for (const c of venda.caixaMovimentos.filter((x) => x.tipo === 'venda')) {
          await tx.caixaMovimento.create({ data: { sessaoId: venda.sessaoId, tipo: 'estorno', formaPagamentoId: c.formaPagamentoId, valor: c.valor.neg(), motivo: `Cancelamento ${venda.numero}: ${motivo}`, vendaPdvId: venda.id, usuarioId } })
        }
        const local = await localPadrao(tx)
        const devolver = await tx.estoqueMovimentacao.findMany({ where: { vendaPdvId: venda.id, tipo: 'venda_pdv' } })
        for (const m of devolver) {
          await movimentar(tx, { tipo: 'venda_pdv', produtoId: m.produtoId, localId: local?.id ?? m.localId, quantidade: new Decimal(m.quantidade.toString()).neg(), motivo: `Cancelamento da venda ${venda.numero}`, vendaPdvId: venda.id, usuarioId, verificarAlerta: false })
        }
        await tx.vendaPdv.update({ where: { id }, data: { status: 'cancelada', motivoCancelamento: motivo, canceladaEm: new Date() } })
        await registrarAuditoria(tx, { tabela: 'vendas_pdv', registroId: id, acao: 'cancelar', depois: { motivo }, usuarioId })
      })
      return obter(id)
    },

    async listar(q: z.output<typeof vendasPdvQuerySchema>, usuarioId: string, veTodos: boolean) {
      const where: Prisma.VendaPdvWhereInput = {
        ...(q.sessaoId ? { sessaoId: q.sessaoId } : {}),
        ...(veTodos ? {} : { usuarioId }),
        ...(q.de || q.ate ? { createdAt: { ...(q.de ? { gte: new Date(`${q.de}T00:00:00-03:00`) } : {}), ...(q.ate ? { lte: new Date(`${q.ate}T23:59:59.999-03:00`) } : {}) } } : {}),
        ...(q.busca ? { OR: [{ numero: { contains: q.busca, mode: 'insensitive' } }, { cliente: { nome: { contains: q.busca, mode: 'insensitive' } } }] } : {}),
      }
      const pag = paginacao(q, ['createdAt', 'total'] as const, { campo: 'createdAt', direcao: 'desc' })
      const [total, data] = await prisma.$transaction([prisma.vendaPdv.count({ where }), prisma.vendaPdv.findMany({ where, ...pag, include: incluirVenda })])
      return paginado(data.map(formatarVenda), total, q)
    },

    /** Títulos a receber em aberto para receber no balcão (busca por cliente ou pedido). */
    async titulosAbertos(busca?: string) {
      const texto = busca ? { contains: busca, mode: 'insensitive' as const } : undefined
      const titulos = await prisma.contaReceber.findMany({
        where: { status: { in: ['aberto', 'parcial', 'vencido'] }, ...(texto ? { OR: [{ cliente: { nome: texto } }, { pedido: { numero: texto } }, { descricao: texto }] } : {}) },
        orderBy: { vencimento: 'asc' },
        take: 20,
        select: { id: true, descricao: true, valor: true, valorPago: true, vencimento: true, status: true, cliente: ref, pedido: { select: { id: true, numero: true } } },
      })
      return titulos.map((t) => ({ ...t, saldo: new Decimal(t.valor.toString()).minus(t.valorPago.toString()).toFixed(2) }))
    },

    /** Recebimento de título no caixa: baixa no financeiro + entrada na gaveta. */
    async receber(d: z.output<typeof recebimentoCaixaSchema>, usuarioId: string) {
      const sessao = await sessoes.exigirAberta(usuarioId)
      const forma = await prisma.formaPagamento.findUnique({ where: { id: d.formaPagamentoId } })
      if (!forma?.ativo) throw AppError.regraNegocio('Forma de pagamento inválida.')
      const efeitos = await prisma.$transaction(async (tx) => {
        const r = await baixarTitulo(tx, {
          tipo: 'receber',
          tituloId: d.contaReceberId,
          valorRecebido: d.valorRecebido,
          juros: d.juros,
          multa: d.multa,
          desconto: d.desconto,
          data: hojeISO(),
          formaPagamentoId: forma.id,
          contaFinanceiraId: forma.tipo === 'dinheiro' ? sessao.contaFinanceiraId : null,
          contaPadrao: sessao.contaFinanceiraId,
          caixaSessaoId: sessao.id,
          usuarioId,
        })
        await tx.caixaMovimento.create({ data: { sessaoId: sessao.id, tipo: 'recebimento', formaPagamentoId: forma.id, valor: d.valorRecebido, contaReceberId: d.contaReceberId, movimentoFinanceiroId: r.movimentoId, usuarioId } })
        return r.efeitos
      })
      if (efeitos.pedidoId) app.tempoReal.emitir('pedidos', 'pedido:atualizado', { id: efeitos.pedidoId })
      for (const u of efeitos.comissaoLiberadaPara) app.tempoReal.emitir(`usuario:${u}`, 'notificacao:nova', { titulo: 'Comissão liberada' })
      return sessoes.detalhe(sessao.id)
    },
  }
}
