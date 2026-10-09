import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import type { FastifyRequest } from 'fastify'
import { CODIGOS_ERRO } from '@onprint/shared'
import { AppError } from '../core/AppError'
import { contextoEmpresa } from '../core/contexto-empresa'

/** Conteúdo do access token (JWT curto). */
export interface AccessTokenPayload {
  sub: string
  papelId: string
  /** true enquanto o usuário precisa trocar a senha */
  dts: boolean
  /** Empresa assinante (id em plataforma.assinantes) */
  emp: string
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload
    user: AccessTokenPayload
  }
}

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Rota que funciona com a assinatura bloqueada (ver e pagar a assinatura, sair) */
    assinaturaLivre?: boolean
    /** POST que não grava nada (ex.: simulação de preço): liberado no modo só leitura */
    semEscrita?: boolean
  }
  interface FastifyInstance {
    /** Exige access token válido e senha já trocada. */
    autenticar: (request: FastifyRequest) => Promise<void>
    /** Exige access token válido, mesmo com troca de senha pendente (rotas me e trocar-senha). */
    autenticarPermitindoTrocaSenha: (request: FastifyRequest) => Promise<void>
    /** Exige o token de administrador da plataforma (painel); tokens das empresas são recusados. */
    autenticarPlataforma: (request: FastifyRequest) => Promise<void>
    /** Situação atual do usuário no banco da empresa do contexto (cache de poucos segundos); null se não existe. */
    situacaoUsuario: (empresaId: string, usuarioId: string) => Promise<SituacaoUsuario | null>
    /** Descarta o cache do usuário (troca de senha, desativação, mudança de papel). */
    esquecerUsuario: (empresaId: string, usuarioId: string) => void
  }
}

export interface SituacaoUsuario {
  ativo: boolean
  papelId: string
  deveTrocarSenha: boolean
}

/** Desativar ou trocar o papel de alguém vale em segundos, sem esperar o access token (15 min) vencer. */
const CACHE_USUARIO_MAX_MS = 15_000
const MAX_CACHE_USUARIOS = 5000

export const authPlugin = fp(async (app) => {
  /** Valida o token e entra no schema da empresa dele (desativada = sessão encerrada). */
  async function verificarToken(request: FastifyRequest) {
    try {
      await request.jwtVerify()
    } catch {
      throw AppError.naoAutenticado()
    }
    // Token do painel da plataforma não abre o sistema de nenhuma empresa
    if ((request.user as { plat?: boolean }).plat) throw AppError.naoAutenticado()
    const empresa = await app.empresas.porId(request.user.emp)
    if (!empresa) throw AppError.naoAutenticado()
    contextoEmpresa.definir(empresa)
    // Usuário desativado perde o acesso na hora; as permissões seguem o papel atual do banco, não o do token
    const usuario = await app.situacaoUsuario(empresa.id, request.user.sub)
    if (!usuario?.ativo) throw AppError.naoAutenticado()
    request.user.papelId = usuario.papelId
    request.user.dts = request.user.dts || usuario.deveTrocarSenha
  }

  // Nunca mais longo que o cache das empresas (0 nos testes ponta a ponta = sempre consulta)
  const CACHE_USUARIO_MS = Math.min(CACHE_USUARIO_MAX_MS, app.config.CACHE_EMPRESAS_SEGUNDOS * 1000)
  const cacheUsuarios = new Map<string, { situacao: SituacaoUsuario | null; expira: number }>()
  app.decorate('situacaoUsuario', async (empresaId: string, usuarioId: string) => {
    const chave = `${empresaId}:${usuarioId}`
    const guardado = cacheUsuarios.get(chave)
    if (guardado && guardado.expira > Date.now()) return guardado.situacao
    const situacao = await app.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { ativo: true, papelId: true, deveTrocarSenha: true } })
    cacheUsuarios.delete(chave)
    if (CACHE_USUARIO_MS > 0) cacheUsuarios.set(chave, { situacao, expira: Date.now() + CACHE_USUARIO_MS })
    if (cacheUsuarios.size > MAX_CACHE_USUARIOS) cacheUsuarios.delete(cacheUsuarios.keys().next().value as string)
    return situacao
  })
  app.decorate('esquecerUsuario', (empresaId: string, usuarioId: string) => {
    cacheUsuarios.delete(`${empresaId}:${usuarioId}`)
  })
  const limpeza = setInterval(() => {
    const agora = Date.now()
    for (const [chave, item] of cacheUsuarios) if (item.expira <= agora) cacheUsuarios.delete(chave)
  }, 60_000)
  limpeza.unref()
  app.addHook('onClose', async () => clearInterval(limpeza))

  await app.register(jwt, {
    secret: app.config.JWT_ACCESS_SECRET,
    sign: { expiresIn: app.config.JWT_ACCESS_EXPIRES.texto },
  })

  app.decorate('autenticarPlataforma', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify()
    } catch {
      throw AppError.naoAutenticado()
    }
    const token = request.user as unknown as { sub: string; plat?: boolean }
    if (!token.plat) throw AppError.naoAutenticado('Entre com um usuário da plataforma.')
    const admin = await app.plataforma.adminPlataforma.findUnique({ where: { id: token.sub }, select: { ativo: true } })
    if (!admin?.ativo) throw AppError.naoAutenticado()
  })

  app.decorate('autenticarPermitindoTrocaSenha', async (request: FastifyRequest) => {
    await verificarToken(request)
  })

  app.decorate('autenticar', async (request: FastifyRequest) => {
    await verificarToken(request)
    if (request.user.dts) {
      throw new AppError(403, CODIGOS_ERRO.TROCA_SENHA_OBRIGATORIA, 'Troque sua senha para continuar.')
    }
    verificarAssinatura(request)
  })

  /** Bloqueada: só as rotas da assinatura. Só leitura: nada que grave (métodos diferentes de GET). */
  function verificarAssinatura(request: FastifyRequest) {
    const acesso = contextoEmpresa.exigir().assinatura?.acesso
    const config = request.routeOptions.config
    if (!acesso || config.assinaturaLivre) return
    if (acesso.nivel === 'bloqueado') throw new AppError(403, CODIGOS_ERRO.ASSINATURA_BLOQUEADA, acesso.mensagem)
    if (acesso.nivel === 'somente_leitura' && !['GET', 'HEAD'].includes(request.method) && !config.semEscrita) {
      throw new AppError(403, CODIGOS_ERRO.ASSINATURA_SOMENTE_LEITURA, acesso.mensagem)
    }
  }
})
