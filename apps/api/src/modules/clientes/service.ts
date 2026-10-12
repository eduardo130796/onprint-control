import type { Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  EXTENSOES_FOTO_CLIENTE,
  TAMANHO_MAX_FOTO_CLIENTE_MB,
  nomeCliente,
  somenteDigitos,
  type clienteSchema,
  type clientesQuerySchema,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { filtroAtivo, paginacao, paginado } from '../../core/paginacao'
import { comConflitoAmigavel } from '../../core/prisma-erros'
import { criarArquivosService } from '../arquivos/service'
import { urlMiniaturaLogada } from '../vitrine/imagens'
import { criarSubcadastrosCliente } from './subcadastros'

type Dados = z.output<typeof clienteSchema>
type Query = z.output<typeof clientesQuerySchema>

const CONFLITOS = {
  cpf_cnpj: 'Já existe um cliente com este CPF/CNPJ.',
  whatsapp: 'Já existe um cliente com este WhatsApp.',
}

const incluirVendedor = { vendedor: { select: { id: true, nome: true } } } as const

function filtroBusca(busca?: string): Prisma.ClienteWhereInput {
  if (!busca) return {}
  const digitos = somenteDigitos(busca)
  const texto = { contains: busca, mode: 'insensitive' as const }
  return {
    OR: [
      { nome: texto },
      { fantasia: texto },
      { email: texto },
      ...(digitos.length >= 3
        ? [{ cpfCnpj: { contains: digitos } }, { whatsapp: { contains: digitos } }, { telefone: { contains: digitos } }]
        : []),
    ],
  }
}

export function criarClientesService(app: FastifyInstance) {
  const { prisma, storage } = app
  const arquivos = criarArquivosService(app)

  /** Miniatura da foto (WebP 480 px, link assinado): a lista carrega só imagens pequenas e sem pedir URL uma a uma */
  function comFoto<T extends { fotoArquivoId: string | null }>(cliente: T) {
    return { ...cliente, fotoUrl: cliente.fotoArquivoId ? urlMiniaturaLogada(storage, cliente.fotoArquivoId) : null }
  }

  async function validarVendedor(vendedorId: string | null | undefined) {
    if (!vendedorId) return
    const vendedor = await prisma.usuario.findUnique({ where: { id: vendedorId }, select: { ativo: true } })
    if (!vendedor?.ativo) throw AppError.regraNegocio('Vendedor inválido ou desativado.')
  }

  /**
   * Outro cliente (ativo ou desativado) já usa o CPF/CNPJ ou o WhatsApp: diz quem é e o que fazer.
   * Desativar não apaga, então o documento continua ocupado até o cadastro ser reativado.
   */
  async function conferirDuplicado(dados: { cpfCnpj?: string | null; whatsapp?: string | null }, excetoId?: string) {
    const ou: Prisma.ClienteWhereInput[] = []
    if (dados.cpfCnpj) ou.push({ cpfCnpj: dados.cpfCnpj })
    if (dados.whatsapp) ou.push({ whatsapp: dados.whatsapp })
    if (!ou.length) return
    const outro = await prisma.cliente.findFirst({
      where: { OR: ou, ...(excetoId ? { id: { not: excetoId } } : {}) },
      select: { id: true, nome: true, fantasia: true, ativo: true, cpfCnpj: true },
    })
    if (!outro) return
    const campo = dados.cpfCnpj && outro.cpfCnpj === dados.cpfCnpj ? 'cpfCnpj' : 'whatsapp'
    const rotulo = campo === 'cpfCnpj' ? 'CPF/CNPJ' : 'WhatsApp'
    const nome = nomeCliente(outro)
    throw AppError.conflito(
      outro.ativo ? `Já existe um cliente com este ${rotulo}: ${nome}.` : `Este ${rotulo} é de ${nome}, um cliente desativado. Reative o cadastro em vez de criar outro.`,
      { campo, clienteId: outro.id, nome, ativo: outro.ativo },
    )
  }

  async function obterBase(id: string) {
    const cliente = await prisma.cliente.findUnique({ where: { id } })
    if (!cliente) throw AppError.naoEncontrado('Cliente não encontrado.')
    return cliente
  }

  return {
    async listar(q: Query) {
      const where: Prisma.ClienteWhereInput = {
        ...filtroAtivo(q.ativo),
        ...(q.situacao ? { situacao: q.situacao } : {}),
        ...(q.vendedorId ? { vendedorId: q.vendedorId } : {}),
        ...filtroBusca(q.busca),
      }
      const pag = paginacao(q, ['nome', 'createdAt', 'situacao', 'updatedAt'] as const, { campo: 'nome', direcao: 'asc' })
      const [total, data] = await prisma.$transaction([
        prisma.cliente.count({ where }),
        prisma.cliente.findMany({ where, ...pag, include: incluirVendedor }),
      ])
      return paginado(data.map(comFoto), total, q)
    },

    async obter(id: string) {
      const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: {
          ...incluirVendedor,
          enderecos: { orderBy: [{ tipo: 'asc' }, { createdAt: 'asc' }] },
          contatos: { orderBy: [{ principal: 'desc' }, { nome: 'asc' }] },
        },
      })
      if (!cliente) throw AppError.naoEncontrado('Cliente não encontrado.')
      return comFoto(cliente)
    },

    /** Cliente com este CPF/CNPJ (ativo ou não): o cadastro avisa antes de duplicar */
    async porDocumento(documento: string) {
      const cpfCnpj = somenteDigitos(documento)
      if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) return null
      return prisma.cliente.findUnique({ where: { cpfCnpj }, select: { id: true, nome: true, fantasia: true, ativo: true } })
    },

    async criar(dados: Dados, usuarioId: string) {
      await validarVendedor(dados.vendedorId)
      await conferirDuplicado(dados)
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const cliente = await tx.cliente.create({ data: { ...dados, createdBy: usuarioId }, include: incluirVendedor })
            await registrarAuditoria(tx, { tabela: 'clientes', registroId: cliente.id, acao: 'criar', depois: cliente, usuarioId })
            return comFoto(cliente)
          }),
        CONFLITOS,
      )
    },

    async atualizar(id: string, dados: Dados, usuarioId: string) {
      const antes = await obterBase(id)
      await validarVendedor(dados.vendedorId)
      await conferirDuplicado(dados, id)
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const cliente = await tx.cliente.update({ where: { id }, data: dados, include: incluirVendedor })
            await registrarAuditoria(tx, { tabela: 'clientes', registroId: id, acao: 'editar', antes, depois: cliente, usuarioId })
            return comFoto(cliente)
          }),
        CONFLITOS,
      )
    },

    /** Exclusão lógica. */
    async alterarAtivo(id: string, ativo: boolean, usuarioId: string) {
      const antes = await obterBase(id)
      return prisma.$transaction(async (tx) => {
        const cliente = await tx.cliente.update({ where: { id }, data: { ativo }, include: incluirVendedor })
        await registrarAuditoria(tx, {
          tabela: 'clientes',
          registroId: id,
          acao: ativo ? 'editar' : 'desativar',
          antes,
          depois: cliente,
          usuarioId,
        })
        return comFoto(cliente)
      })
    },

    /** Foto/imagem do cliente (PNG ou JPG, até 5 MB): troca a atual, que é apagada. */
    async trocarFoto(request: FastifyRequest, id: string, usuarioId: string) {
      const antes = await obterBase(id)
      const arquivo = await arquivos.receberUpload(
        request,
        { entidade: 'cliente', entidadeId: id, categoria: 'foto_cliente', extensoes: EXTENSOES_FOTO_CLIENTE, tamanhoMaxMb: TAMANHO_MAX_FOTO_CLIENTE_MB },
        usuarioId,
      )
      const cliente = await prisma.$transaction(async (tx) => {
        const cliente = await tx.cliente.update({ where: { id }, data: { fotoArquivoId: arquivo.id }, include: incluirVendedor })
        await registrarAuditoria(tx, { tabela: 'clientes', registroId: id, acao: 'editar', antes, depois: cliente, usuarioId })
        return cliente
      })
      if (antes.fotoArquivoId) await arquivos.remover(antes.fotoArquivoId, usuarioId)
      return comFoto(cliente)
    },

    async removerFoto(id: string, usuarioId: string) {
      const antes = await obterBase(id)
      // Apagar o arquivo limpa o campo do cliente (e as miniaturas geradas)
      if (antes.fotoArquivoId) await arquivos.remover(antes.fotoArquivoId, usuarioId)
      return comFoto(await prisma.cliente.findUniqueOrThrow({ where: { id }, include: incluirVendedor }))
    },

    ...criarSubcadastrosCliente(prisma, obterBase),
  }
}

export type ClientesService = ReturnType<typeof criarClientesService>
