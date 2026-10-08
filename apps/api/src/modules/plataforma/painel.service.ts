import type { FastifyInstance } from 'fastify'
import {
  categoriaEmpresa,
  formatarDataSimples,
  formatarMoeda,
  hojeISO,
  resumirIndicadores,
  type GravidadeProblema,
  type PainelPlataforma,
  type ProblemaPlataforma,
  type SituacaoAssinatura,
} from '@onprint/shared'
import { diaISO, paraDia, resumirAssinatura } from '../../plataforma/assinaturas'
import { valoresCobrados } from './empresas.service'

const ORDEM: Record<GravidadeProblema, number> = { alta: 0, media: 1, baixa: 2 }
const DIAS_30 = 30 * 86_400_000

/** Indicadores e lista de problemas do painel da plataforma. */
export function criarPainelService(app: FastifyInstance) {
  const { plataforma } = app

  return {
    async obter(): Promise<PainelPlataforma> {
      const hoje = hojeISO()
      const desde30 = new Date(Date.now() - DIAS_30)
      const inicioMes = new Date(`${hoje.slice(0, 7)}-01T00:00:00-03:00`)
      const [empresas, recebido, emAtraso, falhas, notasComErro, avisosComErro, novas, conversoes] = await Promise.all([
        plataforma.assinante.findMany({ where: { ativo: true }, include: { assinatura: { include: { plano: true } } } }),
        plataforma.cobranca.aggregate({ _sum: { valor: true }, where: { situacao: 'paga', pagoEm: { gte: inicioMes } } }),
        plataforma.cobranca.aggregate({ _sum: { valor: true }, where: { situacao: { in: ['pendente', 'vencida'] }, OR: [{ vencimento: { lt: paraDia(hoje) } }, { vencimentoOriginal: { lt: paraDia(hoje) } }] } }),
        plataforma.cobranca.findMany({ where: { situacao: { in: ['pendente', 'vencida'] }, falha: { not: null } }, include: { assinante: true }, orderBy: { updatedAt: 'desc' }, take: 50 }),
        plataforma.cobranca.findMany({ where: { nfSituacao: 'erro' }, include: { assinante: true }, orderBy: { updatedAt: 'desc' }, take: 50 }),
        plataforma.eventoGateway.findMany({ where: { processadoEm: null, erro: { not: null }, recebidoEm: { gte: desde30 } }, orderBy: { recebidoEm: 'desc' }, take: 50 }),
        plataforma.assinante.count({ where: { createdAt: { gte: desde30 } } }),
        plataforma.eventoAssinatura.count({ where: { tipo: 'ativacao', createdAt: { gte: desde30 } } }),
      ])

      const problemas: ProblemaPlataforma[] = []
      const indicadores = []
      const cobrado = await valoresCobrados(plataforma, hoje)
      for (const e of empresas) {
        if (!e.assinatura) continue
        const { acesso } = resumirAssinatura(e.assinatura, hoje)
        const situacao = e.assinatura.situacao as SituacaoAssinatura
        indicadores.push({ situacao, acesso, valorMensal: e.assinatura.plano.valorMensal.toFixed(2), valorCobrado: cobrado(e.assinatura) })
        const empresa = { id: e.id, nome: e.nome, slug: e.slug }
        const categoria = categoriaEmpresa(situacao, acesso)
        const data = (diaISO(e.assinatura.atrasoDesde) ?? diaISO(e.assinatura.testeAte) ?? e.assinatura.updatedAt.toISOString()) as string
        if (categoria === 'bloqueada') problemas.push({ tipo: 'bloqueada', gravidade: 'alta', empresa, descricao: acesso.mensagem, data })
        else if (categoria === 'somente_leitura') problemas.push({ tipo: 'somente_leitura', gravidade: 'alta', empresa, descricao: acesso.mensagem, data })
        else if (categoria === 'aviso') problemas.push({ tipo: 'cobranca_vencida', gravidade: 'media', empresa, descricao: acesso.mensagem, data })
        else if (acesso.motivo === 'cortesia' && acesso.nivel === 'aviso') {
          problemas.push({ tipo: 'teste_acabando', gravidade: 'baixa', empresa, descricao: acesso.mensagem, data: (diaISO(e.assinatura.cortesiaAte) ?? data) as string })
        } else if (acesso.motivo === 'teste_acabando' && !e.assinatura.gatewayAssinaturaId) {
          problemas.push({ tipo: 'teste_acabando', gravidade: 'baixa', empresa, descricao: `${acesso.mensagem} Ainda não assinou.`, data })
        }
        if (e.assinatura.cancelarEm) {
          problemas.push({ tipo: 'cancelamento', gravidade: 'baixa', empresa, descricao: `Cancelamento agendado: acesso até ${formatarDataSimples(diaISO(e.assinatura.cancelarEm))}`, data: e.assinatura.updatedAt.toISOString() })
        }
      }
      for (const c of falhas) {
        problemas.push({ tipo: 'falha_cartao', gravidade: 'media', empresa: { id: c.assinante.id, nome: c.assinante.nome, slug: c.assinante.slug }, descricao: `${c.falha} na mensalidade de ${formatarMoeda(c.valor.toFixed(2))}`, data: c.updatedAt.toISOString() })
      }
      for (const c of notasComErro) {
        problemas.push({ tipo: 'nota_fiscal', gravidade: 'media', empresa: { id: c.assinante.id, nome: c.assinante.nome, slug: c.assinante.slug }, descricao: `Nota fiscal com erro: ${c.nfErro ?? 'sem detalhe'}`, data: c.updatedAt.toISOString() })
      }
      for (const ev of avisosComErro) {
        problemas.push({ tipo: 'aviso_gateway', gravidade: 'media', empresa: null, descricao: `Aviso do Asaas ${ev.tipo} não aplicado: ${ev.erro}`, data: ev.recebidoEm.toISOString(), eventoId: ev.id })
      }
      problemas.sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade] || b.data.localeCompare(a.data))

      return {
        indicadores: resumirIndicadores(indicadores),
        recebidoNoMes: (recebido._sum.valor?.toFixed(2) ?? '0.00'),
        emAtraso: (emAtraso._sum.valor?.toFixed(2) ?? '0.00'),
        novasEmpresas30Dias: novas,
        conversoes30Dias: conversoes,
        problemas,
        pagamentoOnline: Boolean(app.pagamentos),
      }
    },
  }
}
