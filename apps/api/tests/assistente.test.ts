import type { AssistenteConfig } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { custoEstimadoUsd } from '@onprint/shared'
import { carregarEnv } from '../src/config/env'
import { ErroIA, SimuladoProvider, criarProvedorIA, type PedidoEstruturado, type ProvedorIA } from '../src/integrations/ia'
import { traduzirErro } from '../src/integrations/ia/anthropic'
import { chaveDeCifra, cifrarChave, decifrarChave, segredoDoCofre } from '../src/integrations/ia/cofre'
import { classificarSimulado } from '../src/integrations/ia/simulado'
import { criarAssistente, inicioDoMes, resolverConfig, type RegistroUso, type RepositorioAssistente } from '../src/modules/assistente/assistente'
import { criarCentralAssistente } from '../src/modules/assistente/central.service'
import { ESQUEMA_CLASSIFICACAO, pedidoClassificarResposta, primeiroNome, semDadosPessoais, validarClassificacao, type ClassificacaoResposta } from '../src/modules/assistente/prompts'
import { CONFIANCA_APROVAR, decidirPeloAssistente, decidirResposta, vaiParaAssistente, type LeituraAssistente, type OrcamentoEnviado, type Recebida } from '../src/modules/whatsapp/respostas'

const env = carregarEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://x:x@localhost:1/x', JWT_ACCESS_SECRET: 'segredo-de-teste-jwt', JWT_REFRESH_SECRET: 'segredo-de-teste-2', LOG_LEVEL: 'silent' })
const log = { info: vi.fn(), warn: vi.fn() }
const agora = new Date('2026-10-24T15:00:00Z')

/** Linha de assistente_config como o Prisma devolve */
function linha(c: Partial<AssistenteConfig> = {}): AssistenteConfig {
  return {
    id: 'cfg',
    ativo: true,
    provedor: 'simulado',
    modelo: 'claude-haiku-5-5',
    chaveCifrada: null,
    chaveFinal: null,
    limiteChamadasMes: 300,
    limiteUsdMes: null,
    precos: [{ modelo: 'claude-haiku-5-5', entrada: 0.1, saida: 0.5 }],
    cotacaoDolar: 5.5 as never,
    createdAt: agora,
    updatedAt: agora,
    ...c,
  }
}

/** Banco em memória do núcleo */
function memoria(cfg: AssistenteConfig | null, usoDoMes = { chamadas: 0, custoUsd: 0 }) {
  const usos: RegistroUso[] = []
  const repo: RepositorioAssistente = { config: async () => cfg, registrarUso: async (r) => void usos.push(r), usoDoMes: async () => usoDoMes }
  return { repo, usos }
}

const contexto = (mensagem: string) => ({
  grafica: 'Gráfica Aurora',
  orcamento: { numero: 'ORC-0042', itens: [{ descricao: 'Banner 90×120 cm lona 440 g', quantidade: '2', categoria: 'Comunicação visual' }] },
  cliente: primeiroNome('Mariana Souza Lima'),
  mensagem,
})

