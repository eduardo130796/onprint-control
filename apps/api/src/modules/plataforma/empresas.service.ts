import { randomBytes } from 'node:crypto'
import type { Assinante, Assinatura, Plano } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import {
  categoriaEmpresa,
  hojeISO,
  type AcaoAssinatura,
  type EmpresaPlataformaDetalhe,
  type EmpresaPlataformaResumo,
  type EmpresasPlataformaQuery,
  type novaEmpresaSchema,
  type SituacaoAssinatura,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { ErroGateway } from '../../integrations/pagamentos'
import { diaISO, resumirAssinatura } from '../../plataforma/assinaturas'
import { executarAcao } from '../../plataforma/operacoes'
import { resumoCobranca } from '../assinatura/service'
import { provisionarEmpresa } from '../../plataforma/provisionar'
import { criarRecuperacaoService } from '../auth/recuperacao.service'

type AssinanteCompleto = Assinante & { assinatura: (Assinatura & { plano: Plano }) | null }

function resumo(e: AssinanteCompleto, hoje: string): EmpresaPlataformaResumo {
  const a = e.assinatura
  const r = a ? resumirAssinatura(a, hoje) : null
  return {
    id: e.id,
    nome: e.nome,
    slug: e.slug,
    ativa: e.ativo,
    criadaEm: e.createdAt.toISOString(),
    plano: a?.plano.nome ?? null,
    valorMensal: a?.plano.valorMensal.toFixed(2) ?? null,
    situacao: (a?.situacao as SituacaoAssinatura | undefined) ?? null,
    categoria: a && r ? categoriaEmpresa(a.situacao as SituacaoAssinatura, r.acesso) : null,
    nivel: r?.acesso.nivel ?? null,
    mensagem: r?.acesso.mensagem ?? null,
    proximoVencimento: diaISO(a?.proximoVencimento),
    testeAte: diaISO(a?.testeAte),
    gateway: a?.gatewayAssinaturaId ? a.gateway : null,
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

  return {
    async listar(q: EmpresasPlataformaQuery): Promise<EmpresaPlataformaResumo[]> {
      const hoje = hojeISO()
      const texto = q.busca?.toLowerCase()
      const todas = await plataforma.assinante.findMany({ include: incluir, orderBy: { nome: 'asc' } })
      return todas
        .map((e) => resumo(e, hoje))
        .filter((e) => !texto || e.nome.toLowerCase().includes(texto) || e.slug.includes(texto))
        .filter((e) => !q.nivel || e.nivel === q.nivel)
        .filter((e) => !q.situacao || e.situacao === q.situacao)
        .filter((e) => !q.plano || todas.find((t) => t.id === e.id)?.assinatura?.plano.codigo === q.plano)
    },

    async obter(id: string): Promise<EmpresaPlataformaDetalhe> {
      const e = await carregar(id)
      const a = e.assinatura
      // Usuários ficam no schema da própria empresa
      const banco = app.empresas.clienteDe(e.schema)
      const [cobrancas, eventos, total, ativos, admins] = await Promise.all([
        plataforma.cobranca.findMany({ where: { assinanteId: id }, orderBy: { vencimento: 'desc' }, take: 24 }),
        plataforma.eventoAssinatura.findMany({ where: { assinanteId: id }, orderBy: { createdAt: 'desc' }, take: 60 }),
        banco.usuario.count(),
        banco.usuario.count({ where: { ativo: true } }),
        banco.usuario.findMany({ where: { ativo: true, papel: { codigo: 'admin' } }, select: { nome: true, email: true, ultimoLogin: true }, orderBy: { nome: 'asc' } }),
      ])
      const r = a ? resumirAssinatura(a, hojeISO()) : null
      return {
        ...resumo(e, hojeISO()),
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
