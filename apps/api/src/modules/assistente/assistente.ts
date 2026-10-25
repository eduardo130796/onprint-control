import type { AssistenteConfig, Prisma, PrismaClient } from '@prisma/client'
import type { FastifyBaseLogger } from 'fastify'
import {
  COTACAO_DOLAR_PADRAO,
  MODELO_PADRAO_IA,
  PRECOS_PADRAO_IA,
  PROVEDORES_IA,
  PROVEDORES_IA_DISPONIVEIS,
  custoEstimadoUsd,
  type PrecoModeloIA,
  type ProvedorIA as NomeProvedorIA,
  type RecursoIA,
} from '@onprint/shared'
import type { Env } from '../../config/env'
import { ErroIA, MENSAGENS_ERRO_IA, criarProvedorIA, type OpcoesProvedorIA, type PedidoEstruturado, type ProvedorIA, type TipoErroIA, type UsoTokens } from '../../integrations/ia'
import { decifrarChave, segredoDoCofre } from '../../integrations/ia/cofre'
import { VERSOES_PROMPTS } from './prompts'

/*
 * Núcleo do Assistente GrafyGo: lê a configuração da central (schema plataforma), confere o limite do mês da empresa,
 * chama o provedor e grava cada chamada em uso_ia (tokens, custo estimado pela tabela de preços, ok/erro). Nunca
 * lança: devolve { ok: false, motivo } e quem chamou segue sem IA (o comportamento de antes).
 */

export type ConfigEnv = Pick<Env, 'NODE_ENV' | 'ANTHROPIC_API_KEY' | 'IA_SEGREDO' | 'JWT_ACCESS_SECRET'>

/** Configuração já resolvida (chave aberta, padrões aplicados) */
export interface ConfigAssistente {
  ativo: boolean
  provedor: NomeProvedorIA
  modelo: string
  chave: string | null
  origemChave: 'banco' | 'ambiente' | null
  chaveFinal: string | null
  chaveIlegivel: boolean
  limiteChamadasMes: number | null
  limiteUsdMes: number | null
  precos: PrecoModeloIA[]
  cotacaoDolar: number
  /** Ligado, provedor disponível e com chave: as empresas podem usar */
  pronto: boolean
}

export interface RegistroUso {
  assinanteId: string | null
  recurso: RecursoIA
  provedor: string
  modelo: string
  tokensEntrada: number
  tokensSaida: number
  custoEstimadoUsd: number
  situacao: 'ok' | 'erro' | 'limite'
  erro: string | null
  latenciaMs: number | null
  /** Quanto a chamada produziu (itens de orçamento, produtos, descrições); 0 nas outras */
  itens?: number
}

/** O que o núcleo precisa do banco (Prisma em produção; memória nos testes) */
export interface RepositorioAssistente {
  config(): Promise<AssistenteConfig | null>
  registrarUso(r: RegistroUso): Promise<void>
  /** Chamadas feitas (sem as evitadas pelo limite) e custo estimado da empresa desde o início do mês */
  usoDoMes(assinanteId: string, desde: Date): Promise<{ chamadas: number; custoUsd: number }>
}

export function repositorioPrisma(plataforma: PrismaClient): RepositorioAssistente {
  return {
    config: () => plataforma.assistenteConfig.findFirst({ orderBy: { createdAt: 'asc' } }),
    async registrarUso(r) {
      await plataforma.usoIa.create({ data: { ...r, custoEstimadoUsd: r.custoEstimadoUsd.toFixed(6) } })
    },
    async usoDoMes(assinanteId, desde) {
      const a = await plataforma.usoIa.aggregate({ where: { assinanteId, criadoEm: { gte: desde }, situacao: { not: 'limite' } }, _count: { _all: true }, _sum: { custoEstimadoUsd: true } })
      return { chamadas: a._count._all, custoUsd: Number(a._sum.custoEstimadoUsd ?? 0) }
    },
  }
}

const numero = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? null : Number(v))