describe('Assistente: decisão sobre a leitura (limiares)', () => {
  const orc: OrcamentoEnviado = {
    mensagemId: 'm1',
    orcamentoId: 'o1',
    numero: 'ORC-1',
    status: 'enviado',
    idExterno: 'TXT1',
    enqueteId: 'POLL1',
    formatoResposta: 'enquete',
    enviadaEm: new Date(agora.getTime() - 3_600_000),
    resposta: null,
    respostaEm: null,
    respostaIdExterno: null,
  }
  const base = { acao: 'notificar' as const, motivo: 'texto' as const, alvos: [orc], resposta: 'outra' as const, avisarEquipe: true }
  const ler = (intencao: LeituraAssistente['intencao'], confianca: number, temPergunta = false): LeituraAssistente => ({ intencao, confianca, resumo: 'O cliente quer seguir.', temPergunta })
  const ligado = { aprovarSozinho: true, agora }

  it('aprova sozinho só com confiança ≥ 0,85 e sem pergunta', () => {
    expect(decidirPeloAssistente(ler('aprova', 0.93), 'tá ótimo, pode mandar ver', base, ligado)).toMatchObject({ acao: 'aprovar', alvo: { orcamentoId: 'o1' }, resposta: 'aprovado', assistente: { intencao: 'aprova' } })
    expect(decidirPeloAssistente(ler('aprova', CONFIANCA_APROVAR), 'pode mandar', base, ligado).acao).toBe('aprovar')
    expect(decidirPeloAssistente(ler('aprova', 0.84), 'pode mandar', base, ligado)).toMatchObject({ acao: 'notificar', motivo: 'assistente' })
  })
  it('pergunta no texto ou na leitura nunca aprova', () => {
    expect(decidirPeloAssistente(ler('aprova', 0.99), 'gostei, dá pra entregar sexta?', base, ligado)).toMatchObject({ acao: 'notificar', motivo: 'assistente', avisarEquipe: true })
    expect(decidirPeloAssistente(ler('aprova', 0.99, true), 'gostei, dá pra entregar sexta', base, ligado)).toMatchObject({ acao: 'notificar', motivo: 'assistente' })
  })
  it('"aprovar sozinho" desligado: avisa para confirmar', () => {
    expect(decidirPeloAssistente(ler('aprova', 0.95), 'show', base, { ...ligado, aprovarSozinho: false })).toMatchObject({ acao: 'notificar', motivo: 'aprovacao_manual', resposta: 'aprovado' })
  })
  it('modificação com ≥ 0,8 segue o fluxo de modificação; abaixo, só avisa', () => {
    expect(decidirPeloAssistente(ler('quer_modificacoes', 0.8), 'queria num azul mais escuro', base, ligado)).toMatchObject({ acao: 'modificar', resposta: 'modificacoes', responderCliente: true })
    expect(decidirPeloAssistente(ler('quer_modificacoes', 0.79), 'hmm azul', base, ligado)).toMatchObject({ acao: 'notificar', motivo: 'assistente' })
  })
  it('pergunta sempre avisa (mesmo no silêncio de 10 min); "outro" respeita o silêncio', () => {
    const calado = { ...base, avisarEquipe: false }
    expect(decidirPeloAssistente(ler('pergunta', 0.9, true), 'entrega sexta', calado, ligado)).toMatchObject({ acao: 'notificar', avisarEquipe: true })
    expect(decidirPeloAssistente(ler('outro', 0.8), 'hmm vou pensar', calado, ligado)).toMatchObject({ acao: 'notificar', avisarEquipe: false })
  })
  it('só vai para o Assistente texto sem intenção, de um orçamento aberto só', () => {
    const texto = (t: string): Recebida => ({ tipo: 'texto', idMensagem: 'T1', texto: t, citadoId: null })
    const opcoes = { aprovarSozinho: true, agora }
    const um = decidirResposta(texto('hmm vou pensar'), [orc], opcoes)
    expect(vaiParaAssistente(um, texto('hmm vou pensar'))).toBe(true)
    // Regras já entenderam
    expect(vaiParaAssistente(decidirResposta(texto('aprovado'), [orc], opcoes), texto('aprovado'))).toBe(false)
    // Dois orçamentos abertos: só avisa (o Assistente não escolhe o orçamento)
    const dois = [orc, { ...orc, orcamentoId: 'o2', mensagemId: 'm2', idExterno: 'TXT2', enqueteId: 'P2' }]
    expect(vaiParaAssistente(decidirResposta(texto('tá ótimo'), dois, opcoes), texto('tá ótimo'))).toBe(false)
    // Orçamento fechado e voto ficam como antes
    expect(vaiParaAssistente(decidirResposta(texto('tá ótimo'), [{ ...orc, status: 'expirado' }], opcoes), texto('tá ótimo'))).toBe(false)
    const voto: Recebida = { tipo: 'voto', idMensagem: 'V1', idEnquete: 'POLL1', opcoes: null }
    expect(vaiParaAssistente(decidirResposta(voto, [orc], opcoes), voto)).toBe(false)
    // "1"/"2" num orçamento com enquete: a equipe vê (nunca a IA)
    expect(vaiParaAssistente(decidirResposta(texto('1'), [orc], opcoes), texto('1'))).toBe(false)
  })
})

