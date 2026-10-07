import fp from 'fastify-plugin'
import type { FastifyRequest } from 'fastify'
import { ACOES_LEITURA, CODIGOS_ERRO, MODULO_ROTULOS, type Acao, type Modulo } from '@onprint/shared'
import { AppError } from '../core/AppError'
import { contextoEmpresa } from '../core/contexto-empresa'

declare module 'fastify' {
  interface FastifyInstance {
    /** onRequest: exige login, senha trocada e a permissão módulo + ação. */
    exigirPermissao: (modulo: Modulo, acao: Acao) => (request: FastifyRequest) => Promise<void>
    /** Consulta (sem lançar erro) se o usuário da requisição tem a permissão. */
    temPermissao: (request: FastifyRequest, modulo: Modulo, acao: Acao) => Promise<boolean>
    /** Limpa o cache — chamado sempre que a matriz de permissões muda. */
    invalidarPermissoes: () => void
    /** Permissões ("modulo:acao") de um papel, com cache (usado também fora de requisições HTTP). */
    permissoesDoPapel: (papelId: string) => Promise<Set<string>>
  }
}

/**
 * Permissões por papel com cache em memória (por empresa). O cache é carregado sob demanda
 * e invalidado quando a matriz é alterada em Configurações → Permissões.
 */
export const permissionsPlugin = fp(async (app) => {
  const cache = new Map<string, Promise<Set<string>>>()

  function permissoesDoPapel(papelId: string): Promise<Set<string>> {
    const chave = `${contextoEmpresa.exigir().id}:${papelId}`
    let carregando = cache.get(chave)
    if (!carregando) {
      carregando = app.prisma.papelPermissao
        .findMany({ where: { papelId, papel: { ativo: true } }, include: { permissao: true } })
        .then((lista) => new Set(lista.map((pp) => `${pp.permissao.modulo}:${pp.permissao.acao}`)))
      carregando.catch(() => cache.delete(chave))
      cache.set(chave, carregando)
    }
    return carregando
  }

  /** A assinatura limita o papel: módulos fora do plano e, no modo só leitura, ações de escrita. */
  function assinaturaPermite(modulo: Modulo, acao: Acao) {
    const assinatura = contextoEmpresa.exigir().assinatura
    if (!assinatura) return true
    if (!assinatura.modulos.includes(modulo) || assinatura.acesso.nivel === 'bloqueado') return false
    return assinatura.acesso.nivel !== 'somente_leitura' || ACOES_LEITURA.includes(acao)
  }

  app.decorate('temPermissao', async (request: FastifyRequest, modulo: Modulo, acao: Acao) => {
    return assinaturaPermite(modulo, acao) && (await permissoesDoPapel(request.user.papelId)).has(`${modulo}:${acao}`)
  })

  app.decorate('exigirPermissao', (modulo: Modulo, acao: Acao) => async (request: FastifyRequest) => {
    await app.autenticar(request)
    const assinatura = contextoEmpresa.exigir().assinatura
    if (assinatura && !assinatura.modulos.includes(modulo)) {
      throw new AppError(403, CODIGOS_ERRO.MODULO_NAO_CONTRATADO, `O módulo ${MODULO_ROTULOS[modulo]} não faz parte do plano ${assinatura.plano.nome}.`)
    }
    if (!(await app.temPermissao(request, modulo, acao))) throw AppError.semPermissao()
  })

  app.decorate('invalidarPermissoes', () => cache.clear())
  app.decorate('permissoesDoPapel', permissoesDoPapel)
})