/** Tabela de preços do banco (JSON) conferida; inválida = a padrão */
export function precosDaConfig(json: unknown): PrecoModeloIA[] {
  if (!Array.isArray(json)) return PRECOS_PADRAO_IA
  const lista = json.flatMap((p) =>
    p && typeof p === 'object' && typeof p.modelo === 'string' && Number.isFinite(Number(p.entrada)) && Number.isFinite(Number(p.saida))
      ? [{ modelo: p.modelo as string, entrada: Number(p.entrada), saida: Number(p.saida) }]
      : [],
  )
  return lista
}

/** Linha do banco (ou nenhuma) + variáveis de ambiente → configuração efetiva */
export function resolverConfig(linha: AssistenteConfig | null, env: ConfigEnv): ConfigAssistente {
  const provedor = (PROVEDORES_IA as readonly string[]).includes(linha?.provedor ?? '') ? (linha!.provedor as NomeProvedorIA) : 'anthropic'
  let chave: string | null = null
  let origemChave: ConfigAssistente['origemChave'] = null
  let chaveIlegivel = false
  if (linha?.chaveCifrada) {
    chave = decifrarChave(linha.chaveCifrada, segredoDoCofre(env))
    if (chave) origemChave = 'banco'
    else chaveIlegivel = true
  }
  if (!chave && provedor === 'anthropic' && env.ANTHROPIC_API_KEY) {
    chave = env.ANTHROPIC_API_KEY
    origemChave = 'ambiente'
  }
  const disponivel = PROVEDORES_IA_DISPONIVEIS.includes(provedor) && (provedor !== 'simulado' || env.NODE_ENV !== 'production')
  const ativo = linha?.ativo ?? false
  return {
    ativo,
    provedor,
    modelo: linha?.modelo || MODELO_PADRAO_IA,
    chave,
    origemChave,
    chaveFinal: origemChave === 'banco' ? linha!.chaveFinal : chave ? chave.slice(-4) : null,
    chaveIlegivel,
    limiteChamadasMes: linha ? linha.limiteChamadasMes : 300,
    limiteUsdMes: linha ? numero(linha.limiteUsdMes) : 1,
    precos: linha ? precosDaConfig(linha.precos) : PRECOS_PADRAO_IA,
    cotacaoDolar: numero(linha?.cotacaoDolar) ?? COTACAO_DOLAR_PADRAO,
    pronto: ativo && disponivel && (provedor === 'simulado' || Boolean(chave)),
  }
}

/** Primeiro instante do mês corrente no horário de Brasília */
export function inicioDoMes(agora: Date): Date {
  const [ano, mes] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(agora).split('-')
  return new Date(`${ano}-${mes}-01T00:00:00-03:00`)
}

export type ResultadoIA<T> =
  | { ok: true; dados: T; uso: UsoTokens; modelo: string; custoUsd: number; latenciaMs: number }
  | { ok: false; motivo: 'desligado' | 'limite' | 'erro'; erro: string | null; tipoErro?: TipoErroIA; uso?: UsoTokens; latenciaMs?: number }

export interface OpcoesAssistente {
  repositorio: RepositorioAssistente
  env: ConfigEnv
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>
  fabrica?: (o: OpcoesProvedorIA) => ProvedorIA
  agora?: () => Date
  /** Por quanto tempo a configuração fica em cache (a central limpa ao salvar) */
  cacheMs?: number
}

