import type { FastifyInstance } from 'fastify'
import { adicionarDias, diaDaSemana, hojeISO, type PcpResumo } from '@onprint/shared'
import { formatarOp, incluirOp } from './consultas'

/** Capacidade padrão: 8 h por dia útil (segunda a sexta) por máquina ativa. */
export const HORAS_POR_DIA = 8
export const DIAS_UTEIS_SEMANA = 5

const ORDEM_PRIORIDADE = { urgente: 0, alta: 1, normal: 2, baixa: 3 } as const

/** Segunda e domingo da semana de uma data. */
export function semanaDe(iso: string) {
  const dia = diaDaSemana(iso)
  const inicio = adicionarDias(iso, dia === 0 ? -6 : 1 - dia)
  return { inicio, fim: adicionarDias(inicio, 6) }
}

/**
 * PCP / Cockpit: carga por máquina (fila e horas estimadas), capacidade × demanda da semana,
 * gargalos (demanda acima da capacidade), atrasos e a lista das OPs ativas para o Gantt.
 */
export function criarPcpService(app: FastifyInstance) {
  return {
    async resumo(): Promise<PcpResumo> {
      const hoje = hojeISO()
      const semana = semanaDe(hoje)
      const [maquinas, ativas] = await Promise.all([
        app.prisma.maquina.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } }),
        app.prisma.ordemProducao.findMany({ where: { cancelada: false, etapaAtual: { not: 'concluido' } }, include: incluirOp }),
      ])
      const ops = ativas
        .map((op) => formatarOp(op, (id) => app.storage.gerarUrlTemporaria(id, 3600), hoje))
        .sort(
          (a, b) =>
            ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade] ||
            (a.dataFimPrevista?.getTime() ?? Infinity) - (b.dataFimPrevista?.getTime() ?? Infinity),
        )
      const venceNaSemana = (d: Date | null) => !d || d.toISOString().slice(0, 10) <= semana.fim
      const horas = (lista: typeof ops) => Math.round(lista.reduce((s, o) => s + Number(o.horasEstimadas), 0) * 100) / 100

      const porMaquina = maquinas.map((m) => {
        const daMaquina = ops.filter((o) => o.maquinaId === m.id)
        const capacidadeSemana = m.status === 'ativa' ? HORAS_POR_DIA * DIAS_UTEIS_SEMANA : 0
        const horasSemana = horas(daMaquina.filter((o) => venceNaSemana(o.dataFimPrevista)))
        return {
          maquina: { id: m.id, nome: m.nome, status: m.status, velocidadeM2Hora: m.velocidadeM2Hora?.toString() ?? null },
          opsNaFila: daMaquina.length,
          horasEstimadas: horas(daMaquina),
          horasSemana,
          capacidadeSemana,
          ocupacao: capacidadeSemana > 0 ? Math.round((horasSemana / capacidadeSemana) * 1000) / 10 : horasSemana > 0 ? 999 : 0,
        }
      })
      const semMaquina = ops.filter((o) => !o.maquinaId)

      return {
        semana,
        maquinas: porMaquina,
        semMaquina: { opsNaFila: semMaquina.length, horasEstimadas: horas(semMaquina) },
        gargalos: porMaquina.filter((m) => m.ocupacao > 100).map((m) => m.maquina.nome),
        atrasadas: ops.filter((o) => o.atrasada) as unknown as PcpResumo['atrasadas'],
        ops: ops as unknown as PcpResumo['ops'],
      }
    },
  }
}
