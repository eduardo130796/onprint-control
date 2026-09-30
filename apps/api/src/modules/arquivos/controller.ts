import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { EntidadeArquivo } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import type { ArquivosService } from './service'

export function criarArquivosController(app: FastifyInstance, service: ArquivosService) {
  /** Arquivos seguem a permissão do módulo da entidade; o logo da empresa é visível a todos os usuários. */
  async function verificarAcesso(request: FastifyRequest, arquivo: { entidade: string; categoria: string }, escrita: boolean) {
    if (!escrita && arquivo.categoria === 'logo') return
    // Arte e comprovante: quem acompanha o pedido ou a produção também precisa ver (miniatura no kanban)
    if (!escrita && ['arte', 'entrega'].includes(arquivo.entidade)) {
      const verificacoes = await Promise.all([
        app.temPermissao(request, 'artes', 'visualizar'),
        app.temPermissao(request, 'producao', 'visualizar'),
        app.temPermissao(request, 'pedidos', 'visualizar'),
      ])
      if (verificacoes.some(Boolean)) return
    }
    const modulo = service.moduloDaEntidade(arquivo.entidade)
    if (!(await app.temPermissao(request, modulo, escrita ? 'editar' : 'visualizar'))) throw AppError.semPermissao()
  }

  async function enviarConteudo(reply: FastifyReply, arquivo: Awaited<ReturnType<ArquivosService['obter']>>) {
    const { stream, disposicao } = service.abrir(arquivo)
    return reply
      .type(arquivo.mime)
      .header('Content-Disposition', disposicao)
      .header('Content-Length', arquivo.tamanho)
      // Arquivos enviados por usuários nunca executam scripts no domínio do sistema
      .header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
      .header('Cache-Control', 'private, max-age=300')
      .send(stream)
  }

  return {
    async enviar(
      request: FastifyRequest,
      query: { entidade: EntidadeArquivo; entidadeId: string; categoria: string },
    ) {
      if (query.entidade === 'empresa' || !service.categoriaValida(query.categoria) || query.categoria === 'logo') {
        throw AppError.regraNegocio('Use a tela de Dados da empresa para enviar o logo.')
      }
      await verificarAcesso(request, query, true)
      return service.receberUpload(
        request,
        { entidade: query.entidade, entidadeId: query.entidadeId, categoria: query.categoria },
        request.user.sub,
      )
    },

    async listar(request: FastifyRequest, query: { entidade: EntidadeArquivo; entidadeId: string }) {
      await verificarAcesso(request, { ...query, categoria: 'anexo' }, false)
      return service.listar(query.entidade, query.entidadeId)
    },

    async baixar(request: FastifyRequest, reply: FastifyReply, id: string) {
      const arquivo = await service.obter(id)
      await verificarAcesso(request, arquivo, false)
      return enviarConteudo(reply, arquivo)
    },

    async urlTemporaria(request: FastifyRequest, id: string) {
      const arquivo = await service.obter(id)
      await verificarAcesso(request, arquivo, false)
      return { url: app.storage.gerarUrlTemporaria(id) }
    },

    async baixarPublico(reply: FastifyReply, token: string) {
      const id = app.storage.validarTokenTemporario(token)
      if (!id) throw AppError.naoEncontrado('Link expirado ou inválido.')
      return enviarConteudo(reply, await service.obter(id))
    },

    async remover(request: FastifyRequest, id: string) {
      const arquivo = await service.obter(id)
      await verificarAcesso(request, arquivo, true)
      await service.remover(id, request.user.sub)
    },
  }
}
