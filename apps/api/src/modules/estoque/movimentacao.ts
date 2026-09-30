import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { Decimal, custoMedioAposEntrada, type TipoMovimentacao } from '@onprint/shared'
import { AppError } from '../../core/AppError'

type Tx = Prisma.TransactionClient

export interface NovaMovimentacao {
  tipo: TipoMovimentacao
  produtoId: string
  localId: string
  /** Com sinal: positiva entra, negativa sai */
  quantidade: Decimal
  /** Entrada de nota ou perna de destino da transferência: custo que recalcula o custo médio do local */
  custoEntrada?: string
  motivo?: string | null
  opId?: string | null
  pedidoId?: string | null
  fornecedorId?: string | null
  entradaId?: string | null
  transferenciaId?: string | null
  vendaPdvId?: string | null
  usuarioId: string | null
  /** Consumo da produção pode deixar o saldo negativo (o material já foi usado) */
  permitirNegativo?: boolean
  /** Transferências não mudam o total: não geram alerta */
  verificarAlerta?: boolean
}

/** Produto que caiu para o mínimo nesta transação (notificações já gravadas; falta o aviso em tempo real). */
export interface AlertaEstoque {
  produtoId: string
  usuarios: string[]
}

async function saldoTravado(tx: Tx, produtoId: string, localId: string) {
  // Cria a linha se não existir e trava até o commit: movimentações simultâneas ficam em fila
  await tx.$executeRaw`
    INSERT INTO estoque_saldos (produto_id, local_id, quantidade, custo_medio, updated_at)
    VALUES (${produtoId}::uuid, ${localId}::uuid, 0, 0, now())
    ON CONFLICT (produto_id, local_id) DO NOTHING`
  const [linha] = await tx.$queryRaw<{ id: string; quantidade: Prisma.Decimal; custo_medio: Prisma.Decimal }[]>`
    SELECT id, quantidade, custo_medio FROM estoque_saldos
    WHERE produto_id = ${produtoId}::uuid AND local_id = ${localId}::uuid
    FOR UPDATE`
  if (!linha) throw new Error('Saldo de estoque não encontrado.')
  return { id: linha.id, quantidade: new Decimal(linha.quantidade.toString()), custoMedio: new Decimal(linha.custo_medio.toString()) }
}

async function totalDoProduto(tx: Tx, produtoId: string) {
  const r = await tx.estoqueSaldo.aggregate({ where: { produtoId }, _sum: { quantidade: true } })
  return new Decimal(r._sum.quantidade?.toString() ?? 0)
}

/** Usuários ativos que movimentam estoque (recebem o alerta de estoque baixo). */
export async function usuariosDoEstoque(tx: Tx | FastifyInstance['prisma']) {
  const usuarios = await tx.usuario.findMany({
    where: { ativo: true, papel: { permissoes: { some: { permissao: { modulo: 'estoque', acao: 'editar' } } } } },
    select: { id: true },
  })
  return usuarios.map((u) => u.id)
}

/**
 * Única porta de alteração de saldo (seção 9): grava a movimentação com o saldo resultante,
 * atualiza saldo e custo médio do local e, se o total do produto cruzou o mínimo, notifica.
 * Precisa rodar dentro de prisma.$transaction.
 */
export async function movimentar(tx: Tx, m: NovaMovimentacao): Promise<{ id: string; alerta: AlertaEstoque | null }> {
  if (m.quantidade.isZero()) throw AppError.regraNegocio('A movimentação não altera o saldo.')
  const produto = await tx.produto.findUnique({ where: { id: m.produtoId }, select: { nome: true, controlaEstoque: true, estoqueMinimo: true, unidadeMedida: { select: { sigla: true } } } })
  if (!produto) throw AppError.naoEncontrado('Produto não encontrado.')
  if (!produto.controlaEstoque) throw AppError.regraNegocio(`${produto.nome} não controla estoque (veja a aba Estoque do produto).`)
  const local = await tx.estoqueLocal.findUnique({ where: { id: m.localId }, select: { nome: true, ativo: true } })
  if (!local?.ativo) throw AppError.regraNegocio('Local de estoque inválido ou desativado.')

  const saldo = await saldoTravado(tx, m.produtoId, m.localId)
  const totalAntes = await totalDoProduto(tx, m.produtoId)
  const novoSaldo = saldo.quantidade.plus(m.quantidade)
  if (novoSaldo.lt(0) && !m.permitirNegativo) {
    const unidade = produto.unidadeMedida?.sigla ?? ''
    throw AppError.regraNegocio(`Saldo insuficiente de ${produto.nome} em ${local.nome}: disponível ${saldo.quantidade.toFixed(3)} ${unidade}.`.trim())
  }

  const ehEntrada = m.custoEntrada !== undefined && m.quantidade.gt(0)
  const custoMedio = ehEntrada ? custoMedioAposEntrada(saldo.quantidade, saldo.custoMedio, m.quantidade, m.custoEntrada!) : saldo.custoMedio.toFixed(4)
  const mov = await tx.estoqueMovimentacao.create({
    data: {
      tipo: m.tipo,
      produtoId: m.produtoId,
      localId: m.localId,
      quantidade: m.quantidade.toFixed(3),
      custoUnitario: ehEntrada ? m.custoEntrada! : saldo.custoMedio.toFixed(4),
      saldoApos: novoSaldo.toFixed(3),
      motivo: m.motivo ?? null,
      opId: m.opId ?? null,
      pedidoId: m.pedidoId ?? null,
      fornecedorId: m.fornecedorId ?? null,
      entradaId: m.entradaId ?? null,
      transferenciaId: m.transferenciaId ?? null,
      vendaPdvId: m.vendaPdvId ?? null,
      usuarioId: m.usuarioId,
    },
  })
  await tx.estoqueSaldo.update({ where: { id: saldo.id }, data: { quantidade: novoSaldo.toFixed(3), custoMedio } })
  // O custo do cadastro acompanha o custo médio das compras (base do custo estimado nos orçamentos)
  if (ehEntrada && m.tipo === 'entrada') await tx.produto.update({ where: { id: m.produtoId }, data: { custo: new Decimal(custoMedio).toDecimalPlaces(2).toFixed(2) } })

  const minimo = new Decimal(produto.estoqueMinimo.toString())
  const totalDepois = totalAntes.plus(m.quantidade)
  const cruzouMinimo = m.verificarAlerta !== false && m.quantidade.lt(0) && totalAntes.gt(minimo) && totalDepois.lte(minimo)
  if (!cruzouMinimo) return { id: mov.id, alerta: null }

  const usuarios = await usuariosDoEstoque(tx)
  const unidade = produto.unidadeMedida?.sigla ?? ''
  await tx.notificacao.createMany({
    data: usuarios.map((usuarioId) => ({
      usuarioId,
      titulo: `Estoque baixo: ${produto.nome}`,
      mensagem: `Saldo ${[totalDepois.toFixed(3), unidade].join(' ').trim()} (mínimo ${minimo.toFixed(3)}).`,
      link: '/estoque/alertas',
    })),
  })
  return { id: mov.id, alerta: { produtoId: m.produtoId, usuarios } }
}

/** Avisa em tempo real quem recebeu alerta (chamar depois do commit). */
export function avisarAlertas(app: FastifyInstance, alertas: (AlertaEstoque | null)[], titulo = 'Estoque baixo') {
  const usuarios = new Set(alertas.flatMap((a) => a?.usuarios ?? []))
  if (usuarios.size === 0) return
  app.tempoReal.emitir([...usuarios].map((u) => `usuario:${u}`), 'notificacao:nova', { titulo, estoque: true })
}
