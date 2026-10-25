import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  FUNCOES_ASSISTENTE,
  FUNCOES_ASSISTENTE_INFO,
  RECURSOS_IA,
  funcaoLiberada,
  type AssistenteEmpresa,
  type ControlesAssistente,
  type FuncaoAssistente,
  type RecursoIA,
  type UsoRecursoEmpresa,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { obterConfigWhatsapp } from '../whatsapp/avisos'
import { inicioDoMes, type ResultadoIA } from './assistente'

/*
 * Assistente GrafyGo na empresa (Configurações → Assistente): os controles da gráfica (chave geral, cada ajuda e
 * "nunca falar com meus clientes"), o uso do mês contra o limite da central e a trava de cada ajuda. A leitura das
 * respostas do WhatsApp continua em whatsapp_config.assistente_respostas (a tela do WhatsApp mostra o mesmo campo).
 */

const camposEmpresa = { assistenteAtivo: true, assistenteOrcamentoTexto: true, assistenteProdutos: true, assistenteDescricoes: true, assistenteRegras: true, assistenteSemClientes: true } as const

type LinhaEmpresa = { assistenteAtivo: boolean; assistenteOrcamentoTexto: boolean; assistenteProdutos: boolean; assistenteDescricoes: boolean; assistenteRegras: boolean; assistenteSemClientes: boolean }

/** Linhas do banco → controles (empresa ainda sem configuração: tudo no padrão) */
export function controlesDasLinhas(e: LinhaEmpresa | null, w: { assistenteRespostas: boolean } | null): ControlesAssistente {
  return {
    ativo: e?.assistenteAtivo ?? true,
    respostasWhatsapp: w?.assistenteRespostas ?? true,
    orcamentoTexto: e?.assistenteOrcamentoTexto ?? true,
    produtos: e?.assistenteProdutos ?? true,
    descricoes: e?.assistenteDescricoes ?? true,
    regras: e?.assistenteRegras ?? true,
    semClientes: e?.assistenteSemClientes ?? false,
  }
}

/** Controles da empresa do contexto (prisma já no schema dela) */
export async function controlesDaEmpresa(prisma: PrismaClient): Promise<ControlesAssistente> {
  const [e, w] = await Promise.all([
    prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: camposEmpresa }),
    prisma.whatsappConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { assistenteRespostas: true } }),
  ])
  return controlesDasLinhas(e, w)
}

/** Por que a ajuda não respondeu, para a pessoa (o resultado sem IA nunca quebra a tela: ela segue sem o Assistente) */
export function mensagemSemResultado(r: Extract<ResultadoIA<unknown>, { ok: false }>): string {
  if (r.motivo === 'desligado') return 'O Assistente GrafyGo não está disponível agora.'
  if (r.motivo === 'limite') return 'A gráfica chegou ao limite de uso do Assistente GrafyGo neste mês. Fale com o suporte da GrafyGo para ampliar.'
  return 'O Assistente GrafyGo não conseguiu responder agora. Tente de novo em instantes.'
}

/** Nome da gráfica para a persona ("Assistente GrafyGo da <gráfica>") */
export async function nomeDaGrafica(prisma: PrismaClient): Promise<string> {
  const e = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { nomeFantasia: true, razaoSocial: true } })
  return e?.nomeFantasia || e?.razaoSocial || contextoEmpresa.atual()?.nome || 'gráfica'
}

