import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  NAO_SEI_FAZER,
  clienteSchema,
  formatarMoeda,
  formatarTelefone,
  nomeCliente,
  normalizarNumeroWhatsapp,
  orcamentoSchema,
  textoMensagemOrcamento,
  type OrcamentoDeTexto,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { contextoUsuario } from '../../core/escopo'
import { linkAprovacaoOrcamento, linkSistema } from '../../core/links'
import { ErroWhatsapp, instanciaDaEmpresa } from '../../integrations/whatsapp'
import { clienteNovo, criarAjudasAssistente, dadosDoTexto } from '../assistente/ajudas.service'
import { controlesDaEmpresa, nomeDaGrafica } from '../assistente/empresa.service'
import { criarPedirService, tipoDoArquivo } from '../assistente/pedir.service'
import { criarPerguntasService } from '../assistente/perguntas.service'
import { criarClientesService } from '../clientes/service'
import { criarOrcamentosService } from '../orcamentos/orcamentos.service'
import { pdfDoOrcamento } from '../orcamentos/pdf'
import { avisarOrcamento } from '../orcamentos/tempo-real'
import { obterConfigWhatsapp, whatsappNoPlano } from './avisos'
import { numeroParaCadastro, numerosParaBusca } from './conversas'
import {
  AVISO_VALE_MS,
  PERGUNTA_VALE_MS,
  RASCUNHO_NO_CANAL_MS,
  ehCanalVoce,
  ehEcoDoAssistente,
  ehReacaoDeOrcamento,
  escolherParaCancelar,
  escolherParaEnviar,
  estaPendente,
  interpretarVoce,
  linhaDoRascunho,
  nomeDoPedido,
  selecionarMensagens,
  textoAvisoOrcamento,
  textoDaPergunta,
  textoEstado,
  textoNota,
  textoPergunta,
  type DecisaoEnvio,
  type RascunhoCanal,
} from './copiloto'
import { criarEnvioManual, validarPdf } from './manual'
import { templateDaCategoria } from './mensagem-pedido'
import { variantesDoNumero } from './respostas'
import type { EventoWebhook } from './webhook'

type EventoReacao = Extract<EventoWebhook, { tipo: 'reacao' }>
type EventoProprio = Extract<EventoWebhook, { tipo: 'proprio' }>
type Config = Awaited<ReturnType<typeof obterConfigWhatsapp>>

/** Quem age pelo canal "Você": o dono (o administrador mais antigo e ativo), com as permissões dele */
interface Dono {
  id: string
  req: FastifyRequest
}

/** Um texto que acabamos de mandar ao "Você" (o eco que volta pelo webhook é ignorado) */
const ECO_MS = 3 * 60_000

const incluirRascunho = {
  orcamento: { select: { id: true, numero: true, status: true, total: true, updatedAt: true, enviadoEm: true, liberacaoPendente: true, cliente: { select: { nome: true, fantasia: true } } } },
} satisfies Prisma.OrcamentoWhatsappInclude

type LinhaRascunho = Prisma.OrcamentoWhatsappGetPayload<{ include: typeof incluirRascunho }>

const paraRascunho = (l: LinhaRascunho): RascunhoCanal => ({
  orcamentoId: l.orcamentoId,
  numero: l.orcamento.numero,
  cliente: l.contato || nomeCliente(l.orcamento.cliente),
  total: l.orcamento.total.toString(),
  status: l.orcamento.status,
  criadoEm: l.createdAt,
  avisadoEm: l.avisadoEm,
  atualizadoEm: l.orcamento.updatedAt,
  enviadoEm: l.enviadoEm,
  enviadoNoSistemaEm: l.orcamento.enviadoEm,
  descartadoEm: l.descartadoEm,
  liberacaoPendente: l.orcamento.liberacaoPendente,
})

/**
 * Copiloto pelo WhatsApp (copiloto.ts tem as regras): 📝 numa mensagem do cliente salva o orçamento rascunho e avisa
 * na conversa "Você"; lá o dono responde "ok" (envia com o mesmo texto e PDF do "Enviar orçamento"), "cancela",
 * pergunta ("quem está devendo?"), pede orçamento ("orçamento pra Ana: 2 banners") ou manda a foto da nota. Só age
 * com o interruptor "Assistente no WhatsApp" ligado (padrão desligado). Respostas fixas não chamam a IA; o 📝 faz uma
 * leitura de orçamento e o resto passa pelo roteador barato do Peça ao Assistente. Nunca lança para o webhook.
 */