describe('Assistente: núcleo (limite, registro de uso, falhas)', () => {
  const pedido = pedidoClassificarResposta(contexto('tá ótimo, pode mandar ver'))

  it('desligado ou sem configuração: não chama e não registra', async () => {
    for (const cfg of [null, linha({ ativo: false })]) {
      const m = memoria(cfg)
      const fabrica = vi.fn()
      const a = criarAssistente({ repositorio: m.repo, env, log, fabrica })
      expect(await a.executar({ assinanteId: 'e1', recurso: 'whatsapp_resposta', pedido })).toMatchObject({ ok: false, motivo: 'desligado' })
      expect(fabrica).not.toHaveBeenCalled()
      expect(m.usos).toEqual([])
    }
  })
  it('Anthropic sem chave (nem no banco nem no ambiente) não fica pronto', async () => {
    const a = criarAssistente({ repositorio: memoria(linha({ provedor: 'anthropic' })).repo, env, log })
    expect(await a.disponivel()).toBe(false)
  })
  it('ok: devolve a leitura e grava tokens e custo pela tabela de preços', async () => {
    const m = memoria(linha({ provedor: 'simulado', modelo: 'claude-haiku-5-5' }))
    const a = criarAssistente({ repositorio: m.repo, env, log })
    const r = await a.executar({ assinanteId: 'e1', recurso: 'whatsapp_resposta', pedido })
    expect(r).toMatchObject({ ok: true, dados: { intencao: 'aprova' } })
    expect(m.usos).toHaveLength(1)
    const u = m.usos[0]!
    expect(u).toMatchObject({ assinanteId: 'e1', recurso: 'whatsapp_resposta', provedor: 'simulado', modelo: 'claude-haiku-5-5', situacao: 'ok', erro: null })
    expect(u.tokensEntrada).toBeGreaterThan(0)
    expect(u.custoEstimadoUsd).toBe(custoEstimadoUsd([{ modelo: 'claude-haiku-5-5', entrada: 0.1, saida: 0.5 }], 'claude-haiku-5-5', { entrada: u.tokensEntrada, saida: u.tokensSaida }))
    expect(custoEstimadoUsd([{ modelo: 'x', entrada: 0.1, saida: 0.5 }], 'x', { entrada: 1_000_000, saida: 2_000_000 })).toBe(1.1)
  })
  it('erro do provedor ou resposta fora do schema: ok false, registrado como erro (com os tokens gastos)', async () => {
    const m = memoria(linha())
    const a = criarAssistente({ repositorio: m.repo, env, log })
    expect(await a.executar({ assinanteId: 'e1', recurso: 'whatsapp_resposta', pedido: pedidoClassificarResposta(contexto('[simular-erro] oi')) })).toMatchObject({ ok: false, motivo: 'erro', tipoErro: 'indisponivel' })
    const invalida = await a.executar({ assinanteId: 'e1', recurso: 'whatsapp_resposta', pedido: pedidoClassificarResposta(contexto('[simular-invalido]')) })
    expect(invalida).toMatchObject({ ok: false, motivo: 'erro', tipoErro: 'resposta_invalida' })
    expect(m.usos.map((u) => u.situacao)).toEqual(['erro', 'erro'])
    expect(m.usos[1]!.tokensEntrada).toBeGreaterThan(0)
  })
  it('exceção qualquer (ou demora) na fábrica/provedor vira erro, nunca lança', async () => {
    const m = memoria(linha())
    const a = criarAssistente({ repositorio: m.repo, env, log, fabrica: () => ({ nome: 'simulado', modelo: 'x', estruturado: () => Promise.reject(new ErroIA('tempo', 'demorou')) }) })
    expect(await a.executar({ assinanteId: 'e1', recurso: 'whatsapp_resposta', pedido })).toMatchObject({ ok: false, motivo: 'erro', tipoErro: 'tempo' })
    const b = criarAssistente({ repositorio: m.repo, env, log, fabrica: () => { throw new Error('quebrou') } })
    expect(await b.executar({ assinanteId: 'e1', recurso: 'whatsapp_resposta', pedido })).toMatchObject({ ok: false, motivo: 'erro' })
  })
  it('limite do mês (chamadas ou US$): não chama, registra "limite"; o teste da central não tem limite', async () => {
    for (const [cfg, uso] of [
      [linha({ limiteChamadasMes: 10 }), { chamadas: 10, custoUsd: 0 }],
      [linha({ limiteChamadasMes: null, limiteUsdMes: 0.5 as never }), { chamadas: 3, custoUsd: 0.5 }],
    ] as const) {
      const m = memoria(cfg, uso)
      const estruturado = vi.fn()
      const a = criarAssistente({ repositorio: m.repo, env, log, fabrica: () => ({ nome: 'simulado', modelo: 'x', estruturado }) })
      expect(await a.executar({ assinanteId: 'e1', recurso: 'whatsapp_resposta', pedido })).toMatchObject({ ok: false, motivo: 'limite' })
      expect(estruturado).not.toHaveBeenCalled()
      expect(m.usos).toMatchObject([{ situacao: 'limite', tokensEntrada: 0, custoEstimadoUsd: 0 }])
    }
    const m = memoria(linha({ limiteChamadasMes: 0 }))
    const a = criarAssistente({ repositorio: m.repo, env, log })
    expect((await a.executar({ assinanteId: null, recurso: 'teste_central', pedido })).ok).toBe(true)
  })
  it('mês no horário de Brasília', () => {
    expect(inicioDoMes(new Date('2026-11-01T02:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(inicioDoMes(new Date('2026-11-01T03:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z')
  })
})

describe('Assistente: privacidade e persona', () => {
  it('o prompt leva a gráfica, o orçamento e o primeiro nome; nunca telefone, documento ou e-mail', async () => {
    let enviado: PedidoEstruturado<ClassificacaoResposta> | undefined
    const provedor: ProvedorIA = {
      nome: 'simulado',
      modelo: 'x',
      async estruturado<T>(p: PedidoEstruturado<T>) {
        enviado = p as unknown as PedidoEstruturado<ClassificacaoResposta>
        return new SimuladoProvider().estruturado(p)
      },
    }
    const a = criarAssistente({ repositorio: memoria(linha()).repo, env, log, fabrica: () => provedor })
    const msg = 'gostei! me liga no (11) 98888-7777 ou manda no mari@exemplo.com, meu CPF é 123.456.789-09'
    await a.executar({ assinanteId: 'e1', recurso: 'whatsapp_resposta', pedido: pedidoClassificarResposta(contexto(msg)) })
    const tudo = `${enviado!.sistema}\n${enviado!.conteudo}`
    expect(tudo).toContain('Assistente GrafyGo da Gráfica Aurora')
    expect(tudo).toContain('ORC-0042')
    expect(tudo).toContain('Comunicação visual')
    expect(tudo).toContain('Cliente: Mariana')
    expect(tudo).not.toContain('Souza')
    expect(tudo).not.toMatch(/98888|7777|123\.456|mari@/)
    expect(tudo).toContain('[número omitido]')
    expect(tudo).toContain('[e-mail omitido]')
    // Quantidades e medidas continuam
    expect(semDadosPessoais('quero 1000 cartões 9x5 até dia 15/11')).toBe('quero 1000 cartões 9x5 até dia 15/11')
  })
  it('primeiro nome só de pessoa (nada de razão social inteira)', () => {
    expect(primeiroNome('  joão da silva ')).toBe('joão')
    expect(primeiroNome('')).toBeNull()
    expect(primeiroNome('12345')).toBeNull()
  })
  it('schema da resposta: estrito (structured output) e a validação normaliza', () => {
    expect(ESQUEMA_CLASSIFICACAO.additionalProperties).toBe(false)
    expect(ESQUEMA_CLASSIFICACAO.required).toEqual(['intencao', 'confianca', 'resumo', 'tem_pergunta'])
    expect(validarClassificacao({ intencao: 'aprova', confianca: 1.4, resumo: ' O cliente   aprovou. ', tem_pergunta: false })).toEqual({ intencao: 'aprova', confianca: 1, resumo: 'O cliente aprovou.', temPergunta: false })
    expect(() => validarClassificacao({ intencao: 'talvez', confianca: 0.5, resumo: 'x', tem_pergunta: false })).toThrow()
  })
  it('simulado: os três exemplos do WhatsApp', () => {
    expect(classificarSimulado(pedidoClassificarResposta(contexto('tá ótimo, pode mandar ver')).conteudo)).toMatchObject({ intencao: 'aprova' })
    expect(classificarSimulado(pedidoClassificarResposta(contexto('gostei, dá pra entregar sexta?')).conteudo)).toMatchObject({ intencao: 'pergunta', tem_pergunta: true })
    expect(classificarSimulado(pedidoClassificarResposta(contexto('hmm vou pensar')).conteudo)).toMatchObject({ intencao: 'outro' })
  })
})

describe('Assistente: chave da API (cofre e central)', () => {
  const chave = 'sk-ant-api03-chave-de-teste-ABCD1234'

  it('AES-256-GCM: ida e volta; segredo trocado ou valor adulterado não abre', () => {
    const guardada = cifrarChave(chave, 'segredo-1')
    expect(guardada).not.toContain(chave)
    expect(guardada.startsWith('v1:')).toBe(true)
    expect(decifrarChave(guardada, 'segredo-1')).toBe(chave)
    expect(decifrarChave(guardada, 'segredo-2')).toBeNull()
    const [v, iv, tag, c] = guardada.split(':')
    expect(decifrarChave([v, iv, tag, `${c![0] === 'A' ? 'B' : 'A'}${c!.slice(1)}`].join(':'), 'segredo-1')).toBeNull()
    expect(decifrarChave('texto-puro', 'segredo-1')).toBeNull()
    // Duas cifras da mesma chave são diferentes (IV aleatório) e a chave de cifra tem 32 bytes
    expect(cifrarChave(chave, 'segredo-1')).not.toBe(guardada)
    expect(chaveDeCifra('x')).toHaveLength(32)
    expect(segredoDoCofre({ IA_SEGREDO: '', JWT_ACCESS_SECRET: 'jwt' })).toBe('jwt')
    expect(segredoDoCofre({ IA_SEGREDO: 'ia', JWT_ACCESS_SECRET: 'jwt' })).toBe('ia')
  })
  it('configuração resolvida: chave do banco aberta; ilegível avisa; ANTHROPIC_API_KEY só sem chave no banco', () => {
    const cifrada = cifrarChave(chave, segredoDoCofre(env))
    expect(resolverConfig(linha({ provedor: 'anthropic', chaveCifrada: cifrada, chaveFinal: '1234' }), env)).toMatchObject({ chave, origemChave: 'banco', chaveFinal: '1234', pronto: true })
    expect(resolverConfig(linha({ provedor: 'anthropic', chaveCifrada: cifrarChave(chave, 'outro'), chaveFinal: '1234' }), env)).toMatchObject({ chave: null, chaveIlegivel: true, pronto: false })
    const comAmbiente = { ...env, ANTHROPIC_API_KEY: 'sk-ant-ambiente-9999' }
    expect(resolverConfig(linha({ provedor: 'anthropic' }), comAmbiente)).toMatchObject({ origemChave: 'ambiente', chaveFinal: '9999', pronto: true })
    expect(resolverConfig(linha({ provedor: 'anthropic', chaveCifrada: cifrada }), comAmbiente)).toMatchObject({ chave, origemChave: 'banco' })
    // Simulado nunca em produção; provedor "em breve" nunca fica pronto
    expect(resolverConfig(linha({ provedor: 'simulado' }), { ...env, NODE_ENV: 'production' }).pronto).toBe(false)
    expect(resolverConfig(linha({ provedor: 'openai', chaveCifrada: cifrada }), env).pronto).toBe(false)
  })
  it('a central nunca devolve a chave (salvar, obter, testar); guarda só cifrada', async () => {
    let salva: AssistenteConfig | null = null
    const plataforma = {
      assistenteConfig: {
        findFirst: async () => salva,
        create: async ({ data }: { data: Partial<AssistenteConfig> }) => (salva = linha({ ...data, ativo: data.ativo ?? false } as Partial<AssistenteConfig>)),
        update: async ({ data }: { data: Partial<AssistenteConfig> }) => (salva = { ...salva!, ...data } as AssistenteConfig),
      },
    }
    const repo: RepositorioAssistente = { config: async () => salva, registrarUso: async () => undefined, usoDoMes: async () => ({ chamadas: 0, custoUsd: 0 }) }
    const app = { plataforma, config: env, log, assistente: criarAssistente({ repositorio: repo, env, log, cacheMs: 0 }) } as unknown as FastifyInstance
    const central = criarCentralAssistente(app)
    const dados = { ativo: true, provedor: 'anthropic' as const, modelo: 'claude-haiku-5-5', chave, limiteChamadasMes: 300, limiteUsdMes: 1, precos: [{ modelo: 'claude-haiku-5-5', entrada: 0.1, saida: 0.5 }], cotacaoDolar: 5.5 }
    const depois = await central.salvar(dados, 'dono@grafygo')
    expect(JSON.stringify(depois)).not.toContain(chave)
    expect(depois.chave).toEqual({ origem: 'banco', final: '1234', ilegivel: false })
    expect(depois.pronto).toBe(true)
    expect(salva!.chaveCifrada).not.toContain(chave)
    expect(decifrarChave(salva!.chaveCifrada!, segredoDoCofre(env))).toBe(chave)
    expect(JSON.stringify(await central.obter())).not.toContain(chave)
    // Salvar sem chave mantém a guardada; removerChave apaga
    expect((await central.salvar({ ...dados, chave: undefined }, 'dono')).chave.final).toBe('1234')
    expect((await central.salvar({ ...dados, chave: undefined, removerChave: true }, 'dono')).chave).toEqual({ origem: null, final: null, ilegivel: false })
    // Provedor "em breve" é recusado
    await expect(central.salvar({ ...dados, provedor: 'gemini' }, 'dono')).rejects.toThrow(/em breve/)
    // Testar com o simulado (sem rede): ok, tokens e o que entendeu; nada da chave volta
    const teste = await central.testar({ provedor: 'simulado', chave })
    expect(teste).toMatchObject({ ok: true, provedor: 'simulado', resultado: { intencao: 'aprova' } })
    expect(teste.tokens.entrada).toBeGreaterThan(0)
    expect(JSON.stringify(teste)).not.toContain(chave)
  })
  it('Anthropic: structured output (json_schema), esforço baixo, sem temperature; tokens e recusa', async () => {
    const chamadas: Record<string, unknown>[] = []
    let resposta: Record<string, unknown> = {
      model: 'claude-haiku-5-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 412, output_tokens: 38 },
      content: [{ type: 'text', text: JSON.stringify({ intencao: 'pergunta', confianca: 0.91, resumo: 'O cliente perguntou se dá para entregar na sexta.', tem_pergunta: true }) }],
    }
    const cliente = { messages: { create: async (p: Record<string, unknown>) => (chamadas.push(p), resposta) } }
    const { AnthropicProvider } = await import('../src/integrations/ia/anthropic')
    const p = new AnthropicProvider({ chave: 'k', modelo: 'claude-haiku-5-5', tempoLimiteMs: 15_000, cliente: cliente as never })
    const r = await p.estruturado(pedidoClassificarResposta(contexto('gostei, dá pra entregar sexta?')))
    expect(r).toMatchObject({ dados: { intencao: 'pergunta', temPergunta: true }, uso: { entrada: 412, saida: 38 }, modelo: 'claude-haiku-5-5' })
    const enviado = chamadas[0]!
    expect(enviado).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 1024, output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA_CLASSIFICACAO } } })
    expect(enviado).not.toHaveProperty('temperature')
    expect(enviado).not.toHaveProperty('top_p')
    expect((enviado.messages as { role: string }[]).map((m) => m.role)).toEqual(['user'])
    resposta = { ...resposta, stop_reason: 'refusal', content: [] }
    await expect(p.estruturado(pedidoClassificarResposta(contexto('x')))).rejects.toMatchObject({ tipo: 'recusa', uso: { entrada: 412, saida: 38 } })
    resposta = { ...resposta, stop_reason: 'end_turn', content: [{ type: 'text', text: 'não é json' }] }
    await expect(p.estruturado(pedidoClassificarResposta(contexto('x')))).rejects.toMatchObject({ tipo: 'resposta_invalida' })
  })
  it('provedores: Anthropic exige chave; OpenAI/Gemini ainda não existem; erros do SDK viram ErroIA', async () => {
    expect(() => criarProvedorIA({ provedor: 'anthropic', modelo: 'claude-haiku-5-5', chave: null })).toThrow(ErroIA)
    expect(() => criarProvedorIA({ provedor: 'openai', modelo: 'x', chave: 'k' })).toThrow(/ainda não está disponível/)
    expect(criarProvedorIA({ provedor: 'anthropic', modelo: 'claude-haiku-5-5', chave: 'k' }).nome).toBe('anthropic')
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    expect(traduzirErro(new Anthropic.APIConnectionTimeoutError()).tipo).toBe('tempo')
    expect(traduzirErro(new Anthropic.APIConnectionError({ message: 'x' })).tipo).toBe('indisponivel')
    expect(traduzirErro(new Error('x')).tipo).toBe('indisponivel')
  })
})
