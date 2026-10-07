import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { MODULOS, MODULOS_ESSENCIAIS, MODULO_ROTULOS, hojeISO, type MinhaAssinatura, type SituacaoAssinatura } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { diaISO, resumirAssinatura } from '../../plataforma/assinaturas'

/** Assinatura da própria empresa: funciona mesmo com o sistema bloqueado (é por aqui que se regulariza). */
export const assinaturaRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/assinatura',
    { onRequest: [app.autenticar], config: { assinaturaLivre: true }, schema: { tags: ['assinatura'], summary: 'Plano, situação, módulos e planos disponíveis' } },
    async (): Promise<MinhaAssinatura> => {
      const empresa = contextoEmpresa.exigir()
      // Lê direto do banco da plataforma (sem cache): a tela mostra a situação de agora
      const [a, planos, usuariosAtivos] = await Promise.all([
        app.plataforma.assinatura.findUnique({ where: { assinanteId: empresa.id }, include: { plano: true } }),
        app.plataforma.plano.findMany({ where: { ativo: true, publico: true }, orderBy: { ordem: 'asc' } }),
        app.prisma.usuario.count({ where: { ativo: true } }),
      ])
      if (!a) throw AppError.naoEncontrado('Esta empresa ainda não tem assinatura.')
      const resumo = resumirAssinatura(a, hojeISO())
      return {
        situacao: a.situacao as SituacaoAssinatura,
        plano: {
          codigo: a.plano.codigo,
          nome: a.plano.nome,
          descricao: a.plano.descricao,
          valorMensal: a.plano.valorMensal.toFixed(2),
          limiteUsuarios: a.plano.limiteUsuarios,
          diasAteSomenteLeitura: a.plano.diasAteSomenteLeitura,
          diasAteBloqueio: a.plano.diasAteBloqueio,
        },
        acesso: resumo.acesso,
        testeAte: diaISO(a.testeAte),
        proximoVencimento: diaISO(a.proximoVencimento),
        atrasoDesde: diaISO(a.atrasoDesde),
        liberadoAte: diaISO(a.liberadoAte),
        usuariosAtivos,
        modulos: MODULOS.filter((m) => !MODULOS_ESSENCIAIS.includes(m)).map((m) => ({
          codigo: m,
          rotulo: MODULO_ROTULOS[m],
          incluido: resumo.modulos.includes(m),
          planos: planos.filter((p) => p.modulos.includes(m)).map((p) => p.nome),
        })),
        planos: planos.map((p) => ({
          codigo: p.codigo,
          nome: p.nome,
          descricao: p.descricao,
          valorMensal: p.valorMensal.toFixed(2),
          limiteUsuarios: p.limiteUsuarios,
          atual: p.id === a.planoId,
        })),
        suporte: app.config.SUPORTE_CONTATO,
      }
    },
  )
}
