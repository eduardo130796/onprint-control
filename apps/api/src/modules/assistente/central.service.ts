import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import {
  PROVEDORES_IA_DISPONIVEIS,
  PROVEDOR_IA_ROTULOS,
  type AssistenteCentral,
  type TesteAssistente,
  type UsoAssistenteMes,
  type UsoEmpresaIA,
  type assistenteConfigSchema,
  type ProvedorIA as NomeProvedorIA,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { cifrarChave, finalDaChave, segredoDoCofre } from '../../integrations/ia/cofre'
import { inicioDoMes, resolverConfig, type ConfigAssistente } from './assistente'
import { pedidoDeTeste } from './prompts'

/** Reais do painel (4 casas: o custo de cada gráfica costuma ser de centavos) */
const brl = (usd: number, cotacao: number) => Math.round(usd * cotacao * 10_000) / 10_000

/** Central do Assistente GrafyGo (painel da plataforma, só o dono/suporte): configuração, teste e uso por empresa. */
export function criarCentralAssistente(app: FastifyInstance) {
  const { plataforma } = app
  const simuladoDisponivel = app.config.NODE_ENV !== 'production'

  const linha = () => plataforma.assistenteConfig.findFirst({ orderBy: { createdAt: 'asc' } })

  /** Configuração para o navegador: a chave nunca sai, só a origem e os 4 últimos caracteres */
  function paraCentral(c: ConfigAssistente): AssistenteCentral {
    return {
      ativo: c.ativo,
      provedor: c.provedor,
      modelo: c.modelo,
      chave: { origem: c.origemChave, final: c.chaveFinal, ilegivel: c.chaveIlegivel },
      limiteChamadasMes: c.limiteChamadasMes,
      limiteUsdMes: c.limiteUsdMes,
      precos: c.precos,
      cotacaoDolar: c.cotacaoDolar,
      pronto: c.pronto,
      simuladoDisponivel,
    }
  }

  function conferirProvedor(provedor: NomeProvedorIA) {
    if (!PROVEDORES_IA_DISPONIVEIS.includes(provedor)) throw AppError.regraNegocio(`${PROVEDOR_IA_ROTULOS[provedor]} ainda não está disponível (em breve).`)
    if (provedor === 'simulado' && !simuladoDisponivel) throw AppError.regraNegocio('O provedor simulado só existe fora de produção.')
  }

  return {
    async obter(): Promise<AssistenteCentral> {
      return paraCentral(resolverConfig(await linha(), app.config))
    },

    async salvar(dados: z.output<typeof assistenteConfigSchema>, admin: string): Promise<AssistenteCentral> {
      conferirProvedor(dados.provedor)
      const atual = await linha()
      const chave = dados.removerChave ? { chaveCifrada: null, chaveFinal: null } : dados.chave ? { chaveCifrada: cifrarChave(dados.chave, segredoDoCofre(app.config)), chaveFinal: finalDaChave(dados.chave) } : {}
      const valores = {
        ativo: dados.ativo,
        provedor: dados.provedor,
        modelo: dados.modelo,
        limiteChamadasMes: dados.limiteChamadasMes,
        limiteUsdMes: dados.limiteUsdMes === null ? null : dados.limiteUsdMes.toFixed(4),
        precos: dados.precos,
        cotacaoDolar: dados.cotacaoDolar.toFixed(4),
        ...chave,
      }
      const salva = atual ? await plataforma.assistenteConfig.update({ where: { id: atual.id }, data: valores }) : await plataforma.assistenteConfig.create({ data: valores })
      app.assistente.esquecer()
      // Sem a chave no log: só se mudou
      app.log.info({ admin, ativo: dados.ativo, provedor: dados.provedor, modelo: dados.modelo, chave: dados.removerChave ? 'removida' : dados.chave ? 'trocada' : 'mantida' }, 'Central do Assistente GrafyGo salva')
      return paraCentral(resolverConfig(salva, app.config))
    },

    /**
     * "Testar": uma classificação pequena com a configuração salva ou com o que está no formulário (provedor, modelo,
     * chave digitada e ainda não salva). Registra o uso como teste da central (sem empresa).
     */
    async testar(dados: { provedor?: NomeProvedorIA; modelo?: string; chave?: string }): Promise<TesteAssistente> {
      const salva = resolverConfig(await linha(), app.config)
      const provedor = dados.provedor ?? salva.provedor
      conferirProvedor(provedor)
      const config: ConfigAssistente = {
        ...salva,
        provedor,
        modelo: dados.modelo ?? salva.modelo,
        chave: dados.chave ?? (provedor === salva.provedor ? salva.chave : provedor === 'anthropic' ? app.config.ANTHROPIC_API_KEY || null : null),
      }
      const r = await app.assistente.executar({ assinanteId: null, recurso: 'teste_central', pedido: pedidoDeTeste(), configTeste: config })
      if (r.ok) {
        return { ok: true, provedor, modelo: r.modelo, tokens: r.uso, latenciaMs: r.latenciaMs, custoUsd: r.custoUsd, resultado: { intencao: r.dados.intencao, confianca: r.dados.confianca, resumo: r.dados.resumo }, erro: null }
      }
      return { ok: false, provedor, modelo: config.modelo, tokens: r.uso ?? { entrada: 0, saida: 0 }, latenciaMs: r.latenciaMs ?? 0, custoUsd: 0, resultado: null, erro: r.erro }
    },

    /** Uso do mês (horário de Brasília) por empresa: chamadas, tokens, custo estimado (USD e R$) e os últimos erros */
    async uso(mes?: string): Promise<UsoAssistenteMes> {
      const c = resolverConfig(await linha(), app.config)
      const desde = mes ? new Date(`${mes}-01T00:00:00-03:00`) : inicioDoMes(new Date())
      const ate = new Date(desde)
      ate.setUTCMonth(ate.getUTCMonth() + 1)
      const [grupos, gruposRecurso, erros] = await Promise.all([
        plataforma.usoIa.groupBy({
          by: ['assinanteId', 'situacao'],
          where: { criadoEm: { gte: desde, lt: ate } },
          _count: { _all: true },
          _sum: { tokensEntrada: true, tokensSaida: true, custoEstimadoUsd: true },
        }),
        plataforma.usoIa.groupBy({
          by: ['recurso', 'situacao'],
          where: { criadoEm: { gte: desde, lt: ate } },
          _count: { _all: true },
          _sum: { tokensEntrada: true, tokensSaida: true, custoEstimadoUsd: true, itens: true },
        }),
        plataforma.usoIa.findMany({ where: { situacao: { in: ['erro', 'limite'] }, criadoEm: { gte: desde, lt: ate } }, orderBy: { criadoEm: 'desc' }, take: 15 }),
      ])
      const ids = [...new Set([...grupos.map((g) => g.assinanteId), ...erros.map((e) => e.assinanteId)].filter((x): x is string => Boolean(x)))]
      const assinantes = new Map((await plataforma.assinante.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, slug: true } })).map((a) => [a.id, a]))

      const vazio = (): Omit<UsoEmpresaIA, 'empresa'> => ({ chamadas: 0, erros: 0, bloqueadas: 0, tokensEntrada: 0, tokensSaida: 0, custoUsd: 0, custoBrl: 0 })
      /** Soma um grupo (empresa ou recurso × situação) na linha */
      function somar(alvo: Omit<UsoEmpresaIA, 'empresa'>, g: (typeof grupos)[number]) {
        if (g.situacao === 'limite') alvo.bloqueadas += g._count._all
        else alvo.chamadas += g._count._all
        if (g.situacao === 'erro') alvo.erros += g._count._all
        alvo.tokensEntrada += g._sum.tokensEntrada ?? 0
        alvo.tokensSaida += g._sum.tokensSaida ?? 0
        alvo.custoUsd += Number(g._sum.custoEstimadoUsd ?? 0)
      }
      const porEmpresa = new Map<string, UsoEmpresaIA>()
      const totais = vazio()
      for (const g of grupos) {
        const chave = g.assinanteId ?? 'central'
        const linhaEmpresa = porEmpresa.get(chave) ?? { empresa: g.assinanteId ? (assinantes.get(g.assinanteId) ?? { id: g.assinanteId, nome: 'Empresa removida', slug: '' }) : null, ...vazio() }
        somar(linhaEmpresa, g)
        somar(totais, g)
        porEmpresa.set(chave, linhaEmpresa)
      }
      const porRecurso = new Map<string, Omit<UsoEmpresaIA, 'empresa'> & { recurso: string; itens: number }>()
      for (const g of gruposRecurso) {
        const linhaRecurso = porRecurso.get(g.recurso) ?? { recurso: g.recurso, itens: 0, ...vazio() }
        somar(linhaRecurso, { ...g, assinanteId: null })
        linhaRecurso.itens += g._sum.itens ?? 0
        porRecurso.set(g.recurso, linhaRecurso)
      }
      const fechar = <T extends Omit<UsoEmpresaIA, 'empresa'>>(u: T): T => ({ ...u, custoUsd: Math.round(u.custoUsd * 1e6) / 1e6, custoBrl: brl(u.custoUsd, c.cotacaoDolar) })
      return {
        mes: `${desde.toISOString().slice(0, 7)}`,
        cotacaoDolar: c.cotacaoDolar,
        totais: fechar(totais),
        empresas: [...porEmpresa.values()].map(fechar).sort((a, b) => b.custoUsd - a.custoUsd || b.chamadas - a.chamadas),
        porRecurso: [...porRecurso.values()].map(fechar).sort((a, b) => b.chamadas - a.chamadas || b.custoUsd - a.custoUsd),
        ultimosErros: erros.map((e) => ({
          id: e.id,
          empresa: e.assinanteId ? (assinantes.get(e.assinanteId)?.nome ?? 'Empresa removida') : null,
          recurso: e.recurso,
          situacao: e.situacao as 'erro' | 'limite',
          erro: e.erro,
          modelo: e.modelo,
          em: e.criadoEm.toISOString(),
        })),
      }
    },
  }
}
