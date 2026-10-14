import type { FastifyInstance } from 'fastify'
import { arteAguardaCliente, caminhoAcompanhamento, nomeCliente, type StatusPedido } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { avisarMudancaPedido, sincronizarStatusPedido } from '../pedidos/automacao'
import { descartarAvisoDeArte } from '../whatsapp/anexos-arte'

const NAO_ENCONTRADA = 'Link inválido ou arte não encontrada.'
const NAO_AGUARDA = 'Esta arte não está aguardando sua resposta.'

interface PedidoDaResposta {
  id: string
  numero: string
  vendedorId: string | null
}

interface ArteDaResposta {
  id: string
  versao: number
  status: string
  designerId: string | null
}

/**
 * Aprovação da arte pelo cliente, sem login: pela página do pedido (/pedido/:token, todas as artes de uma vez ou
 * uma a uma) ou pelo link antigo da arte (/arte/:token, que continua valendo). Só responde a arte que aguarda o
 * cliente (enviada_cliente, última versão) enquanto o pedido está na etapa da arte: depois que a produção seguiu,
 * os botões somem e a API recusa.
 */
export function criarArtesPublicoService(app: FastifyInstance) {
  const { prisma, storage } = app

  async function buscar(token: string) {
    const arte = await prisma.arte.findUnique({
      where: { tokenPublico: token },
      include: {
        arquivo: { select: { id: true, nomeOriginal: true, mime: true } },
        // Comentários internos da equipe não aparecem para o cliente
        comentarios: { where: { origem: 'cliente' }, orderBy: { createdAt: 'asc' }, select: { autorNome: true, origem: true, texto: true, createdAt: true } },
        pedidoItem: {
          select: {
            id: true,
            descricao: true,
            quantidade: true,
            largura: true,
            altura: true,
            pedido: { select: { id: true, numero: true, status: true, tokenPublico: true, vendedorId: true, cliente: { select: { nome: true, fantasia: true } } } },
            artes: { orderBy: { versao: 'desc' }, take: 1, select: { id: true } },
          },
        },
      },
    })
    if (!arte) throw AppError.naoEncontrado(NAO_ENCONTRADA)
    return arte
  }

  /**
   * Grava a resposta do cliente em uma ou mais artes do mesmo pedido, numa transação: cada arte só muda se ainda
   * estiver aguardando (clique duplo, ou aprovar e pedir ajuste ao mesmo tempo, não aplicam as duas respostas).
   * Avisa o designer e o vendedor (uma notificação), recalcula o status do pedido e avisa as telas abertas.
   */
  async function responderArtes(pedido: PedidoDaResposta, artes: ArteDaResposta[], aprovar: boolean, nome: string, texto: string, ip: string) {
    const titulo =
      artes.length === 1
        ? `Arte v${artes[0]!.versao} do ${pedido.numero} ${aprovar ? 'aprovada' : 'com ajuste solicitado'}`
        : `${artes.length} artes do ${pedido.numero} ${aprovar ? 'aprovadas' : 'com ajuste solicitado'}`
    const avisar = [...artes.map((a) => a.designerId), pedido.vendedorId].filter((id, i, l): id is string => Boolean(id) && l.indexOf(id) === i)
    const mudanca = await prisma.$transaction(async (tx) => {
      for (const arte of artes) {
        const { count } = await tx.arte.updateMany({
          where: { id: arte.id, status: 'enviada_cliente' },
          data: aprovar ? { status: 'aprovada', aprovadaEm: new Date(), comentarioCliente: texto } : { status: 'ajuste_solicitado', comentarioCliente: texto },
        })
        if (count !== 1) throw AppError.regraNegocio('Esta arte já foi respondida.')
        await tx.arteComentario.create({ data: { arteId: arte.id, autorNome: nome, origem: 'cliente', texto } })
        await registrarAuditoria(tx, {
          tabela: 'artes',
          registroId: arte.id,
          acao: 'editar',
          antes: { status: arte.status },
          depois: { status: aprovar ? 'aprovada' : 'ajuste_solicitado', via: 'link público', nome, ip, ...(artes.length > 1 ? { todasDoPedido: true } : {}) },
          usuarioId: null,
        })
      }
      for (const usuarioId of avisar) {
        await tx.notificacao.create({ data: { usuarioId, titulo, mensagem: `${nome}: ${texto}`, link: `/pedidos/${pedido.id}` } })
      }
      return sincronizarStatusPedido(tx, pedido.id, null)
    })
    avisarMudancaPedido(app, mudanca, pedido.id)
    app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId: pedido.id })
    for (const u of avisar) app.tempoReal.emitir(`usuario:${u}`, 'notificacao:nova', { titulo, pedidoId: pedido.id, link: `/pedidos/${pedido.id}` })
    await descartarAvisoDeArte(prisma, pedido.id)
  }

  /** Link antigo (/arte/:token): só a arte do link */
  async function responder(token: string, aprovar: boolean, nome: string, texto: string, ip: string) {
    const arte = await buscar(token)
    const ultima = arte.pedidoItem.artes[0]?.id === arte.id
    const pedido = arte.pedidoItem.pedido
    if (!ultima || !arteAguardaCliente(pedido.status as StatusPedido, arte.status)) throw AppError.regraNegocio(NAO_AGUARDA)
    await responderArtes(pedido, [arte], aprovar, nome, texto, ip)
    return montarVisao(token)
  }

  /** Artes do pedido (pelo token do acompanhamento) que aguardam o cliente agora; com `arteIds`, só essas (todas precisam aguardar) */
  async function aguardandoNoPedido(tokenPedido: string, arteIds?: string[]) {
    const pedido = await prisma.pedido.findUnique({
      where: { tokenPublico: tokenPedido },
      select: {
        id: true,
        numero: true,
        status: true,
        vendedorId: true,
        itens: { select: { artes: { orderBy: { versao: 'desc' }, take: 1, select: { id: true, versao: true, status: true, designerId: true } } } },
      },
    })
    if (!pedido) throw AppError.naoEncontrado('Link inválido ou pedido não encontrado.')
    const aguardando = pedido.itens.flatMap((i) => i.artes).filter((a) => arteAguardaCliente(pedido.status, a.status))
    const alvo = arteIds ? aguardando.filter((a) => arteIds.includes(a.id)) : aguardando
    if (!alvo.length || (arteIds && alvo.length !== new Set(arteIds).size)) throw AppError.regraNegocio(NAO_AGUARDA)
    return { pedido, alvo }
  }

  async function montarVisao(token: string) {
    const arte = await buscar(token)
    const empresa = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
    const ultima = arte.pedidoItem.artes[0]?.id === arte.id
    const pedido = arte.pedidoItem.pedido
    const podeExibir = arte.arquivo && ['image/png', 'image/jpeg', 'application/pdf'].includes(arte.arquivo.mime)
    return {
      versao: arte.versao,
      status: arte.status,
      ultimaVersao: ultima,
      // Pedido que já seguiu para a produção (ou terminou) não pede mais a aprovação
      podeResponder: ultima && arteAguardaCliente(pedido.status as StatusPedido, arte.status),
      pedido: { numero: pedido.numero, cliente: nomeCliente(pedido.cliente) },
      /** Página do pedido, seção das artes (onde aprova todas de uma vez) */
      linkPedido: `${caminhoAcompanhamento(contextoEmpresa.exigir().slug, pedido.tokenPublico)}#artes`,
      item: {
        descricao: arte.pedidoItem.descricao,
        quantidade: arte.pedidoItem.quantidade.toString(),
        largura: arte.pedidoItem.largura?.toString() ?? null,
        altura: arte.pedidoItem.altura?.toString() ?? null,
      },
      arquivo: arte.arquivo
        ? {
            nome: arte.arquivo.nomeOriginal,
            mime: arte.arquivo.mime,
            // URLs assinadas e temporárias: o arquivo nunca fica exposto como pasta pública
            url: storage.gerarUrlTemporaria(arte.arquivo.id, 3600),
            visualizavel: Boolean(podeExibir),
          }
        : null,
      miniaturaUrl: arte.miniaturaId ? storage.gerarUrlTemporaria(arte.miniaturaId, 3600) : null,
      comentarios: arte.comentarios,
      aprovadaEm: arte.aprovadaEm,
      empresa: {
        nome: empresa?.nomeFantasia || empresa?.razaoSocial || '',
        logoUrl: empresa?.logoArquivoId ? storage.gerarUrlTemporaria(empresa.logoArquivoId, 3600) : null,
      },
    }
  }

  return {
    obter: montarVisao,
    aprovar: (token: string, nome: string, ip: string) => responder(token, true, nome, `Aprovada por ${nome}.`, ip),
    pedirAjuste: (token: string, nome: string, comentario: string, ip: string) => responder(token, false, nome, comentario, ip),

    /** Página do pedido: aprova todas as artes que aguardam o cliente (ou só as escolhidas) */
    async aprovarDoPedido(tokenPedido: string, nome: string, arteIds: string[] | undefined, ip: string) {
      const { pedido, alvo } = await aguardandoNoPedido(tokenPedido, arteIds)
      await responderArtes(pedido, alvo, true, nome, `Aprovada por ${nome}.`, ip)
      return { aprovadas: alvo.length }
    },

    /** Página do pedido: ajuste em uma arte */
    async pedirAjusteDoPedido(tokenPedido: string, arteId: string, nome: string, comentario: string, ip: string) {
      const { pedido, alvo } = await aguardandoNoPedido(tokenPedido, [arteId])
      await responderArtes(pedido, alvo, false, nome, comentario, ip)
    },
  }
}

export type ArtePublica = Awaited<ReturnType<ReturnType<typeof criarArtesPublicoService>['obter']>>
