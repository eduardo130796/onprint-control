import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import {
  ASSUNTO_CONVERSA_ROTULOS,
  MIDIA_CONVERSA_ROTULOS,
  STATUS_PEDIDO_FINAIS,
  funcaoLiberada,
  hojeISO,
  nomeCliente,
  normalizarNumeroWhatsapp,
  type AssuntoConversa,
  type ContatoWhatsapp,
  type ConversaWhatsapp,
  type MidiaConversa,
  type OrcamentoDaConversa,
  type OrcamentoDeTexto,
  type PedidosDaConversa,
  type SituacaoConversa,
  type StatusPedido,
  type conversasWhatsappQuerySchema,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { paginado } from '../../core/paginacao'
import { clienteNovo, criarAjudasAssistente } from '../assistente/ajudas.service'
import { controlesDaEmpresa, nomeDaGrafica } from '../assistente/empresa.service'
import { pedidoClassificarResposta, primeiroNome } from '../assistente/prompts'
import {
  ESPERA_CLASSIFICAR_MS,
  MENSAGENS_NA_LEITURA,
  assuntoDaLeitura,
  assuntoMaisImportante,
  assuntoPelasRegras,
  juntarNaConversa,
  numeroCanonico,
  numeroParaCadastro,
  numerosParaBusca,
  respostaProntaDoPedido,
  soCortesia,
} from './conversas'
import { notificarEquipe, quemAvisar } from './leituras-presas'
import { variantesDoNumero, type LeituraAssistente } from './respostas'
import type { EventoWebhook } from './webhook'

/** Mensagem que entra nas Conversas: texto (com ou sem mídia) ou só mídia */
export type EventoConversa = Extract<EventoWebhook, { tipo: 'texto' | 'midia' }>

/** O que já se sabe da mensagem quando ela chega aqui (vinda da leitura das respostas ao orçamento) */
export interface TratamentoConversa {
  /** Orçamento a que a mensagem se refere */
  orcamentoId?: string | null
  /** Virou resposta tratada do orçamento (aprovou, pediu modificação): não pede ação na lista */
  tratada?: boolean
  /** O Assistente já leu (resposta que era outro assunto, pergunta sobre o orçamento): nenhuma chamada a mais */
  leitura?: LeituraAssistente | null
  /** A equipe já foi avisada pelo orçamento (não repete o aviso no sino) */
  jaAvisada?: boolean
}

const incluirConversa = {
  cliente: { select: { id: true, nome: true, fantasia: true, tipoPessoa: true, vendedorId: true } },
  orcamento: { select: { id: true, numero: true } },
  mensagens: { where: { tratada: false }, orderBy: { recebidaEm: 'desc' }, take: 30 },
} satisfies Prisma.ConversaWhatsappInclude

type LinhaConversa = Prisma.ConversaWhatsappGetPayload<{ include: typeof incluirConversa }>

/** Texto da mensagem para ler e mostrar ("[Foto]" quando só veio a mídia) */
const textoDaMensagem = (m: { texto: string | null; midia: string | null }) =>
  m.texto ?? (m.midia ? `[${MIDIA_CONVERSA_ROTULOS[m.midia as MidiaConversa] ?? 'Mídia'}]` : '')

export function formatarConversa(c: LinhaConversa): ConversaWhatsapp {
  return {
    id: c.id,
    numero: c.numero,
    nomeWhatsapp: c.nomeWhatsapp,
    cliente: c.cliente ? { id: c.cliente.id, rotulo: nomeCliente(c.cliente) } : null,
    assunto: c.assunto as AssuntoConversa,
    assuntoVia: c.assuntoVia === 'assistente' ? 'assistente' : 'regras',
    resumo: c.resumo,
    mensagens: [...c.mensagens].reverse().map((m) => ({ id: m.id, texto: m.texto, midia: (m.midia as MidiaConversa | null) ?? null, em: m.recebidaEm.toISOString() })),
    orcamento: c.orcamento,
    situacao: c.situacao as SituacaoConversa,
    resolvidaEm: c.resolvidaEm?.toISOString() ?? null,
    primeiraEm: c.primeiraEm.toISOString(),
    ultimaEm: c.ultimaEm.toISOString(),
  }
}

/**
 * Conversas do WhatsApp (copiloto nível 1). Cada mensagem de cliente que não virou resposta tratada de orçamento
 * entra aqui (mensagens seguidas do mesmo contato juntas), ligada ao cliente pelo número (com e sem o 9º dígito). O
 * assunto sai na hora pelas palavras; com o Assistente GrafyGo ligado (e "respostas do WhatsApp" liberada), uma leitura
 * barata depois que o cliente termina de escrever refina o assunto e escreve o resumo. Nada é enviado ao cliente daqui.
 */
export function criarConversasWhatsapp(app: FastifyInstance, opcoes: { esperaMs?: number } = {}) {
  const { prisma } = app
  const ajudas = criarAjudasAssistente(app)
  const espera = opcoes.esperaMs ?? ESPERA_CLASSIFICAR_MS

  /** Leituras agendadas (uma por conversa: mensagem nova reinicia a espera) e em andamento */
  const agendadas = new Map<string, NodeJS.Timeout>()
  const emAndamento = new Set<Promise<void>>()
  function acompanhar(p: Promise<void>) {
    emAndamento.add(p)
    void p.finally(() => emAndamento.delete(p))
  }

  const avisarTela = () => app.tempoReal.emitir('whatsapp', 'conversa:atualizada', {})

  /** O Assistente pode ler (central ligada, chave geral e "respostas do WhatsApp" da empresa) */
  async function assistenteLiberado() {
    return (await app.assistente.disponivel()) && funcaoLiberada(await controlesDaEmpresa(prisma), 'respostasWhatsapp')
  }

  /** Cliente do cadastro pelo número (com e sem o 9º dígito, com e sem o 55); o do WhatsApp igual vem antes */
  async function clienteDoNumero(numero: string | null) {
    const numeros = numerosParaBusca(numero)
    if (!numeros.length) return null
    const lista = await prisma.cliente.findMany({
      where: { ativo: true, OR: [{ whatsapp: { in: numeros } }, { telefone: { in: numeros } }] },
      select: { id: true, whatsapp: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })
    return lista.find((c) => c.whatsapp && numeros.includes(c.whatsapp)) ?? lista[0] ?? null
  }

  /** Avisa no sino (uma vez por conversa): aberta, com assunto que pede ação e sem leitura pendente */
  async function avisarEquipe(id: string) {
    const c = await prisma.conversaWhatsapp.findUnique({ where: { id }, include: incluirConversa })
    if (!c || c.notificadaEm || c.situacao !== 'aberta' || c.classificar || c.assunto === 'outro') return
    const { count } = await prisma.conversaWhatsapp.updateMany({ where: { id, notificadaEm: null }, data: { notificadaEm: new Date() } })
    if (count !== 1) return
    const quem = c.cliente ? nomeCliente(c.cliente) : (c.nomeWhatsapp ?? 'Um cliente novo')
    const titulo =
      c.assunto === 'orcamento' ? `${quem} pediu um orçamento no WhatsApp` : c.assunto === 'pedido' ? `${quem} perguntou do pedido no WhatsApp` : `${quem} mandou uma dúvida no WhatsApp`
    const primeiro = c.mensagens.at(-1)
    const mensagem = c.resumo ?? (primeiro ? `“${textoDaMensagem(primeiro).slice(0, 160)}”` : ASSUNTO_CONVERSA_ROTULOS[c.assunto as AssuntoConversa])
    await notificarEquipe(app, await quemAvisar(prisma, c.cliente?.vendedorId ?? null), { titulo, mensagem, link: '/whatsapp' }, true)
  }

  /** Lê a conversa com o Assistente (mensagens ainda não tratadas, as mais recentes) e grava o assunto e o resumo */
  async function classificar(empresa: EmpresaAtual, id: string) {
    const c = await prisma.conversaWhatsapp.findUnique({ where: { id }, include: { ...incluirConversa, mensagens: { where: { tratada: false }, orderBy: { recebidaEm: 'desc' }, take: MENSAGENS_NA_LEITURA } } })
    if (!c || !c.classificar) return
    const parar = () => prisma.conversaWhatsapp.updateMany({ where: { id, ultimaEm: c.ultimaEm }, data: { classificar: false } })
    if (c.situacao !== 'aberta' || !c.mensagens.length || !(await assistenteLiberado())) {
      await parar()
      return avisarEquipe(id)
    }
    const pedidos = c.clienteId
      ? await prisma.pedido.findMany({
          where: { clienteId: c.clienteId, status: { notIn: [...STATUS_PEDIDO_FINAIS] } },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { numero: true, status: true, dataPrevistaEntrega: true },
        })
      : []
    const nome = c.cliente ? (c.cliente.tipoPessoa === 'PF' ? primeiroNome(c.cliente.nome) : null) : primeiroNome(c.nomeWhatsapp)
    const r = await app.assistente.executar({
      assinanteId: empresa.id,
      recurso: 'whatsapp_resposta',
      pedido: pedidoClassificarResposta({
        grafica: (await nomeDaGrafica(prisma)) || empresa.nome,
        orcamento: null,
        pedidos: pedidos.map((p) => `${p.numero} · ${p.status.replace(/_/g, ' ')} · previsão ${p.dataPrevistaEntrega.toISOString().slice(0, 10)}`),
        cliente: nome,
        mensagem: [...c.mensagens].reverse().map(textoDaMensagem).join('\n'),
      }),
    })
    if (!r.ok) {
      app.log.info({ empresa: empresa.slug, conversa: id, motivo: r.motivo }, 'Conversa do WhatsApp sem a leitura do Assistente: fica o assunto pelas palavras')
      await parar()
      return avisarEquipe(id)
    }
    const assunto = c.assuntoVia === 'assistente' ? assuntoMaisImportante(c.assunto as AssuntoConversa, assuntoDaLeitura(r.dados.intencao)) : assuntoDaLeitura(r.dados.intencao)
    // Chegou mensagem nova enquanto lia: a próxima leitura (já agendada) vale
    const { count } = await prisma.conversaWhatsapp.updateMany({
      where: { id, ultimaEm: c.ultimaEm },
      data: { assunto, assuntoVia: 'assistente', resumo: r.dados.resumo.slice(0, 300), confianca: r.dados.confianca, classificar: false },
    })
    if (count === 1) {
      avisarTela()
      await avisarEquipe(id)
    }
  }

  function agendar(empresa: EmpresaAtual, id: string) {
    clearTimeout(agendadas.get(id))
    const t = setTimeout(() => {
      agendadas.delete(id)
      acompanhar(
        contextoEmpresa.com(empresa, () => classificar(empresa, id)).catch((erro) => app.log.warn({ err: erro, empresa: empresa.slug, conversa: id }, 'Conversa do WhatsApp: leitura do Assistente falhou')),
      )
    }, espera)
    t.unref?.()
    agendadas.set(id, t)
  }

  /** A conversa do id (404 se não existir) */
  async function obter(id: string) {
    const c = await prisma.conversaWhatsapp.findUnique({ where: { id }, include: incluirConversa })
    if (!c) throw AppError.naoEncontrado('Conversa não encontrada.')
    return c
  }

  /** Cliente da conversa como o editor espera: achado ou o pré-cadastro com o número do remetente e o nome do WhatsApp */
  function clienteDaConversa(c: LinhaConversa): OrcamentoDeTexto['cliente'] {
    if (c.cliente) return { mencionado: null, encontrado: { id: c.cliente.id, rotulo: nomeCliente(c.cliente) }, memoria: [], candidatos: [], novo: null }
    const whatsapp = numeroParaCadastro(c.numero)
    return { mencionado: c.nomeWhatsapp, encontrado: null, memoria: [], candidatos: [], novo: clienteNovo({ documento: null, telefones: whatsapp ? [whatsapp] : [], email: null }, c.nomeWhatsapp) }
  }

  return {
    /** O mesmo aviso do webhook duas vezes: a mensagem já está aqui */
    async jaRecebida(idExterno: string) {
      return Boolean(await prisma.conversaMensagemWhatsapp.findUnique({ where: { idExterno }, select: { id: true } }))
    },

    /**
     * Guarda a mensagem (junta na conversa aberta do contato se a anterior foi há pouco), liga ao cliente pelo número e
     * define o assunto. Nunca lança para o webhook: erro fica no log. Devolve o id da conversa (null = repetida/erro).
     */
    async registrar(empresa: EmpresaAtual, e: EventoConversa, t: TratamentoConversa = {}): Promise<string | null> {
      try {
        const agora = new Date()
        const texto = e.tipo === 'texto' ? e.texto : null
        const midia = e.midia ?? null
        const numero = numeroCanonico(e.numero)
        const ultima = await prisma.conversaWhatsapp.findFirst({ where: e.numero ? { numero: { in: variantesDoNumero(e.numero) } } : { jid: e.jid }, orderBy: { ultimaEm: 'desc' } })
        const cliente = ultima?.clienteId ? null : await clienteDoNumero(e.numero)
        const juntar = juntarNaConversa(ultima, agora)
        // Conversa nova só de resposta tratada ou de cortesia ("obrigado", "ok", 👍): já nasce resolvida
        const resolvida = !juntar && (Boolean(t.tratada) || (texto !== null && !midia && soCortesia([texto])))
        let id: string
        try {
          id = await prisma.$transaction(async (tx) => {
            const conversa =
              juntar && ultima
                ? await tx.conversaWhatsapp.update({
                    where: { id: ultima.id },
                    data: { ultimaEm: agora, nomeWhatsapp: e.nome ?? ultima.nomeWhatsapp, clienteId: ultima.clienteId ?? cliente?.id ?? null, orcamentoId: ultima.orcamentoId ?? t.orcamentoId ?? null },
                  })
                : await tx.conversaWhatsapp.create({
                    data: {
                      numero,
                      jid: numero ? null : e.jid,
                      nomeWhatsapp: e.nome,
                      clienteId: cliente?.id ?? null,
                      orcamentoId: t.orcamentoId ?? null,
                      situacao: resolvida ? 'resolvida' : 'aberta',
                      resolvidaEm: resolvida ? agora : null,
                      notificadaEm: t.jaAvisada || resolvida ? agora : null,
                      primeiraEm: agora,
                      ultimaEm: agora,
                    },
                  })
            await tx.conversaMensagemWhatsapp.create({ data: { conversaId: conversa.id, idExterno: e.idMensagem, texto, midia, orcamentoId: t.orcamentoId ?? null, tratada: Boolean(t.tratada), recebidaEm: agora } })
            return conversa.id
          })
        } catch (erro) {
          // Mesma mensagem de novo (id único): nada a fazer
          if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') return null
          throw erro
        }
        if (t.jaAvisada && juntar) await prisma.conversaWhatsapp.updateMany({ where: { id, notificadaEm: null }, data: { notificadaEm: agora } })

        if (!t.tratada && !resolvida) {
          const c = await prisma.conversaWhatsapp.findUniqueOrThrow({ where: { id }, include: { mensagens: { where: { tratada: false }, orderBy: { recebidaEm: 'desc' }, take: MENSAGENS_NA_LEITURA } } })
          if (t.leitura) {
            // Leitura já feita pela resposta ao orçamento: vale como a do Assistente, sem outra chamada
            const assunto = c.assuntoVia === 'assistente' ? assuntoMaisImportante(c.assunto as AssuntoConversa, assuntoDaLeitura(t.leitura.intencao)) : assuntoDaLeitura(t.leitura.intencao)
            await prisma.conversaWhatsapp.update({ where: { id }, data: { assunto, assuntoVia: 'assistente', resumo: t.leitura.resumo.slice(0, 300), confianca: t.leitura.confianca, classificar: false } })
          } else {
            const emAndamento = c.clienteId ? await prisma.pedido.count({ where: { clienteId: c.clienteId, status: { notIn: [...STATUS_PEDIDO_FINAIS] } } }) : 0
            const pelasRegras = assuntoPelasRegras([...c.mensagens].reverse().map((m) => m.texto ?? ''), { temPedidoEmAndamento: emAndamento > 0 })
            const ler = await assistenteLiberado()
            await prisma.conversaWhatsapp.update({
              where: { id },
              // A leitura anterior do Assistente não "desce" pelas palavras; a próxima leitura refaz o assunto
              data: { assunto: assuntoMaisImportante(c.assunto as AssuntoConversa, pelasRegras), classificar: ler },
            })
            if (ler) agendar(empresa, id)
          }
          await avisarEquipe(id)
        }
        avisarTela()
        return id
      } catch (erro) {
        app.log.error({ err: erro, empresa: empresa.slug }, 'Conversa do WhatsApp não registrada')
        return null
      }
    },

    /** Leituras que ficaram para trás (a API reiniciou durante a espera): roda na tarefa de cada minuto */
    async classificarPendentes(empresa: EmpresaAtual, agora = new Date()) {
      const pendentes = await prisma.conversaWhatsapp.findMany({
        where: { classificar: true, ultimaEm: { lt: new Date(agora.getTime() - 4 * espera) } },
        select: { id: true },
        orderBy: { ultimaEm: 'asc' },
        take: 10,
      })
      for (const p of pendentes) await classificar(empresa, p.id)
      return pendentes.length
    },

    async listar(q: z.output<typeof conversasWhatsappQuerySchema>) {
      // Só conversas com mensagem que pede atenção (a resposta tratada de orçamento fica de fora)
      const where: Prisma.ConversaWhatsappWhereInput = { situacao: q.situacao, mensagens: { some: { tratada: false } } }
      const [total, linhas] = await prisma.$transaction([
        prisma.conversaWhatsapp.count({ where }),
        prisma.conversaWhatsapp.findMany({ where, include: incluirConversa, orderBy: q.situacao === 'aberta' ? { ultimaEm: 'desc' } : { resolvidaEm: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      ])
      return paginado(linhas.map(formatarConversa), total, q)
    },

    /** Contador da tela e do menu: conversas abertas */
    async contar() {
      return { abertas: await prisma.conversaWhatsapp.count({ where: { situacao: 'aberta' } }) }
    },

    /**
     * "Montar orçamento": o texto da conversa vai para o orçamento por texto do Assistente (itens com os produtos e o
     * preço do sistema); o cliente é o da conversa ou o pré-cadastro com o número do remetente e o nome do WhatsApp.
     * Sem o Assistente (ou sem texto), o editor abre só com o cliente e a conversa nas observações internas.
     */
    async montarOrcamento(id: string): Promise<OrcamentoDaConversa> {
      const c = await obter(id)
      const texto = [...c.mensagens]
        .reverse()
        .map((m) => m.texto)
        .filter((t): t is string => Boolean(t?.trim()))
        .join('\n')
        .slice(0, 3000)
      const cliente = clienteDaConversa(c)
      const vazio = (aviso: string): OrcamentoDaConversa => ({
        texto,
        assistente: false,
        aviso,
        leitura: { itens: [], cliente, prazoDesejado: null, observacoes: texto ? `Pedido no WhatsApp: “${texto.slice(0, 500)}”` : null, naoIdentificados: [], sugestoes: [] },
      })
      if (texto.length < 5) return vazio('A conversa não tem texto para montar os itens (só foto ou áudio): adicione os itens à mão.')
      try {
        const leitura = await ajudas.orcamentoDeTexto(texto, { clienteId: c.clienteId, nome: c.nomeWhatsapp, whatsapp: numeroParaCadastro(c.numero) })
        return { texto, leitura, assistente: true, aviso: null }
      } catch (erro) {
        // Assistente desligado, limite do mês, catálogo vazio: o editor abre com o cliente e o texto
        if (erro instanceof AppError && erro.statusCode < 500) return vazio(erro.message)
        throw erro
      }
    },

    /** "Ver pedido": pedidos em andamento do cliente (o mais recente primeiro) e a resposta pronta sobre ele */
    async pedidos(id: string): Promise<PedidosDaConversa> {
      const c = await obter(id)
      if (!c.clienteId) return { pedidos: [], respostaPronta: null }
      const hoje = hojeISO()
      const lista = await prisma.pedido.findMany({
        where: { clienteId: c.clienteId, OR: [{ status: { notIn: [...STATUS_PEDIDO_FINAIS] } }, { status: 'entregue', updatedAt: { gte: new Date(Date.now() - 3 * 86_400_000) } }] },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, numero: true, status: true, dataPrevistaEntrega: true, tipoEntrega: true },
      })
      const pedidos = lista.map((p) => {
        const data = p.dataPrevistaEntrega.toISOString().slice(0, 10)
        return { id: p.id, numero: p.numero, status: p.status as StatusPedido, dataPrevistaEntrega: data, atrasado: !STATUS_PEDIDO_FINAIS.includes(p.status as StatusPedido) && p.status !== 'pronto' && data < hoje }
      })
      const primeiro = lista[0]
      if (!primeiro) return { pedidos, respostaPronta: null }
      const nome = c.cliente?.tipoPessoa === 'PF' ? primeiroNome(c.cliente.nome) : c.cliente ? nomeCliente(c.cliente) : primeiroNome(c.nomeWhatsapp)
      const respostaPronta = respostaProntaDoPedido(
        { numero: primeiro.numero, status: primeiro.status as StatusPedido, dataPrevistaEntrega: pedidos[0]!.dataPrevistaEntrega, tipoEntrega: primeiro.tipoEntrega },
        { nome, hojeISO: hoje, grafica: (await nomeDaGrafica(prisma)) || null },
      )
      return { pedidos, respostaPronta }
    },

    async resolver(id: string, usuarioId: string) {
      await obter(id)
      const c = await prisma.conversaWhatsapp.update({ where: { id }, data: { situacao: 'resolvida', resolvidaEm: new Date(), resolvidaPor: usuarioId, classificar: false }, include: incluirConversa })
      avisarTela()
      return formatarConversa(c)
    },

    /** Desfaz o "resolvida" (o toque errado) */
    async reabrir(id: string) {
      await obter(id)
      const c = await prisma.conversaWhatsapp.update({ where: { id }, data: { situacao: 'aberta', resolvidaEm: null, resolvidaPor: null }, include: incluirConversa })
      avisarTela()
      return formatarConversa(c)
    },

    /**
     * O orçamento montado a partir da conversa foi salvo: a conversa fica ligada a ele (e resolvida) e o cliente sem
     * WhatsApp no cadastro fica com o número do remetente — o "Enviar orçamento" já vai para ele, sem perguntar.
     */
    async vincular(id: string, orcamentoId: string, usuarioId: string) {
      const c = await obter(id)
      const o = await prisma.orcamento.findUnique({ where: { id: orcamentoId }, select: { id: true, clienteId: true, cliente: { select: { id: true, whatsapp: true } } } })
      if (!o) throw AppError.naoEncontrado('Orçamento não encontrado.')
      const whatsapp = numeroParaCadastro(c.numero)
      if (whatsapp && !o.cliente.whatsapp && !(await prisma.cliente.findFirst({ where: { whatsapp: { in: numerosParaBusca(c.numero) } }, select: { id: true } }))) {
        await prisma.cliente.update({ where: { id: o.clienteId }, data: { whatsapp } })
      }
      const atualizada = await prisma.conversaWhatsapp.update({
        where: { id },
        data: { orcamentoId: o.id, clienteId: c.clienteId ?? o.clienteId, situacao: 'resolvida', resolvidaEm: new Date(), resolvidaPor: usuarioId, classificar: false },
        include: incluirConversa,
      })
      avisarTela()
      return formatarConversa(atualizada)
    },

    /**
     * Contatos do WhatsApp pelo nome ou pelo número, sem copiar número: quem já escreveu para a gráfica (nome do perfil
     * ou do cadastro) e, com busca, os clientes com WhatsApp no cadastro. O mais recente primeiro; até 15.
     */
    async contatos(busca?: string): Promise<ContatoWhatsapp[]> {
      const termo = busca?.trim() ?? ''
      const digitos = termo.replace(/\D/g, '')
      const porTexto = termo && !/^[\d\s()+-]+$/.test(termo)
      const conversas = await prisma.conversaWhatsapp.findMany({
        where: {
          numero: { not: null },
          ...(termo
            ? {
                OR: [
                  ...(porTexto
                    ? [
                        { nomeWhatsapp: { contains: termo, mode: 'insensitive' as const } },
                        { cliente: { nome: { contains: termo, mode: 'insensitive' as const } } },
                        { cliente: { fantasia: { contains: termo, mode: 'insensitive' as const } } },
                      ]
                    : []),
                  ...(digitos.length >= 4 ? [{ numero: { contains: digitos } }] : []),
                ],
              }
            : {}),
        },
        orderBy: { ultimaEm: 'desc' },
        take: 60,
        select: { numero: true, nomeWhatsapp: true, cliente: { select: { id: true, nome: true, fantasia: true } } },
      })
      const clientes = termo
        ? await prisma.cliente.findMany({
            where: {
              ativo: true,
              whatsapp: { not: null },
              OR: [
                ...(porTexto ? [{ nome: { contains: termo, mode: 'insensitive' as const } }, { fantasia: { contains: termo, mode: 'insensitive' as const } }] : []),
                ...(digitos.length >= 4 ? [{ whatsapp: { contains: digitos.replace(/^55(?=\d{10,11}$)/, '') } }] : []),
              ],
            },
            orderBy: { nome: 'asc' },
            take: 10,
            select: { id: true, nome: true, fantasia: true, whatsapp: true },
          })
        : []
      const lista: ContatoWhatsapp[] = []
      const visto = new Set<string>()
      const juntar = (numero: string | null, nome: string, cliente: ContatoWhatsapp['cliente']) => {
        if (!numero || variantesDoNumero(numero).some((n) => visto.has(n))) return
        variantesDoNumero(numero).forEach((n) => visto.add(n))
        lista.push({ numero, nome, cliente })
      }
      for (const c of conversas) juntar(c.numero, c.cliente ? nomeCliente(c.cliente) : (c.nomeWhatsapp ?? ''), c.cliente ? { id: c.cliente.id, rotulo: nomeCliente(c.cliente) } : null)
      for (const c of clientes) juntar(normalizarNumeroWhatsapp(c.whatsapp), nomeCliente(c), { id: c.id, rotulo: nomeCliente(c) })
      return lista.filter((c) => c.nome || c.cliente).slice(0, 15)
    },

    /** Espera as leituras em andamento e cancela as agendadas (desligamento da API) */
    async encerrar() {
      for (const t of agendadas.values()) clearTimeout(t)
      agendadas.clear()
      while (emAndamento.size) await Promise.all([...emAndamento])
    },
  }
}

export type ConversasWhatsapp = ReturnType<typeof criarConversasWhatsapp>
