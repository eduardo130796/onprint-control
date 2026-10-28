import type { FastifyInstance } from 'fastify'
import { STATUS_PEDIDO_FINAIS, formatarDataSimples, formatarMoeda, formatarTelefone, hojeISO, nomeCliente, type StatusPedido } from '@onprint/shared'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { linkAprovacaoOrcamento } from '../../core/links'
import { ErroWhatsapp, instanciaDaEmpresa } from '../../integrations/whatsapp'
import { montarCerebro } from '../assistente/cerebro'
import { urlDaVitrine } from '../vitrine/regras'
import { controlesDaEmpresa, nomeDaGrafica } from '../assistente/empresa.service'
import { primeiroNome } from '../assistente/prompts'
import { pedidoAtendimento, type ContextoAtendimento } from '../assistente/prompts-atendimento'
import {
  APRESENTACAO_VALE_MS,
  ATENDER_ATE_MS,
  DONO_NA_CONVERSA_MS,
  ESPERA_SEGUIDA_MS,
  MAX_ATENDIMENTOS,
  PARADA_VALE_MS,
  agoraPorExtenso,
  ajustarAbertura,
  apresentacao,
  avisoLimite,
  avisoPediuPessoa,
  avisoSemResposta,
  comApresentacao,
  esperaDoAtendente,
  funcionamentoAgora,
  negociando,
  paradaValendo,
  pedePessoa,
  quandoAtender,
  valorNovo,
  textoChamarPessoa,
  textoMenuCliente,
  FIM_DO_MENU,
  opcoesDoMenu,
  pedidoDoCliente,
  semCabecalho,
  textoCatalogo,
  textoConviteOrcamento,
  textoNovoOrcamento,
  textoVerOrcamento,
  fraseDoPedido,
  legendaDoProduto,
  linhaDoProduto,
  type ProdutoDoCatalogo,
  textoRecepcao,
  type ParadaAtendente,
} from './atendente'
import { obterConfigWhatsapp, whatsappNoPlano } from './avisos'
import type { CopilotoWhatsapp } from './copiloto.service'
import { quandoFalar, respostaProntaDoPedido, soSaudacao } from './conversas'
import type { criarMensagensDono } from './mensagens-dono'
import { lerArquivo } from './anexos-arte'
import { variantesDoNumero } from './respostas'

const ASSUNTOS = ['orcamento', 'pedido', 'duvida'] as const
/** Entre a mídia (fotos, PDF) e o convite para o orçamento: o convite chega depois dela */
const PAUSA_ANTES_DO_CONVITE_MS = 3_000
type Assunto = (typeof ASSUNTOS)[number]

const incluirConversa = {
  cliente: { select: { id: true, nome: true, fantasia: true, tipoPessoa: true } },
  mensagens: { where: { tratada: false }, orderBy: { recebidaEm: 'asc' as const }, take: 50 },
}

/**
 * Atendente do WhatsApp (atendente.ts tem as regras): a cada minuto, as conversas de cliente sem resposta há alguns
 * minutos recebem uma mensagem do Assistente em nome da gráfica. Orçamento: o rascunho fica pronto no "Você" (o mesmo
 * do 📝) e o cliente ouve o que foi anotado e o que falta, sem valor. Pedido: a situação pelo sistema. Dúvida: só o
 * que a gráfica deixou dizer; o resto vai para o dono. Sai de cena quando o dono ou a equipe falam com o cliente, e de
 * vez quando o cliente pede uma pessoa. Só com "Assistente no WhatsApp" e o atendente ligados (padrão desligado).
 */
