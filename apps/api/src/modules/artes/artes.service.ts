import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import type { ContextoUsuario } from '../../core/escopo'
import type { ArquivosService } from '../arquivos/service'
import { avisarMudancaPedido, sincronizarStatusPedido } from '../pedidos/automacao'
import { gerarMiniatura } from './miniatura'

const gerarToken = () => randomBytes(24).toString('base64url')

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
      return mudarStatus(id, ctx, ['em_criacao', 'ajuste_solicitado'], { status: 'enviada_cliente' }, 'Esta arte não pode ser enviada agora.')
    },

    aprovarInterno: (id: string, nome: string, ctx: ContextoUsuario) =>
      mudarStatus(id, ctx, ['em_criacao', 'enviada_cliente', 'ajuste_solicitado'], { status: 'aprovada', aprovadaEm: new Date() }, 'Esta arte não pode ser aprovada.', `Aprovação registrada internamente: ${nome}.`),

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
