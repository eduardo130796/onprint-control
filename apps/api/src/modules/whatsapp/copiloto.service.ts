import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  Decimal,
  NAO_SEI_FAZER,
  cadastroLoteSchema,
  clienteSchema,
  formatarMoeda,
  formatarTelefone,
  hojeISO,
  impedimentoDaLinha,
  linhaObsRecusados,
  itemDaLinha,
  linhaItemMensagem,
  nomeCliente,
  normalizarNumeroWhatsapp,
  orcamentoSchema,
  resumoCondicoesPagamento,
  textoMensagemOrcamento,
  type OrcamentoDeTexto,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { contextoUsuario } from '../../core/escopo'
import { linkAprovacaoOrcamento, linkSistema } from '../../core/links'
import { ErroWhatsapp, instanciaDaEmpresa } from '../../integrations/whatsapp'
import { clienteNovo, criarAjudasAssistente, dadosDoTexto } from '../assistente/ajudas.service'
import { controlesDaEmpresa, criarAssistenteEmpresa, mensagemSemResultado, nomeDaGrafica } from '../assistente/empresa.service'
import { criarNotasWhatsapp, linkDaNota } from '../assistente/notas-whatsapp'
import { criarPedirService, tipoDoArquivo } from '../assistente/pedir.service'
import { criarProdutosWhatsapp, linkDaLeituraProdutos, marcarLeituraCriada, prontoParaOk } from '../assistente/produtos-whatsapp'
import { criarCadastroLote } from '../produtos/cadastro-lote.service'
import { pedidoAjusteOrcamento } from '../assistente/prompts-ajuste'
import { criarPerguntasService } from '../assistente/perguntas.service'
import { criarClientesService } from '../clientes/service'
import { criarConversaoAutomatica } from '../orcamentos/conversao-automatica'
import { criarConversaoService } from '../orcamentos/conversao.service'
import { criarOrcamentosService } from '../orcamentos/orcamentos.service'
import { estornoAoCancelarPedido } from '../estoque/ganchos'
import { criarPedidosService } from '../pedidos/pedidos.service'
import { pdfDoOrcamento } from '../orcamentos/pdf'
import { avisarOrcamento } from '../orcamentos/tempo-real'
import { obterConfigWhatsapp, whatsappNoPlano } from './avisos'
import { numeroParaCadastro, numerosParaBusca } from './conversas'
import {
  AVISO_VALE_MS,
  OK_SOLTO_MS,
  estaPendente,
  exemploDePreco,
  foraDaLeitura,
  interpretarRespostaFora,
  juntarFora,
  lerForaDoCatalogo,
  linhaCurtaItem,
  linhaForaNoTopo,
  moedaCurta,
  pendentesFora,
  recusadosFora,
  rotuloFora,
  textoConfirmarFora,
  textoNadaNoCatalogo,
  type ComandoVoce,
  type ItemFora,
  JANELA_ACRESCENTAR_MS,
  PERGUNTA_VALE_MS,
  RASCUNHO_NO_CANAL_MS,
  ehCanalVoce,
  ehEcoDoAssistente,
  destinoDaReacao,
  ehReacaoDeOrcamento,
  escolherParaAjustar,
  formaDaConfirmacao,
  escolherParaCancelar,
  escolherParaEnviar,
  interpretarVoce,
  legendaDeProdutos,
  linhaDoAnterior,
  linhaDoRascunho,
  nomeDoPedido,
  rotaDoComando,
  selecionarMensagens,
  textoAcrescimo,
  textoAjuste,
  textoAvisoOrcamento,
  textoDaPergunta,
  textoEstado,
  textoNota,
  textoPergunta,
  textoProdutosLidos,
  type AvisoCitado,
  type ConfirmacaoDoDono,
  type DecisaoEnvio,
  type RascunhoCanal,
} from './copiloto'
import { DESFAZER_MS, impedimentoParaDesfazer, textoAprovadoAuto } from './aprovacao'
import { CONFIANCA_AJUSTE, aplicarItens, descontoDaOperacao, editavelDoOrcamento, payloadDoEditavel, validarAjuste, type ItemEditavel } from './ajustes'
import { criarEnvioManual, validarPdf } from './manual'
import { templateDaCategoria } from './mensagem-pedido'
import { variantesDoNumero } from './respostas'
import type { EventoWebhook } from './webhook'

type EventoReacao = Extract<EventoWebhook, { tipo: 'reacao' }>
type EventoProprio = Extract<EventoWebhook, { tipo: 'proprio' }>
type Config = Awaited<ReturnType<typeof obterConfigWhatsapp>>
type Dec = { toString(): string }
/** A mensagem do dono no "Você" que recebe a reação de confirmação */
type Gatilho = { jid: string; id: string }

/** Quem age pelo canal "Você": o dono (o administrador mais antigo e ativo), com as permissões dele */
interface Dono {
  id: string
  req: FastifyRequest
}

/** Um texto que acabamos de mandar ao "Você" (o eco que volta pelo webhook é ignorado) */
const ECO_MS = 3 * 60_000
/** A 📝 chegou antes da mensagem reagida ser gravada (leitura do Assistente em andamento): tenta de novo nestes intervalos */
const ESPERA_ANCORA = [1500, 3000, 6000, 10_000]

const incluirRascunho = {
  orcamento: { select: { id: true, numero: true, status: true, total: true, updatedAt: true, enviadoEm: true, liberacaoPendente: true, cliente: { select: { nome: true, fantasia: true } } } },
} satisfies Prisma.OrcamentoWhatsappInclude

type LinhaRascunho = Prisma.OrcamentoWhatsappGetPayload<{ include: typeof incluirRascunho }>

/**
 * O "ok" marca o rascunho como enviado antes de mandar (trava contra dois "ok" seguidos) e desmarca se o envio falha.
 * Se a API cair no meio, a marca fica: passado este tempo com o orçamento ainda em rascunho, a trava é abandonada.
 */
const TRAVA_ENVIO_MS = 2 * 60_000
const travaAbandonada = (enviadoEm: Date | null, status: string) => Boolean(enviadoEm) && status === 'rascunho' && Date.now() - enviadoEm!.getTime() > TRAVA_ENVIO_MS