export function criarAtendenteWhatsapp(app: FastifyInstance, deps: { copiloto: CopilotoWhatsapp; mensagensDono: ReturnType<typeof criarMensagensDono> }) {
  const { prisma } = app
  const { copiloto, mensagensDono } = deps

  /** A mensagem ao cliente, registrada em mensagens_whatsapp ("Atendente"): o eco não conta como o dono falando */
  async function enviar(empresa: EmpresaAtual, numero: string, clienteId: string | null, texto: string) {
    const base = { clienteId, evento: 'atendimento', manual: false, telefone: numero, texto, tentativas: 1 }
    try {
      const r = await app.whatsapp.provedor.enviarTexto(instanciaDaEmpresa(empresa.id), numero, texto)
      await prisma.mensagemWhatsapp.create({ data: { ...base, status: 'enviada', enviadaEm: new Date(), idExterno: r.id } })
      return true
    } catch (erro) {
      const e = erro instanceof ErroWhatsapp ? erro : new ErroWhatsapp('temporario', (erro as Error).message)
      await prisma.mensagemWhatsapp.create({ data: { ...base, status: 'falhou', erro: e.message } })
      app.log.warn({ err: e, empresa: empresa.slug }, 'Atendente do WhatsApp: mensagem ao cliente não saiu')
      return false
    }
  }

  type Conversa = NonNullable<Awaited<ReturnType<typeof buscar>>>[number]
  function buscar(agora: Date, esperaMs: number) {
    return prisma.conversaWhatsapp.findMany({
      where: {
        situacao: 'aberta',
        atendenteParou: null,
        numero: { not: null },
        classificar: false,
        // Assunto lido pelo Assistente, ou "outro" (a saudação sozinha: quandoAtender confere)
        OR: [{ assuntoVia: 'assistente', assunto: { in: [...ASSUNTOS] } }, { assunto: 'outro' }],
        ultimaEm: { lte: new Date(agora.getTime() - esperaMs), gte: new Date(agora.getTime() - ATENDER_ATE_MS) },
      },
      include: incluirConversa,
      orderBy: { ultimaEm: 'desc' },
      take: 40,
    })
  }

  /**
   * O dono falou com esse número (celular ou WhatsApp Web) ou alguém da equipe mandou algo pelo sistema há pouco (envio
   * manual: o "Enviar orçamento", o "ok" no "Você"; o envio sozinho do atendente não conta). E a última resposta do
   * atendente: já atendendo, a próxima sai mais rápido.
   */
  async function presenca(numero: string, agora: Date) {
    const desde = new Date(agora.getTime() - DONO_NA_CONVERSA_MS)
    const variantes = variantesDoNumero(numero)
    const [doDono, daEquipe, doAtendente] = await Promise.all([
      mensagensDono.depois(numero, desde),
      // Enviar um orçamento (botão ou "ok" no "Você") não é conversar com o cliente: não conta
      prisma.mensagemWhatsapp.findFirst({
        where: { telefone: { in: variantes }, status: 'enviada', manual: true, evento: { not: 'orcamento_enviado' }, enviadaEm: { gte: desde } },
        orderBy: { enviadaEm: 'desc' },
        select: { enviadaEm: true },
      }),
      prisma.mensagemWhatsapp.findFirst({ where: { telefone: { in: variantes }, status: 'enviada', evento: 'atendimento', enviadaEm: { gte: desde } }, orderBy: { enviadaEm: 'desc' }, select: { enviadaEm: true, texto: true } }),
    ])
    return {
      ultimaDoDonoEm: doDono.at(-1)?.enviadaEm ?? null,
      ultimoEnvioEquipeEm: daEquipe?.enviadaEm ?? null,
      ultimaDoAtendenteEm: doAtendente?.enviadaEm ?? null,
      // Ele está na conversa: a próxima mensagem do cliente é respondida mesmo sem assunto ("1", "o catálogo")
      emAtendimento: Boolean(doAtendente),
      menuAberto: Boolean(doAtendente?.texto.includes(FIM_DO_MENU)),
    }
  }

  /**
   * As últimas 12 horas com esse número, na ordem: o que o cliente escreveu, o que o atendente respondeu e o que a
   * gráfica mandou (orçamento, avisos do pedido, o que o dono digitou) — o atendente nunca pergunta o que já foi dito
   */
  async function historico(numero: string, agora: Date): Promise<ContextoAtendimento['conversa']> {
    const desde = new Date(agora.getTime() - ATENDER_ATE_MS)
    const variantes = variantesDoNumero(numero)
    const [doCliente, enviadas, doDono] = await Promise.all([
      prisma.conversaMensagemWhatsapp.findMany({ where: { conversa: { numero: { in: variantes } }, recebidaEm: { gte: desde }, texto: { not: null } }, orderBy: { recebidaEm: 'desc' }, take: 15, select: { texto: true, recebidaEm: true } }),
      prisma.mensagemWhatsapp.findMany({ where: { status: 'enviada', telefone: { in: variantes }, createdAt: { gte: desde } }, orderBy: { createdAt: 'desc' }, take: 8, select: { evento: true, texto: true, createdAt: true } }),
      mensagensDono.depois(numero, desde),
    ])
    return [
      ...doCliente.map((m) => ({ de: 'cliente' as const, texto: m.texto!, em: m.recebidaEm })),
      ...enviadas.map((m) => ({ de: m.evento === 'atendimento' ? ('atendente' as const) : ('grafica' as const), texto: m.texto, em: m.createdAt })),
      ...doDono.map((m) => ({ de: 'grafica' as const, texto: m.texto, em: m.enviadaEm })),
    ]
      .sort((a, b) => a.em.getTime() - b.em.getTime())
      .slice(-14)
      .map(({ de, texto }) => ({ de, texto }))
  }

  /**
   * Quem é o cliente para a gráfica, em duas formas: as linhas que vão ao cliente no menu (pedido em andamento,
   * orçamento esperando a aprovação) e as que vão ao Assistente (também se é novo e desde quando compra)
   */
  async function situacaoDoCliente(
    clienteId: string | null,
    agora: Date,
  ): Promise<{ pedido: string | null; paraOAssistente: string[]; orcamentos: { id: string; numero: string }[] }> {
    if (!clienteId) return { pedido: null, paraOAssistente: ['Contato novo: não está no cadastro da gráfica (primeiro contato)'], orcamentos: [] }
    const itensCurtos = (itens: { descricao: string; quantidade: { toString(): string } }[]) =>
      itens
        .slice(0, 6)
        .map((i) => `${Number(i.quantidade.toString()).toLocaleString('pt-BR')}× ${i.descricao}`)
        .join('; ')
    const [cliente, pedido, orcamentos] = await Promise.all([
      prisma.cliente.findUnique({ where: { id: clienteId }, select: { createdAt: true, _count: { select: { pedidos: true } } } }),
      prisma.pedido.findFirst({
        where: { clienteId, status: { notIn: [...STATUS_PEDIDO_FINAIS] } },
        orderBy: { createdAt: 'desc' },
        select: { numero: true, status: true, dataPrevistaEntrega: true, tipoEntrega: true, total: true, valorPago: true, itens: { select: { descricao: true, quantidade: true } } },
      }),
      prisma.orcamento.findMany({
        where: { clienteId, status: { in: ['enviado', 'em_negociacao'] }, updatedAt: { gte: new Date(agora.getTime() - 30 * 86_400_000) } },
        orderBy: { updatedAt: 'desc' },
        take: 2,
        select: { id: true, numero: true, total: true, prazoDias: true, validade: true, enviadoEm: true, tokenPublico: true, itens: { select: { descricao: true, quantidade: true } } },
      }),
    ])
    const paraOAssistente: string[] = [
      cliente?._count.pedidos ? `Cliente da gráfica desde ${formatarDataSimples(hojeISO(cliente.createdAt)).slice(3)}, com ${cliente._count.pedidos} pedido(s)` : 'Cliente no cadastro, ainda sem pedido feito',
    ]
    if (pedido) {
      const frase = fraseDoPedido(pedido.status as StatusPedido, quandoFalar(pedido.dataPrevistaEntrega.toISOString().slice(0, 10), hojeISO(agora)))
      paraOAssistente.push(
        `Pedido em andamento ${pedido.numero}: ${itensCurtos(pedido.itens)}. Situação: ${frase}. ${pedido.tipoEntrega === 'retirada' ? 'Retirada na gráfica' : 'Entrega'}. Total ${formatarMoeda(pedido.total.toString())}, pago ${formatarMoeda(pedido.valorPago.toString())}`,
      )
    }
    for (const o of orcamentos) {
      paraOAssistente.push(
        `Orçamento ${o.numero}${o.enviadoEm ? ` enviado em ${formatarDataSimples(hojeISO(o.enviadoEm)).slice(0, 5)}` : ''}, esperando a aprovação do cliente: ${itensCurtos(o.itens)}. Total ${formatarMoeda(o.total.toString())}. Prazo de produção: ${o.prazoDias} dia(s) útil(eis) depois da aprovação. Válido até ${formatarDataSimples(o.validade.toISOString().slice(0, 10))}. Link para ver e aprovar: ${linkAprovacaoOrcamento(o.tokenPublico)}`,
      )
    }
    return { pedido: pedido?.numero ?? null, paraOAssistente, orcamentos: orcamentos.map((o) => ({ id: o.id, numero: o.numero })) }
  }

  /**
   * O catálogo para mandar ao cliente: o PDF publicado mais novo (vai como arquivo, na conversa) e o link da vitrine
   * (só quando não há PDF). E os produtos da gráfica com um código (P1, P2…), para o Assistente responder "vocês fazem
   * X?" escolhendo quais mostrar: o sistema manda a foto de cada um, sem o cliente sair do WhatsApp
   */
  async function catalogoDaGrafica(): Promise<{ link: string | null; pdfId: string | null; produtos: ProdutoDoCatalogo[] }> {
    const empresa = contextoEmpresa.exigir()
    const [pdf, vitrine] = await Promise.all([
      prisma.arquivo.findFirst({ where: { categoria: 'catalogo_vitrine' }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
      prisma.vitrineConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { ativa: true } }),
    ])
    const site = vitrine?.ativa ? urlDaVitrine(empresa, app.config) : null
    const lista = await prisma.produto.findMany({
      where: { ativo: true, ...(site ? { vitrinePublicado: true, vitrineSlug: { not: null } } : {}) },
      orderBy: [{ vitrineOrdem: 'asc' }, { nome: 'asc' }],
      take: 60,
      select: { nome: true, vitrineNome: true, vitrineDescricao: true, descricao: true, imagemArquivoId: true, vitrineSlug: true, categoria: { select: { nome: true } } },
    })
    const produtos = lista.map((p, i) => ({
      codigo: `P${i + 1}`,
      nome: p.vitrineNome || p.nome,
      categoria: p.categoria?.nome ?? null,
      descricao: (p.vitrineDescricao || p.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 160) || null,
      imagemArquivoId: p.imagemArquivoId,
      link: site && p.vitrineSlug ? `${site}/produto/${p.vitrineSlug}` : null,
    }))
    return { link: site ?? (pdf ? `${urlDaVitrine(empresa, app.config)}/catalogo/${pdf.id}` : null), pdfId: pdf?.id ?? null, produtos }
  }

  /**
   * A foto de cada produto escolhido, com o nome e a descrição curta na legenda (os sem foto vão no texto). Devolve
   * quantas saíram. Nunca lança
   */
  async function enviarFotosDeProdutos(empresa: EmpresaAtual, numero: string, clienteId: string | null, produtos: ProdutoDoCatalogo[]) {
    let enviadas = 0
    for (const p of produtos) {
      if (!p.imagemArquivoId) continue
      try {
        const arquivo = await prisma.arquivo.findUnique({ where: { id: p.imagemArquivoId }, select: { mime: true, nomeOriginal: true } })
        const conteudo = arquivo ? await lerArquivo(app, p.imagemArquivoId) : null
        if (!arquivo || !conteudo) continue
        const legenda = legendaDoProduto(p)
        const r = await app.whatsapp.provedor.enviarDocumento(instanciaDaEmpresa(empresa.id), numero, { conteudo, nomeArquivo: arquivo.nomeOriginal, mime: arquivo.mime, legenda })
        await prisma.mensagemWhatsapp.create({ data: { clienteId, evento: 'atendimento', manual: false, telefone: numero, texto: `[Foto] ${legenda}`, tentativas: 1, status: 'enviada', enviadaEm: new Date(), idExterno: r.id } })
        enviadas++
      } catch (erro) {
        app.log.warn({ err: erro, empresa: empresa.slug }, 'Atendente do WhatsApp: foto do produto não saiu')
      }
    }
    return enviadas
  }

  /** O convite para o orçamento, uns segundos depois da mídia (chega depois das fotos/do PDF, na ordem certa) */
  async function convidarParaOrcamento(empresa: EmpresaAtual, numero: string, clienteId: string | null, depoisDe: 'fotos' | 'catalogo') {
    await new Promise((r) => setTimeout(r, PAUSA_ANTES_DO_CONVITE_MS))
    await enviar(empresa, numero, clienteId, textoConviteOrcamento(depoisDe))
  }

  /** O PDF do catálogo como arquivo na conversa (registrado). Devolve se saiu */
  async function enviarCatalogoPdf(empresa: EmpresaAtual, numero: string, clienteId: string | null, pdfId: string, grafica: string) {
    try {
      const conteudo = await lerArquivo(app, pdfId)
      if (!conteudo) return false
      const r = await app.whatsapp.provedor.enviarDocumento(instanciaDaEmpresa(empresa.id), numero, { conteudo, nomeArquivo: `Catálogo ${grafica}.pdf`, mime: 'application/pdf' })
      await prisma.mensagemWhatsapp.create({ data: { clienteId, evento: 'atendimento', manual: false, telefone: numero, texto: '[Catálogo em PDF]', tentativas: 1, status: 'enviada', enviadaEm: new Date(), idExterno: r.id } })
      return true
    } catch (erro) {
      app.log.warn({ err: erro, empresa: empresa.slug }, 'Atendente do WhatsApp: catálogo em PDF não saiu')
      return false
    }
  }

  async function parar(id: string, motivo: ParadaAtendente) {
    await prisma.conversaWhatsapp.update({ where: { id }, data: { atendenteParou: motivo } })
  }

  async function resolver(id: string) {
    await prisma.conversaWhatsapp.updateMany({ where: { id, situacao: 'aberta' }, data: { situacao: 'resolvida', resolvidaEm: new Date(), classificar: false } })
    app.tempoReal.emitir('whatsapp', 'conversa:atualizada', {})
  }

  /** Atende uma conversa (já reservada): devolve o que fez, para o log */
  async function atender(empresa: EmpresaAtual, c: Conversa, agora: Date, anteriorEm: Date | null, config: { envia: boolean; limite: string | null; saudacao: boolean; menuAberto: boolean }): Promise<string> {
    const numero = c.numero!
    const assunto = c.assunto as Assunto
    const grafica = (await nomeDaGrafica(prisma)) || empresa.nome
    const nome = c.cliente ? (c.cliente.tipoPessoa === 'PF' ? primeiroNome(c.cliente.nome) : null) : primeiroNome(c.nomeWhatsapp)
    const quem = c.cliente ? nomeCliente(c.cliente) : c.nomeWhatsapp?.trim() || formatarTelefone(numero.replace(/^55/, ''))
    const variantes = variantesDoNumero(numero)
    const jaSeApresentou = await prisma.mensagemWhatsapp.findFirst({
      where: { evento: 'atendimento', status: 'enviada', telefone: { in: variantes }, createdAt: { gte: new Date(agora.getTime() - APRESENTACAO_VALE_MS) } },
      select: { id: true },
    })
    const fala = { grafica, nome, seApresentar: !jaSeApresentou }
    const novas = c.mensagens.filter((m) => !anteriorEm || m.recebidaEm > anteriorEm).map((m) => m.texto ?? '')

    // O cliente pediu uma pessoa (ou o atendente já respondeu demais): avisa o cliente e o dono, e para de vez
    const pediuPessoa = pedePessoa(novas)
    if (pediuPessoa || c.atendimentos + 1 > MAX_ATENDIMENTOS) {
      await enviar(empresa, numero, c.clienteId, textoChamarPessoa(fala))
      await parar(c.id, pediuPessoa ? 'pessoa' : 'limite')
      await copiloto.avisarDoAtendente(empresa, pediuPessoa ? avisoPediuPessoa(quem) : avisoLimite(quem))
      return pediuPessoa ? 'pediu uma pessoa' : 'limite de respostas'
    }

    const cliente = await situacaoDoCliente(c.clienteId, agora)
    const catalogo = await catalogoDaGrafica()
    const temCatalogo = Boolean(catalogo.link || catalogo.pdfId)

    // Só cumprimentou ("oi", "bom dia"): o menu curto e organizado, com o que está em aberto (texto pronto, sem IA)
    if (config.saudacao) {
      await enviar(empresa, numero, c.clienteId, textoMenuCliente({ grafica, nome, agora, orcamentos: cliente.orcamentos.map((o) => o.numero), pedido: cliente.pedido, catalogo: temCatalogo }))
      await resolver(c.id)
      return 'menu (saudação)'
    }

    // O que o cliente pediu e o atendente resolve sozinho, certo (o número do menu ou as palavras): sem depender da IA
    const opcoes = config.menuAberto ? opcoesDoMenu({ orcamento: cliente.orcamentos.length > 0, pedido: Boolean(cliente.pedido), catalogo: temCatalogo }) : null
    const escolha = novas.length ? pedidoDoCliente(novas.join(' '), { opcoes, orcamento: cliente.orcamentos.length > 0, pedido: Boolean(cliente.pedido) }) : null
    if (escolha === 'ver_orcamento' && cliente.orcamentos[0]) {
      await enviar(empresa, numero, c.clienteId, ajustarAbertura(textoVerOrcamento(), fala))
      await copiloto.reenviarAoCliente(empresa, cliente.orcamentos[0].id, numero)
      await resolver(c.id)
      return `orçamento ${cliente.orcamentos[0].numero} reenviado`
    }
    if (escolha === 'catalogo' && temCatalogo) {
      await enviar(empresa, numero, c.clienteId, ajustarAbertura(textoCatalogo(catalogo.link, Boolean(catalogo.pdfId)), fala))
      if (catalogo.pdfId && (await enviarCatalogoPdf(empresa, numero, c.clienteId, catalogo.pdfId, grafica))) await convidarParaOrcamento(empresa, numero, c.clienteId, 'catalogo')
      await resolver(c.id)
      return 'catálogo'
    }
    if (escolha === 'novo_orcamento') {
      await enviar(empresa, numero, c.clienteId, ajustarAbertura(textoNovoOrcamento(), fala))
      await resolver(c.id)
      return 'pediu o que precisa'
    }

    // Pedido: a situação pelo sistema (resposta pronta, sem IA)
    if ((assunto === 'pedido' || escolha === 'ver_pedido') && c.clienteId) {
      const p = await prisma.pedido.findFirst({
        where: { clienteId: c.clienteId, status: { notIn: [...STATUS_PEDIDO_FINAIS] } },
        orderBy: { createdAt: 'desc' },
        select: { numero: true, status: true, dataPrevistaEntrega: true, tipoEntrega: true },
      })
      if (p) {
        const pronta = respostaProntaDoPedido(
          { numero: p.numero, status: p.status as StatusPedido, dataPrevistaEntrega: p.dataPrevistaEntrega.toISOString().slice(0, 10), tipoEntrega: p.tipoEntrega },
          { nome, hojeISO: hojeISO(agora), grafica },
        )
        await enviar(empresa, numero, c.clienteId, fala.seApresentar ? comApresentacao(pronta, fala) : semCabecalho(pronta))
        await resolver(c.id)
        return 'situação do pedido'
      }
    }

    // Orçamento: o rascunho primeiro (o mesmo do 📝, com aviso no "Você"), depois a resposta com o que entrou. Com o
    // envio sozinho ligado e tudo certo, o orçamento sai direto (a apresentação vai logo antes) e não há mais o que dizer
    const conversa = await historico(numero, agora)
    const envio = config.envia
      ? {
          limite: config.limite,
          negociando: negociando(conversa.filter((m) => m.de === 'cliente').map((m) => m.texto)),
          // Primeira resposta: a apresentação entra no lugar do "Olá" do orçamento (uma mensagem só)
          abertura: fala.seApresentar ? apresentacao(grafica, nome) : null,
        }
      : null
    // Um orçamento que ele montou para esse número ainda esperando: o que o cliente manda agora completa esse orçamento
    // ("só 3, para parede"), mesmo que a leitura tenha achado que era dúvida
    const completando =
      assunto !== 'orcamento' &&
      Boolean(
        await prisma.orcamentoWhatsapp.findFirst({
          where: {
            origem: 'atendente',
            numero: { in: variantes },
            enviadoEm: null,
            descartadoEm: null,
            createdAt: { gte: new Date(agora.getTime() - DONO_NA_CONVERSA_MS) },
            orcamento: { status: 'rascunho' },
          },
          select: { orcamentoId: true },
        }),
      )
    const r = !config.saudacao && (assunto === 'orcamento' || completando) ? await copiloto.rascunhoDoAtendente(empresa, c.id, envio) : null
    if (r?.situacao === 'enviado') return 'orçamento enviado sozinho'
    const cerebro = await montarCerebro(prisma, { empresa: true, manual: true })
    const ia = await app.assistente.executar({
      assinanteId: empresa.id,
      recurso: 'whatsapp_resposta',
      pedido: pedidoAtendimento({
        grafica,
        agora: agoraPorExtenso(agora),
        sobre: cerebro.empresa,
        manual: cerebro.manual,
        assunto: config.saudacao ? 'saudacao' : r ? 'orcamento' : assunto === 'pedido' ? 'duvida' : assunto,
        funcionamento: funcionamentoAgora((await prisma.vitrineConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { horario: true } }))?.horario ?? null, agora),
        cliente: nome,
        seApresentar: fala.seApresentar,
        situacao: cliente.paraOAssistente,
        catalogo: catalogo.link,
        produtos: catalogo.produtos.map(linhaDoProduto),
        rascunho: r ? { itens: r.itens, fora: r.fora, faltando: r.faltando } : null,
        conversa,
      }),
    })
    if (ia.ok && !ia.dados.responder && !r && !config.saudacao) {
      // Não é cliente (família, fornecedor, propaganda) ou não há o que responder: quieto nesta conversa
      await parar(c.id, 'pessoal')
      return 'não é cliente'
    }
    // Sem a IA (ou sem resposta), o texto pronto: o menu para a saudação, a recepção para o resto
    const pronto = () => textoRecepcao({ ...fala, assunto })
    let texto = ia.ok && ia.dados.responder ? ia.dados.texto : pronto()
    // Nunca valor inventado: só o que a gráfica já mandou na conversa ou o que o sistema tem do cliente (senão, o texto pronto)
    if (valorNovo(texto, [...conversa.filter((m) => m.de !== 'cliente').map((m) => m.texto), ...cliente.paraOAssistente])) texto = pronto()
    texto = ajustarAbertura(texto, fala)
    await enviar(empresa, numero, c.clienteId, texto)
    // Perguntou se a gráfica faz algo: as fotos dos produtos que combinam, logo depois do texto (até 3)
    const mostrar = ia.ok ? catalogo.produtos.filter((p) => ia.dados.mostrarProdutos.includes(p.codigo)).slice(0, 3) : []
    if (mostrar.length && (await enviarFotosDeProdutos(empresa, numero, c.clienteId, mostrar))) await convidarParaOrcamento(empresa, numero, c.clienteId, 'fotos')
    // Pediu o orçamento de novo: sai logo depois, com o PDF (só um dos que estão em aberto para ele)
    const reenviar = ia.ok ? cliente.orcamentos.find((o) => o.numero === ia.dados.reenviarOrcamento) : undefined
    if (reenviar) await copiloto.reenviarAoCliente(empresa, reenviar.id, numero)
    const chamar = ia.ok && ia.dados.chamarEquipe
    if (chamar) await copiloto.avisarDoAtendente(empresa, avisoSemResposta(quem, ia.dados.pergunta || novas.at(-1) || ''))
    else if (!r) await resolver(c.id)
    if (config.saudacao) return 'saudação'
    return r ? `orçamento (${r.situacao})` : reenviar ? `orçamento ${reenviar.numero} reenviado` : chamar ? 'dúvida para a equipe' : 'dúvida respondida'
  }

  return {
    /** As conversas paradas da empresa do contexto (tarefa de cada minuto). Devolve quantas atendeu. Nunca lança */
    async atenderParados(empresa: EmpresaAtual, agora = new Date()): Promise<number> {
      try {
        if (!whatsappNoPlano(empresa)) return 0
        const config = await obterConfigWhatsapp(prisma)
        if (!config.atendenteAtivo || !config.assistenteWhatsapp || config.pausado) return 0
        if (!app.whatsapp.provedor.simulado && !config.conectado) return 0
        const controles = await controlesDaEmpresa(prisma)
        if (!controles.ativo || controles.semClientes || !(await app.assistente.disponivel())) return 0
        const esperaMs = esperaDoAtendente(config.atendenteEsperaMin) * 60_000
        let atendidas = 0
        for (const c of await buscar(agora, Math.min(esperaMs, ESPERA_SEGUIDA_MS))) {
          const saudacao = soSaudacao(c.mensagens.map((m) => m.texto ?? ''))
          const p = await presenca(c.numero!, agora)
          const d = quandoAtender({ ...c, saudacao, ultimaPendenteEm: c.mensagens.at(-1)?.recebidaEm ?? null }, { agora, esperaMs, ...p })
          if (!d.atender) continue
          // Pediu uma pessoa (ou não é cliente) numa conversa anterior: a parada vale para o número
          const paradas = await prisma.conversaWhatsapp.findMany({
            where: { numero: { in: variantesDoNumero(c.numero!) }, atendenteParou: { not: null }, ultimaEm: { gte: new Date(agora.getTime() - PARADA_VALE_MS.pessoal) } },
            select: { atendenteParou: true, ultimaEm: true },
          })
          if (paradaValendo(paradas.map((x) => ({ motivo: x.atendenteParou!, em: x.ultimaEm })), agora)) continue
          // Reserva (outra tarefa ou mensagem nova no meio): só uma resposta por mensagem do cliente
          const { count } = await prisma.conversaWhatsapp.updateMany({
            where: { id: c.id, ultimaEm: c.ultimaEm, atendidaEm: c.atendidaEm, atendenteParou: null },
            data: { atendidaEm: agora, atendimentos: { increment: 1 } },
          })
          if (count !== 1) continue
          try {
            const feito = await atender(empresa, c, agora, c.atendidaEm, { envia: config.atendenteEnvia, limite: config.atendenteLimite?.toString() ?? null, saudacao, menuAberto: p.menuAberto })
            app.log.info({ empresa: empresa.slug, conversa: c.id, assunto: c.assunto, feito }, 'Atendente do WhatsApp respondeu um cliente')
            atendidas++
          } catch (erro) {
            app.log.error({ err: erro, empresa: empresa.slug, conversa: c.id }, 'Atendente do WhatsApp: atendimento falhou')
          }
        }
        return atendidas
      } catch (erro) {
        app.log.warn({ err: erro, empresa: empresa.slug }, 'Atendente do WhatsApp: conferência falhou')
        return 0
      }
    },
  }
}

export type AtendenteWhatsapp = ReturnType<typeof criarAtendenteWhatsapp>
