import argon2 from 'argon2'
import type { FastifyInstance } from 'fastify'
import { formatarDataHora, type LinkSenhaInfo } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { emailConviteUsuario, emailRedefinirSenha, emailSenhaAlterada } from '../../integrations/email/modelos'
import { VALIDADE_HORAS, criarTokensSenha, type FinalidadeToken } from '../../plataforma/tokens-senha'
import { criarContadorTentativas } from './tentativas'

const LINK_INVALIDO = 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".'

interface Destinatario {
  id: string
  nome: string
  email: string
}

/** "Esqueci a senha", convite de usuário novo e troca de senha pelo link do e-mail. */
export function criarRecuperacaoService(app: FastifyInstance) {
  const { prisma, config } = app
  const tokens = criarTokensSenha(app.plataforma, config.JWT_REFRESH_SECRET)
  // Até 5 pedidos de link por e-mail por hora, venham de qualquer IP (não enche a caixa de ninguém)
  const pedidosPorEmail = criarContadorTentativas({ max: 5, janelaMs: 60 * 60_000 })

  /** Como a pessoa reconhece a empresa nos e-mails: o fantasia/razão social e a cor do tema escolhida. */
  async function marcaDaEmpresa() {
    const c = await prisma.empresaConfig.findFirst({ select: { nomeFantasia: true, razaoSocial: true, corTema: true } })
    return { empresa: c?.nomeFantasia || c?.razaoSocial || contextoEmpresa.exigir().nome, tema: c?.corTema ?? null }
  }

  /** Emite o link e manda o e-mail (precisa estar no contexto da empresa do usuário). */
  async function enviarLink(usuario: Destinatario, finalidade: FinalidadeToken, ip?: string) {
    const token = await tokens.emitir({ assinanteId: contextoEmpresa.exigir().id, usuarioId: usuario.id, finalidade, ip })
    const dados = { nome: usuario.nome, email: usuario.email, ...(await marcaDaEmpresa()), link: `${config.APP_URL}/redefinir-senha?token=${token}`, validadeHoras: VALIDADE_HORAS[finalidade] }
    return app.email.enviar(usuario.email, finalidade === 'convite' ? emailConviteUsuario(dados) : emailRedefinirSenha(dados))
  }

  async function processarPedido(email: string, ip: string) {
    const indice = await app.plataforma.indiceLogin.findUnique({ where: { email } })
    const empresa = indice && (await app.empresas.porId(indice.assinanteId))
    if (!indice || !empresa) return
    await contextoEmpresa.com(empresa, async () => {
      const usuario = await prisma.usuario.findUnique({ where: { id: indice.usuarioId }, select: { id: true, nome: true, email: true, ativo: true } })
      if (usuario?.ativo) await enviarLink(usuario, 'redefinir', ip)
    })
  }

  /** Link válido + empresa e usuário dele, já dentro do contexto da empresa. */
  async function abrirLink<T>(token: string, fn: (link: { id: string; finalidade: FinalidadeToken }, usuario: Destinatario) => Promise<T>): Promise<T> {
    const link = await tokens.validar(token)
    const empresa = link && (await app.empresas.porId(link.assinanteId))
    if (!link || !empresa) throw AppError.naoEncontrado(LINK_INVALIDO)
    return contextoEmpresa.com(empresa, async () => {
      const usuario = await prisma.usuario.findUnique({ where: { id: link.usuarioId }, select: { id: true, nome: true, email: true, ativo: true } })
      if (!usuario?.ativo) throw AppError.naoEncontrado(LINK_INVALIDO)
      return fn({ id: link.id, finalidade: link.finalidade as FinalidadeToken }, usuario)
    })
  }

  return {
    /**
     * Sempre responde igual e na hora: não revela se o e-mail existe, nem pelo tempo de resposta.
     * A busca e o envio rodam depois da resposta.
     */
    solicitar(email: string, ip: string) {
      // Passou do limite: ignora em silêncio (a resposta continua a mesma)
      if (pedidosPorEmail.bloqueado(email)) return
      pedidosPorEmail.registrar(email)
      setImmediate(() => void processarPedido(email, ip).catch((erro: unknown) => app.log.error({ err: erro }, 'Falha no pedido de nova senha')))
    },

    /** Convite para o usuário recém-criado (contexto da requisição de criação). */
    convidar: (usuario: Destinatario) => enviarLink(usuario, 'convite'),

    /** Link de nova senha enviado pelo administrador. */
    enviarRedefinicao: (usuario: Destinatario) => enviarLink(usuario, 'redefinir'),

    consultar(token: string): Promise<LinkSenhaInfo> {
      return abrirLink(token, async (link, u) => ({ nome: u.nome, email: u.email, empresa: (await marcaDaEmpresa()).empresa, finalidade: link.finalidade }))
    },

    redefinir(token: string, novaSenha: string) {
      return abrirLink(token, async (link, usuario) => {
        if (!(await tokens.consumir(link.id))) throw AppError.naoEncontrado(LINK_INVALIDO)
        const senhaHash = await argon2.hash(novaSenha)
        await prisma.$transaction(async (tx) => {
          await tx.usuario.update({ where: { id: usuario.id }, data: { senhaHash, deveTrocarSenha: false } })
          // Senha nova encerra as sessões abertas em outros aparelhos
          await tx.sessao.updateMany({ where: { usuarioId: usuario.id, revogada: false }, data: { revogada: true } })
          await registrarAuditoria(tx, { tabela: 'usuarios', registroId: usuario.id, acao: 'redefinir_senha', depois: { pelo: link.finalidade }, usuarioId: usuario.id })
        })
        app.esquecerUsuario(contextoEmpresa.exigir().id, usuario.id)
        const aviso = emailSenhaAlterada({ nome: usuario.nome, ...(await marcaDaEmpresa()), quando: formatarDataHora(new Date().toISOString()) })
        void app.email.enviar(usuario.email, aviso)
      })
    },
  }
}

export type RecuperacaoService = ReturnType<typeof criarRecuperacaoService>