export function criarAssistenteEmpresa(app: FastifyInstance) {
  const { prisma } = app

  /** Uso da empresa no mês (horário de Brasília), por recurso, sem as chamadas evitadas pelo limite */
  async function usoDoMes(assinanteId: string) {
    const desde = inicioDoMes(new Date())
    const grupos = await app.plataforma.usoIa.groupBy({
      by: ['recurso'],
      where: { assinanteId, criadoEm: { gte: desde }, situacao: { not: 'limite' } },
      _count: { _all: true },
      _sum: { itens: true, custoEstimadoUsd: true },
    })
    const porRecurso: UsoRecursoEmpresa[] = RECURSOS_IA.filter((r) => r !== 'teste_central').map((recurso) => {
      const g = grupos.find((x) => x.recurso === recurso)
      return { recurso, chamadas: g?._count._all ?? 0, itens: g?._sum.itens ?? 0 }
    })
    const custoUsd = grupos.reduce((s, g) => s + Number(g._sum.custoEstimadoUsd ?? 0), 0)
    return { desde, porRecurso, chamadas: porRecurso.reduce((s, r) => s + r.chamadas, 0), custoUsd }
  }

  async function obter(): Promise<AssistenteEmpresa> {
    const empresa = contextoEmpresa.exigir()
    const [controles, config, uso] = await Promise.all([controlesDaEmpresa(prisma), app.assistente.config(), usoDoMes(empresa.id)])
    const disponivel = config.pronto
    return {
      controles,
      disponivel,
      liberado: Object.fromEntries(FUNCOES_ASSISTENTE.map((f) => [f, disponivel && funcaoLiberada(controles, f)])) as Record<FuncaoAssistente, boolean>,
      uso: {
        mes: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()),
        chamadas: uso.chamadas,
        limiteChamadas: config.limiteChamadasMes,
        percentualCusto: config.limiteUsdMes ? Math.min(100, Math.round((uso.custoUsd / config.limiteUsdMes) * 1000) / 10) : null,
        porRecurso: uso.porRecurso,
      },
    }
  }

  return {
    obter,

    async salvar(dados: ControlesAssistente, usuarioId: string): Promise<AssistenteEmpresa> {
      await prisma.$transaction(async (tx) => {
        const empresa = await tx.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, ...camposEmpresa } })
        if (!empresa) throw AppError.regraNegocio('Cadastre os dados da empresa antes de configurar o Assistente.')
        const whatsapp = await obterConfigWhatsapp(tx as unknown as PrismaClient)
        const antes = controlesDasLinhas(empresa, whatsapp)
        await tx.empresaConfig.update({
          where: { id: empresa.id },
          data: {
            assistenteAtivo: dados.ativo,
            assistenteOrcamentoTexto: dados.orcamentoTexto,
            assistenteProdutos: dados.produtos,
            assistenteDescricoes: dados.descricoes,
            assistenteRegras: dados.regras,
            assistenteSemClientes: dados.semClientes,
          },
        })
        if (whatsapp.assistenteRespostas !== dados.respostasWhatsapp) await tx.whatsappConfig.update({ where: { id: whatsapp.id }, data: { assistenteRespostas: dados.respostasWhatsapp } })
        await registrarAuditoria(tx, { tabela: 'empresa_config', registroId: empresa.id, acao: 'editar', antes: { assistente: antes }, depois: { assistente: dados }, usuarioId })
      })
      return obter()
    },

    /**
     * Trava de cada ajuda: a central ligada e a empresa deixando. Devolve o id da empresa (assinante) para o uso.
     * Lança 422 com a explicação para a tela.
     */
    async exigir(funcao: FuncaoAssistente): Promise<{ assinanteId: string; recurso: RecursoIA }> {
      const empresa = contextoEmpresa.exigir()
      if (!(await app.assistente.disponivel())) throw AppError.regraNegocio('O Assistente GrafyGo ainda não foi liberado pela GrafyGo.')
      const controles = await controlesDaEmpresa(prisma)
      if (!funcaoLiberada(controles, funcao)) {
        throw AppError.regraNegocio(
          controles.ativo
            ? `“${FUNCOES_ASSISTENTE_INFO[funcao].titulo}” está desligado em Configurações → Assistente.`
            : 'O Assistente GrafyGo está desligado em Configurações → Assistente.',
        )
      }
      return { assinanteId: empresa.id, recurso: FUNCOES_ASSISTENTE_INFO[funcao].recurso }
    },
  }
}

export type AssistenteDaEmpresa = ReturnType<typeof criarAssistenteEmpresa>
