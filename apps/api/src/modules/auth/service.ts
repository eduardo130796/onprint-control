import argon2 from 'argon2'
import type { FastifyInstance } from 'fastify'
import type { LoginInput, TrocarSenhaInput, UsuarioLogado } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { gerarRefreshToken, hashRefreshToken } from '../../core/tokens'

export interface MetaRequisicao {
  ip?: string
  userAgent?: string
}

export interface ResultadoAutenticacao {
  accessToken: string
  refreshToken?: string
  usuario: UsuarioLogado
}

const CREDENCIAIS_INVALIDAS = 'E-mail ou senha inválidos.'

export function criarAuthService(app: FastifyInstance) {
  const { prisma, config } = app
  // Hash fictício para que o tempo de resposta não revele se o e-mail existe
  let hashFicticio: Promise<string> | undefined
  const obterHashFicticio = () => (hashFicticio ??= argon2.hash('senha-ficticia-onprint'))

  async function montarUsuarioLogado(usuarioId: string): Promise<UsuarioLogado> {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: { papel: { include: { permissoes: { include: { permissao: true } } } } },
    })
    if (!usuario || !usuario.ativo) throw AppError.naoAutenticado()
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      avatar: usuario.avatar,
      deveTrocarSenha: usuario.deveTrocarSenha,
      papel: { id: usuario.papel.id, codigo: usuario.papel.codigo, nome: usuario.papel.nome },
      permissoes: usuario.papel.permissoes.map((pp) => `${pp.permissao.modulo}:${pp.permissao.acao}`).sort(),
    }
  }

  function assinarAccessToken(usuario: UsuarioLogado) {
    return app.jwt.sign({ sub: usuario.id, papelId: usuario.papel.id, dts: usuario.deveTrocarSenha })
  }

  async function criarSessao(usuarioId: string, meta: MetaRequisicao) {
    const refreshToken = gerarRefreshToken()
    await prisma.sessao.create({
      data: {
        usuarioId,
        refreshTokenHash: hashRefreshToken(refreshToken, config.JWT_REFRESH_SECRET),
        expiraEm: new Date(Date.now() + config.JWT_REFRESH_EXPIRES.ms),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500),
      },
    })
    return refreshToken
  }

  return {
    async login({ email, senha }: LoginInput, meta: MetaRequisicao): Promise<ResultadoAutenticacao> {
      const registro = await prisma.usuario.findUnique({ where: { email } })
      const senhaOk = await argon2.verify(registro?.senhaHash ?? (await obterHashFicticio()), senha)
      if (!registro || !senhaOk) throw AppError.naoAutenticado(CREDENCIAIS_INVALIDAS)
      if (!registro.ativo) throw AppError.naoAutenticado('Usuário desativado. Fale com o administrador.')

      await prisma.usuario.update({ where: { id: registro.id }, data: { ultimoLogin: new Date() } })
      const usuario = await montarUsuarioLogado(registro.id)
      const refreshToken = await criarSessao(registro.id, meta)
      return { accessToken: assinarAccessToken(usuario), refreshToken, usuario }
    },

    /** Valida o refresh token, revoga a sessão antiga e emite um novo par (rotação). */
    async renovar(refreshToken: string | undefined, meta: MetaRequisicao): Promise<ResultadoAutenticacao> {
      if (!refreshToken) throw AppError.naoAutenticado()
      const hash = hashRefreshToken(refreshToken, config.JWT_REFRESH_SECRET)
      const sessao = await prisma.sessao.findUnique({ where: { refreshTokenHash: hash } })
      if (!sessao || sessao.revogada || sessao.expiraEm < new Date()) throw AppError.naoAutenticado()

      const usuario = await montarUsuarioLogado(sessao.usuarioId)
      await prisma.sessao.update({ where: { id: sessao.id }, data: { revogada: true } })
      const novoRefresh = await criarSessao(sessao.usuarioId, meta)
      return { accessToken: assinarAccessToken(usuario), refreshToken: novoRefresh, usuario }
    },

    async logout(refreshToken: string | undefined) {
      if (!refreshToken) return
      await prisma.sessao.updateMany({
        where: { refreshTokenHash: hashRefreshToken(refreshToken, config.JWT_REFRESH_SECRET) },
        data: { revogada: true },
      })
    },

    me: montarUsuarioLogado,

    async trocarSenha(usuarioId: string, input: TrocarSenhaInput): Promise<ResultadoAutenticacao> {
      const registro = await prisma.usuario.findUnique({ where: { id: usuarioId } })
      if (!registro) throw AppError.naoAutenticado()
      if (!(await argon2.verify(registro.senhaHash, input.senhaAtual))) {
        throw AppError.regraNegocio('A senha atual está incorreta.')
      }
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { senhaHash: await argon2.hash(input.novaSenha), deveTrocarSenha: false },
      })
      const usuario = await montarUsuarioLogado(usuarioId)
      return { accessToken: assinarAccessToken(usuario), usuario }
    },
  }
}

export type AuthService = ReturnType<typeof criarAuthService>