export function criarCopilotoWhatsapp(app: FastifyInstance) {
  const { prisma } = app
  const orcamentos = criarOrcamentosService(app)
  const ajudas = criarAjudasAssistente(app)
  const pedir = criarPedirService(app)
  const perguntas = criarPerguntasService(app)
  const clientes = criarClientesService(app)
  const enviarManual = criarEnvioManual(app)

  /** Textos mandados ao "Você" há pouco, por empresa (anti-laço antes de o id voltar do envio) */
  const textosEnviados = new Map<string, { texto: string; em: number }[]>()
  const emAndamento = new Set<Promise<void>>()
  function acompanhar(empresa: EmpresaAtual, tarefa: () => Promise<void>) {
    const p = contextoEmpresa.com(empresa, tarefa).catch((erro) => app.log.error({ err: erro, empresa: empresa.slug }, 'Copiloto do WhatsApp: tarefa falhou'))
    emAndamento.add(p)
    void p.finally(() => emAndamento.delete(p))
  }

  // ─── Ligado? Quem é o dono? Mandar no "Você" ───

  /** A config, só se o interruptor estiver ligado (e o WhatsApp no plano); senão null: a empresa não age */
  async function configLigada(empresa: EmpresaAtual): Promise<Config | null> {
    if (!whatsappNoPlano(empresa)) return null
    const config = await obterConfigWhatsapp(prisma)
    return config.assistenteWhatsapp ? config : null
  }

  /** Central da GrafyGo e a chave geral da empresa (Configurações → Assistente) */
  const assistenteLigado = async () => (await app.assistente.disponivel()) && (await controlesDaEmpresa(prisma)).ativo

  async function dono(): Promise<Dono | null> {
    const u = await prisma.usuario.findFirst({ where: { ativo: true, papel: { codigo: 'admin' } }, orderBy: { createdAt: 'asc' }, select: { id: true, papelId: true } })
    // As consultas e permissões olham só o usuário (sub e papel), como numa requisição dele
    return u ? { id: u.id, req: { user: { sub: u.id, papelId: u.papelId } } as unknown as FastifyRequest } : null
  }

  function lembrarTexto(empresaId: string, texto: string) {
    const agora = Date.now()
    const lista = (textosEnviados.get(empresaId) ?? []).filter((t) => agora - t.em < ECO_MS)
    lista.push({ texto, em: agora })
    textosEnviados.set(empresaId, lista.slice(-30))
  }

  /**
   * Manda no "Você" (o número conectado para ele mesmo) e registra: o eco é ignorado e o "ok" citando esta mensagem
   * acha o orçamento. Sem número conhecido ou desconectado, fica no log.
   */
  async function avisar(empresa: EmpresaAtual, texto: string, extra: { tipo?: 'aviso' | 'confirmar' | 'pergunta' | 'resposta'; orcamentoId?: string | null; opcoes?: string[] } = {}) {
    const config = await obterConfigWhatsapp(prisma)
    const provedor = app.whatsapp.provedor
    if (!config.numero || (!provedor.simulado && !config.conectado)) {
      app.log.warn({ empresa: empresa.slug }, 'Copiloto do WhatsApp: sem o número conectado para responder na conversa "Você"')
      return null
    }
    lembrarTexto(empresa.id, texto)
    let id: string | null = null
    try {
      id = (await provedor.enviarTexto(instanciaDaEmpresa(empresa.id), config.numero, texto)).id
    } catch (erro) {
      app.log.warn({ err: erro, empresa: empresa.slug }, 'Copiloto do WhatsApp: resposta no "Você" não saiu')
      return null
    }
    return prisma.mensagemVoceWhatsapp.create({
      data: { idExterno: id ?? `local-${randomUUID()}`, direcao: 'enviada', tipo: extra.tipo ?? 'resposta', texto: texto.slice(0, 4000), orcamentoId: extra.orcamentoId ?? null, opcoes: extra.opcoes ?? [] },
    })
  }

  /** Guarda a mensagem do dono (ou a reação): false se já veio (o mesmo aviso do webhook duas vezes) */
  async function registrarRecebida(idExterno: string, tipo: string, texto: string | null) {
    // skipDuplicates: o id único decide (dois avisos ao mesmo tempo, um só passa), sem erro no log
    const { count } = await prisma.mensagemVoceWhatsapp.createMany({ data: [{ idExterno, direcao: 'recebida', tipo, texto: texto?.slice(0, 4000) ?? null }], skipDuplicates: true })
    return count === 1
  }

  const mensagemDeErro = (erro: unknown) => (erro instanceof AppError && erro.statusCode < 500 ? erro.message : null)

  // ─── Clientes ───

  /** Cliente pelo número (com e sem o 9º dígito e o 55); o do WhatsApp igual vem antes */
  async function clienteDoNumero(numero: string | null) {
    const numeros = numerosParaBusca(numero)
    if (!numeros.length) return null
    const lista = await prisma.cliente.findMany({
      where: { ativo: true, OR: [{ whatsapp: { in: numeros } }, { telefone: { in: numeros } }] },
      select: { id: true, nome: true, fantasia: true, whatsapp: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })
    return lista.find((c) => c.whatsapp && numeros.includes(c.whatsapp)) ?? lista[0] ?? null
  }

  /** Pré-cadastro (sem duplicar: CPF/CNPJ ou WhatsApp já cadastrado devolve esse cliente) */
  async function preCadastro(d: Dono, dados: { nome: string; whatsapp?: string | null; telefone?: string | null; email?: string | null; documento?: string | null; tipoPessoa?: 'PF' | 'PJ' }) {
    const lido = clienteSchema.safeParse({
      tipoPessoa: dados.documento?.length === 14 ? 'PJ' : (dados.tipoPessoa ?? 'PF'),
      nome: dados.nome,
      cpfCnpj: dados.documento ?? '',
      whatsapp: dados.whatsapp ?? '',
      telefone: dados.telefone ?? '',
      email: dados.email ?? '',
      origem: 'whatsapp',
      situacao: 'pre_cadastro',
    })
    if (!lido.success) throw AppError.regraNegocio(`Cliente novo: ${lido.error.issues[0]?.message ?? 'confira os dados.'}`)
    try {
      const c = await clientes.criar(lido.data, d.id)
      return { id: c.id, rotulo: nomeCliente(c), novo: true }
    } catch (erro) {
      const det = erro instanceof AppError && erro.statusCode === 409 ? (erro.details as { clienteId?: string; nome?: string; ativo?: boolean } | undefined) : undefined
      if (det?.clienteId && det.ativo !== false) return { id: det.clienteId, rotulo: det.nome ?? dados.nome, novo: false }
      throw erro
    }
  }

  // ─── Orçamento rascunho salvo + aviso no "Você" ───

  /** O que o Assistente marcou para conferir, em frases curtas */
  function paraConferir(l: OrcamentoDeTexto): string[] {
    const lista: string[] = []
    for (const i of l.itens) {
      if (!i.produto) lista.push(`“${i.descricao}” não está no catálogo`)
      else if (i.conferir) lista.push(`${i.descricao}: ${(i.avisos[0] ?? (i.preco && !i.preco.ok ? i.preco.erros[0] : null) ?? 'produto ou quantidade').replace(/\.$/, '').toLowerCase()}`)
    }
    for (const n of l.naoIdentificados) lista.push(`não entendi “${n}”`)
    if (l.prazoDesejado && !l.dataDesejada) lista.push(`prazo “${l.prazoDesejado}”`)
    return lista.slice(0, 6)
  }

  /** Observações internas: o que o Assistente leu (como o editor faz) e as mensagens do cliente */
  function notaInterna(l: OrcamentoDeTexto, origem: string, texto: string) {
    const partes = [
      l.sugestoes.length ? `oferecer ao cliente: ${l.sugestoes.join('; ')}` : null,
      l.prazoDesejado && !l.dataDesejada ? `prazo pedido pelo cliente: ${l.prazoDesejado}` : null,
      l.observacoes,
      l.naoIdentificados.length ? `não entendido: ${l.naoIdentificados.join('; ')}` : null,
    ].filter(Boolean)
    return [`Pedido lido pelo Assistente GrafyGo (${origem})${partes.length ? ` — ${partes.join(' · ')}` : ''}`, `Mensagens: “${texto.slice(0, 1200)}”`].join('\n')
  }

  /**
   * Salva o orçamento rascunho com os itens lidos (o motor de preços recalcula tudo), liga ao WhatsApp e avisa no
   * "Você". Itens fora do catálogo não entram (ficam no "confira"). Devolve o orçamento ou lança 422 com a explicação.
   */
  async function salvarRascunho(
    empresa: EmpresaAtual,
    d: Dono,
    p: { origem: 'reacao' | 'voce'; gatilhoId: string; mensagemId: string | null; texto: string; cliente: { id: string; rotulo: string; novo: boolean }; numero: string | null; leitura: OrcamentoDeTexto },
  ) {
    const itens = p.leitura.itens.filter((i) => i.produto)
    if (!itens.length) {
      const nao = [...p.leitura.itens.map((i) => i.descricao), ...p.leitura.naoIdentificados]
      throw AppError.regraNegocio(`Não achei os produtos no catálogo${nao.length ? ` (${nao.slice(0, 3).join('; ')})` : ''}. Monte pelo sistema: ${linkSistema('/orcamentos/novo')}`)
    }
    const dados = orcamentoSchema.parse({
      clienteId: p.cliente.id,
      origem: 'assistente',
      dataDesejada: p.leitura.dataDesejada ?? null,
      observacoesInternas: notaInterna(p.leitura, p.origem === 'reacao' ? '📝 na conversa do WhatsApp' : 'pedido no WhatsApp', p.texto),
      itens: itens.map((i) => ({
        produtoId: i.produto!.id,
        quantidade: i.quantidade,
        largura: i.largura ?? '',
        altura: i.altura ?? '',
        acabamentoIds: i.acabamentos.map((a) => a.id),
        observacao: i.observacao ?? '',
      })),
    })
    const ctx = await contextoUsuario(app, d.req, 'orcamentos')
    const o = await orcamentos.criar(dados, ctx)
    const conferir = paraConferir(p.leitura)
    await prisma.orcamentoWhatsapp.create({
      data: { orcamentoId: o.id, origem: p.origem, gatilhoId: p.gatilhoId, mensagemId: p.mensagemId, numero: p.numero, contato: p.cliente.rotulo, conferir },
    })
    avisarOrcamento(app, o, 'criado', { origem: 'sistema', atorId: null })
    const aviso = textoAvisoOrcamento(
      {
        numero: o.numero,
        cliente: p.cliente.rotulo,
        clienteNovo: p.cliente.novo,
        itens: o.itens.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade.toString(), largura: i.largura?.toString(), altura: i.altura?.toString(), total: i.total.toString() })),
        total: o.total.toString(),
        conferir,
        link: linkSistema(`/orcamentos/${o.id}`),
        liberacaoPendente: o.liberacaoPendente,
      },
      p.origem,
    )
    if (await avisar(empresa, aviso, { tipo: 'aviso', orcamentoId: o.id })) await prisma.orcamentoWhatsapp.update({ where: { orcamentoId: o.id }, data: { avisadoEm: new Date() } })
    return o
  }

  // ─── 📝 numa mensagem do cliente ───

  async function processarReacao(empresa: EmpresaAtual, e: EventoReacao) {
    const d = await dono()
    if (!d) return void app.log.warn({ empresa: empresa.slug }, 'Copiloto do WhatsApp: sem administrador ativo para criar o orçamento')
    if (e.reagidaMinha) return void (await avisar(empresa, 'Reaja com 📝 numa mensagem do cliente (não numa sua) para eu montar o orçamento.'))
    // 📝 de novo na mesma mensagem: o orçamento que já existe
    const ja = await prisma.orcamentoWhatsapp.findFirst({ where: { mensagemId: e.idReagida }, select: { orcamentoId: true, orcamento: { select: { numero: true } } } })
    if (ja) return void (await avisar(empresa, `Essa mensagem já virou o ${ja.orcamento.numero}: ${linkSistema(`/orcamentos/${ja.orcamentoId}`)}`, { orcamentoId: ja.orcamentoId }))
    const ancora = await prisma.conversaMensagemWhatsapp.findUnique({
      where: { idExterno: e.idReagida },
      select: { conversa: { include: { mensagens: { orderBy: { recebidaEm: 'asc' }, take: 200 }, cliente: { select: { id: true, nome: true, fantasia: true, whatsapp: true, ativo: true } } } } },
    })
    if (!ancora) {
      return void (await avisar(
        empresa,
        `Não achei essa mensagem no sistema (só vejo as que chegaram com o WhatsApp conectado ao GrafyGo). Reaja com 📝 numa mensagem mais recente do cliente, ou monte pelo sistema: ${linkSistema('/orcamentos/novo')}`,
      ))
    }
    const conversa = ancora.conversa
    const numero = conversa.numero ?? e.numero
    // Nada de antes do último orçamento enviado a esse cliente (um orçamento resolvido não volta)
    const ultimoEnvio = numero
      ? await prisma.mensagemWhatsapp.findFirst({
          where: { evento: 'orcamento_enviado', status: 'enviada', telefone: { in: variantesDoNumero(numero) } },
          orderBy: { enviadaEm: 'desc' },
          select: { enviadaEm: true, createdAt: true, orcamento: { select: { numero: true } } },
        })
      : null
    const sel = selecionarMensagens(e.idReagida, conversa.mensagens, { ultimoEnvioEm: ultimoEnvio ? (ultimoEnvio.enviadaEm ?? ultimoEnvio.createdAt) : null })
    if (!sel.ok) {
      const motivo = {
        nao_encontrada: `Não achei essa mensagem no sistema. Monte pelo sistema: ${linkSistema('/orcamentos/novo')}`,
        usada: `Essa mensagem já entrou num orçamento. Veja os orçamentos: ${linkSistema('/orcamentos')}`,
        antiga: `Essa mensagem é de antes do último orçamento enviado para esse cliente${ultimoEnvio?.orcamento ? ` (${ultimoEnvio.orcamento.numero})` : ''}. Reaja com 📝 numa mensagem mais recente.`,
        sem_texto: `Essa conversa só tem foto ou áudio: não consigo ler os itens. Monte pelo sistema: ${linkSistema('/orcamentos/novo')}`,
      }[sel.motivo]
      return void (await avisar(empresa, motivo))
    }
    if (!(await assistenteLigado())) return void (await avisar(empresa, `O Assistente GrafyGo está desligado (Configurações → Assistente). Monte pelo sistema: ${linkSistema('/orcamentos/novo')}`))

    // Cliente: o da conversa, o do número ou o pré-cadastro com o número e o nome do perfil (sem duplicar)
    const doCadastro = conversa.cliente?.ativo ? conversa.cliente : await clienteDoNumero(numero)
    const whatsapp = numeroParaCadastro(numero)
    let cliente: { id: string; rotulo: string; novo: boolean }
    try {
      cliente = doCadastro
        ? { id: doCadastro.id, rotulo: nomeCliente(doCadastro), novo: false }
        : await preCadastro(d, { nome: conversa.nomeWhatsapp?.trim() || `WhatsApp ${formatarTelefone(whatsapp ?? numero ?? '')}`.trim(), whatsapp })
      // Cliente sem WhatsApp no cadastro: fica com o número de quem escreveu (o envio vai para ele sem perguntar)
      if (doCadastro && !doCadastro.whatsapp && whatsapp && !(await prisma.cliente.findFirst({ where: { whatsapp: { in: numerosParaBusca(numero) } }, select: { id: true } }))) {
        await prisma.cliente.update({ where: { id: doCadastro.id }, data: { whatsapp } })
      }
    } catch (erro) {
      return void (await avisar(empresa, mensagemDeErro(erro) ?? 'Não consegui cadastrar o cliente. Monte pelo sistema.'))
    }
    try {
      const leitura = await ajudas.orcamentoDeTexto(sel.texto, { clienteId: cliente.id, nome: conversa.nomeWhatsapp, whatsapp })
      const o = await salvarRascunho(empresa, d, { origem: 'reacao', gatilhoId: e.idMensagem, mensagemId: e.idReagida, texto: sel.texto, cliente, numero: numero ? normalizarNumeroWhatsapp(numero) : null, leitura })
      const agora = new Date()
      await prisma.conversaMensagemWhatsapp.updateMany({ where: { idExterno: { in: sel.mensagens.map((m) => m.idExterno) } }, data: { usadaEm: agora } })
      await prisma.conversaWhatsapp.update({ where: { id: conversa.id }, data: { orcamentoId: o.id, clienteId: conversa.clienteId ?? cliente.id, situacao: 'resolvida', resolvidaEm: agora, resolvidaPor: d.id, classificar: false } })
      app.tempoReal.emitir('whatsapp', 'conversa:atualizada', {})
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) app.log.error({ err: erro, empresa: empresa.slug }, 'Copiloto do WhatsApp: orçamento do 📝 não montado')
      await avisar(empresa, msg ? `Não montei o orçamento: ${msg}` : `Não consegui montar o orçamento agora. Tente o 📝 de novo em instantes ou monte pelo sistema: ${linkSistema('/orcamentos/novo')}`)
    }
  }

  // ─── Canal "Você": os rascunhos e o "ok" ───

  /** Os orçamentos do canal (dos últimos dias e os citados), como estão agora no sistema */
  async function rascunhos(extra: string[] = []): Promise<RascunhoCanal[]> {
    const linhas = await prisma.orcamentoWhatsapp.findMany({
      where: { OR: [{ createdAt: { gte: new Date(Date.now() - RASCUNHO_NO_CANAL_MS) } }, ...(extra.length ? [{ orcamentoId: { in: extra } }] : [])] },
      include: incluirRascunho,
      orderBy: { createdAt: 'asc' },
    })
    return linhas.map(paraRascunho)
  }

  /** O aviso que o dono citou (stanzaId): o orçamento dele e quando saiu */
  async function avisoCitado(citadoId: string | null) {
    if (!citadoId) return null
    const m = await prisma.mensagemVoceWhatsapp.findUnique({ where: { idExterno: citadoId }, select: { direcao: true, orcamentoId: true, createdAt: true } })
    return m?.direcao === 'enviada' && m.orcamentoId ? { orcamentoId: m.orcamentoId, em: m.createdAt } : null
  }

  async function perguntaAberta() {
    const p = await prisma.mensagemVoceWhatsapp.findFirst({
      where: { direcao: 'enviada', tipo: 'pergunta', resolvidaEm: null, createdAt: { gte: new Date(Date.now() - PERGUNTA_VALE_MS) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, opcoes: true, createdAt: true },
    })
    return p ? { id: p.id, opcoes: p.opcoes, em: p.createdAt } : null
  }

  /** O resumo atual de um orçamento do canal (para pedir outro ok) */
  async function reavisar(empresa: EmpresaAtual, r: RascunhoCanal, motivo: 'mudou' | 'antigo' | 'pela_referencia') {
    const o = await prisma.orcamento.findUnique({ where: { id: r.orcamentoId }, include: { itens: { orderBy: { ordem: 'asc' } }, whatsapp: true } })
    if (!o) return avisar(empresa, 'Esse orçamento não existe mais no sistema. Nada foi enviado.')
    const texto = textoAvisoOrcamento(
      {
        numero: o.numero,
        cliente: r.cliente,
        clienteNovo: false,
        itens: o.itens.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade.toString(), largura: i.largura?.toString(), altura: i.altura?.toString(), total: i.total.toString() })),
        total: o.total.toString(),
        conferir: [],
        link: linkSistema(`/orcamentos/${o.id}`),
        liberacaoPendente: o.liberacaoPendente,
      },
      motivo,
    )
    const m = await avisar(empresa, texto, { tipo: 'confirmar', orcamentoId: o.id })
    if (m) await prisma.orcamentoWhatsapp.update({ where: { orcamentoId: o.id }, data: { avisadoEm: m.createdAt } })
    return m
  }

  /** Logo da empresa como data URL (PNG/JPEG); sem logo ou falhando, null (o PDF sai sem) */
  async function logo(arquivoId: string | null): Promise<string | null> {
    if (!arquivoId) return null
    try {
      const a = await prisma.arquivo.findUnique({ where: { id: arquivoId }, select: { caminho: true, mime: true } })
      if (!a || !['image/png', 'image/jpeg'].includes(a.mime)) return null
      const partes: Buffer[] = []
      for await (const parte of app.storage.abrir(a.caminho)) partes.push(parte as Buffer)
      return `data:${a.mime};base64,${Buffer.concat(partes).toString('base64')}`
    } catch {
      return null
    }
  }

  /**
   * Envia um rascunho ao cliente pelo mesmo caminho do "Enviar orçamento" (texto do template no formato configurado e
   * o PDF), marca como enviado e confirma no "Você" dizendo qual. Só um envio por orçamento (marca antes de mandar).
   */
  async function enviarRascunho(empresa: EmpresaAtual, d: Dono, r: RascunhoCanal) {
    const marcado = await prisma.orcamentoWhatsapp.updateMany({ where: { orcamentoId: r.orcamentoId, enviadoEm: null, descartadoEm: null }, data: { enviadoEm: new Date() } })
    if (marcado.count !== 1) return avisar(empresa, textoEstado({ ...r, enviadoEm: r.enviadoEm ?? new Date() }, new Date()))
    const desfazer = () => prisma.orcamentoWhatsapp.update({ where: { orcamentoId: r.orcamentoId }, data: { enviadoEm: null } })
    try {
      const ctx = await contextoUsuario(app, d.req, 'orcamentos')
      const o = await orcamentos.obter(r.orcamentoId, { ...ctx, veTodos: true })
      if (o.status !== 'rascunho') {
        await desfazer()
        return avisar(empresa, textoEstado({ ...r, status: o.status, enviadoNoSistemaEm: o.enviadoEm }, new Date()))
      }
      if (o.liberacaoPendente) {
        await desfazer()
        return avisar(empresa, `O ${o.numero} precisa da liberação de um gerente antes de sair. Abra para liberar: ${linkSistema(`/orcamentos/${o.id}`)}`)
      }
      const ow = await prisma.orcamentoWhatsapp.findUnique({ where: { orcamentoId: o.id }, select: { numero: true } })
      const numero = normalizarNumeroWhatsapp(ow?.numero ?? '') ?? normalizarNumeroWhatsapp(o.cliente.whatsapp ?? o.cliente.telefone ?? '')
      if (!numero) {
        await desfazer()
        return avisar(empresa, `O cliente do ${o.numero} não tem WhatsApp no cadastro. Abra para enviar: ${linkSistema(`/orcamentos/${o.id}`)}`)
      }
      const config = await prisma.empresaConfig.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { nomeFantasia: true, razaoSocial: true, cnpj: true, whatsapp: true, telefone: true, email: true, site: true, logradouro: true, numero: true, bairro: true, cidade: true, uf: true, chavePix: true, corTema: true, logoArquivoId: true },
      })
      const link = linkAprovacaoOrcamento(o.tokenPublico)
      // O PDF do mesmo desenho da tela; se não sair, a mensagem vai sem ele (e o dono fica sabendo)
      let pdf: Buffer | null = null
      try {
        if (config) pdf = await pdfDoOrcamento(o, config, { logo: await logo(config.logoArquivoId), linkAprovacao: link })
      } catch (erro) {
        app.log.warn({ err: erro, empresa: empresa.slug, orcamento: o.numero }, 'Copiloto do WhatsApp: PDF do orçamento não gerado; envio só com o texto')
      }
      const texto = textoMensagemOrcamento(
        { ...o, total: o.total.toString(), sinalPercentual: o.sinalPercentual.toString(), validade: o.validade.toISOString(), itens: o.itens.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade.toString(), largura: i.largura?.toString(), altura: i.altura?.toString(), total: i.total.toString() })) },
        await templateDaCategoria(prisma, 'orcamento_enviado'),
        { empresa: (await nomeDaGrafica(prisma)) || empresa.nome, linkAprovacao: link, comPdf: Boolean(pdf) },
      )
      const resultado = await enviarManual(
        { tipo: 'orcamento_enviado', telefone: numero, texto, clienteId: o.clienteId, orcamentoId: o.id },
        pdf ? validarPdf(pdf, `${o.numero} - ${nomeCliente(o.cliente)}.pdf`) : null,
        d.id,
      )
      const enviado = await orcamentos.marcarEnviado(o.id, { ...ctx, veTodos: true })
      avisarOrcamento(app, enviado, 'enviado', { origem: 'sistema', atorId: null })
      const avisos = [resultado.aviso, pdf ? null : 'O PDF não foi junto: mande pelo sistema se precisar.'].filter(Boolean).join(' ')
      return avisar(empresa, `✅ ${o.numero} enviado para ${r.cliente} (${formatarMoeda(o.total.toString())}).${avisos ? `\n${avisos}` : ''}`, { orcamentoId: o.id })
    } catch (erro) {
      await desfazer()
      const msg = mensagemDeErro(erro) ?? (erro instanceof ErroWhatsapp ? erro.message : null)
      if (!msg) app.log.error({ err: erro, empresa: empresa.slug }, 'Copiloto do WhatsApp: envio do orçamento falhou')
      return avisar(empresa, `Não enviei o ${r.numero}: ${msg ?? 'falha ao enviar agora.'} Tente de novo ou envie pelo sistema: ${linkSistema(`/orcamentos/${r.orcamentoId}`)}`)
    }
  }

  async function aplicarEnvio(empresa: EmpresaAtual, d: Dono, decisao: DecisaoEnvio, pergunta: { id: string } | null) {
    const agora = new Date()
    switch (decisao.acao) {
      case 'enviar':
        if (pergunta) await prisma.mensagemVoceWhatsapp.update({ where: { id: pergunta.id }, data: { resolvidaEm: agora } })
        for (const r of decisao.rascunhos) await enviarRascunho(empresa, d, r)
        return
      case 'confirmar':
        await reavisar(empresa, decisao.rascunho, decisao.motivo)
        return
      case 'perguntar':
        await avisar(empresa, textoPergunta(decisao.rascunhos), { tipo: 'pergunta', opcoes: decisao.rascunhos.map((r) => r.orcamentoId) })
        return
      case 'estado':
        await avisar(empresa, `${textoEstado(decisao.rascunho, agora)}`, { orcamentoId: decisao.rascunho.orcamentoId })
        return
      case 'apagado':
        await avisar(empresa, 'Esse orçamento não existe mais no sistema. Nada foi enviado.')
        return
      case 'nenhum':
        await avisar(
          empresa,
          decisao.antigos.length
            ? `Não sei qual enviar: nenhum orçamento foi avisado aqui nos últimos 30 minutos. Responda *ok* em cima do aviso do orçamento (ou "ok 0105").\nEsperando envio:\n${decisao.antigos
                .slice(-5)
                .map((r) => `• ${linhaDoRascunho(r)}`)
                .join('\n')}`
            : 'Não há orçamento esperando envio por aqui. Reaja com 📝 numa mensagem do cliente para eu montar um.',
        )
        return
      case 'escolha_invalida':
        await avisar(empresa, decisao.motivo === 'opcao' ? 'Essa opção não está na lista. Responda com o número de uma das opções ou *todos*.' : 'Não tenho pergunta aberta agora. Responda *ok* em cima do aviso do orçamento que quer enviar.')
        return
    }
  }

  // ─── Canal "Você": roteador (perguntas, orçamento novo) ───

  async function orcamentoPeloVoce(empresa: EmpresaAtual, d: Dono, e: EventoProprio, texto: string) {
    if (!(await app.temPermissao(d.req, 'orcamentos', 'criar'))) return void (await avisar(empresa, 'Sem permissão para criar orçamentos.'))
    let leitura: OrcamentoDeTexto
    try {
      leitura = await ajudas.orcamentoDeTexto(texto)
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      return void (await avisar(empresa, msg))
    }
    const c = leitura.cliente
    // O nome lido pela IA ou, sem ele, o que vem depois do "pra" (sem IA)
    const nome = c.novo?.nome ?? c.mencionado ?? nomeDoPedido(texto)
    let candidatos = c.candidatos ?? []
    let achado = c.encontrado
    if (!achado && !candidatos.length && nome) {
      const porNome = await prisma.cliente.findMany({
        where: { ativo: true, OR: [{ nome: { contains: nome, mode: 'insensitive' } }, { fantasia: { contains: nome, mode: 'insensitive' } }] },
        select: { id: true, nome: true, fantasia: true },
        take: 4,
      })
      if (porNome.length === 1) achado = { id: porNome[0]!.id, rotulo: nomeCliente(porNome[0]!) }
      else candidatos = porNome.map((x) => ({ id: x.id, rotulo: nomeCliente(x), detalhe: null }))
    }
    let cliente: { id: string; rotulo: string; novo: boolean }
    let numero: string | null = null
    if (achado) {
      cliente = { id: achado.id, rotulo: achado.rotulo, novo: false }
      const cad = await prisma.cliente.findUnique({ where: { id: achado.id }, select: { whatsapp: true, telefone: true } })
      numero = normalizarNumeroWhatsapp(cad?.whatsapp ?? cad?.telefone ?? '')
    } else if (candidatos.length) {
      return void (await avisar(empresa, `Achei mais de um cliente: ${candidatos.map((x) => x.rotulo).join(', ')}. Mande de novo com o nome completo.`))
    } else if (nome) {
      // Cliente novo: o pré-cadastro com o nome e o contato escritos no pedido (WhatsApp, telefone, e-mail)
      const novo = c.novo ?? clienteNovo(dadosDoTexto(texto), nome)
      if (!novo?.whatsapp && !novo?.telefone && !novo?.email) {
        return void (await avisar(empresa, `Não achei ${nome} no cadastro. Mande de novo com o WhatsApp do cliente (ex.: "orçamento pra ${nome} 11 99999-9999: 2 banners 2x1").`))
      }
      try {
        cliente = await preCadastro(d, { nome, whatsapp: novo.whatsapp, telefone: novo.telefone, email: novo.email, documento: novo.documento, tipoPessoa: novo.tipoPessoa })
      } catch (erro) {
        return void (await avisar(empresa, mensagemDeErro(erro) ?? 'Não consegui cadastrar o cliente.'))
      }
      numero = normalizarNumeroWhatsapp(novo.whatsapp ?? '')
    } else {
      return void (await avisar(empresa, 'Para quem é o orçamento? Mande de novo com o nome do cliente (ex.: "orçamento pra Ana: 2 banners 2x1").'))
    }
    try {
      await salvarRascunho(empresa, d, { origem: 'voce', gatilhoId: e.idMensagem, mensagemId: null, texto, cliente, numero, leitura })
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      await avisar(empresa, `Não montei o orçamento: ${msg}`)
    }
  }

  async function roteador(empresa: EmpresaAtual, d: Dono, e: EventoProprio, texto: string) {
    if (!(await assistenteLigado())) return void (await avisar(empresa, 'O Assistente GrafyGo está desligado (Configurações → Assistente). Por aqui eu só envio orçamentos ("ok").'))
    let l: Awaited<ReturnType<typeof pedir.entender>>
    try {
      l = await pedir.entender(texto)
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      return void (await avisar(empresa, msg))
    }
    switch (l.intencao) {
      case 'pergunta':
        try {
          const r = await perguntas.responder(d.req, l.pergunta!, l.periodo)
          await avisar(empresa, textoDaPergunta(r, r.link ? linkSistema(r.link.path) : null))
        } catch (erro) {
          const msg = mensagemDeErro(erro)
          if (!msg) throw erro
          await avisar(empresa, msg)
        }
        return
      case 'orcamento':
        return orcamentoPeloVoce(empresa, d, e, texto)
      case 'cliente':
        return void (await avisar(empresa, `Abra para cadastrar o cliente: ${linkSistema(`/clientes/novo${l.nomeCliente ? `?${new URLSearchParams({ nome: l.nomeCliente })}` : ''}`)}`))
      case 'produto':
        return void (await avisar(empresa, `Cadastre o produto pelo sistema (no "Peça ao Assistente" eu preencho com a sua descrição): ${linkSistema('/produtos/novo')}`))
      case 'nota_compra':
        return void (await avisar(empresa, 'Mande aqui a foto, o PDF ou o XML da nota que eu preencho a entrada para você conferir.'))
      default:
        return void (await avisar(empresa, NAO_SEI_FAZER))
    }
  }

  // ─── Canal "Você": a nota de compra (foto, PDF ou XML) ───

  async function nota(empresa: EmpresaAtual, d: Dono, e: EventoProprio) {
    const sistema = linkSistema('/estoque/entradas/novo')
    if (!(await app.temPermissao(d.req, 'estoque', 'criar'))) return void (await avisar(empresa, 'Sem permissão para lançar notas de compra.'))
    let arquivo: { conteudo: Buffer; nome: string } | null = null
    try {
      const m = await app.whatsapp.provedor.baixarMidia(instanciaDaEmpresa(empresa.id), e.bruto)
      if (m) arquivo = { conteudo: m.conteudo, nome: e.arquivo?.nome ?? m.nomeArquivo ?? 'nota' }
    } catch (erro) {
      app.log.warn({ err: erro, empresa: empresa.slug }, 'Copiloto do WhatsApp: arquivo da nota não baixado')
    }
    if (!arquivo) return void (await avisar(empresa, `Não consegui baixar o arquivo. Lance a nota pelo sistema: ${sistema}`))
    const mediaType = tipoDoArquivo(arquivo.conteudo)
    if (!mediaType) return void (await avisar(empresa, 'Esse arquivo não parece uma nota. Mande a foto, o PDF do DANFE ou o XML.'))
    try {
      const lida = await pedir.nota(d.req, { nome: arquivo.nome, mediaType, conteudo: arquivo.conteudo })
      const salva = await prisma.notaWhatsapp.create({ data: { leitura: lida as unknown as Prisma.InputJsonValue, arquivo: arquivo.nome.slice(0, 200) } })
      await avisar(empresa, textoNota(lida, linkSistema(`/estoque/entradas/novo?notaWhatsapp=${salva.id}`)))
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      await avisar(empresa, `${msg} Lance pelo sistema: ${sistema}`)
    }
  }

  async function processarVoce(empresa: EmpresaAtual, e: EventoProprio) {
    const d = await dono()
    if (!d) return void app.log.warn({ empresa: empresa.slug }, 'Copiloto do WhatsApp: sem administrador ativo para o canal "Você"')
    if (e.midia === 'foto' || e.midia === 'documento') return nota(empresa, d, e)
    const texto = e.texto?.trim()
    if (!texto) return void (await avisar(empresa, 'Por aqui eu leio texto e a foto, o PDF ou o XML da nota. Áudio ainda não.'))
    const comando = interpretarVoce(texto)
    const agora = new Date()
    if (comando.tipo === 'enviar' || comando.tipo === 'escolha') {
      const citado = await avisoCitado(e.citadoId)
      const pergunta = comando.tipo === 'escolha' ? await perguntaAberta() : null
      const lista = await rascunhos([...(citado ? [citado.orcamentoId] : []), ...(pergunta?.opcoes ?? [])])
      return aplicarEnvio(empresa, d, escolherParaEnviar(comando, { citado, rascunhos: lista, pergunta, agora }), pergunta)
    }
    if (comando.tipo === 'cancelar') {
      const citado = await avisoCitado(e.citadoId)
      const decisao = escolherParaCancelar(comando.ref, { citado, rascunhos: await rascunhos(citado ? [citado.orcamentoId] : []), agora })
      if (decisao.acao === 'descartar') {
        await prisma.orcamentoWhatsapp.updateMany({ where: { orcamentoId: decisao.rascunho.orcamentoId, descartadoEm: null, enviadoEm: null }, data: { descartadoEm: agora } })
        return void (await avisar(empresa, `Certo: o ${decisao.rascunho.numero} (${decisao.rascunho.cliente}) não será enviado por aqui. Ele continua no sistema como rascunho.`, { orcamentoId: decisao.rascunho.orcamentoId }))
      }
      if (decisao.acao === 'estado') return void (await avisar(empresa, textoEstado(decisao.rascunho, agora)))
      if (decisao.acao === 'apagado') return void (await avisar(empresa, 'Esse orçamento não existe mais no sistema.'))
      return void (await avisar(
        empresa,
        decisao.pendentes.length
          ? `Qual? Responda *cancela* em cima do aviso do orçamento.\n${decisao.pendentes.map((r) => `• ${linhaDoRascunho(r)}`).join('\n')}`
          : 'Não há orçamento esperando envio por aqui.',
      ))
    }
    if (comando.tipo === 'ajuste') {
      // Edição automática ainda não: o link do editor do orçamento citado ou do último avisado
      const citado = await avisoCitado(e.citadoId)
      const alvo = citado ?? (await rascunhos()).filter((r) => estaPendente(r) && agora.getTime() - (r.avisadoEm ?? r.criadoEm).getTime() <= AVISO_VALE_MS).at(-1)
      if (alvo) return void (await avisar(empresa, `Abra para ajustar: ${linkSistema(`/orcamentos/${alvo.orcamentoId}`)}`, { orcamentoId: alvo.orcamentoId }))
    }
    return roteador(empresa, d, e, texto)
  }

  return {
    /**
     * Reação do dono: só a 📝 (✍️) e com o interruptor ligado. Registra já (o mesmo aviso do webhook não cria outro
     * orçamento) e monta em segundo plano: o webhook não espera a IA.
     */
    async reacao(empresa: EmpresaAtual, e: EventoReacao, sender: string | null): Promise<{ acao: string; motivo?: string }> {
      if (!ehReacaoDeOrcamento(e.emoji)) return { acao: 'ignorar', motivo: 'outra reação' }
      const config = await configLigada(empresa)
      if (!config) return { acao: 'ignorar', motivo: 'assistente no WhatsApp desligado' }
      if (ehCanalVoce(e.jids, { numero: config.numero, lid: config.lid, sender })) return { acao: 'ignorar', motivo: 'reação no "Você"' }
      if (!(await registrarRecebida(e.idMensagem, 'reacao', e.emoji))) return { acao: 'ignorar', motivo: 'repetida' }
      acompanhar(empresa, () => processarReacao(empresa, e))
      return { acao: 'copiloto', motivo: 'montando o orçamento' }
    },

    /**
     * Mensagem do próprio número: só a conversa "Você" interessa (o dono falando com o cliente não dispara nada); o eco
     * do que o Assistente mandou é ignorado. Responde em segundo plano.
     */
    async proprio(empresa: EmpresaAtual, e: EventoProprio, sender: string | null): Promise<{ acao: string; motivo?: string }> {
      const config = await configLigada(empresa)
      if (!config) return { acao: 'ignorar', motivo: 'assistente no WhatsApp desligado' }
      if (!ehCanalVoce(e.jids, { numero: config.numero, lid: config.lid, sender })) return { acao: 'ignorar', motivo: 'conversa com cliente' }
      const enviada = await prisma.mensagemVoceWhatsapp.findUnique({ where: { idExterno: e.idMensagem }, select: { direcao: true } })
      if (enviada) return { acao: 'ignorar', motivo: enviada.direcao === 'enviada' ? 'eco do assistente' : 'repetida' }
      const recentes = (textosEnviados.get(empresa.id) ?? []).filter((t) => Date.now() - t.em < ECO_MS).map((t) => t.texto)
      if (ehEcoDoAssistente({ idMensagem: e.idMensagem, texto: e.texto }, { ids: new Set(), textos: recentes })) return { acao: 'ignorar', motivo: 'eco do assistente' }
      if (!(await registrarRecebida(e.idMensagem, e.midia ?? 'texto', e.texto))) return { acao: 'ignorar', motivo: 'repetida' }
      acompanhar(empresa, () => processarVoce(empresa, e))
      return { acao: 'copiloto', motivo: 'canal Você' }
    },

    /** Espera as tarefas em andamento (testes e desligamento da API) */
    async aguardar() {
      while (emAndamento.size) await Promise.all([...emAndamento])
    },
  }
}

export type CopilotoWhatsapp = ReturnType<typeof criarCopilotoWhatsapp>
