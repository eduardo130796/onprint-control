import type { Prisma } from '@prisma/client'
import { Decimal, hojeISO } from '@onprint/shared'
import { proximoNumero } from '../../core/numeracao'

/** Horas estimadas: área ÷ velocidade da máquina; sem isso, a soma dos tempos padrão dos processos. */
export function estimarHoras(areaM2: string, velocidadeM2Hora: string | null | undefined, minutosProcessos: number): string {
  const area = new Decimal(areaM2 || 0)
  const velocidade = new Decimal(velocidadeM2Hora || 0)
  if (area.gt(0) && velocidade.gt(0)) return area.div(velocidade).toDecimalPlaces(2).toFixed(2)
  return new Decimal(minutosProcessos).div(60).toDecimalPlaces(2).toFixed(2)
}

const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)

/**
 * Cria uma OP por item do pedido que ainda não tem OP ativa (fila do kanban).
 * A máquina vem do roteiro do produto (primeira etapa com máquina) ou da máquina padrão do processo.
 */
export async function gerarOpsDoPedido(tx: Prisma.TransactionClient, pedidoId: string, usuarioId: string | null): Promise<string[]> {
  const pedido = await tx.pedido.findUniqueOrThrow({
    where: { id: pedidoId },
    include: {
      itens: {
        orderBy: { ordem: 'asc' },
        include: {
          ordensProducao: { where: { cancelada: false }, select: { id: true } },
          produto: {
            select: {
              processos: {
                orderBy: { ordem: 'asc' },
                select: { maquina: true, processo: { select: { tempoPadraoMinutos: true, maquinaPadrao: true } } },
              },
            },
          },
        },
      },
    },
  })
  const ultima = await tx.ordemProducao.aggregate({ where: { etapaAtual: 'fila' }, _max: { ordemKanban: true } })
  let ordem = (ultima._max.ordemKanban ?? 0) + 1
  const criadas: string[] = []

  for (const item of pedido.itens) {
    if (item.ordensProducao.length > 0) continue
    const etapas = item.produto.processos
    const maquina = etapas.find((e) => e.maquina)?.maquina ?? etapas.find((e) => e.processo.maquinaPadrao)?.processo.maquinaPadrao ?? null
    const minutos = etapas.reduce((s, e) => s + (e.processo.tempoPadraoMinutos ?? 0), 0)
    const op = await tx.ordemProducao.create({
      data: {
        numero: await proximoNumero(tx, 'op'),
        pedidoId,
        pedidoItemId: item.id,
        quantidade: item.quantidade,
        largura: item.largura,
        altura: item.altura,
        areaM2: item.areaM2,
        maquinaId: maquina?.id ?? null,
        prioridade: pedido.prioridade,
        horasEstimadas: estimarHoras(item.areaM2.toString(), maquina?.velocidadeM2Hora?.toString(), minutos),
        dataInicioPrevista: dataBanco(hojeISO()),
        dataFimPrevista: pedido.dataPrevistaEntrega,
        ordemKanban: ordem++,
        createdBy: usuarioId,
        historico: { create: { etapaDe: null, etapaPara: 'fila', usuarioId } },
      },
    })
    criadas.push(op.id)
  }
  return criadas
}
