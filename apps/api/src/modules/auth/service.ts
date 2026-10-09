import argon2 from 'argon2'
import type { FastifyInstance } from 'fastify'
import { CODIGOS_ERRO, filtrarPermissoes, type LoginInput, type TrocarSenhaInput, type UsuarioLogado } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { empresaDoRefreshToken, gerarRefreshToken, hashRefreshToken } from '../../core/tokens'
import { LOGIN_JANELA_MS, LOGIN_MAX_FALHAS, MSG_LOGIN_TRAVADO, criarContadorTentativas } from './tentativas'

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
/** Duas abas renovando juntas usam o mesmo token: dentro desta carência não é tratado como roubo. */
const CARENCIA_REUSO_MS = 60_000

export function criarAuthService(app: FastifyInstance) {
  const { prisma, config } = app
  // Hash fictício para que o tempo de resposta não revele se o e-mail existe
  let hashFicticio: Promise<string> | undefined
  const obterHashFicticio = () => (hashFicticio ??= argon2.hash('senha-ficticia-onprint'))
  const falhasLogin = criarContadorTentativas({ max: LOGIN_MAX_FALHAS, janelaMs: LOGIN_JANELA_MS })

  async function montarUsuarioLogado(usuarioId: string): Promise<UsuarioLogado> {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: { papel: { include: { permissoes: { include: { permissao: true } } } } },
    })
    if (!usuario || !usuario.ativo) throw AppError.naoAutenticado()
    const empresa = contextoEmpresa.exigir()
    const permissoes = usuario.papel.permissoes.map((pp) => `${pp.permissao.modulo}:${pp.permissao.acao}`).sort()
    const assinatura = empresa.assinatura
    // Marca da empresa no sistema: nome, logo e cor (o "Minha Empresa" padrão não conta como nome)
    const config = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { nomeFantasia: true, razaoSocial: true, logoArquivoId: true, corTema: true } })
    const razao = config?.razaoSocial && config.razaoSocial !== 'Minha Empresa' ? config.razaoSocial : null
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      avatar: usuario.avatar,
      deveTrocarSenha: usuario.deveTrocarSenha,
      modoTela: (['claro', 'escuro', 'sistema'].includes(usuario.modoTela) ? usuario.modoTela : 'claro') as UsuarioLogado['modoTela'],
      papel: { id: usuario.papel.id, codigo: usuario.papel.codigo, nome: usuario.papel.nome },
      // Módulos fora do plano, ações de escrita no modo só leitura e tudo no bloqueio saem da lista
      permissoes: assinatura ? filtrarPermissoes(permissoes, assinatura.modulos, assinatura.acesso.nivel) : permissoes,
      empresa: { id: empresa.id, nome: empresa.nome, slug: empresa.slug, exibicao: config?.nomeFantasia || razao || empresa.nome, logoArquivoId: config?.logoArquivoId ?? null, corTema: config?.corTema ?? null },
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
      // Muitas senhas erradas para o mesmo e-mail (de qualquer IP) travam o e-mail por um tempo
      if (falhasLogin.bloqueado(dados.email)) throw new AppError(429, CODIGOS_ERRO.MUITAS_TENTATIVAS, MSG_LOGIN_TRAVADO)
      try {
        const indice = await app.plataforma.indiceLogin.findUnique({ where: { email: dados.email } })
        const empresa = indice ? await app.empresas.porId(indice.assinanteId) : null
        if (!empresa) {
          await argon2.verify(await obterHashFicticio(), dados.senha)
          throw AppError.naoAutenticado(CREDENCIAIS_INVALIDAS)
        }
        const resultado = await contextoEmpresa.com(empresa, () => entrar(dados, meta))
        falhasLogin.limpar(dados.email)
        return resultado
      } catch (erro) {
        if (erro instanceof AppError && erro.statusCode === 401) falhasLogin.registrar(dados.email)
        throw erro
      }
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

    /** Senha nova encerra todas as sessões e links de senha pendentes; quem trocou recebe uma sessão nova. */
    async trocarSenha(usuarioId: string, input: TrocarSenhaInput, meta: MetaRequisicao): Promise<ResultadoAutenticacao> {
      const registro = await prisma.usuario.findUnique({ where: { id: usuarioId } })
      if (!registro) throw AppError.naoAutenticado()
      if (!(await argon2.verify(registro.senhaHash, input.senhaAtual))) {
        throw AppError.regraNegocio('A senha atual está incorreta.')
      }
      const senhaHash = await argon2.hash(input.novaSenha)
      await prisma.$transaction([
        prisma.usuario.update({ where: { id: usuarioId }, data: { senhaHash, deveTrocarSenha: false } }),
        prisma.sessao.updateMany({ where: { usuarioId, revogada: false }, data: { revogada: true } }),
      ])
      const empresaId = contextoEmpresa.exigir().id
      await app.plataforma.tokenSenha.updateMany({ where: { assinanteId: empresaId, usuarioId, usadoEm: null }, data: { usadoEm: new Date() } })
      app.esquecerUsuario(empresaId, usuarioId)
      const usuario = await montarUsuarioLogado(usuarioId)
      const refreshToken = await criarSessao(usuarioId, meta)
      return { accessToken: assinarAccessToken(usuario), refreshToken, usuario }
    },
  }

  async function entrar({ email, senha }: LoginInput, meta: MetaRequisicao): Promise<ResultadoAutenticacao> {
    const registro = await prisma.usuario.findUnique({ where: { email } })
    const senhaOk = await argon2.verify(registro?.senhaHash ?? (await obterHashFicticio()), senha)
    if (!registro || !senhaOk) throw AppError.naoAutenticado(CREDENCIAIS_INVALIDAS)
    if (!registro.ativo) throw AppError.naoAutenticado('Usuário desativado. Fale com o administrador.')

    await prisma.usuario.update({ where: { id: registro.id }, data: { ultimoLogin: new Date() } })
    // Login novo vê na hora o papel e a situação atuais (sem o cache curto da autenticação)
    app.esquecerUsuario(contextoEmpresa.exigir().id, registro.id)
    const usuario = await montarUsuarioLogado(registro.id)
    const refreshToken = await criarSessao(registro.id, meta)
    return { accessToken: assinarAccessToken(usuario), refreshToken, usuario }
  }

  /**
   * Rotação: só uma requisição consegue revogar a sessão (update condicional), as demais recebem 401.
   * A sessão rotacionada guarda o instante da troca em expiraEm (= updatedAt): é assim que se distingue
   * de logout/troca de senha. Token já rotacionado usado de novo depois da carência = sinal de roubo:
   * todas as sessões do usuário são encerradas.
   */
  async function renovarNaEmpresa(refreshToken: string, meta: MetaRequisicao): Promise<ResultadoAutenticacao> {
    const hash = hashRefreshToken(refreshToken, config.JWT_REFRESH_SECRET)
    const sessao = await prisma.sessao.findUnique({ where: { refreshTokenHash: hash } })
    if (!sessao) throw AppError.naoAutenticado()
    const agora = new Date()
    const r = await prisma.sessao.updateMany({
      where: { id: sessao.id, revogada: false, expiraEm: { gt: agora } },
      data: { revogada: true, expiraEm: agora, updatedAt: agora },
    })
    if (r.count !== 1) {
      const rotacionada = sessao.revogada && Math.abs(sessao.expiraEm.getTime() - sessao.updatedAt.getTime()) < 1000
      if (rotacionada && agora.getTime() - sessao.expiraEm.getTime() > CARENCIA_REUSO_MS) {
        await prisma.sessao.updateMany({ where: { usuarioId: sessao.usuarioId, revogada: false }, data: { revogada: true } })
        app.log.warn({ usuarioId: sessao.usuarioId, empresaId: contextoEmpresa.exigir().id, ip: meta.ip }, 'Refresh token reutilizado: sessões do usuário encerradas')
      }
      throw AppError.naoAutenticado()
    }

    const usuario = await montarUsuarioLogado(sessao.usuarioId)
    const novoRefresh = await criarSessao(sessao.usuarioId, meta)
    return { accessToken: assinarAccessToken(usuario), refreshToken: novoRefresh, usuario }
  }
}

export type AuthService = ReturnType<typeof criarAuthService>
