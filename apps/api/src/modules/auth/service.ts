import argon2 from 'argon2'
import type { FastifyInstance } from 'fastify'
import { filtrarPermissoes, type LoginInput, type TrocarSenhaInput, type UsuarioLogado } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { empresaDoRefreshToken, gerarRefreshToken, hashRefreshToken } from '../../core/tokens'

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
    const empresa = contextoEmpresa.exigir()
    const permissoes = usuario.papel.permissoes.map((pp) => `${pp.permissao.modulo}:${pp.permissao.acao}`).sort()
    const assinatura = empresa.assinatura
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      avatar: usuario.avatar,
      deveTrocarSenha: usuario.deveTrocarSenha,
      papel: { id: usuario.papel.id, codigo: usuario.papel.codigo, nome: usuario.papel.nome },
      // Módulos fora do plano, ações de escrita no modo só leitura e tudo no bloqueio saem da lista
      permissoes: assinatura ? filtrarPermissoes(permissoes, assinatura.modulos, assinatura.acesso.nivel) : permissoes,
      empresa: { id: empresa.id, nome: empresa.nome, slug: empresa.slug },
      assinatura: assinatura ? { plano: assinatura.plano.nome, ...assinatura.acesso } : null,
    }
  }

  function assinarAccessToken(usuario: UsuarioLogado) {
    return app.jwt.sign({ sub: usuario.id, papelId: usuario.papel.id, dts: usuario.deveTrocarSenha, emp: usuario.empresa.id })
  }

  async function criarSessao(usuarioId: string, meta: MetaRequisicao) {
    const refreshToken = gerarRefreshToken(contextoEmpresa.exigir().id)
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

  /** Empresa da sessão a partir do refresh token (o login e a renovação não passam pela autenticação). */
  async function empresaDaSessao(refreshToken: string): Promise<EmpresaAtual> {
    const empresa = await app.empresas.porId(empresaDoRefreshToken(refreshToken))
    if (!empresa) throw AppError.naoAutenticado()
    return empresa
  }

  return {
    /** O e-mail é único na plataforma: o índice de login diz em qual empresa procurar o usuário. */
    async login(dados: LoginInput, meta: MetaRequisicao): Promise<ResultadoAutenticacao> {
      const indice = await app.plataforma.indiceLogin.findUnique({ where: { email: dados.email } })
      const empresa = indice ? await app.empresas.porId(indice.assinanteId) : null
      if (!empresa) {
        await argon2.verify(await obterHashFicticio(), dados.senha)
        throw AppError.naoAutenticado(CREDENCIAIS_INVALIDAS)
      }
      return contextoEmpresa.com(empresa, () => entrar(dados, meta))
    },

    /** Valida o refresh token, revoga a sessão antiga e emite um novo par (rotação). */
    async renovar(refreshToken: string | undefined, meta: MetaRequisicao): Promise<ResultadoAutenticacao> {
      if (!refreshToken) throw AppError.naoAutenticado()
      return contextoEmpresa.com(await empresaDaSessao(refreshToken), () => renovarNaEmpresa(refreshToken, meta))
    },

    async logout(refreshToken: string | undefined) {
      if (!refreshToken) return
      const empresa = await app.empresas.porId(empresaDoRefreshToken(refreshToken))
      if (!empresa) return
      await contextoEmpresa.com(empresa, () =>
        prisma.sessao.updateMany({
          where: { refreshTokenHash: hashRefreshToken(refreshToken, config.JWT_REFRESH_SECRET) },
          data: { revogada: true },
        }),
      )
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

  async function entrar({ email, senha }: LoginInput, meta: MetaRequisicao): Promise<ResultadoAutenticacao> {
    const registro = await prisma.usuario.findUnique({ where: { email } })
    const senhaOk = await argon2.verify(registro?.senhaHash ?? (await obterHashFicticio()), senha)
    if (!registro || !senhaOk) throw AppError.naoAutenticado(CREDENCIAIS_INVALIDAS)
    if (!registro.ativo) throw AppError.naoAutenticado('Usuário desativado. Fale com o administrador.')

    await prisma.usuario.update({ where: { id: registro.id }, data: { ultimoLogin: new Date() } })
    const usuario = await montarUsuarioLogado(registro.id)
    const refreshToken = await criarSessao(registro.id, meta)
    return { accessToken: assinarAccessToken(usuario), refreshToken, usuario }
  }

  async function renovarNaEmpresa(refreshToken: string, meta: MetaRequisicao): Promise<ResultadoAutenticacao> {
    const hash = hashRefreshToken(refreshToken, config.JWT_REFRESH_SECRET)
    const sessao = await prisma.sessao.findUnique({ where: { refreshTokenHash: hash } })
    if (!sessao || sessao.revogada || sessao.expiraEm < new Date()) throw AppError.naoAutenticado()

    const usuario = await montarUsuarioLogado(sessao.usuarioId)
    await prisma.sessao.update({ where: { id: sessao.id }, data: { revogada: true } })
    const novoRefresh = await criarSessao(sessao.usuarioId, meta)
    return { accessToken: assinarAccessToken(usuario), refreshToken: novoRefresh, usuario }
  }
}

export type AuthService = ReturnType<typeof criarAuthService>
