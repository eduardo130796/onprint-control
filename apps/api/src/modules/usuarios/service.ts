import { randomBytes, randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { criarUsuarioSchema, editarUsuarioSchema, usuariosQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { filtroAtivo, paginacao, paginado } from '../../core/paginacao'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { comConflitoAmigavel } from '../../core/prisma-erros'
import { criarIndiceLogin } from '../../plataforma/indice-login'
import { criarRecuperacaoService } from '../auth/recuperacao.service'

type Criar = z.output<typeof criarUsuarioSchema>
type Editar = z.output<typeof editarUsuarioSchema>
type Query = z.output<typeof usuariosQuerySchema>

const CONFLITOS = { email: 'Já existe um usuário com este e-mail.' }

/** Nunca devolve senha_hash. */
const selecionar = {
  id: true,
  nome: true,
  email: true,
  telefone: true,
  comissaoPercentual: true,
  deveTrocarSenha: true,
  ultimoLogin: true,
  ativo: true,
  createdAt: true,
  updatedAt: true,
  papel: { select: { id: true, codigo: true, nome: true } },
} as const

export function criarUsuariosService(app: FastifyInstance) {
  const { prisma } = app
  const indice = criarIndiceLogin(app.plataforma)
  const recuperacao = criarRecuperacaoService(app)

  async function obter(id: string) {
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: selecionar })
    if (!usuario) throw AppError.naoEncontrado('Usuário não encontrado.')
    return usuario
  }

  async function validarPapel(papelId: string) {
    const papel = await prisma.papel.findUnique({ where: { id: papelId } })
    if (!papel?.ativo) throw AppError.regraNegocio('Papel inválido.')
    return papel
  }

  /** Papel atual de quem faz a ação (lido do banco, não do token, para refletir mudanças recentes). */
  async function autorEhAdmin(autorId: string) {
    const autor = await prisma.usuario.findUnique({ where: { id: autorId }, select: { ativo: true, papel: { select: { codigo: true, ativo: true } } } })
    return Boolean(autor?.ativo && autor.papel.ativo && autor.papel.codigo === 'admin')
  }

  /**
   * Evita escalada de privilégio por quem recebeu a permissão de gerenciar usuários:
   * só um administrador atribui o papel de administrador ou mexe em um administrador.
   */
  async function exigirAdminSe(condicao: boolean, autorId: string, mensagem: string) {
    if (condicao && !(await autorEhAdmin(autorId))) throw AppError.semPermissao(mensagem)
  }

  /** Impede que o sistema fique sem nenhum administrador ativo. */
  async function garantirOutroAdmin(usuarioId: string) {
    const outros = await prisma.usuario.count({
      where: { id: { not: usuarioId }, ativo: true, papel: { codigo: 'admin' } },
    })
    if (outros === 0) throw AppError.regraNegocio('O sistema precisa de pelo menos um administrador ativo.')
  }

  /** Limite de usuários ativos do plano (desativados não contam). */
  async function garantirVaga() {
    const assinatura = contextoEmpresa.exigir().assinatura
    if (assinatura?.limiteUsuarios == null) return
    const ativos = await prisma.usuario.count({ where: { ativo: true } })
    if (ativos >= assinatura.limiteUsuarios) {
      throw AppError.regraNegocio(`O plano ${assinatura.plano.nome} permite até ${assinatura.limiteUsuarios} usuários ativos. Desative alguém ou mude de plano.`)
    }
  }

  async function revogarSessoes(tx: Prisma.TransactionClient, usuarioId: string) {
    await tx.sessao.updateMany({ where: { usuarioId, revogada: false }, data: { revogada: true } })
  }

  return {
    obter,

    async listar(q: Query) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.UsuarioWhereInput = {
        ...filtroAtivo(q.ativo),
        ...(q.papelId ? { papelId: q.papelId } : {}),
        ...(texto ? { OR: [{ nome: texto }, { email: texto }] } : {}),
      }
      const pag = paginacao(q, ['nome', 'email', 'ultimoLogin', 'createdAt'] as const, { campo: 'nome', direcao: 'asc' })
      const [total, data] = await prisma.$transaction([
        prisma.usuario.count({ where }),
        prisma.usuario.findMany({ where, ...pag, select: selecionar }),
      ])
      return paginado(data, total, q)
    },

    /** Papéis ativos, para o campo "papel" do cadastro de usuários. */
    papeis() {
      return prisma.papel.findMany({
        where: { ativo: true },
        select: { id: true, codigo: true, nome: true },
        orderBy: { createdAt: 'asc' },
      })
    },

    /** Lista enxuta (id, nome) de usuários ativos — usada em campos como "vendedor". */
    opcoes() {
      return prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } })
    },

    /** Cria o usuário e manda o convite por e-mail (link para criar a senha). */
    async criar(dados: Criar, autorId: string) {
      const papel = await validarPapel(dados.papelId)
      await exigirAdminSe(papel.codigo === 'admin', autorId, 'Somente um administrador pode atribuir o papel de administrador.')
      await garantirVaga()
      const { senhaProvisoria, ...resto } = dados
      if (!senhaProvisoria && !app.email.configurado) {
        throw AppError.regraNegocio('O envio de e-mails ainda não está configurado: informe uma senha provisória.', { campo: 'senhaProvisoria' })
      }
      // Sem senha provisória, ninguém sabe a senha inicial: o acesso começa pelo link do convite
      const senhaHash = await argon2.hash(senhaProvisoria ?? randomBytes(24).toString('base64url'))
      const id = randomUUID()
      // O e-mail de login é único na plataforma inteira, não só nesta empresa
      const usuario = await indice.comReserva(resto.email, contextoEmpresa.exigir().id, id, () =>
        comConflitoAmigavel(
          () =>
            prisma.$transaction(async (tx) => {
              const usuario = await tx.usuario.create({
                data: { ...resto, id, senhaHash, deveTrocarSenha: true, createdBy: autorId },
                select: selecionar,
              })
              await registrarAuditoria(tx, { tabela: 'usuarios', registroId: usuario.id, acao: 'criar', depois: usuario, usuarioId: autorId })
              return usuario
            }),
          CONFLITOS,
        ),
      )
      const conviteEnviado =
        app.email.configurado &&
        (await recuperacao.convidar(usuario).catch((erro: unknown) => {
          app.log.error({ err: erro, usuarioId: usuario.id }, 'Falha ao enviar o convite')
          return false
        }))
      return { ...usuario, conviteEnviado }
    },

    /** Manda ao usuário um link para ele mesmo criar uma senha nova. */
    async enviarLinkSenha(id: string) {
      const usuario = await obter(id)
      if (!usuario.ativo) throw AppError.regraNegocio('Usuário desativado: reative antes de enviar o link.')
      if (!app.email.configurado) throw AppError.regraNegocio('O envio de e-mails ainda não está configurado (SMTP). Defina uma senha provisória.')
      if (!(await recuperacao.enviarRedefinicao(usuario))) throw AppError.regraNegocio('Não foi possível enviar o e-mail agora. Tente de novo ou defina uma senha provisória.')
    },

    async atualizar(id: string, dados: Editar, autorId: string) {
      const antes = await obter(id)
      const papel = await validarPapel(dados.papelId)
      if (id === autorId && dados.papelId !== antes.papel.id) throw AppError.semPermissao('Você não pode alterar o próprio papel.')
      if (id === autorId && !dados.ativo) throw AppError.regraNegocio('Você não pode desativar o próprio usuário.')
      await exigirAdminSe(antes.papel.codigo === 'admin' && id !== autorId, autorId, 'Somente um administrador pode alterar outro administrador.')
      await exigirAdminSe(papel.codigo === 'admin' && antes.papel.codigo !== 'admin', autorId, 'Somente um administrador pode atribuir o papel de administrador.')
      const deixaDeSerAdmin = antes.papel.codigo === 'admin' && (papel.codigo !== 'admin' || !dados.ativo)
      if (deixaDeSerAdmin) await garantirOutroAdmin(id)
      if (dados.ativo && !antes.ativo) await garantirVaga()

      const gravar = () =>
        comConflitoAmigavel(
          () =>
            prisma.$transaction(async (tx) => {
              const usuario = await tx.usuario.update({ where: { id }, data: dados, select: selecionar })
              if (!dados.ativo) await revogarSessoes(tx, id)
              await registrarAuditoria(tx, { tabela: 'usuarios', registroId: id, acao: 'editar', antes, depois: usuario, usuarioId: autorId })
              return usuario
            }),
          CONFLITOS,
        )
      // Desativar ou trocar o papel vale na hora (sem esperar o cache da autenticação)
      const esquecer = <T>(r: T) => {
        app.esquecerUsuario(contextoEmpresa.exigir().id, id)
        return r
      }
      if (dados.email === antes.email) return esquecer(await gravar())
      // Troca de e-mail: reserva o novo no índice de login e só então libera o antigo
      const empresaId = contextoEmpresa.exigir().id
      const usuario = await indice.comReserva(dados.email, empresaId, id, gravar)
      await indice.liberar(antes.email, empresaId)
      return esquecer(usuario)
    },

    /** O admin define uma senha provisória; o usuário é obrigado a trocá-la no próximo login. */
    async redefinirSenha(id: string, senhaProvisoria: string, autorId: string) {
      const alvo = await obter(id)
      // Definir a senha de um administrador daria acesso à conta dele
      await exigirAdminSe(alvo.papel.codigo === 'admin' && id !== autorId, autorId, 'Somente um administrador pode redefinir a senha de outro administrador.')
      const senhaHash = await argon2.hash(senhaProvisoria)
      await prisma.$transaction(async (tx) => {
        await tx.usuario.update({ where: { id }, data: { senhaHash, deveTrocarSenha: true } })
        await revogarSessoes(tx, id)
        await registrarAuditoria(tx, { tabela: 'usuarios', registroId: id, acao: 'redefinir_senha', usuarioId: autorId })
      })
      app.esquecerUsuario(contextoEmpresa.exigir().id, id)
    },

    async desativar(id: string, autorId: string) {
      const antes = await obter(id)
      if (id === autorId) throw AppError.regraNegocio('Você não pode desativar o próprio usuário.')
      await exigirAdminSe(antes.papel.codigo === 'admin', autorId, 'Somente um administrador pode desativar outro administrador.')
      if (antes.papel.codigo === 'admin') await garantirOutroAdmin(id)
      const usuario = await prisma.$transaction(async (tx) => {
        const u = await tx.usuario.update({ where: { id }, data: { ativo: false }, select: selecionar })
        await revogarSessoes(tx, id)
        await registrarAuditoria(tx, { tabela: 'usuarios', registroId: id, acao: 'desativar', antes, depois: u, usuarioId: autorId })
        return u
      })
      app.esquecerUsuario(contextoEmpresa.exigir().id, id)
      return usuario
    },
  }
}

export type UsuariosService = ReturnType<typeof criarUsuariosService>