export function criarAssistente(o: OpcoesAssistente) {
  let fabrica = o.fabrica ?? criarProvedorIA
  const agora = o.agora ?? (() => new Date())
  const cacheMs = o.cacheMs ?? 15_000
  let cache: { config: ConfigAssistente; expira: number } | null = null

  async function config(): Promise<ConfigAssistente> {
    if (cache && cache.expira > Date.now()) return cache.config
    const c = resolverConfig(await o.repositorio.config(), o.env)
    cache = { config: c, expira: Date.now() + cacheMs }
    return c
  }

  async function registrar(r: RegistroUso) {
    try {
      await o.repositorio.registrarUso(r)
    } catch (erro) {
      o.log.warn({ err: erro, recurso: r.recurso }, 'Uso do Assistente GrafyGo não registrado')
    }
  }

  /**
   * Uma chamada estruturada. `assinanteId` null = teste da central (sem limite). `configTeste`: usa esta configuração
   * em vez da salva (botão "Testar" antes de ligar).
   */
  async function executar<T>(e: {
    assinanteId: string | null
    recurso: RecursoIA
    pedido: PedidoEstruturado<T>
    configTeste?: ConfigAssistente
    /** Quanto a resposta produziu (vai para uso_ia.itens: "este mês o Assistente montou X itens") */
    contar?: (dados: T) => number
  }): Promise<ResultadoIA<T>> {
    const c = e.configTeste ?? (await config())
    if (!e.configTeste && !c.pronto) return { ok: false, motivo: 'desligado', erro: null }
    const base = { assinanteId: e.assinanteId, recurso: e.recurso, provedor: c.provedor, modelo: c.modelo }

    if (e.assinanteId && (c.limiteChamadasMes !== null || c.limiteUsdMes !== null)) {
      const uso = await o.repositorio.usoDoMes(e.assinanteId, inicioDoMes(agora()))
      const passou = (c.limiteChamadasMes !== null && uso.chamadas >= c.limiteChamadasMes) || (c.limiteUsdMes !== null && uso.custoUsd >= c.limiteUsdMes)
      if (passou) {
        const erro = `Limite do mês atingido (${uso.chamadas} chamada(s), US$ ${uso.custoUsd.toFixed(4)}).`
        await registrar({ ...base, tokensEntrada: 0, tokensSaida: 0, custoEstimadoUsd: 0, situacao: 'limite', erro, latenciaMs: null })
        return { ok: false, motivo: 'limite', erro }
      }
    }

    const inicio = Date.now()
    try {
      const provedor = fabrica({ provedor: c.provedor, modelo: c.modelo, chave: c.chave })
      const r = await provedor.estruturado(e.pedido)
      const latenciaMs = Date.now() - inicio
      const custoUsd = custoEstimadoUsd(c.precos, c.modelo, r.uso)
      await registrar({ ...base, modelo: c.modelo, tokensEntrada: r.uso.entrada, tokensSaida: r.uso.saida, custoEstimadoUsd: custoUsd, situacao: 'ok', erro: null, latenciaMs, itens: e.contar?.(r.dados) ?? 0 })
      o.log.info({ recurso: e.recurso, prompt: VERSOES_PROMPTS[e.pedido.tarefa], modelo: r.modelo, tokens: r.uso, latenciaMs }, 'Assistente GrafyGo respondeu')
      return { ok: true, dados: r.dados, uso: r.uso, modelo: r.modelo, custoUsd, latenciaMs }
    } catch (erro) {
      const latenciaMs = Date.now() - inicio
      const ia = erro instanceof ErroIA ? erro : new ErroIA('indisponivel', (erro as Error)?.message?.slice(0, 200) ?? 'Erro desconhecido.')
      const custoUsd = custoEstimadoUsd(c.precos, c.modelo, ia.uso)
      await registrar({ ...base, tokensEntrada: ia.uso.entrada, tokensSaida: ia.uso.saida, custoEstimadoUsd: custoUsd, situacao: 'erro', erro: `${ia.tipo}: ${ia.message}`.slice(0, 500), latenciaMs })
      o.log.warn({ recurso: e.recurso, tipo: ia.tipo, erro: ia.message, latenciaMs }, 'Assistente GrafyGo falhou: segue sem IA')
      return { ok: false, motivo: 'erro', erro: ia.message || MENSAGENS_ERRO_IA[ia.tipo], tipoErro: ia.tipo, uso: ia.uso, latenciaMs }
    }
  }

  return {
    config,
    executar,
    /** As empresas podem usar agora (central ligada e configurada) */
    disponivel: async () => (await config()).pronto,
    /** Depois de salvar na central */
    esquecer: () => {
      cache = null
    },
    /** Testes: troca a fábrica de provedores (ex.: SimuladoProvider com respostas próprias) */
    definirFabrica: (f: (o: OpcoesProvedorIA) => ProvedorIA) => {
      fabrica = f
    },
  }
}

export type Assistente = ReturnType<typeof criarAssistente>