const paraRascunho = (l: LinhaRascunho): RascunhoCanal => ({
  orcamentoId: l.orcamentoId,
  numero: l.orcamento.numero,
  cliente: l.contato || nomeCliente(l.orcamento.cliente),
  total: l.orcamento.total.toString(),
  status: l.orcamento.status,
  criadoEm: l.createdAt,
  avisadoEm: l.avisadoEm,
  atualizadoEm: l.orcamento.updatedAt,
  enviadoEm: travaAbandonada(l.enviadoEm, l.orcamento.status) ? null : l.enviadoEm,
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
  const notas = criarNotasWhatsapp(app)
  const assistenteEmpresa = criarAssistenteEmpresa(app)
  const automatica = criarConversaoAutomatica(app, criarConversaoService(app, orcamentos))
  const pedidosSvc = criarPedidosService(app, estornoAoCancelarPedido)
  const lote = criarCadastroLote(app)
  const produtosWhatsapp = criarProdutosWhatsapp(app)

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
  async function avisar(
    empresa: EmpresaAtual,
    texto: string,
    extra: {
      tipo?: 'aviso' | 'confirmar' | 'pergunta' | 'resposta' | 'confirmar_aprovacao' | 'aprovado_auto' | 'produto' | 'produto_criar' | 'confirmar_fora' | 'fora_pendencia'
      orcamentoId?: string | null
      opcoes?: string[]
      leituraProdutoId?: string
      /** Aviso "não tenho no catálogo" (a resposta com o preço cria produto e rascunho) */
      pendenciaId?: string
    } = {},
  ) {
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
      data: {
        idExterno: id ?? `local-${randomUUID()}`,
        direcao: 'enviada',
        tipo: extra.tipo ?? 'resposta',
        texto: texto.slice(0, 4000),
        orcamentoId: extra.orcamentoId ?? null,
        opcoes: extra.opcoes ?? [],
        leituraProdutoId: extra.leituraProdutoId ?? null,
        pendenciaId: extra.pendenciaId ?? null,
      },
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
    // O que ficou fora do catálogo não entra aqui: vai no topo do aviso ("⚠️ Ficou de fora…")
    for (const i of l.itens) {
      if (i.produto && i.conferir) lista.push(`${i.descricao}: ${(i.avisos[0] ?? (i.preco && !i.preco.ok ? i.preco.erros[0] : null) ?? 'produto ou quantidade').replace(/\.$/, '').toLowerCase()}`)
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
    p: {
      origem: 'reacao' | 'voce'
      gatilhoId: string
      mensagemId: string | null
      texto: string
      cliente: { id: string; rotulo: string; novo: boolean }
      numero: string | null
      leitura: OrcamentoDeTexto
      /** O último do mesmo cliente já não estava pendente (enviado, aprovado…): o aviso diz */
      anterior?: RascunhoCanal | null
      /** Linha antes do título (ex.: "Cadastrei Chaveiro acrílico (R$ 4/un) e montei:") */
      antes?: string
    },
  ) {
    const dados = orcamentoSchema.parse({
      clienteId: p.cliente.id,
      origem: 'assistente',
      dataDesejada: p.leitura.dataDesejada ?? null,
      observacoesInternas: notaInterna(p.leitura, p.origem === 'reacao' ? '📝 na conversa do WhatsApp' : 'pedido no WhatsApp', p.texto),
      itens: itensDaLeitura(p.leitura).map((n) => n.item),
    })
    const ctx = await contextoUsuario(app, d.req, 'orcamentos')
    const o = await orcamentos.criar(dados, ctx)
    const conferir = paraConferir(p.leitura)
    // O que o cliente pediu e não está no catálogo fica guardado: o aviso mostra no topo e o "ok" pergunta antes
    const fora = foraDaLeitura(p.leitura)
    await prisma.orcamentoWhatsapp.create({
      data: {
        orcamentoId: o.id,
        origem: p.origem,
        gatilhoId: p.gatilhoId,
        mensagemId: p.mensagemId,
        numero: p.numero,
        contato: p.cliente.rotulo,
        conferir,
        ...(fora.length ? { foraDoCatalogo: fora as unknown as Prisma.InputJsonValue } : {}),
      },
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
        desconto: o.desconto.toString(),
        antes: p.antes ?? (p.anterior ? linhaDoAnterior(p.anterior) : undefined),
        foraNoTopo: linhaForaNoTopo(fora),
      },
      p.origem,
    )
    if (await avisar(empresa, aviso, { tipo: 'aviso', orcamentoId: o.id })) await prisma.orcamentoWhatsapp.update({ where: { orcamentoId: o.id }, data: { avisadoEm: new Date() } })
    return o
  }

  /** Os itens que a leitura achou no catálogo, no formato do editor (fora do catálogo: 422 com o que não achou) */
  function itensDaLeitura(l: OrcamentoDeTexto): { item: ItemEditavel; rotulo: string }[] {
    const itens = l.itens.filter((i) => i.produto)
    if (!itens.length) {
      const nao = [...l.itens.map((i) => i.descricao), ...l.naoIdentificados]
      throw AppError.regraNegocio(`Não achei os produtos no catálogo${nao.length ? ` (${nao.slice(0, 3).join('; ')})` : ''}. Monte pelo sistema: ${linkSistema('/orcamentos/novo')}`)
    }
    return itens.map((i) => ({
      item: {
        produtoId: i.produto!.id,
        descricao: '',
        quantidade: i.quantidade,
        largura: i.largura,
        altura: i.altura,
        precoUnitario: null,
        acabamentoIds: i.acabamentos.map((a) => a.id),
        desconto: '0',
        observacao: i.observacao ?? '',
        precisaArte: i.produto!.precisaArte,
      },
      rotulo: `${Number(i.quantidade).toLocaleString('pt-BR')}× ${i.produto!.nome}`,
    }))
  }

  /** Itens do orçamento para as mensagens ("2× Banner 2,0 × 1,0 m — R$ 320,00") */
  const itensDaMensagem = (o: { itens: { descricao: string; quantidade: Dec; largura: Dec | null; altura: Dec | null; total: Dec }[] }) =>
    o.itens.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade.toString(), largura: i.largura?.toString(), altura: i.altura?.toString(), total: i.total.toString() }))

  /**
   * 📝 de novo do mesmo cliente: os itens novos entram no fim do rascunho pendente dele, pelo serviço de orçamentos (o
   * mesmo cálculo do editor; as edições do dono continuam). O aviso novo diz o que entrou e vira o válido: o "ok" no
   * aviso antigo cai em "mudou desde o aviso".
   */
  async function acrescentarAoRascunho(empresa: EmpresaAtual, d: Dono, r: RascunhoCanal, leitura: OrcamentoDeTexto, texto: string) {
    // Só o que está no catálogo entra; o que não está vai para a lista de fora (o aviso mostra no topo)
    const novos = leitura.itens.some((i) => i.produto) ? itensDaLeitura(leitura) : []
    const ctx = { ...(await contextoUsuario(app, d.req, 'orcamentos')), veTodos: true }
    const atual = await orcamentos.obter(r.orcamentoId, ctx)
    const base = editavelDoOrcamento(atual)
    const nota = notaInterna(leitura, '📝 na conversa do WhatsApp, acréscimo', texto)
    const o = novos.length
      ? await orcamentos.atualizar(
          r.orcamentoId,
          orcamentoSchema.parse(
            payloadDoEditavel({
              ...base,
              // O prazo que o dono já pôs vale mais que o do pedido novo
              dataDesejada: base.dataDesejada ?? leitura.dataDesejada ?? null,
              observacoesInternas: [base.observacoesInternas.trim(), nota].filter(Boolean).join('\n').slice(0, 2000),
              itens: [...base.itens, ...novos.map((n) => n.item)],
            }),
          ),
          ctx,
        )
      : atual
    const conferir = paraConferir(leitura)
    const ow = await prisma.orcamentoWhatsapp.findUnique({ where: { orcamentoId: o.id }, select: { conferir: true, foraDoCatalogo: true } })
    const fora = juntarFora(lerForaDoCatalogo(ow?.foraDoCatalogo), foraDaLeitura(leitura))
    await prisma.orcamentoWhatsapp.update({
      where: { orcamentoId: o.id },
      data: { conferir: [...new Set([...(ow?.conferir ?? []), ...conferir])].slice(0, 10), foraDoCatalogo: fora as unknown as Prisma.InputJsonValue },
    })
    avisarOrcamento(app, o, 'alterado', { origem: 'sistema', atorId: null })
    const todos = itensDaMensagem(o)
    const aviso = textoAcrescimo({
      numero: o.numero,
      cliente: r.cliente,
      clienteNovo: false,
      novos: todos.slice(base.itens.length),
      itens: todos,
      total: o.total.toString(),
      desconto: o.desconto.toString(),
      conferir,
      link: linkSistema(`/orcamentos/${o.id}`),
      liberacaoPendente: o.liberacaoPendente,
      foraNoTopo: linhaForaNoTopo(fora),
    })
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
    // 📝 de novo numa mensagem que esperava o preço (nada no catálogo): a mesma pergunta, sem ler de novo
    const esperando = await prisma.pendenciaCatalogoWhatsapp.findFirst({ where: { mensagemId: e.idReagida, situacao: 'pendente' }, orderBy: { createdAt: 'desc' } })
    if (esperando) {
      return void (await avisar(empresa, textoNadaNoCatalogo(foraDaLeitura(esperando.leitura as unknown as OrcamentoDeTexto)), { tipo: 'fora_pendencia', pendenciaId: esperando.id }))
    }
    const buscarAncora = () =>
      prisma.conversaMensagemWhatsapp.findUnique({
        where: { idExterno: e.idReagida },
        select: { conversa: { include: { mensagens: { orderBy: { recebidaEm: 'asc' }, take: 200 }, cliente: { select: { id: true, nome: true, fantasia: true, whatsapp: true, ativo: true } } } } },
      })
    // A mensagem do cliente pode ainda estar na leitura do Assistente (resposta a um orçamento enviado): espera um pouco
    let ancora = await buscarAncora()
    for (let tentativa = 0; !ancora && tentativa < ESPERA_ANCORA.length; tentativa++) {
      await new Promise((r) => setTimeout(r, ESPERA_ANCORA[tentativa]))
      ancora = await buscarAncora()
    }
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
        usada: conversa.orcamentoId ? `Essa mensagem já entrou num orçamento: ${linkSistema(`/orcamentos/${conversa.orcamentoId}`)}` : `Essa mensagem já entrou num orçamento. Veja os orçamentos: ${linkSistema('/orcamentos')}`,
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
      // O mesmo cliente com um rascunho do WhatsApp pendente das últimas 12 horas: os itens novos entram nele (um só)
      const numeroConversa = numero ? normalizarNumeroWhatsapp(numero) : null
      const doCliente = await prisma.orcamentoWhatsapp.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - JANELA_ACRESCENTAR_MS) },
          OR: [{ orcamento: { clienteId: cliente.id } }, ...(numeroConversa ? [{ numero: { in: variantesDoNumero(numeroConversa) } }] : [])],
        },
        include: incluirRascunho,
      })
      const destino = destinoDaReacao(doCliente.map(paraRascunho), new Date())
      const fora = foraDaLeitura(leitura)
      if (destino.acao === 'criar' && !leitura.itens.some((i) => i.produto) && fora.length) {
        // Nada no catálogo: nenhum rascunho vazio. Guarda a pendência e pergunta o preço (ou "não tem")
        const p = await prisma.pendenciaCatalogoWhatsapp.create({
          data: {
            gatilhoId: e.idMensagem,
            mensagemId: e.idReagida,
            conversaId: conversa.id,
            clienteId: cliente.id,
            clienteNovo: cliente.novo,
            contato: cliente.rotulo,
            numero: numeroConversa,
            texto: sel.texto,
            leitura: leitura as unknown as Prisma.InputJsonValue,
            mensagens: sel.mensagens.map((m) => m.idExterno),
          },
        })
        return void (await avisar(empresa, textoNadaNoCatalogo(fora), { tipo: 'fora_pendencia', pendenciaId: p.id }))
      }
      const o =
        destino.acao === 'acrescentar'
          ? await acrescentarAoRascunho(empresa, d, destino.rascunho, leitura, sel.texto)
          : await salvarRascunho(empresa, d, { origem: 'reacao', gatilhoId: e.idMensagem, mensagemId: e.idReagida, texto: sel.texto, cliente, numero: numeroConversa, leitura, anterior: destino.anterior })
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
    const m = await prisma.mensagemVoceWhatsapp.findUnique({ where: { idExterno: citadoId }, select: { direcao: true, tipo: true, orcamentoId: true, createdAt: true } })
    return m?.direcao === 'enviada' && m.orcamentoId ? { orcamentoId: m.orcamentoId, em: m.createdAt, tipo: m.tipo } : null
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
        desconto: o.desconto.toString(),
        foraNoTopo: linhaForaNoTopo(await foraDoRascunho(o.id)),
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
   * Confirmação do que o dono pediu e deu certo: reação na mensagem dele (formaDaConfirmacao); texto só com alerta.
   * Reação que não sai (a Evolution recusou): o texto inteiro, como antes.
   */
  async function confirmar(empresa: EmpresaAtual, gatilho: Gatilho | null, acao: ConfirmacaoDoDono, alertas: (string | null)[], planoB: string) {
    const f = formaDaConfirmacao(acao, alertas)
    if (gatilho) {
      try {
        await app.whatsapp.provedor.reagir(instanciaDaEmpresa(empresa.id), { remoteJid: gatilho.jid, fromMe: true, id: gatilho.id }, f.reacao)
        return f.texto ? avisar(empresa, f.texto) : null
      } catch (erro) {
        app.log.warn({ err: erro, empresa: empresa.slug }, 'Copiloto do WhatsApp: reação no "Você" não saiu; vai o texto')
      }
    }
    return avisar(empresa, f.texto ? `${planoB}\n${f.texto}` : planoB)
  }

  /**
   * O orçamento ao cliente pelo mesmo caminho do "Enviar orçamento" (texto do template no formato configurado e o PDF;
   * a linha registra a versão que o cliente viu). Devolve o que avisar ao dono (PDF que não foi…) ou "". Lança no erro.
   */
  async function enviarAoCliente(empresa: EmpresaAtual, d: Dono, o: Awaited<ReturnType<typeof orcamentos.obter>>, numero: string, recusados: string[] = []) {
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
      { ...o, total: o.total.toString(), sinalPercentual: o.sinalPercentual.toString(), validade: o.validade.toISOString(), itens: itensDaMensagem(o) },
      await templateDaCategoria(prisma, 'orcamento_enviado'),
      { empresa: (await nomeDaGrafica(prisma)) || empresa.nome, linkAprovacao: link, comPdf: Boolean(pdf), recusados },
    )
    const resultado = await enviarManual(
      { tipo: 'orcamento_enviado', telefone: numero, texto, clienteId: o.clienteId, orcamentoId: o.id },
      pdf ? validarPdf(pdf, `${o.numero} - ${nomeCliente(o.cliente)}.pdf`) : null,
      d.id,
    )
    return [resultado.aviso, pdf ? null : 'O PDF não foi junto: mande pelo sistema se precisar.'].filter(Boolean).join(' ')
  }

  /**
   * Envia um rascunho ao cliente pelo mesmo caminho do "Enviar orçamento" (texto do template no formato configurado e
   * o PDF), marca como enviado e confirma com ✅ na mensagem "ok" do dono. Só um envio por orçamento (marca antes).
   */
  async function enviarRascunho(empresa: EmpresaAtual, d: Dono, r: RascunhoCanal, gatilho: Gatilho | null, opcoes: { foraConfirmado?: boolean } = {}) {
    // Item pedido que ficou fora do catálogo: o "ok" apressado não manda sem ele (pede outro "ok", o preço ou "não tem")
    if (!opcoes.foraConfirmado && estaPendente(r)) {
      const pendentes = pendentesFora(await foraDoRascunho(r.orcamentoId))
      if (pendentes.length) return avisar(empresa, textoConfirmarFora(r.numero, pendentes), { tipo: 'confirmar_fora', orcamentoId: r.orcamentoId })
    }
    const livre: Prisma.OrcamentoWhatsappWhereInput = { OR: [{ enviadoEm: null }, { enviadoEm: { lt: new Date(Date.now() - TRAVA_ENVIO_MS) }, orcamento: { status: 'rascunho' } }] }
    const marcado = await prisma.orcamentoWhatsapp.updateMany({ where: { orcamentoId: r.orcamentoId, descartadoEm: null, ...livre }, data: { enviadoEm: new Date() } })
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
      const ow = await prisma.orcamentoWhatsapp.findUnique({ where: { orcamentoId: o.id }, select: { numero: true, foraDoCatalogo: true } })
      const numero = normalizarNumeroWhatsapp(ow?.numero ?? '') ?? normalizarNumeroWhatsapp(o.cliente.whatsapp ?? o.cliente.telefone ?? '')
      if (!numero) {
        await desfazer()
        return avisar(empresa, `O cliente do ${o.numero} não tem WhatsApp no cadastro. Abra para enviar: ${linkSistema(`/orcamentos/${o.id}`)}`)
      }
      // O que a gráfica não faz (o dono disse "não tem") vai numa linha "Obs." antes da assinatura
      const recusados = recusadosFora(lerForaDoCatalogo(ow?.foraDoCatalogo)).map((i) => i.descricao)
      const avisos = await enviarAoCliente(empresa, d, o, numero, recusados)
      const enviado = await orcamentos.marcarEnviado(o.id, { ...ctx, veTodos: true })
      avisarOrcamento(app, enviado, 'enviado', { origem: 'sistema', atorId: null })
      // Deu certo: ✅ na própria mensagem "ok" (texto só com alerta, como o PDF que não foi)
      return confirmar(empresa, gatilho, 'enviado', [avisos ? `${o.numero}: ${avisos}` : null], `✅ ${o.numero} enviado para ${r.cliente} (${formatarMoeda(o.total.toString())}).`)
    } catch (erro) {
      await desfazer()
      const msg = mensagemDeErro(erro) ?? (erro instanceof ErroWhatsapp ? erro.message : null)
      if (!msg) app.log.error({ err: erro, empresa: empresa.slug }, 'Copiloto do WhatsApp: envio do orçamento falhou')
      return avisar(empresa, `Não enviei o ${r.numero}: ${msg ?? 'falha ao enviar agora.'} Tente de novo ou envie pelo sistema: ${linkSistema(`/orcamentos/${r.orcamentoId}`)}`)
    }
  }

  async function aplicarEnvio(empresa: EmpresaAtual, d: Dono, decisao: DecisaoEnvio, pergunta: { id: string } | null, gatilho: Gatilho | null) {
    const agora = new Date()
    switch (decisao.acao) {
      case 'enviar':
        if (pergunta) await prisma.mensagemVoceWhatsapp.update({ where: { id: pergunta.id }, data: { resolvidaEm: agora } })
        for (const r of decisao.rascunhos) await enviarRascunho(empresa, d, r, gatilho)
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
        return produtosPeloVoce(empresa, d, { texto })
      case 'ajuda':
        return void (await avisar(
          empresa,
          l.tema ? `Tem o passo a passo na central de ajuda: ${linkSistema(`/ajuda/${l.tema}`)}` : `Veja os passo a passo na central de ajuda: ${linkSistema('/ajuda')}`,
        ))
      case 'nota_compra':
        return void (await avisar(empresa, 'Mande aqui a foto, o PDF ou o XML da nota que eu preencho a entrada para você conferir.'))
      default:
        return void (await avisar(empresa, NAO_SEI_FAZER))
    }
  }

  // ─── Canal "Você": a nota de compra (foto, PDF ou XML) ───

  async function baixarArquivo(empresa: EmpresaAtual, e: EventoProprio) {
    try {
      const m = await app.whatsapp.provedor.baixarMidia(instanciaDaEmpresa(empresa.id), e.bruto)
      if (m) return { conteudo: m.conteudo, nome: e.arquivo?.nome ?? m.nomeArquivo ?? 'arquivo' }
    } catch (erro) {
      app.log.warn({ err: erro, empresa: empresa.slug }, 'Copiloto do WhatsApp: arquivo não baixado')
    }
    return null
  }

  async function nota(empresa: EmpresaAtual, d: Dono, e: EventoProprio) {
    const sistema = linkSistema('/estoque/entradas/novo')
    // Foto com a legenda "tabela de preços", "produtos"…: cadastro de produtos, não nota
    if (legendaDeProdutos(e.texto)) return produtosPeloVoce(empresa, d, { arquivo: await baixarArquivo(empresa, e) })
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
      const salva = await notas.guardar(lida, arquivo.nome)
      await avisar(empresa, textoNota(lida, linkSistema(linkDaNota(salva.id))))
    } catch (erro) {
      // Não é nota (uma tabela de preços, um cardápio de serviços?): tenta ler os produtos
      if (erro instanceof AppError && (erro.details as { motivo?: string } | undefined)?.motivo === 'nao_e_nota' && mediaType !== 'text/xml') {
        return produtosPeloVoce(empresa, d, { arquivo: arquivo!, semTabela: `Não li uma nota nem uma tabela de preços nessa imagem. Para nota, mande a foto mais nítida ou o XML; para produtos, escreva "tabela" na legenda. Ou lance pelo sistema: ${sistema}` })
      }
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      await avisar(empresa, `${msg} Lance pelo sistema: ${sistema}`)
    }
  }

  // ─── Canal "Você": produtos ("novo produto: …" ou a foto de uma tabela de preços) ───

  /**
   * Lê os produtos (texto ou arquivo), guarda a leitura (sino + revisão preenchida) e responde com o resumo e o link.
   * Um produto só e claro: o aviso aceita o "ok" citando para criar. Nada é criado aqui.
   */
  async function produtosPeloVoce(empresa: EmpresaAtual, d: Dono, entrada: { texto?: string; arquivo?: { conteudo: Buffer; nome: string } | null; semTabela?: string }) {
    const sistema = linkSistema('/produtos/cadastrar-varios')
    if (!(await app.temPermissao(d.req, 'produtos', 'criar'))) return void (await avisar(empresa, 'Sem permissão para cadastrar produtos.'))
    if (!entrada.texto && !entrada.arquivo) return void (await avisar(empresa, `Não consegui baixar o arquivo. Cadastre pelo sistema: ${sistema}`))
    try {
      const l = entrada.texto
        ? await lote.lerTexto(entrada.texto, 'whatsapp')
        : await lote.lerArquivo({ nome: entrada.arquivo!.nome, mediaType: tipoDoArquivo(entrada.arquivo!.conteudo), conteudo: entrada.arquivo!.conteudo }, 'whatsapp')
      const salva = await produtosWhatsapp.guardar(l, entrada.texto ? 'texto' : 'foto')
      const porOk = prontoParaOk(l)
      await avisar(empresa, textoProdutosLidos(l, linkSistema(linkDaLeituraProdutos(salva.id)), porOk), { tipo: porOk ? 'produto_criar' : 'produto', leituraProdutoId: salva.id })
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      const naoETabela = erro instanceof AppError && (erro.details as { motivo?: string } | undefined)?.motivo === 'nao_e_tabela'
      await avisar(empresa, naoETabela && entrada.semTabela ? entrada.semTabela : `${msg} Cadastre pelo sistema: ${sistema}`)
    }
  }

  /**
   * Resposta em cima do aviso de produtos: "ok" cria (só no aviso de um produto claro, de até 2 horas, ainda pendente e
   * sem nome parecido no cadastro: a leitura vira "criada" na mesma transação, então o segundo "ok" não duplica);
   * "cancela" descarta; o resto, o link da revisão.
   */
  async function respostaAoAvisoDeProduto(empresa: EmpresaAtual, d: Dono, aviso: { tipo: string | null; leituraProdutoId: string; createdAt: Date }, texto: string) {
    const comando = interpretarVoce(texto)
    const link = linkSistema(linkDaLeituraProdutos(aviso.leituraProdutoId))
    if (comando.tipo === 'cancelar') {
      try {
        await produtosWhatsapp.descartar(aviso.leituraProdutoId)
        return void (await avisar(empresa, 'Certo, não criei. A leitura saiu da lista.'))
      } catch (erro) {
        return void (await avisar(empresa, mensagemDeErro(erro) ?? 'Não consegui descartar agora.'))
      }
    }
    if (comando.tipo !== 'enviar') return void (await avisar(empresa, `Para mudar o produto, abra a revisão (nada é criado sem você): ${link}`))
    if (aviso.tipo !== 'produto_criar') return void (await avisar(empresa, `Esse precisa da sua conferência antes. Abra para conferir e criar: ${link}`))
    if (Date.now() - aviso.createdAt.getTime() > AVISO_VALE_MS) return void (await avisar(empresa, `Esse aviso é antigo. Abra para conferir e criar: ${link}`))
    if (!(await app.temPermissao(d.req, 'produtos', 'criar'))) return void (await avisar(empresa, 'Sem permissão para cadastrar produtos.'))
    try {
      const l = await produtosWhatsapp.paraRevisao(aviso.leituraProdutoId, lote)
      // O cadastro pode ter mudado depois do aviso (outro produto com o mesmo nome): aí só pela revisão
      if (!prontoParaOk(l)) return void (await avisar(empresa, `Já existe produto parecido no cadastro. Abra para conferir: ${link}`))
      const dados = cadastroLoteSchema.parse({ itens: [itemDaLinha(l.linhas[0]!)], leituraId: aviso.leituraProdutoId })
      const r = await lote.criar(dados, d.id, (tx, ids) => marcarLeituraCriada(tx, aviso.leituraProdutoId, ids))
      const p = r.criados[0]!
      await avisar(empresa, `✅ ${p.nome} criado (${p.codigo}), pronto para orçamento: ${linkSistema(`/produtos/${p.id}`)}`)
    } catch (erro) {
      const det = erro instanceof AppError ? (erro.details as { motivo?: string; produtosIds?: string[] } | undefined) : undefined
      if (det?.motivo === 'criada') return void (await avisar(empresa, `Esse produto já foi criado${det.produtosIds?.[0] ? `: ${linkSistema(`/produtos/${det.produtosIds[0]}`)}` : '.'}`))
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      await avisar(empresa, `Não criei: ${msg} Abra para conferir: ${link}`)
    }
  }

  // ─── Item que o cliente pediu e não está no catálogo ───

  /** Os itens de fora do catálogo guardados no rascunho */
  async function foraDoRascunho(orcamentoId: string): Promise<ItemFora[]> {
    const ow = await prisma.orcamentoWhatsapp.findUnique({ where: { orcamentoId }, select: { foraDoCatalogo: true } })
    return lerForaDoCatalogo(ow?.foraDoCatalogo)
  }
  const gravarFora = (orcamentoId: string, l: ItemFora[]) => prisma.orcamentoWhatsapp.update({ where: { orcamentoId }, data: { foraDoCatalogo: l as unknown as Prisma.InputJsonValue } })

  const selecionarProdutoCurto = { id: true, nome: true, codigo: true, modoCalculo: true, precisaArte: true, precoVenda: true, larguraPadrao: true, alturaPadrao: true, ativo: true } as const
  type ProdutoCurto = Prisma.ProdutoGetPayload<{ select: typeof selecionarProdutoCurto }>

  /**
   * O produto pelo preço que o dono disse ("chaveiro acrílico R$ 4 a unidade"): a mesma leitura e o mesmo cadastro do
   * "Cadastrar vários" (auditoria, checagem de duplicado). Já existe um parecido: usa o do catálogo. Faltou o preço ou
   * como é cobrado: devolve a pergunta (nunca inventa preço).
   */
  async function produtoPeloPreco(d: Dono, texto: string, item: ItemFora): Promise<{ ok: true; produto: ProdutoCurto; criado: boolean } | { ok: false; pergunta: string }> {
    const exemplo = exemploDePreco([item])
    const cadastrar = linkSistema('/produtos/novo')
    if (!(await app.temPermissao(d.req, 'produtos', 'criar'))) return { ok: false, pergunta: 'Sem permissão para cadastrar produtos.' }
    let l: Awaited<ReturnType<typeof lote.lerTexto>>
    try {
      l = await lote.lerTexto(texto, 'whatsapp')
    } catch (erro) {
      if (!mensagemDeErro(erro)) throw erro
      return { ok: false, pergunta: `Não entendi o preço. Responda como no exemplo: "${exemplo}", ou cadastre pelo sistema: ${cadastrar}` }
    }
    if (l.linhas.length !== 1) return { ok: false, pergunta: `Me diga um produto por vez, ex.: "${exemplo}".` }
    const linha = l.linhas[0]!
    if (linha.duplicado) {
      const existente = await prisma.produto.findUnique({ where: { id: linha.duplicado.id }, select: selecionarProdutoCurto })
      if (existente?.ativo) return { ok: true, produto: existente, criado: false }
    }
    if (!prontoParaOk(l)) {
      const falta = impedimentoDaLinha(linha) ? 'o preço' : 'como é cobrado (por unidade, m², milheiro…)'
      return { ok: false, pergunta: `Para cadastrar “${linha.nome}” com segurança preciso saber ${falta}. Responda, por exemplo, "${exemplo}", ou cadastre pelo sistema: ${cadastrar}` }
    }
    const r = await lote.criar(cadastroLoteSchema.parse({ itens: [itemDaLinha(linha)] }), d.id)
    return { ok: true, produto: await prisma.produto.findUniqueOrThrow({ where: { id: r.criados[0]!.id }, select: selecionarProdutoCurto }), criado: true }
  }

  /** O item do produto (no fim do orçamento) com a quantidade que o cliente pediu e as medidas padrão do produto */
  const itemDoProduto = (p: ProdutoCurto, quantidade: string | null): ItemEditavel => ({
    produtoId: p.id,
    descricao: '',
    quantidade: quantidade ?? '1',
    largura: p.larguraPadrao?.toString() ?? null,
    altura: p.alturaPadrao?.toString() ?? null,
    precoUnitario: null,
    acabamentoIds: [],
    desconto: '0',
    observacao: '',
    precisaArte: p.precisaArte,
  })

  /**
   * A resposta do dono sobre o que ficou de fora, num rascunho pendente: citando o aviso dele (📝, ➕, ✏️ ou o do "ok"
   * com item de fora) ou, sem citar, com um só rascunho recente com item de fora. Devolve true se tratou.
   */
  async function respostaSobreFora(empresa: EmpresaAtual, d: Dono, citado: AvisoCitado | null, comando: ComandoVoce, texto: string, gatilho: Gatilho, agora: Date): Promise<boolean> {
    if (citado && !['aviso', 'confirmar', 'confirmar_fora', 'resposta'].includes(citado.tipo ?? '')) return false
    let r: RascunhoCanal | undefined
    if (citado) r = (await rascunhos([citado.orcamentoId])).find((x) => x.orcamentoId === citado.orcamentoId)
    else {
      const recentes = (await rascunhos()).filter((x) => estaPendente(x) && agora.getTime() - (x.avisadoEm ?? x.criadoEm).getTime() <= OK_SOLTO_MS)
      const comFora: RascunhoCanal[] = []
      for (const x of recentes) if (pendentesFora(await foraDoRascunho(x.orcamentoId)).length) comFora.push(x)
      if (comFora.length === 1) r = comFora[0]
    }
    if (!r || !estaPendente(r)) return false
    const fora = await foraDoRascunho(r.orcamentoId)
    const pendentes = pendentesFora(fora)
    if (!pendentes.length) return false
    const resposta = interpretarRespostaFora(texto, pendentes)
    if (resposta?.tipo === 'recusar') {
      await recusarFora(empresa, d, r, fora, resposta.itens.map((k) => pendentes[k]!))
      return true
    }
    if (resposta?.tipo === 'preco') {
      if (resposta.item === null) {
        await avisar(empresa, `De qual item é esse preço? ${pendentes.map((p, k) => `${k + 1}) ${rotuloFora(p)}`).join(' · ')}. Responda com o nome, ex.: "${exemploDePreco([pendentes[0]!])}".`, { tipo: 'confirmar_fora', orcamentoId: r.orcamentoId })
        return true
      }
      await incluirFora(empresa, d, r, fora, pendentes[resposta.item]!, texto)
      return true
    }
    // O segundo "ok", citando o aviso do "ok" com item de fora: envia assim (aviso de até 2 horas, sem mudança depois dele)
    if (citado?.tipo === 'confirmar_fora' && comando.tipo === 'enviar') {
      if (r.atualizadoEm.getTime() > citado.em.getTime() || agora.getTime() - citado.em.getTime() > AVISO_VALE_MS) {
        const antes = r.atualizadoEm.getTime() > citado.em.getTime() ? `O ${r.numero} mudou desde este aviso. ` : 'Esse aviso é antigo. '
        await avisar(empresa, `${antes}${textoConfirmarFora(r.numero, pendentes)}`, { tipo: 'confirmar_fora', orcamentoId: r.orcamentoId })
        return true
      }
      await enviarRascunho(empresa, d, r, gatilho, { foraConfirmado: true })
      return true
    }
    return false
  }

  /** "chaveiro R$ 4 a unidade": cadastra (ou usa o parecido), põe no fim do rascunho e devolve o ✏️ */
  async function incluirFora(empresa: EmpresaAtual, d: Dono, r: RascunhoCanal, fora: ItemFora[], item: ItemFora, texto: string) {
    const link = linkSistema(`/orcamentos/${r.orcamentoId}`)
    try {
      const res = await produtoPeloPreco(d, texto, item)
      if (!res.ok) return void (await avisar(empresa, res.pergunta, { tipo: 'confirmar_fora', orcamentoId: r.orcamentoId }))
      const ctx = { ...(await contextoUsuario(app, d.req, 'orcamentos')), veTodos: true }
      const atual = await orcamentos.obter(r.orcamentoId, ctx)
      const base = editavelDoOrcamento(atual)
      const o = await orcamentos.atualizar(r.orcamentoId, orcamentoSchema.parse(payloadDoEditavel({ ...base, itens: [...base.itens, itemDoProduto(res.produto, item.quantidade)] })), ctx)
      const novaLista = fora.map((f) => (f.chave === item.chave ? { ...f, situacao: 'incluido' as const, produtoId: res.produto.id } : f))
      await gravarFora(r.orcamentoId, novaLista)
      avisarOrcamento(app, o, 'alterado', { origem: 'sistema', atorId: null })
      const todos = itensDaMensagem(o)
      const aviso = textoAjuste({
        numero: o.numero,
        cliente: r.cliente,
        clienteNovo: false,
        itens: todos,
        total: o.total.toString(),
        desconto: o.desconto.toString(),
        conferir: item.quantidade ? [] : ['a quantidade do item novo (o pedido não disse)'],
        link,
        liberacaoPendente: o.liberacaoPendente,
        foraNoTopo: linhaForaNoTopo(novaLista),
        feito: `incluí ${linhaCurtaItem(todos.at(-1)!)}, ${res.criado ? 'cadastrei no catálogo' : `usei o ${res.produto.nome} que já estava no catálogo`}`,
      })
      if (await avisar(empresa, aviso, { tipo: 'aviso', orcamentoId: o.id })) await prisma.orcamentoWhatsapp.update({ where: { orcamentoId: o.id }, data: { avisadoEm: new Date() } })
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      await avisar(empresa, `Não incluí: ${msg} Abra para ajustar: ${link}`, { tipo: 'confirmar_fora', orcamentoId: r.orcamentoId })
    }
  }

  /**
   * "não tem", "não faço", "manda sem", "tira o chaveiro": o item fica recusado (sai do "⚠️"), o cliente vê a linha
   * "Obs.: … não fazemos no momento." na mensagem e nas observações do orçamento (PDF e tela), e o aviso pede o "ok"
   */
  async function recusarFora(empresa: EmpresaAtual, d: Dono, r: RascunhoCanal, fora: ItemFora[], recusados: ItemFora[]) {
    const chaves = new Set(recusados.map((i) => i.chave))
    const novaLista = fora.map((f) => (chaves.has(f.chave) ? { ...f, situacao: 'recusado' as const } : f))
    await gravarFora(r.orcamentoId, novaLista)
    const obs = linhaObsRecusados(recusadosFora(novaLista).map((i) => i.descricao))
    const ctx = { ...(await contextoUsuario(app, d.req, 'orcamentos')), veTodos: true }
    let o = await orcamentos.obter(r.orcamentoId, ctx)
    const base = editavelDoOrcamento(o)
    // A linha "Obs." anterior (de outra recusa) dá lugar à nova, com todos os recusados
    const observacoes = [...base.observacoes.split('\n').filter((l) => l.trim() && !/^Obs\.: .* não fazemos no momento\.$/.test(l.trim())), ...(obs ? [obs] : [])].join('\n').slice(0, 2000)
    if (observacoes !== base.observacoes) o = await orcamentos.atualizar(r.orcamentoId, orcamentoSchema.parse(payloadDoEditavel({ ...base, observacoes })), ctx)
    const aviso = textoAjuste({
      numero: o.numero,
      cliente: r.cliente,
      clienteNovo: false,
      itens: itensDaMensagem(o),
      total: o.total.toString(),
      desconto: o.desconto.toString(),
      conferir: [],
      link: linkSistema(`/orcamentos/${o.id}`),
      liberacaoPendente: o.liberacaoPendente,
      foraNoTopo: linhaForaNoTopo(novaLista),
      feito: `vai sem ${recusados.map(rotuloFora).join(' e ')}; o cliente lê “${obs}”`,
    })
    if (await avisar(empresa, aviso, { tipo: 'aviso', orcamentoId: o.id })) await prisma.orcamentoWhatsapp.update({ where: { orcamentoId: o.id }, data: { avisadoEm: new Date() } })
  }

  /**
   * Resposta em cima do "Não tenho no catálogo" (📝 sem nenhum item do catálogo): o preço cadastra o produto e monta
   * o rascunho de uma vez (com a quantidade do pedido); "não tem" encerra sem criar nada.
   */
  async function respostaAPendencia(empresa: EmpresaAtual, d: Dono, pendenciaId: string, texto: string) {
    const p = await prisma.pendenciaCatalogoWhatsapp.findUnique({ where: { id: pendenciaId } })
    if (!p) return void (await avisar(empresa, 'Esse pedido não está mais esperando.'))
    if (p.situacao === 'criada' && p.orcamentoId) return void (await avisar(empresa, `Esse pedido já virou orçamento: ${linkSistema(`/orcamentos/${p.orcamentoId}`)}`))
    if (p.situacao !== 'pendente') return void (await avisar(empresa, 'Esse pedido já foi encerrado. Nada foi criado.'))
    const leitura = p.leitura as unknown as OrcamentoDeTexto
    const fora = foraDaLeitura(leitura)
    const resposta = interpretarRespostaFora(texto, fora)
    const pedirDeNovo = (prefixo: string, itens = fora) => avisar(empresa, `${prefixo}${textoNadaNoCatalogo(itens)}`, { tipo: 'fora_pendencia', pendenciaId: p.id })
    if (!resposta) return void (await pedirDeNovo('Não entendi. '))
    // Índice do item de fora → o item da leitura (os sem produto, na ordem)
    const semProduto = leitura.itens.map((i, k) => (i.produto ? -1 : k)).filter((k) => k >= 0)
    if (resposta.tipo === 'recusar') {
      const tirar = new Set(resposta.itens.map((k) => semProduto[k]!))
      const restam = leitura.itens.filter((_, k) => !tirar.has(k))
      if (!restam.length) {
        await prisma.pendenciaCatalogoWhatsapp.update({ where: { id: p.id }, data: { situacao: 'descartada', resolvidaEm: new Date() } })
        return void (await avisar(empresa, 'Certo, nada foi criado.'))
      }
      const nova = { ...leitura, itens: restam }
      await prisma.pendenciaCatalogoWhatsapp.update({ where: { id: p.id }, data: { leitura: nova as unknown as Prisma.InputJsonValue } })
      return void (await pedirDeNovo('Certo. ', foraDaLeitura(nova)))
    }
    if (resposta.item === null) {
      return void (await avisar(empresa, `De qual item é esse preço? ${fora.map((f, k) => `${k + 1}) ${rotuloFora(f)}`).join(' · ')}. Responda com o nome, ex.: "${exemploDePreco([fora[0]!])}".`, { tipo: 'fora_pendencia', pendenciaId: p.id }))
    }
    const item = fora[resposta.item]!
    try {
      const res = await produtoPeloPreco(d, texto, item)
      if (!res.ok) return void (await avisar(empresa, res.pergunta, { tipo: 'fora_pendencia', pendenciaId: p.id }))
      const k = semProduto[resposta.item]!
      const pr = res.produto
      const sugerido = {
        ...leitura.itens[k]!,
        produto: { id: pr.id, nome: pr.nome, codigo: pr.codigo, modoCalculo: pr.modoCalculo, precisaArte: pr.precisaArte },
        quantidade: item.quantidade ?? '1',
        largura: pr.larguraPadrao?.toString() ?? null,
        altura: pr.alturaPadrao?.toString() ?? null,
        acabamentos: [],
        conferir: false,
        avisos: [],
      }
      const leitura2: OrcamentoDeTexto = { ...leitura, itens: leitura.itens.map((i, j) => (j === k ? sugerido : i)) }
      const cliente = await prisma.cliente.findUnique({ where: { id: p.clienteId }, select: { id: true, nome: true, fantasia: true } })
      if (!cliente) return void (await avisar(empresa, 'O cliente desse pedido não existe mais no cadastro. Nada foi criado.'))
      const preco = `${moedaCurta(pr.precoVenda.toString())} ${pr.modoCalculo === 'unidade' ? 'a unidade' : pr.modoCalculo === 'm2' ? 'o m²' : pr.modoCalculo === 'milheiro' ? 'o milheiro' : pr.modoCalculo === 'metro_linear' ? 'o metro' : 'a hora'}`
      const o = await salvarRascunho(empresa, d, {
        origem: 'reacao',
        gatilhoId: p.gatilhoId,
        mensagemId: p.mensagemId,
        texto: p.texto,
        cliente: { id: cliente.id, rotulo: p.contato ?? nomeCliente(cliente), novo: p.clienteNovo },
        numero: p.numero,
        leitura: leitura2,
        antes: res.criado ? `Cadastrei ${pr.nome} (${preco}) no catálogo e montei:` : `Usei o ${pr.nome} (${preco}) que já estava no catálogo e montei:`,
      })
      const agora = new Date()
      await prisma.pendenciaCatalogoWhatsapp.update({ where: { id: p.id }, data: { situacao: 'criada', orcamentoId: o.id, resolvidaEm: agora } })
      if (p.mensagens.length) await prisma.conversaMensagemWhatsapp.updateMany({ where: { idExterno: { in: p.mensagens } }, data: { usadaEm: agora } })
      if (p.conversaId) {
        await prisma.conversaWhatsapp.updateMany({ where: { id: p.conversaId }, data: { orcamentoId: o.id, situacao: 'resolvida', resolvidaEm: agora, resolvidaPor: d.id, classificar: false } })
      }
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      await avisar(empresa, `Não montei: ${msg}`, { tipo: 'fora_pendencia', pendenciaId: p.id })
    }
  }

  async function processarVoce(empresa: EmpresaAtual, e: EventoProprio) {
    const d = await dono()
    if (!d) return void app.log.warn({ empresa: empresa.slug }, 'Copiloto do WhatsApp: sem administrador ativo para o canal "Você"')
    if (e.midia === 'foto' || e.midia === 'documento') return nota(empresa, d, e)
    const texto = e.texto?.trim()
    if (!texto) return void (await avisar(empresa, 'Por aqui eu leio texto e a foto, o PDF ou o XML da nota. Áudio ainda não.'))
    // Em cima do aviso de produtos lidos ("ok" cria, "cancela" descarta): não é assunto de orçamento
    const avisoProduto = e.citadoId
      ? await prisma.mensagemVoceWhatsapp.findUnique({ where: { idExterno: e.citadoId }, select: { direcao: true, tipo: true, leituraProdutoId: true, pendenciaId: true, createdAt: true } })
      : null
    if (avisoProduto?.direcao === 'enviada' && avisoProduto.leituraProdutoId) {
      return respostaAoAvisoDeProduto(empresa, d, { tipo: avisoProduto.tipo, leituraProdutoId: avisoProduto.leituraProdutoId, createdAt: avisoProduto.createdAt }, texto)
    }
    // Em cima do "não tenho no catálogo" (nada no catálogo): o preço cria o produto e o rascunho; "não tem" encerra
    if (avisoProduto?.direcao === 'enviada' && avisoProduto.pendenciaId) return respostaAPendencia(empresa, d, avisoProduto.pendenciaId, texto)
    const comando = interpretarVoce(texto)
    const agora = new Date()
    // A mensagem do dono: as confirmações viram reação nela (✅, 👍, ↩️), sem mensagem nova
    const gatilho: Gatilho = { jid: e.jid, id: e.idMensagem }
    // Aprovação pela resposta do cliente: o aviso de "confirmar aprovação" (o "ok" APROVA; nunca reenvia sem pedir) e o
    // da aprovação automática ("desfazer"). São avisos de outro tipo que os de rascunho: cada um com o seu "ok".
    const citadoAprovacao = await avisoCitado(e.citadoId)
    // Item que ficou fora do catálogo: o preço inclui, "não tem" recusa, o segundo "ok" (citando) envia sem ele
    const fora = await respostaSobreFora(empresa, d, citadoAprovacao, comando, texto, gatilho, agora)
    if (fora) return
    switch (rotaDoComando(comando, citadoAprovacao?.tipo)) {
      case 'desfazer':
        return desfazerAprovacao(empresa, d, citadoAprovacao?.tipo === 'aprovado_auto' ? citadoAprovacao : null, Boolean(citadoAprovacao), gatilho)
      case 'aprovar':
        return aprovarPeloDono(empresa, d, citadoAprovacao!)
      case 'reenviar':
        return reenviarVersao(empresa, d, citadoAprovacao!.orcamentoId, gatilho)
      case 'nao_aprovar':
        return void (await avisar(empresa, `Certo, não aprovei. O orçamento continua esperando a sua confirmação ("Cliente aprovou pelo WhatsApp"): ${linkSistema(`/orcamentos/${citadoAprovacao!.orcamentoId}`)}`))
      case 'ajustar_aprovacao': {
        // Ajuste em cima do aviso ("faz por 500"): o ajuste de sempre; o aviso novo pede o "ok" para aprovar
        const r = await comoRascunho(citadoAprovacao!.orcamentoId)
        if (!r) return void (await avisar(empresa, 'Esse orçamento não existe mais no sistema. Nada foi feito.'))
        return ajustar(empresa, d, r, texto, 'aprovacao')
      }
      case 'ja_aprovado':
        return void (await avisar(empresa, 'Esse orçamento já foi aprovado. Se não era isso, responda *desfazer* em cima do aviso da aprovação (até 10 minutos).'))
      case 'reenviar_sem_citar':
        return void (await avisar(empresa, 'Responda *reenvia* em cima do aviso do orçamento que o cliente respondeu.'))
      case 'rascunho':
        break
    }
    if (comando.tipo === 'enviar' || comando.tipo === 'escolha') {
      const citado = await avisoCitado(e.citadoId)
      const pergunta = comando.tipo === 'escolha' ? await perguntaAberta() : null
      const lista = await rascunhos([...(citado ? [citado.orcamentoId] : []), ...(pergunta?.opcoes ?? [])])
      return aplicarEnvio(empresa, d, escolherParaEnviar(comando, { citado, rascunhos: lista, pergunta, agora }), pergunta, gatilho)
    }
    if (comando.tipo === 'cancelar') {
      const citado = await avisoCitado(e.citadoId)
      const decisao = escolherParaCancelar(comando.ref, { citado, rascunhos: await rascunhos(citado ? [citado.orcamentoId] : []), agora })
      if (decisao.acao === 'descartar') {
        await prisma.orcamentoWhatsapp.updateMany({ where: { orcamentoId: decisao.rascunho.orcamentoId, descartadoEm: null, enviadoEm: null }, data: { descartadoEm: agora } })
        // 👍 na mensagem "cancela" (o texto só se a reação não sair)
        return void (await confirmar(empresa, gatilho, 'cancelado', [], `Certo: o ${decisao.rascunho.numero} (${decisao.rascunho.cliente}) não será enviado por aqui. Ele continua no sistema como rascunho.`))
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
    // Ajuste ("10% de desconto", "tira o 2") ou qualquer texto em cima do aviso de um orçamento
    const citado = await avisoCitado(e.citadoId)
    if (comando.tipo === 'ajuste' || citado) {
      const decisao = escolherParaAjustar({ citado, rascunhos: await rascunhos(citado ? [citado.orcamentoId] : []), agora })
      switch (decisao.acao) {
        case 'ajustar':
          return ajustar(empresa, d, decisao.rascunho, texto)
        case 'estado':
          return void (await avisar(empresa, `${textoEstado(decisao.rascunho, agora)} Não alterei nada.`, { orcamentoId: decisao.rascunho.orcamentoId }))
        case 'apagado':
          return void (await avisar(empresa, 'Esse orçamento não existe mais no sistema. Não alterei nada.'))
        case 'perguntar':
          return void (await avisar(empresa, `Qual orçamento? Responda o ajuste em cima do aviso dele.\n${decisao.rascunhos.map((r) => `• ${linhaDoRascunho(r)}`).join('\n')}`))
        case 'nenhum':
          // Sem orçamento para ajustar: o pedido segue para o roteador (pode ser pergunta ou orçamento novo)
          break
      }
    }
    return roteador(empresa, d, e, texto)
  }

  // ─── Aprovação pela resposta do cliente: confirmar, reenviar e desfazer ───

  /** "Responda ok a esta mensagem para virar pedido assim…" (conforme a empresa converte ao aprovar) */
  async function linhaDeConfirmacao(comReenvio: boolean) {
    const e = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { converterAoAprovar: true } })
    const ok = `Responda *ok* a esta mensagem para ${(e?.converterAoAprovar ?? true) ? 'virar pedido' : 'aprovar'} assim`
    return comReenvio ? `${ok}, ou *reenvia* para mandar a versão nova ao cliente antes.` : `${ok}, ou ajuste antes ("faz por 500").`
  }

  /** O orçamento no formato dos textos do canal, mesmo sem ter nascido no WhatsApp */
  async function comoRascunho(orcamentoId: string): Promise<RascunhoCanal | null> {
    const o = await prisma.orcamento.findUnique({
      where: { id: orcamentoId },
      select: { id: true, numero: true, status: true, total: true, updatedAt: true, createdAt: true, enviadoEm: true, liberacaoPendente: true, cliente: { select: { nome: true, fantasia: true } } },
    })
    if (!o) return null
    return {
      orcamentoId: o.id,
      numero: o.numero,
      cliente: nomeCliente(o.cliente),
      total: o.total.toString(),
      status: o.status,
      criadoEm: o.createdAt,
      avisadoEm: null,
      atualizadoEm: o.updatedAt,
      enviadoEm: null,
      enviadoNoSistemaEm: o.enviadoEm,
      descartadoEm: null,
      liberacaoPendente: o.liberacaoPendente,
    }
  }

  /** Estado de um orçamento que não está mais esperando a aprovação */
  const estadoDaAprovacao = (numero: string, status: string) =>
    status === 'aprovado'
      ? `O ${numero} já foi aprovado. Nada foi feito.`
      : status === 'convertido'
        ? `O ${numero} já virou pedido. Nada foi feito.`
        : status === 'rascunho'
          ? `O ${numero} ainda não foi enviado ao cliente. Nada foi feito.`
          : `O ${numero} está ${status.replace(/_/g, ' ')}. Nada foi feito.`

  /**
   * O "ok" no aviso de aprovação a confirmar: aprova pelo mesmo caminho do botão "Cliente aprovou pelo WhatsApp" (e
   * converte, se a empresa deixou). Não reenvia nada ao cliente. Mudou de novo depois deste aviso: pergunta outra vez.
   */
  async function aprovarPeloDono(empresa: EmpresaAtual, d: Dono, citado: AvisoCitado) {
    const ctx = { ...(await contextoUsuario(app, d.req, 'orcamentos')), veTodos: true }
    const o = await prisma.orcamento.findUnique({
      where: { id: citado.orcamentoId },
      select: { id: true, numero: true, status: true, total: true, updatedAt: true, vendedorId: true, createdBy: true, liberacaoPendente: true, cliente: { select: { nome: true, fantasia: true } } },
    })
    if (!o) return void (await avisar(empresa, 'Esse orçamento não existe mais no sistema. Nada foi aprovado.'))
    const link = linkSistema(`/orcamentos/${o.id}`)
    if (!['enviado', 'em_negociacao'].includes(o.status)) return void (await avisar(empresa, estadoDaAprovacao(o.numero, o.status)))
    if (o.liberacaoPendente) return void (await avisar(empresa, `O ${o.numero} precisa da liberação de um gerente antes de aprovar. Abra para liberar: ${link}`))
    if (o.updatedAt.getTime() > citado.em.getTime()) {
      return void (await avisar(empresa, `O ${o.numero} mudou desde este aviso (total agora ${formatarMoeda(o.total.toString())}). ${await linhaDeConfirmacao(true)}`, { tipo: 'confirmar_aprovacao', orcamentoId: o.id }))
    }
    const nome = nomeCliente(o.cliente)
    try {
      await orcamentos.aprovarInterno(o.id, nome, ctx, 'whatsapp')
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      return void (await avisar(empresa, `Não aprovei o ${o.numero}: ${msg}`))
    }
    const r = await automatica.aposAprovacao({ id: o.id, numero: o.numero, vendedorId: o.vendedorId, createdBy: o.createdBy, cliente: o.cliente }, { origem: 'equipe', atorId: d.id, nome, canal: 'whatsapp' })
    await prisma.mensagemWhatsapp.updateMany({ where: { orcamentoId: o.id, aprovacaoPendente: { not: null } }, data: { aprovacaoPendente: null, aprovacaoPendenteEm: null } })
    const pedido = r.situacao === 'convertido' ? ` e virou o ${r.pedido.numero}` : ''
    const falhou = r.situacao === 'falhou' ? `\nO pedido não foi criado sozinho (${r.motivo.replace(/\.$/, '')}): converta pelo sistema: ${link}` : ''
    await avisar(empresa, `✅ ${o.numero} aprovado${pedido} (${formatarMoeda(o.total.toString())}).${falhou}`)
  }

  /** "reenvia" no aviso de aprovação a confirmar: a versão nova vai ao cliente (para ele responder sobre ela) */
  async function reenviarVersao(empresa: EmpresaAtual, d: Dono, orcamentoId: string, gatilho: Gatilho | null) {
    const ctx = { ...(await contextoUsuario(app, d.req, 'orcamentos')), veTodos: true }
    const link = linkSistema(`/orcamentos/${orcamentoId}`)
    try {
      const o = await orcamentos.obter(orcamentoId, ctx)
      if (!['enviado', 'em_negociacao'].includes(o.status)) return void (await avisar(empresa, estadoDaAprovacao(o.numero, o.status)))
      if (o.liberacaoPendente) return void (await avisar(empresa, `O ${o.numero} precisa da liberação de um gerente antes de sair. Abra para liberar: ${link}`))
      const ultima = await prisma.mensagemWhatsapp.findFirst({ where: { orcamentoId: o.id, evento: 'orcamento_enviado', status: 'enviada' }, orderBy: { enviadaEm: 'desc' }, select: { telefone: true } })
      const numero = ultima?.telefone ?? normalizarNumeroWhatsapp(o.cliente.whatsapp ?? o.cliente.telefone ?? '')
      if (!numero) return void (await avisar(empresa, `O cliente do ${o.numero} não tem WhatsApp no cadastro. Abra para enviar: ${link}`))
      // A resposta "a confirmar" era sobre a versão antiga: sai da faixa (a nova resposta decide de novo)
      await prisma.mensagemWhatsapp.updateMany({ where: { orcamentoId: o.id, aprovacaoPendente: { not: null } }, data: { aprovacaoPendente: null, aprovacaoPendenteEm: null } })
      const avisos = await enviarAoCliente(empresa, d, o, numero)
      avisarOrcamento(app, o, 'alterado', { origem: 'sistema', atorId: null })
      await confirmar(empresa, gatilho, 'reenviado', [avisos ? `${o.numero}: ${avisos}` : null], `✅ Versão nova do ${o.numero} enviada para ${nomeCliente(o.cliente)} (${formatarMoeda(o.total.toString())}). Agora é esperar a resposta.`)
    } catch (erro) {
      const msg = mensagemDeErro(erro) ?? (erro instanceof ErroWhatsapp ? erro.message : null)
      if (!msg) app.log.error({ err: erro, empresa: empresa.slug }, 'Copiloto do WhatsApp: reenvio do orçamento falhou')
      await avisar(empresa, `Não reenviei: ${msg ?? 'falha ao enviar agora.'} Envie pelo sistema: ${link}`)
    }
  }

  /**
   * "desfazer" (até 10 minutos depois do aviso da aprovação automática): cancela o pedido criado — só se nada aconteceu
   * nele (sem pagamento, sem produção, sem arte) — e o orçamento volta para "em negociação", sem o vínculo com o pedido
   * cancelado (pode ser aprovado de novo). A confirmação que ainda esperava na fila não sai; se já saiu, o dono fica
   * sabendo. Tudo na auditoria.
   */
  async function desfazerAprovacao(empresa: EmpresaAtual, d: Dono, citado: AvisoCitado | null, citouOutra: boolean, gatilho: Gatilho | null) {
    const agora = new Date()
    let aviso = citado
    if (!aviso && !citouOutra) {
      const recentes = await prisma.mensagemVoceWhatsapp.findMany({
        where: { direcao: 'enviada', tipo: 'aprovado_auto', createdAt: { gte: new Date(agora.getTime() - DESFAZER_MS) }, orcamentoId: { not: null } },
        select: { orcamentoId: true, createdAt: true },
      })
      if (recentes.length === 1) aviso = { orcamentoId: recentes[0]!.orcamentoId!, em: recentes[0]!.createdAt, tipo: 'aprovado_auto' }
    }
    if (!aviso) return void (await avisar(empresa, 'Responda *desfazer* em cima do aviso da aprovação (vale por 10 minutos).'))
    const o = await prisma.orcamento.findUnique({
      where: { id: aviso.orcamentoId },
      select: {
        id: true,
        numero: true,
        status: true,
        vendedorId: true,
        pedidoId: true,
        observacoesInternas: true,
        cliente: { select: { nome: true, fantasia: true } },
        pedido: {
          select: {
            id: true,
            numero: true,
            status: true,
            valorPago: true,
            contasReceber: { select: { status: true, valorPago: true } },
            ordensProducao: { select: { etapaAtual: true, cancelada: true } },
            itens: { select: { artes: { select: { status: true } } } },
          },
        },
      },
    })
    if (!o) return void (await avisar(empresa, 'Esse orçamento não existe mais no sistema.'))
    const link = linkSistema(o.pedido ? `/pedidos/${o.pedido.id}` : `/orcamentos/${o.id}`)
    const p = o.pedido
    const impedimento = impedimentoParaDesfazer({
      avisoEm: aviso.em,
      agora,
      orcamentoStatus: o.status,
      pedido: p
        ? {
            numero: p.numero,
            status: p.status,
            valorPago: p.valorPago.toString(),
            contasPagas: p.contasReceber.filter((c) => c.status === 'pago' || c.status === 'parcial' || Number(c.valorPago) > 0).length,
            opsIniciadas: p.ordensProducao.filter((op) => !op.cancelada && op.etapaAtual !== 'fila').length,
            artesMexidas: p.itens.flatMap((i) => i.artes).filter((a) => a.status !== 'aguardando_arquivo').length,
          }
        : null,
    })
    if (impedimento) return void (await avisar(empresa, `Não desfiz: ${impedimento}. Abra para ver: ${link}`))
    const motivo = `Aprovação automática do ${o.numero} desfeita pelo dono no WhatsApp.`
    if (p) {
      const ctxPedidos = { ...(await contextoUsuario(app, d.req, 'pedidos')), veTodos: true }
      await pedidosSvc.cancelar(p.id, motivo, false, ctxPedidos)
    }
    // A confirmação ao cliente que ainda esperava o respiro na fila não sai; a que já saiu, o dono fica sabendo
    if (p) await prisma.mensagemWhatsapp.updateMany({ where: { pedidoId: p.id, status: 'pendente' }, data: { status: 'ignorada', erro: 'Aprovação desfeita pelo dono no WhatsApp.' } })
    const saiu = await prisma.mensagemWhatsapp.count({
      where: {
        status: 'enviada',
        OR: [...(p ? [{ pedidoId: p.id }] : []), { orcamentoId: o.id, evento: 'resposta_orcamento', enviadaEm: { gte: new Date(aviso.em.getTime() - 15 * 60_000) } }],
      },
    })
    const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(agora).replace(',', '')
    await prisma.$transaction(async (tx) => {
      await tx.orcamento.update({
        where: { id: o.id },
        data: {
          status: 'em_negociacao',
          aprovadoEm: null,
          aprovadoPorNome: null,
          aprovadoIp: null,
          pedidoId: null,
          observacoesInternas: [o.observacoesInternas?.trim(), `[${quando} · WhatsApp] ${motivo}${p ? ` Pedido ${p.numero} cancelado.` : ''}`].filter(Boolean).join('\n').slice(0, 2000),
        },
      })
      await registrarAuditoria(tx, {
        tabela: 'orcamentos',
        registroId: o.id,
        acao: 'editar',
        antes: { status: o.status, pedido: p?.numero ?? null },
        depois: { status: 'em_negociacao', via: 'desfazer no WhatsApp (conversa "Você")', pedidoCancelado: p?.numero ?? null, confirmacaoJaSaiu: saiu > 0 },
        usuarioId: d.id,
      })
    })
    avisarOrcamento(app, { id: o.id, numero: o.numero, status: 'em_negociacao', vendedorId: o.vendedorId, pedidoId: null, cliente: o.cliente }, 'negociacao', { origem: 'equipe', atorId: d.id })
    // ↩️ na mensagem "desfazer"; texto só se a confirmação já tinha saído ao cliente (o dono precisa falar com ele)
    await confirmar(
      empresa,
      gatilho,
      'desfeito',
      [saiu ? `${o.numero} desfeito, mas o cliente já recebeu a confirmação pelo WhatsApp; fale com ele.` : null],
      `↩️ Desfeito: o ${o.numero} voltou para "em negociação"${p ? ` e o ${p.numero} foi cancelado` : ''}. ${saiu ? 'Atenção: o cliente já recebeu a confirmação pelo WhatsApp; fale com ele.' : 'Nenhuma confirmação saiu para o cliente.'}`,
    )
  }

  // ─── Canal "Você": ajuste do orçamento em linguagem natural ───

  /**
   * "10% de desconto", "tira o 2", "muda os banners para 3", "à vista no Pix", "entrega pra sexta": uma leitura barata
   * vira operações; o sistema confere todas (ajustes.ts) e só então aplica pelo serviço de orçamentos (o mesmo cálculo
   * do editor, com as regras comerciais). O Assistente nunca libera o que as regras pedem a um gerente: fica pendente.
   * Leitura incerta ou operação sem sentido: nada é aplicado. A resposta vira o aviso válido para o "ok".
   */
  async function ajustar(empresa: EmpresaAtual, d: Dono, r: RascunhoCanal, texto: string, modo: 'rascunho' | 'aprovacao' = 'rascunho') {
    const link = linkSistema(`/orcamentos/${r.orcamentoId}`)
    if (!(await assistenteLigado())) return void (await avisar(empresa, `O Assistente GrafyGo está desligado (Configurações → Assistente). Abra para ajustar: ${link}`))
    const ctxDono = { ...(await contextoUsuario(app, d.req, 'orcamentos')), veTodos: true }
    // Feito pelo Assistente: o que as regras pedem a um gerente fica pendente (nunca liberado sozinho)
    const ctx = { ...ctxDono, podeAprovar: false }
    const o = await orcamentos.obter(r.orcamentoId, ctxDono)
    if (modo === 'rascunho' ? o.status !== 'rascunho' : !['enviado', 'em_negociacao'].includes(o.status)) return void (await avisar(empresa, `${textoEstado({ ...r, status: o.status, enviadoNoSistemaEm: o.enviadoEm }, new Date())} Não alterei nada.`))
    const [produtos, formas] = await Promise.all([
      prisma.produto.findMany({
        where: { id: { in: o.itens.map((i) => i.produtoId) } },
        select: { id: true, acabamentos: { where: { acabamento: { ativo: true } }, select: { acabamento: { select: { id: true, nome: true } } } } },
      }),
      prisma.formaPagamento.findMany({ where: { ativo: true }, select: { nome: true }, orderBy: { nome: 'asc' } }),
    ])
    const nomesFormas = formas.map((f) => f.nome)
    const mensagem = itensDaMensagem(o)
    const itens = o.itens.map((i, k) => ({
      descricao: linhaItemMensagem(mensagem[k]!),
      acabamentosDoProduto: produtos.find((p) => p.id === i.produtoId)?.acabamentos.map((a) => a.acabamento) ?? [],
    }))
    const { assinanteId, recurso } = await assistenteEmpresa.exigirLigado('intencao')
    const leitura = await app.assistente.executar({
      assinanteId,
      recurso,
      pedido: pedidoAjusteOrcamento({
        grafica: (await nomeDaGrafica(prisma)) || empresa.nome,
        numero: o.numero,
        itens: itens.map((i) => ({ descricao: i.descricao, acabamentos: i.acabamentosDoProduto.map((a) => a.nome) })),
        pagamento: resumoCondicoesPagamento({ total: o.total.toString(), sinalPercentual: o.sinalPercentual.toString(), parcelas: o.parcelas, intervaloDias: o.intervaloDias }),
        formas: nomesFormas,
        texto,
      }),
      contar: (l) => l.operacoes.length,
    })
    if (!leitura.ok) return void (await avisar(empresa, `${mensagemSemResultado(leitura)} Abra para ajustar: ${link}`))
    const l = leitura.dados
    if (l.confianca < CONFIANCA_AJUSTE || !l.operacoes.length) {
      return void (await avisar(empresa, l.duvida ? `${l.duvida} Responda em cima do aviso, ou abra para ajustar: ${link}` : `Não entendi o ajuste. Abra para ajustar: ${link}`, { orcamentoId: o.id }))
    }
    const hoje = hojeISO()
    const valido = validarAjuste(l.operacoes, { total: o.total.toString(), desconto: o.desconto.toString(), itens }, { formas: nomesFormas, hoje })
    if (!valido.ok) return void (await avisar(empresa, `Não mudei nada: não entendi ${valido.motivo}. Abra para ajustar: ${link}`, { orcamentoId: o.id }))

    // Itens novos ("acrescenta 1 wind banner"): a mesma leitura de orçamento por texto, só com o trecho novo
    const novos: { item: ItemEditavel; rotulo: string }[] = []
    try {
      for (const op of l.operacoes.filter((x) => x.tipo === 'acrescentar')) novos.push(...itensDaLeitura(await ajudas.orcamentoDeTexto(op.texto!, { clienteId: o.clienteId, nome: null, whatsapp: null })))
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      return void (await avisar(empresa, `Não mudei nada: ${msg}`, { orcamentoId: o.id }))
    }

    const feito: string[] = []
    let salvo = o
    const mexeEmItens = l.operacoes.some((x) => !['desconto_percentual', 'desconto_valor', 'total_final'].includes(x.tipo))
    try {
      if (mexeEmItens) {
        const r1 = aplicarItens(editavelDoOrcamento(o), l.operacoes, { itens, formas: nomesFormas, hoje, novos })
        salvo = await orcamentos.atualizar(o.id, orcamentoSchema.parse(payloadDoEditavel(r1.editavel)), ctx)
        feito.push(...r1.feito)
      }
    } catch (erro) {
      const msg = mensagemDeErro(erro)
      if (!msg) throw erro
      return void (await avisar(empresa, `Não mudei nada: ${msg} Abra para ajustar: ${link}`, { orcamentoId: o.id }))
    }
    // Desconto depois dos itens (o "10%" e o "faz por" valem sobre o total novo)
    const opDesconto = l.operacoes.find((x) => ['desconto_percentual', 'desconto_valor', 'total_final'].includes(x.tipo))
    let faltou: string | null = null
    if (opDesconto) {
      try {
        const dsc = descontoDaOperacao(opDesconto, { total: salvo.total.toString(), desconto: salvo.desconto.toString() })
        if (!dsc) faltou = 'o desconto (passaria do total)'
        else {
          salvo = await orcamentos.atualizar(o.id, orcamentoSchema.parse(payloadDoEditavel({ ...editavelDoOrcamento(salvo), desconto: dsc.desconto })), ctx)
          // "Faz por 600": as regras comerciais podem mexer no total; acerta a diferença uma vez
          if (opDesconto.tipo === 'total_final' && !new Decimal(salvo.total.toString()).eq(opDesconto.numero!)) {
            const acerto = descontoDaOperacao(opDesconto, { total: salvo.total.toString(), desconto: salvo.desconto.toString() })
            if (acerto) salvo = await orcamentos.atualizar(o.id, orcamentoSchema.parse(payloadDoEditavel({ ...editavelDoOrcamento(salvo), desconto: acerto.desconto })), ctx)
          }
          feito.push(dsc.feito)
        }
      } catch (erro) {
        const msg = mensagemDeErro(erro)
        if (!msg) throw erro
        faltou = `o desconto (${msg.replace(/\.$/, '')})`
      }
    }
    if (!feito.length) return void (await avisar(empresa, `Não mudei nada: ${faltou ?? 'não entendi o ajuste'}. Abra para ajustar: ${link}`, { orcamentoId: o.id }))
    await prisma.$transaction((tx) =>
      registrarAuditoria(tx, {
        tabela: 'orcamentos',
        registroId: o.id,
        acao: 'editar',
        antes: { total: o.total.toString(), desconto: o.desconto.toString(), itens: o.itens.length },
        depois: { via: 'Assistente no WhatsApp, a pedido do dono (conversa "Você")', pedido: texto.slice(0, 500), operacoes: l.operacoes, feito, total: salvo.total.toString() },
        usuarioId: d.id,
      }),
    )
    avisarOrcamento(app, salvo, 'alterado', { origem: 'sistema', atorId: null })
    const aviso = textoAjuste({
      numero: salvo.numero,
      cliente: r.cliente,
      clienteNovo: false,
      itens: itensDaMensagem(salvo),
      total: salvo.total.toString(),
      desconto: salvo.desconto.toString(),
      conferir: faltou ? [`não apliquei ${faltou}`] : [],
      link,
      liberacaoPendente: salvo.liberacaoPendente,
      foraNoTopo: linhaForaNoTopo(await foraDoRascunho(salvo.id)),
      feito: feito.join('; '),
      // Aprovação a confirmar: o "ok" no aviso novo aprova (o cliente viu a versão de antes: "reenvia" manda a nova)
      acaoFinal: modo === 'aprovacao' ? await linhaDeConfirmacao(true) : undefined,
    })
    const tipo = modo === 'aprovacao' ? 'confirmar_aprovacao' : 'aviso'
    if (await avisar(empresa, aviso, { tipo, orcamentoId: salvo.id })) await prisma.orcamentoWhatsapp.updateMany({ where: { orcamentoId: salvo.id }, data: { avisadoEm: new Date() } })
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

    /**
     * Aprovação do cliente que não saiu sozinha (conversa depois do envio, orçamento mudou): pergunta no "Você", com
     * o Assistente no WhatsApp ligado. Devolve se perguntou (desligado: fica o sino e a faixa no orçamento).
     */
    async pedirConfirmacaoAprovacao(empresa: EmpresaAtual, p: { orcamentoId: string; texto: string }): Promise<boolean> {
      if (!(await configLigada(empresa))) return false
      return Boolean(await avisar(empresa, p.texto, { tipo: 'confirmar_aprovacao', orcamentoId: p.orcamentoId }))
    },

    /** Aprovou sozinho (caso limpo): avisa no "Você", com o "desfazer" por 10 minutos */
    async avisarAprovadoAuto(empresa: EmpresaAtual, p: { orcamentoId: string; numero: string; cliente: string; total: string; pedido: string | null }) {
      if (!(await configLigada(empresa))) return
      await avisar(empresa, textoAprovadoAuto(p), { tipo: 'aprovado_auto', orcamentoId: p.orcamentoId })
    },

    /** Espera as tarefas em andamento (testes e desligamento da API) */
    async aguardar() {
      while (emAndamento.size) await Promise.all([...emAndamento])
    },
  }
}

export type CopilotoWhatsapp = ReturnType<typeof criarCopilotoWhatsapp>
