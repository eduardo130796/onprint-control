import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { artesParaAprovarTodas, notaAprovacaoInterna, type ViaAprovacaoArte } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import type { ContextoUsuario } from '../../core/escopo'
import type { ArquivosService } from '../arquivos/service'
import { avisarMudancaPedido, sincronizarStatusPedido } from '../pedidos/automacao'
import { descartarAvisoDeArte } from '../whatsapp/anexos-arte'
import { gerarMiniatura } from './miniatura'

const gerarToken = () => randomBytes(24).toString('base64url')

const ENCERRADOS = ['cancelado', 'entregue']

export const incluirArte = {
  arquivo: { select: { id: true, nomeOriginal: true, mime: true, tamanho: true } },
  designer: { select: { id: true, nome: true } },
  comentarios: { orderBy: { createdAt: 'asc' as const }, select: { id: true, autorNome: true, origem: true, texto: true, createdAt: true } },
}

/**
 * Artes versionadas por item do pedido (v1, v2…). Cada nova versão tem o próprio link
 * de aprovação. A regra "OP só imprime com arte aprovada" usa sempre a versão mais recente.
 */
export function criarArtesService(app: FastifyInstance, arquivos: ArquivosService) {
  const { prisma, storage } = app

  async function obter(id: string) {
    const arte = await prisma.arte.findUnique({ where: { id }, include: { ...incluirArte, pedidoItem: { select: { id: true, pedidoId: true } } } })
    if (!arte) throw AppError.naoEncontrado('Arte não encontrada.')
    return arte
  }

  async function ultimaVersao(pedidoItemId: string) {
    return prisma.arte.findFirst({ where: { pedidoItemId }, orderBy: { versao: 'desc' } })
  }

  /** Última versão da arte de cada item do pedido */
  async function ultimasDoPedido(pedidoId: string) {
    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: { id: true, status: true, itens: { select: { artes: { orderBy: { versao: 'desc' }, take: 1, select: { id: true, status: true, arquivoId: true } } } } },
    })
    if (!pedido) throw AppError.naoEncontrado('Pedido não encontrado.')
    return { pedido, artes: pedido.itens.flatMap((i) => i.artes) }
  }

  async function mudarStatus(id: string, ctx: ContextoUsuario, permitidos: string[], dados: Parameters<typeof prisma.arte.update>[0]['data'], mensagem: string, comentario?: string) {
    const arte = await obter(id)
    const ultima = await ultimaVersao(arte.pedidoItemId)
    if (ultima?.id !== id) throw AppError.regraNegocio('Existe uma versão mais nova desta arte.')
    if (!permitidos.includes(arte.status)) throw AppError.regraNegocio(mensagem)
    const usuario = await prisma.usuario.findUnique({ where: { id: ctx.usuarioId }, select: { nome: true } })
    const mudanca = await prisma.$transaction(async (tx) => {
      await tx.arte.update({ where: { id }, data: dados })
      if (comentario) await tx.arteComentario.create({ data: { arteId: id, autorNome: usuario?.nome ?? 'Equipe', usuarioId: ctx.usuarioId, origem: 'interno', texto: comentario } })
      await registrarAuditoria(tx, { tabela: 'artes', registroId: id, acao: 'editar', antes: { status: arte.status }, depois: dados, usuarioId: ctx.usuarioId })
      return sincronizarStatusPedido(tx, arte.pedidoItem.pedidoId, ctx.usuarioId)
    })
    avisarMudancaPedido(app, mudanca, arte.pedidoItem.pedidoId)
    app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId: arte.pedidoItem.pedidoId })
    return obter(id)
  }

  return {
    obter,

    /**
     * Recebe o arquivo da arte: preenche a versão atual se ela ainda não tem arquivo,
     * senão cria a próxima versão. Gera a miniatura quando o arquivo é imagem.
     */
    async enviarArquivo(request: FastifyRequest, pedidoItemId: string, ctx: ContextoUsuario) {
      const item = await prisma.pedidoItem.findUnique({ where: { id: pedidoItemId }, include: { pedido: { select: { id: true, status: true } } } })
      if (!item) throw AppError.naoEncontrado('Item do pedido não encontrado.')
      if (['cancelado', 'entregue'].includes(item.pedido.status)) throw AppError.regraNegocio('Pedido encerrado: não recebe novas artes.')

      // Uma nova versão (inclusive depois de aprovada) precisa de nova aprovação do cliente
      const atual = await ultimaVersao(pedidoItemId)
      const alvo =
        atual && !atual.arquivoId
          ? atual
          : await prisma.arte.create({ data: { pedidoItemId, versao: (atual?.versao ?? 0) + 1, status: 'em_criacao', tokenPublico: gerarToken() } })

      let arquivo
      try {
        arquivo = await arquivos.receberUpload(request, { entidade: 'arte', entidadeId: alvo.id, categoria: 'arte' }, ctx.usuarioId)
      } catch (erro) {
        if (alvo.id !== atual?.id) await prisma.arte.delete({ where: { id: alvo.id } })
        throw erro
      }
      const salvo = await prisma.arquivo.findUniqueOrThrow({ where: { id: arquivo.id } })
      const mini = await gerarMiniatura(storage, salvo.caminho, salvo.mime, salvo.nomeOriginal)

      const mudanca = await prisma.$transaction(async (tx) => {
        const miniatura = mini
          ? await tx.arquivo.create({
              data: { entidade: 'arte', entidadeId: alvo.id, categoria: 'arte', nomeOriginal: mini.nome, caminho: mini.caminho, mime: 'image/jpeg', tamanho: mini.tamanho, enviadoPorId: ctx.usuarioId },
            })
          : null
        await tx.arte.update({
          where: { id: alvo.id },
          data: { arquivoId: arquivo.id, miniaturaId: miniatura?.id ?? null, status: 'em_criacao', designerId: ctx.usuarioId },
        })
        await registrarAuditoria(tx, { tabela: 'artes', registroId: alvo.id, acao: 'editar', depois: { versao: alvo.versao, arquivo: arquivo.nomeOriginal }, usuarioId: ctx.usuarioId })
        return sincronizarStatusPedido(tx, item.pedido.id, ctx.usuarioId)
      })
      avisarMudancaPedido(app, mudanca, item.pedido.id)
      app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId: item.pedido.id })
      return obter(alvo.id)
    },

    enviarAoCliente: async (id: string, ctx: ContextoUsuario) => {
      const arte = await obter(id)
      if (!arte.arquivoId) throw AppError.regraNegocio('Envie o arquivo da arte antes de mandar para o cliente.')
      const enviada = await mudarStatus(id, ctx, ['em_criacao', 'ajuste_solicitado'], { status: 'enviada_cliente' }, 'Esta arte não pode ser enviada agora.')
      // Aviso pelo WhatsApp da gráfica, se ligado: uma mensagem com todas as artes do pedido que aguardam o cliente
      void app.whatsapp.avisar('arte_aprovacao', { pedidoId: arte.pedidoItem.pedidoId, arteId: id })
      return enviada
    },

    /** Aprovação registrada pela equipe (o caminho normal): quem registrou fica como autor da nota e na auditoria */
    async aprovarInterno(id: string, dados: { via: ViaAprovacaoArte; nome?: string }, ctx: ContextoUsuario) {
      const aprovada = await mudarStatus(
        id,
        ctx,
        ['em_criacao', 'enviada_cliente', 'ajuste_solicitado'],
        { status: 'aprovada', aprovadaEm: new Date() },
        'Esta arte não pode ser aprovada.',
        notaAprovacaoInterna(dados.via, dados.nome),
      )
      await descartarAvisoDeArte(prisma, aprovada.pedidoItem.pedidoId)
      return aprovada
    },

    /**
     * "Enviar para o cliente" do pedido: marca as artes escolhidas (última versão, com arquivo) como enviadas.
     * A mensagem é uma só para o pedido: pelo diálogo (avisar = false, já saiu) ou pelo aviso automático.
     */
    async enviarVarias(pedidoId: string, arteIds: string[], avisar: boolean, ctx: ContextoUsuario) {
      const { pedido, artes } = await ultimasDoPedido(pedidoId)
      if (ENCERRADOS.includes(pedido.status)) throw AppError.regraNegocio('Pedido encerrado: as artes não vão mais para o cliente.')
      const ids = [...new Set(arteIds)]
      const alvo = artes.filter((a) => ids.includes(a.id))
      if (alvo.length !== ids.length) throw AppError.regraNegocio('Escolha a versão mais recente das artes deste pedido.')
      if (alvo.some((a) => !a.arquivoId)) throw AppError.regraNegocio('Envie o arquivo da arte antes de mandar para o cliente.')
      if (alvo.some((a) => !['em_criacao', 'ajuste_solicitado', 'enviada_cliente'].includes(a.status))) throw AppError.regraNegocio('Arte já aprovada não volta para o cliente.')
      const mudar = alvo.filter((a) => a.status !== 'enviada_cliente')
      const mudanca = await prisma.$transaction(async (tx) => {
        for (const a of mudar) {
          const { count } = await tx.arte.updateMany({ where: { id: a.id, status: a.status }, data: { status: 'enviada_cliente' } })
          if (count !== 1) throw AppError.regraNegocio('A arte mudou enquanto você enviava. Atualize a tela.')
          await registrarAuditoria(tx, { tabela: 'artes', registroId: a.id, acao: 'editar', antes: { status: a.status }, depois: { status: 'enviada_cliente' }, usuarioId: ctx.usuarioId })
        }
        return sincronizarStatusPedido(tx, pedidoId, ctx.usuarioId)
      })
      avisarMudancaPedido(app, mudanca, pedidoId)
      app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId })
      if (avisar) void app.whatsapp.avisar('arte_aprovacao', { pedidoId, arteId: alvo[0]!.id })
      return { enviadas: alvo.length }
    },

    /**
     * "Cliente aprovou todas as artes": um clique aprova a última versão de cada item que está com o cliente ou em
     * criação (com arquivo). Fica a nota em cada arte e a auditoria; o pedido segue para a produção.
     */
    async aprovarTodas(pedidoId: string, dados: { via: ViaAprovacaoArte; nome?: string }, ctx: ContextoUsuario) {
      const { pedido, artes } = await ultimasDoPedido(pedidoId)
      if (ENCERRADOS.includes(pedido.status)) throw AppError.regraNegocio('Pedido encerrado.')
      const alvo = artesParaAprovarTodas(artes)
      if (!alvo.length) throw AppError.regraNegocio('Nenhuma arte com arquivo aguardando aprovação.')
      const usuario = await prisma.usuario.findUnique({ where: { id: ctx.usuarioId }, select: { nome: true } })
      const nota = notaAprovacaoInterna(dados.via, dados.nome)
      const agora = new Date()
      const mudanca = await prisma.$transaction(async (tx) => {
        for (const a of alvo) {
          // Transição atômica: o cliente pode ter respondido pelo link no mesmo instante
          const { count } = await tx.arte.updateMany({ where: { id: a.id, status: a.status }, data: { status: 'aprovada', aprovadaEm: agora } })
          if (count !== 1) throw AppError.regraNegocio('Uma das artes mudou agora há pouco. Atualize a tela.')
          await tx.arteComentario.create({ data: { arteId: a.id, autorNome: usuario?.nome ?? 'Equipe', usuarioId: ctx.usuarioId, origem: 'interno', texto: nota } })
          await registrarAuditoria(tx, {
            tabela: 'artes',
            registroId: a.id,
            acao: 'editar',
            antes: { status: a.status },
            depois: { status: 'aprovada', via: dados.via, todasDoPedido: true },
            usuarioId: ctx.usuarioId,
          })
        }
        return sincronizarStatusPedido(tx, pedidoId, ctx.usuarioId)
      })
      avisarMudancaPedido(app, mudanca, pedidoId)
      app.tempoReal.emitir('producao', 'op:atualizada', { pedidoId })
      await descartarAvisoDeArte(prisma, pedidoId)
      return { aprovadas: alvo.length }
    },

    async comentar(id: string, texto: string, ctx: ContextoUsuario) {
      const arte = await obter(id)
      const usuario = await prisma.usuario.findUnique({ where: { id: ctx.usuarioId }, select: { nome: true } })
      await prisma.arteComentario.create({ data: { arteId: id, autorNome: usuario?.nome ?? 'Equipe', usuarioId: ctx.usuarioId, origem: 'interno', texto } })
      app.tempoReal.emitir('pedidos', 'pedido:atualizado', { id: arte.pedidoItem.pedidoId })
      return obter(id)
    },
  }
}

export type ArtesService = ReturnType<typeof criarArtesService>
