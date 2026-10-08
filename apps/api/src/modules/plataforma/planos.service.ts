import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { EventoGatewayResumo, PlanoInput, PlanoPlataforma, planoSchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { aplicarEventoAsaas } from '../../plataforma/cobrancas'

type DadosPlano = z.output<typeof planoSchema>

/** Planos (preço, módulos, limites e prazos) e avisos do gateway, no painel da plataforma. */
export function criarPlanosService(app: FastifyInstance) {
  const { plataforma } = app

  return {
    async listar(): Promise<PlanoPlataforma[]> {
      const planos = await plataforma.plano.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], include: { _count: { select: { assinaturas: true } } } })
      return planos.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nome: p.nome,
        descricao: p.descricao,
        valorMensal: p.valorMensal.toFixed(2),
        modulos: p.modulos,
        limiteUsuarios: p.limiteUsuarios,
        diasTeste: p.diasTeste,
        diasAteSomenteLeitura: p.diasAteSomenteLeitura,
        diasAteBloqueio: p.diasAteBloqueio,
        publico: p.publico,
        ativo: p.ativo,
        ordem: p.ordem,
        assinaturas: p._count.assinaturas,
      }))
    },

    /**
     * Preço novo vale para quem assinar ou trocar de plano depois; as assinaturas que já existem
     * mantêm o valor combinado no gateway (mudança de preço de quem já paga é decisão caso a caso).
     */
    async salvar(id: string | null, dados: DadosPlano | PlanoInput) {
      const d = dados as DadosPlano
      try {
        const plano = id ? await plataforma.plano.update({ where: { id }, data: d }) : await plataforma.plano.create({ data: d })
        app.empresas.esquecer()
        return plano
      } catch (erro) {
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') throw AppError.conflito('Já existe um plano com este código.')
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2025') throw AppError.naoEncontrado('Plano não encontrado.')
        throw erro
      }
    },

    async eventosGateway(soComErro: boolean): Promise<EventoGatewayResumo[]> {
      const eventos = await plataforma.eventoGateway.findMany({
        where: soComErro ? { processadoEm: null, erro: { not: null } } : {},
        orderBy: { recebidoEm: 'desc' },
        take: 100,
      })
      return eventos.map((e) => ({ id: e.id, eventoId: e.eventoId, tipo: e.tipo, recebidoEm: e.recebidoEm.toISOString(), processadoEm: e.processadoEm?.toISOString() ?? null, erro: e.erro }))
    },

    /** Aplica de novo um aviso guardado (ex.: chegou antes de a assinatura existir no sistema). */
    async reprocessar(id: string) {
      const evento = await plataforma.eventoGateway.findUnique({ where: { id } })
      if (!evento) throw AppError.naoEncontrado('Aviso não encontrado.')
      if (evento.processadoEm) throw AppError.regraNegocio('Este aviso já foi aplicado.')
      try {
        await aplicarEventoAsaas(app, evento.tipo, evento.payload as Parameters<typeof aplicarEventoAsaas>[2])
      } catch (erro) {
        await plataforma.eventoGateway.update({ where: { id }, data: { erro: (erro as Error).message.slice(0, 1000) } })
        throw AppError.regraNegocio(`Ainda não deu para aplicar: ${(erro as Error).message}`)
      }
      await plataforma.eventoGateway.update({ where: { id }, data: { processadoEm: new Date(), erro: null } })
    },
  }
}
