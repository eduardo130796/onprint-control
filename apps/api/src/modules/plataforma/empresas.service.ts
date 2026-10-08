import { randomBytes } from 'node:crypto'
import type { Assinante, Assinatura, Cobranca, Cupom, CupomUso, Plano, PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import {
  categoriaEmpresa,
  formatarDataSimples,
  formatarMoeda,
  hojeISO,
  valorDaMensalidade,
  type AcaoAssinatura,
  type EmpresaPlataformaDetalhe,
  type EmpresaPlataformaResumo,
  type EmpresasPlataformaQuery,
  type novaEmpresaSchema,
  type SituacaoAssinatura,
  type TipoCupom,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { ErroGateway } from '../../integrations/pagamentos'
import { diaISO, resumirAssinatura } from '../../plataforma/assinaturas'
import { cupomEmVigor, resumoCupom } from '../../plataforma/beneficios'
import { vencimentoQueConta } from '../../plataforma/cobrancas'
import { executarAcao } from '../../plataforma/operacoes'
import { resumoCobranca } from '../assinatura/service'
import { provisionarEmpresa } from '../../plataforma/provisionar'
import { criarRecuperacaoService } from '../auth/recuperacao.service'

type AssinaturaComPlano = Assinatura & { plano: Plano }
type AssinanteCompleto = Assinante & { assinatura: AssinaturaComPlano | null }
type UsoComCupom = CupomUso & { cupom: Cupom }

/**
 * O que cada empresa paga por mês hoje: plano em vigor (ou o agendado, se já passou), menos o cupom da janela;
 * cortesia em vigor = 0. Carrega planos e cupons de uma vez (para a lista e os indicadores).
 */
export async function valoresCobrados(plataforma: PrismaClient, hoje: string) {
  const [planos, usos] = await Promise.all([plataforma.plano.findMany(), plataforma.cupomUso.findMany({ where: { encerradoEm: null }, include: { cupom: true } })])
  const usoDe = new Map(usos.map((u) => [u.assinanteId, u]))
  return (a: AssinaturaComPlano): string => {
    const cortesiaAte = diaISO(a.cortesiaAte)
    if (a.situacao === 'cortesia' && (!cortesiaAte || cortesiaAte >= hoje)) return '0.00'
    const agendado = a.planoAgendadoId && a.planoAgendadoEm ? planos.find((p) => p.id === a.planoAgendadoId) : null
    const uso = usoDe.get(a.assinanteId)
    return valorDaMensalidade(
      {
        valorPlano: a.plano.valorMensal.toFixed(2),
        agendado: agendado ? { valor: agendado.valorMensal.toFixed(2), em: diaISO(a.planoAgendadoEm) as string } : null,
        desconto: uso ? { tipo: uso.cupom.tipo as TipoCupom, valor: uso.cupom.valor.toFixed(2), desde: diaISO(uso.desde), ate: diaISO(uso.ate) } : null,
      },
      diaISO(a.proximoVencimento) ?? hoje,
    ).valor
  }
}

interface Extras {
  valorCobrado: (a: AssinaturaComPlano) => string
  abertas: Map<string, Pick<Cobranca, 'valor' | 'vencimento' | 'vencimentoOriginal'>[]>
  ultimoPagamento: Map<string, { valor: string; data: string }>
  cupons: Map<string, UsoComCupom>
}

function beneficio(a: AssinaturaComPlano, uso: UsoComCupom | undefined, hoje: string): EmpresaPlataformaResumo['beneficio'] {
  const fimCortesia = diaISO(a.cortesiaAte)
  if (a.situacao === 'cortesia' && (!fimCortesia || fimCortesia >= hoje)) {
    return { tipo: 'cortesia', rotulo: fimCortesia ? `Cortesia até ${formatarDataSimples(fimCortesia)}` : 'Cortesia' }
  }
  if (uso) {
    const r = resumoCupom(uso, a.plano.valorMensal.toFixed(2))
    return { tipo: 'cupom', rotulo: `${uso.cupom.codigo} · −${formatarMoeda(r?.desconto ?? '0')}` }
  }
  const liberado = diaISO(a.liberadoAte)
  if (liberado && liberado >= hoje) return { tipo: 'liberacao', rotulo: `Liberada até ${formatarDataSimples(liberado)}` }
  return null
}

function resumo(e: AssinanteCompleto, hoje: string, x: Extras): EmpresaPlataformaResumo {
  const a = e.assinatura
  const r = a ? resumirAssinatura(a, hoje) : null
  const vencidas = (x.abertas.get(e.id) ?? []).filter((c) => vencimentoQueConta(c) < hoje)
  return {
    id: e.id,
    nome: e.nome,
    slug: e.slug,
    ativa: e.ativo,
    criadaEm: e.createdAt.toISOString(),
    plano: a?.plano.nome ?? null,
    planoCodigo: a?.plano.codigo ?? null,
    valorMensal: a?.plano.valorMensal.toFixed(2) ?? null,
    valorCobrado: a ? x.valorCobrado(a) : null,
    formaPagamento: a?.formaPagamento ?? null,
    situacao: (a?.situacao as SituacaoAssinatura | undefined) ?? null,
    categoria: a && r ? categoriaEmpresa(a.situacao as SituacaoAssinatura, r.acesso) : null,
    nivel: r?.acesso.nivel ?? null,
    mensagem: r?.acesso.mensagem ?? null,
    bloqueioManual: a?.bloqueioManual ?? false,
    diasAtraso: r?.acesso.diasAtraso ?? 0,
    emAtraso: (vencidas.reduce((t, c) => t + Math.round(Number(c.valor) * 100), 0) / 100).toFixed(2),
    ultimoPagamento: x.ultimoPagamento.get(e.id) ?? null,
    proximoVencimento: diaISO(a?.proximoVencimento),
    testeAte: diaISO(a?.testeAte),
    gateway: a?.gatewayAssinaturaId || a?.gatewayAutorizacaoId ? a.gateway : null,
    beneficio: a ? beneficio(a, x.cupons.get(e.id), hoje) : null,
  }
}

/** Empresas assinantes no painel: lista, ficha, criação pelo suporte e ações na assinatura. */
export function criarEmpresasPlataformaService(app: FastifyInstance) {
  const { plataforma } = app
  const incluir = { assinatura: { include: { plano: true } } } as const

  async function carregar(id: string) {
    const e = await plataforma.assinante.findUnique({ where: { id }, include: incluir })
    if (!e) throw AppError.naoEncontrado('Empresa não encontrada.')
    return e
  }

  /** Cobranças em aberto, último pagamento e cupons de todas (ou de uma) empresa, de uma vez. */
  async function extras(hoje: string, assinanteId?: string): Promise<Extras> {
    const filtro = assinanteId ? { assinanteId } : {}
    const [valorCobrado, abertas, pagas, usos] = await Promise.all([
      valoresCobrados(plataforma, hoje),
      plataforma.cobranca.findMany({ where: { ...filtro, situacao: { in: ['pendente', 'vencida'] } }, select: { assinanteId: true, valor: true, vencimento: true, vencimentoOriginal: true } }),
      plataforma.cobranca.findMany({ where: { ...filtro, situacao: 'paga' }, orderBy: { pagoEm: 'desc' }, distinct: ['assinanteId'], select: { assinanteId: true, valor: true, pagoEm: true, updatedAt: true } }),
      plataforma.cupomUso.findMany({ where: { ...filtro, encerradoEm: null }, include: { cupom: true } }),
    ])
    const porEmpresa = new Map<string, typeof abertas>()
    for (const c of abertas) porEmpresa.set(c.assinanteId, [...(porEmpresa.get(c.assinanteId) ?? []), c])
    return {
      valorCobrado,
      abertas: porEmpresa,
      ultimoPagamento: new Map(pagas.map((c) => [c.assinanteId, { valor: c.valor.toFixed(2), data: (c.pagoEm ?? c.updatedAt).toISOString() }])),
      cupons: new Map(usos.map((u) => [u.assinanteId, u])),
    }
  }

  return {
    async listar(q: EmpresasPlataformaQuery): Promise<EmpresaPlataformaResumo[]> {
      const hoje = hojeISO()
      const texto = q.busca?.toLowerCase()
      const [todas, x] = await Promise.all([plataforma.assinante.findMany({ include: incluir, orderBy: { nome: 'asc' } }), extras(hoje)])
      return todas
        .map((e) => resumo(e, hoje, x))
        .filter((e) => !texto || e.nome.toLowerCase().includes(texto) || e.slug.includes(texto))
        .filter((e) => !q.nivel || e.nivel === q.nivel)
        .filter((e) => !q.situacao || e.situacao === q.situacao)
        .filter((e) => !q.categoria || e.categoria === q.categoria)
        .filter((e) => !q.beneficio || (q.beneficio === 'nenhum' ? !e.beneficio : e.beneficio?.tipo === q.beneficio))
        .filter((e) => !q.plano || e.planoCodigo === q.plano)
    },

    async obter(id: string): Promise<EmpresaPlataformaDetalhe> {
      const e = await carregar(id)
      const a = e.assinatura
      const hoje = hojeISO()
      // Usuários ficam no schema da própria empresa
      const banco = app.empresas.clienteDe(e.schema)
      const [cobrancas, eventos, total, ativos, admins, x, uso, agendado] = await Promise.all([
        plataforma.cobranca.findMany({ where: { assinanteId: id }, orderBy: { vencimento: 'desc' }, take: 36 }),
        plataforma.eventoAssinatura.findMany({ where: { assinanteId: id }, orderBy: { createdAt: 'desc' }, take: 80 }),
        banco.usuario.count(),
        banco.usuario.count({ where: { ativo: true } }),
        banco.usuario.findMany({ where: { ativo: true, papel: { codigo: 'admin' } }, select: { nome: true, email: true, ultimoLogin: true }, orderBy: { nome: 'asc' } }),
        extras(hoje, id),
        cupomEmVigor(plataforma, id),
        a?.planoAgendadoId ? plataforma.plano.findUnique({ where: { id: a.planoAgendadoId } }) : null,
      ])
      const r = a ? resumirAssinatura(a, hoje) : null
      return {
        ...resumo(e, hoje, x),
        schema: e.schema,
        email: e.email,
        cnpj: e.cnpj,
        assinatura:
          a && r
            ? {
                planoCodigo: a.plano.codigo,
                atrasoDesde: diaISO(a.atrasoDesde),
                liberadoAte: diaISO(a.liberadoAte),
                cancelarEm: diaISO(a.cancelarEm),
                bloqueioManual: a.bloqueioManual,
                motivoBloqueio: a.motivoBloqueio,
                modulosExtras: a.modulosExtras,
                modulos: r.modulos,
                limiteUsuarios: r.limiteUsuarios,
                formaPagamento: a.formaPagamento,
                gatewayClienteId: a.gatewayClienteId,
                gatewayAssinaturaId: a.gatewayAssinaturaId,
                documentoCobranca: a.documentoCobranca,
                acesso: r.acesso,
                cortesia: a.situacao === 'cortesia' ? { ate: diaISO(a.cortesiaAte), motivo: a.cortesiaMotivo } : null,
                cupom: resumoCupom(uso, a.plano.valorMensal.toFixed(2)),
                planoAgendado: agendado && a.planoAgendadoEm ? { nome: agendado.nome, em: diaISO(a.planoAgendadoEm) as string } : null,
              }
            : null,
        usuarios: { total, ativos, admins: admins.map((u) => ({ ...u, ultimoLogin: u.ultimoLogin?.toISOString() ?? null })) },
        // Para o suporte, o link de pagamento aparece sempre (mesmo em cobrança paga, para conferência)
        cobrancas: cobrancas.map((c) => ({ ...resumoCobranca(c), gateway: c.gateway, linkPagamento: c.linkPagamento })),
        eventos: eventos.map((ev) => ({ id: ev.id, tipo: ev.tipo, descricao: ev.descricao, autor: ev.autor, data: ev.createdAt.toISOString() })),
      }
    },

    /** Criada pelo suporte: sem senha provisória, o dono recebe o convite por e-mail para criar a senha. */
    async criar(dados: z.output<typeof novaEmpresaSchema>) {
      if (!dados.senhaProvisoria && !app.email.configurado) throw AppError.regraNegocio('O envio de e-mails não está configurado: informe uma senha provisória.')
      const assinante = await provisionarEmpresa(
        { plataforma, databaseUrl: app.config.DATABASE_URL, clienteDe: app.empresas.clienteDe },
        {
          nome: dados.nome,
          plano: dados.plano,
          situacao: dados.situacao,
          exemplos: dados.exemplos,
          admin: { nome: dados.responsavel, email: dados.email, senha: dados.senhaProvisoria ?? randomBytes(24).toString('base64url'), deveTrocarSenha: true },
        },
      )
      app.empresas.esquecer()
      let conviteEnviado = false
      if (!dados.senhaProvisoria) {
        const empresa = await app.empresas.porId(assinante.id)
        if (empresa) {
          conviteEnviado = await contextoEmpresa.com(empresa, async () => {
            const admin = await app.prisma.usuario.findFirstOrThrow({ select: { id: true, nome: true, email: true } })
            return criarRecuperacaoService(app).convidar(admin)
          })
        }
      }
      return { id: assinante.id, slug: assinante.slug, conviteEnviado }
    },

    async acao(id: string, acao: AcaoAssinatura, autor: string) {
      await carregar(id)
      try {
        await executarAcao({ plataforma, pagamentos: app.pagamentos }, id, acao, autor)
      } catch (erro) {
        if (erro instanceof ErroGateway) throw AppError.regraNegocio(erro.message)
        // Erros de regra das operações são Error simples (ex.: "Nenhuma cobrança em aberto."); erros do banco seguem como 500
        if (erro instanceof Error && erro.constructor === Error) throw AppError.regraNegocio(erro.message)
        throw erro
      }
      app.empresas.esquecer()
    },
  }
}
