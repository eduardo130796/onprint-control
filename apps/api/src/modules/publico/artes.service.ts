import type { FastifyInstance } from 'fastify'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { avisarMudancaPedido, sincronizarStatusPedido } from '../pedidos/automacao'

const NAO_ENCONTRADA = 'Link inválido ou arte não encontrada.'

/**
 * Aprovação da arte pelo cliente, sem login (/arte/:token). Mostra só a versão do link;
 * se já existe uma versão mais nova, o link antigo fica apenas para consulta.
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
            pedido: { select: { id: true, numero: true, vendedorId: true, cliente: { select: { nome: true } } } },
            artes: { orderBy: { versao: 'desc' }, take: 1, select: { id: true } },
          },
        },
      },
    })
    if (!arte) throw AppError.naoEncontrado(NAO_ENCONTRADA)
    return arte
  }

  async function responder(token: string, aprovar: boolean, nome: string, texto: string, ip: string) {
    const arte = await buscar(token)
    const ultima = arte.pedidoItem.artes[0]?.id === arte.id
    if (!ultima || arte.status !== 'enviada_cliente') throw AppError.regraNegocio('Esta arte não está aguardando sua resposta.')
    const pedidoId = arte.pedidoItem.pedido.id
    const titulo = `Arte v${arte.versao} do ${arte.pedidoItem.pedido.numero} ${aprovar ? 'aprovada' : 'com ajuste solicitado'}`
    const mudanca = await prisma.$transaction(async (tx) => {
      // Transição atômica: só responde se ainda estiver aguardando (clique duplo ou aprovar e
      // pedir ajuste ao mesmo tempo não aplicam as duas respostas)
      const { count } = await tx.arte.updateMany({
        where: { id: arte.id, status: 'enviada_cliente' },
        data: aprovar ? { status: 'aprovada', aprovadaEm: new Date(), comentarioCliente: texto } : { status: 'ajuste_solicitado', comentarioCliente: texto },
      })
      if (count !== 1) throw AppError.regraNegocio('Esta arte já foi respondida.')
      await tx.arteComentario.create({ data: { arteId: arte.id, autorNome: nome, origem: 'cliente', texto } })
      const avisar = [arte.designerId, arte.pedidoItem.pedido.vendedorId].filter((id, i, l): id is string => Boolean(id) && l.indexOf(id) === i)
      for (const usuarioId of avisar) {
        await tx.notificacao.create({
          data: {
            usuarioId,
            titulo,
            mensagem: `${nome}: ${texto}`,
            link: `/pedidos/${pedidoId}`,
          },
        })
      }
      await registrarAuditoria(tx, { tabela: 'artes', registroId: arte.id, acao: 'editar', antes: { status: arte.status }, depois: { status: aprovar ? 'aprovada' : 'ajuste_solicitado', via: 'link público', nome, ip }, usuarioId: null })
      return { mudanca: await sincronizarStatusPedido(tx, pedidoId, null), avisar }
    })
    avisarMudancaPedido(app, mudanca.mudanca, pedidoId)
    app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId })
    for (const u of mudanca.avisar) app.tempoReal.emitir(`usuario:${u}`, 'notificacao:nova', { titulo, pedidoId })
    return montarVisao(token)
  }

  async function montarVisao(token: string) {
    const arte = await buscar(token)
    const empresa = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
    const ultima = arte.pedidoItem.artes[0]?.id === arte.id
    const podeExibir = arte.arquivo && ['image/png', 'image/jpeg', 'application/pdf'].includes(arte.arquivo.mime)
    return {
      versao: arte.versao,
      status: arte.status,
      ultimaVersao: ultima,
      podeResponder: ultima && arte.status === 'enviada_cliente',
      pedido: { numero: arte.pedidoItem.pedido.numero, cliente: arte.pedidoItem.pedido.cliente.nome },
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
  }
}

export type ArtePublica = Awaited<ReturnType<ReturnType<typeof criarArtesPublicoService>['obter']>>
