import type { FastifyInstance } from 'fastify'
import { hojeISO, type PedidoAcompanhamento } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { enderecoEmLinha, montarAcompanhamento } from './acompanhamento'

const NAO_ENCONTRADO = 'Link inválido ou pedido não encontrado.'

/**
 * "Acompanhe seu pedido" (/pedido/:empresa/:token), sem login. A consulta traz só os campos que a visão do
 * cliente usa (select); a montagem em ./acompanhamento escolhe campo a campo o que sai.
 */
export function criarAcompanhamentoService(app: FastifyInstance) {
  const { prisma, storage } = app

  async function buscar(token: string) {
    const p = await prisma.pedido.findUnique({
      where: { tokenPublico: token },
      select: {
        id: true,
        numero: true,
        status: true,
        tipoEntrega: true,
        enderecoEntrega: true,
        dataPrevistaEntrega: true,
        total: true,
        valorPago: true,
        observacoes: true,
        canceladoEm: true,
        createdAt: true,
        cliente: { select: { nome: true, fantasia: true, cpfCnpj: true } },
        itens: {
          orderBy: { ordem: 'asc' },
          select: {
            id: true,
            descricao: true,
            quantidade: true,
            largura: true,
            altura: true,
            total: true,
            acabamentos: { select: { nome: true } },
            artes: { orderBy: { versao: 'desc' }, select: { id: true, versao: true, status: true, tokenPublico: true, miniaturaId: true } },
          },
        },
        contasReceber: { select: { parcela: true, totalParcelas: true, descricao: true, valor: true, valorPago: true, vencimento: true, status: true, pagoEm: true } },
        entregas: { select: { id: true, dataAgendada: true, dataRealizada: true, status: true, createdAt: true } },
      },
    })
    if (!p) throw AppError.naoEncontrado(NAO_ENCONTRADO)
    return p
  }

  return {
    async obter(token: string): Promise<PedidoAcompanhamento> {
      const p = await buscar(token)
      const idsArtes = p.itens.flatMap((i) => i.artes.map((a) => a.id))
      const [auditoria, empresa, vitrine] = await Promise.all([
        prisma.auditoria.findMany({
          where: {
            OR: [
              { tabela: 'pedidos', registroId: p.id },
              { tabela: 'artes', registroId: { in: idsArtes } },
            ],
          },
          select: { tabela: true, registroId: true, acao: true, antes: true, depois: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 300,
        }),
        prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } }),
        prisma.vitrineConfig.findFirst({ select: { horario: true } }),
      ])
      return montarAcompanhamento(p, {
        slug: contextoEmpresa.exigir().slug,
        hoje: hojeISO(),
        auditoria,
        // URLs assinadas e temporárias (miniatura da arte e logo)
        urlArquivo: (id) => storage.gerarUrlTemporaria(id, 3600),
        empresa: {
          nome: empresa?.nomeFantasia || empresa?.razaoSocial || contextoEmpresa.exigir().nome,
          logoUrl: empresa?.logoArquivoId ? storage.gerarUrlTemporaria(empresa.logoArquivoId, 3600) : null,
          corTema: empresa?.corTema ?? null,
          whatsapp: empresa?.whatsapp ?? null,
          telefone: empresa?.telefone ?? null,
          email: empresa?.email ?? null,
          endereco: empresa ? enderecoEmLinha(empresa) : null,
          horario: vitrine?.horario ?? null,
        },
      })
    },
  }
}
