import type { Prisma, PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { arquivoVisivelDaArte, escolherAnexosArte, type ArteMensagem } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import type { DocumentoWhatsapp, ProvedorWhatsapp } from '../../integrations/whatsapp'

/**
 * Artes que vão como arquivo na mensagem "Arte para aprovação" (uma por pedido): logo depois do texto, cada arte
 * do pedido que o cliente consegue abrir no celular (imagem ou PDF; CDR/AI/PSD vão pela miniatura), até
 * ANEXOS_ARTE_MAX arquivos e ANEXOS_ARTE_MAX_MB no total. O que não couber fica pelo link da mensagem.
 */
export interface AnexoArte {
  arquivoId: string
  nome: string
  mime: string
  tamanho: number
  /** Legenda abaixo do arquivo: "Banner em lona — v2" */
  legenda: string
}

export interface ArteDoPedido extends ArteMensagem {
  arteId: string
  /** Arquivo que o cliente consegue abrir (null = só pelo link) */
  anexo: AnexoArte | null
}

const arquivoSelect = { select: { id: true, nomeOriginal: true, mime: true, tamanho: true } } as const
type ArquivoLinha = { id: string; nomeOriginal: string; mime: string; tamanho: number }
const comoArquivo = (a: ArquivoLinha | null) => (a ? { id: a.id, nome: a.nomeOriginal, mime: a.mime, tamanho: a.tamanho } : null)

/**
 * Última versão da arte de cada item do pedido, na ordem dos itens. Sem `arteIds`, só as que aguardam o cliente
 * (enviada_cliente) e têm arquivo; com eles, essas artes (se forem a última versão do item).
 */
export async function artesDoPedido(prisma: PrismaClient | Prisma.TransactionClient, pedidoId: string, arteIds?: string[]): Promise<ArteDoPedido[]> {
  const itens = await prisma.pedidoItem.findMany({
    // Item sem arte não vai para a aprovação do cliente
    where: { pedidoId, precisaArte: true },
    orderBy: { ordem: 'asc' },
    select: {
      descricao: true,
      artes: { orderBy: { versao: 'desc' }, take: 1, select: { id: true, versao: true, status: true, arquivo: arquivoSelect, miniatura: arquivoSelect } },
    },
  })
  return itens.flatMap(({ descricao, artes: [arte] }) => {
    if (!arte?.arquivo) return []
    if (arteIds ? !arteIds.includes(arte.id) : arte.status !== 'enviada_cliente') return []
    const visivel = arquivoVisivelDaArte({ arquivo: comoArquivo(arte.arquivo), miniatura: comoArquivo(arte.miniatura) })
    const legenda = `${descricao.trim()} — v${arte.versao}`
    // A miniatura (JPEG) vai com o nome do item, não "miniatura-xyz.jpg"
    const nome = visivel && visivel.id === arte.arquivo.id ? visivel.nome : `${descricao.trim().slice(0, 100)} v${arte.versao}.jpg`
    return [{ arteId: arte.id, descricao, versao: arte.versao, anexo: visivel ? { arquivoId: visivel.id, nome, mime: visivel.mime, tamanho: visivel.tamanho, legenda } : null }]
  })
}

/** Os arquivos que vão na mensagem (dentro do limite), na ordem das artes */
export const anexosDasArtes = (artes: ArteDoPedido[]): AnexoArte[] => escolherAnexosArte(artes.flatMap((a) => (a.anexo ? [a.anexo] : []))).anexos

/** "Banner.png, Cartão.pdf" (coluna anexo_nome: o que a equipe vê no histórico) */
export const nomesDosAnexos = (anexos: AnexoArte[]) => (anexos.length ? anexos.map((a) => a.nome).join(', ').slice(0, 300) : null)

/** Para gravar em mensagens_whatsapp.anexos (null = sem arquivos) */
export const anexosJson = (anexos: AnexoArte[]): Prisma.InputJsonValue | undefined =>
  anexos.length ? anexos.map((a) => ({ arquivoId: a.arquivoId, nome: a.nome, mime: a.mime, tamanho: a.tamanho, legenda: a.legenda })) : undefined

/** Lê a lista gravada em mensagens_whatsapp.anexos (ignora o que não tiver o formato) */
export function lerAnexos(json: unknown): AnexoArte[] {
  if (!Array.isArray(json)) return []
  return json.filter(
    (a): a is AnexoArte =>
      Boolean(a) && typeof a === 'object' && typeof (a as AnexoArte).arquivoId === 'string' && typeof (a as AnexoArte).mime === 'string' && typeof (a as AnexoArte).nome === 'string',
  )
}

/**
 * Arquivos escolhidos pela equipe no "Enviar pelo WhatsApp": cada um precisa ser arquivo (ou miniatura) de uma
 * arte deste pedido; vão na ordem pedida, dentro do limite de quantidade e tamanho.
 */
export async function anexosEscolhidos(prisma: PrismaClient, pedidoId: string, arquivoIds: string[]): Promise<AnexoArte[]> {
  if (!arquivoIds.length) return []
  const artes = await prisma.arte.findMany({
    where: { pedidoItem: { pedidoId }, OR: [{ arquivoId: { in: arquivoIds } }, { miniaturaId: { in: arquivoIds } }] },
    select: { versao: true, arquivoId: true, miniaturaId: true, pedidoItem: { select: { descricao: true } }, arquivo: arquivoSelect, miniatura: arquivoSelect },
  })
  const anexos = arquivoIds.map((id) => {
    const arte = artes.find((a) => a.arquivoId === id || a.miniaturaId === id)
    const arquivo = arte?.arquivoId === id ? arte.arquivo : arte?.miniatura
    if (!arte || !arquivo) throw AppError.regraNegocio('Arquivo não é de uma arte deste pedido.')
    const legenda = `${arte.pedidoItem.descricao.trim()} — v${arte.versao}`
    const nome = arte.arquivoId === id ? arquivo.nomeOriginal : `${arte.pedidoItem.descricao.trim().slice(0, 100)} v${arte.versao}.jpg`
    return { arquivoId: arquivo.id, nome, mime: arquivo.mime, tamanho: arquivo.tamanho, legenda }
  })
  return escolherAnexosArte(anexos).anexos
}

/** Nenhuma arte aguarda mais o cliente (aprovou antes de o aviso sair): o aviso de arte na fila não sai */
export async function descartarAvisoDeArte(prisma: PrismaClient, pedidoId: string) {
  if ((await artesDoPedido(prisma, pedidoId)).length) return
  await prisma.mensagemWhatsapp.updateMany({
    where: { pedidoId, evento: 'arte_aprovacao', status: 'pendente', manual: false },
    data: { status: 'ignorada', erro: 'As artes já foram respondidas antes do envio.', proximaTentativaEm: null },
  })
}

async function lerArquivo(app: FastifyInstance, arquivoId: string): Promise<Buffer | null> {
  const arquivo = await app.prisma.arquivo.findUnique({ where: { id: arquivoId }, select: { caminho: true } })
  if (!arquivo) return null
  const partes: Buffer[] = []
  for await (const parte of app.storage.abrir(arquivo.caminho)) partes.push(parte as Buffer)
  return Buffer.concat(partes)
}

/**
 * Manda os arquivos (depois do texto), um a um. Não lança erro: o texto já foi; devolve o aviso do que não foi
 * (null = foram todos). Imagem vai como imagem com a legenda do item; PDF como documento.
 */
export async function enviarAnexos(app: FastifyInstance, provedor: ProvedorWhatsapp, instancia: string, numero: string, anexos: AnexoArte[]): Promise<string | null> {
  const falharam: string[] = []
  for (const a of anexos) {
    try {
      const conteudo = await lerArquivo(app, a.arquivoId)
      if (!conteudo) throw new Error('arquivo não encontrado')
      const documento: DocumentoWhatsapp = { conteudo, nomeArquivo: a.nome, mime: a.mime, legenda: a.legenda }
      await provedor.enviarDocumento(instancia, numero, documento)
    } catch (erro) {
      falharam.push(a.nome)
      app.log.warn({ err: erro, arquivo: a.arquivoId }, 'Arquivo da arte não enviado pelo WhatsApp')
    }
  }
  if (!falharam.length) return null
  return falharam.length === anexos.length
    ? 'A mensagem foi, mas os arquivos das artes não (o cliente vê pelo link).'
    : `A mensagem foi, mas ${falharam.length === 1 ? 'este arquivo não' : 'estes arquivos não'}: ${falharam.join(', ')}.`
}
