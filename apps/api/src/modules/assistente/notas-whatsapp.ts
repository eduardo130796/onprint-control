import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { formatarMoeda, type NotaCompraLida, type NotaWhatsappPendente, type SituacaoNotaWhatsapp } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { notificarEquipe } from '../whatsapp/leituras-presas'

/*
 * Notas de compra lidas pelo WhatsApp (foto, PDF ou XML mandado na conversa "Você"): a leitura fica guardada como
 * pendente, avisa no sino quem lança entradas e aparece na faixa "Notas lidas pelo WhatsApp" da tela de Entradas. A
 * pessoa confere na Nova entrada (?notaWhatsapp=<id>) e, ao registrar, a nota vira "registrada"; ou descarta. Nada entra
 * no estoque sem o "Registrar entrada".
 */

/** Notas pendentes mais velhas que isto saem da faixa (continuam no banco) */
export const NOTA_PENDENTE_DIAS = 30

/** Resumo da nota para a faixa e o sino (o que a leitura guardada traz) */
export function resumoDaNota(n: { id: string; leitura: unknown; createdAt: Date }, jaLancada: NotaWhatsappPendente['jaLancada'] = null): NotaWhatsappPendente {
  const l = (n.leitura ?? {}) as Partial<NotaCompraLida>
  return {
    id: n.id,
    numero: l.numero ?? null,
    fornecedor: l.fornecedor?.existente?.nome ?? l.fornecedor?.fantasia ?? l.fornecedor?.nome ?? 'Fornecedor não identificado',
    total: l.totalNota ?? '0.00',
    itens: Array.isArray(l.itens) ? l.itens.length : 0,
    recebidaEm: n.createdAt.toISOString(),
    jaLancada: jaLancada ?? l.jaLancada ?? null,
  }
}

/** Por que a nota não pode virar entrada (null = pode): registrada não registra de novo; descartada volta se a pessoa abrir */
export function impedimentoDaNota(situacao: SituacaoNotaWhatsapp | string, entradaNumero: string | null): string | null {
  if (situacao === 'registrada') return `Esta nota do WhatsApp já foi registrada${entradaNumero ? ` na entrada ${entradaNumero}` : ''}.`
  return null
}

/** Título do aviso no sino: "Nota 000.023.456 de GRAFPRINT lida pelo WhatsApp: confira e registre" */
export const tituloDoAvisoDaNota = (r: Pick<NotaWhatsappPendente, 'numero' | 'fornecedor'>) =>
  `Nota${r.numero ? ` ${r.numero}` : ''} de ${r.fornecedor} lida pelo WhatsApp: confira e registre`

export const linkDaNota = (id: string) => `/estoque/entradas/novo?notaWhatsapp=${id}`

export function criarNotasWhatsapp(app: FastifyInstance) {
  const { prisma } = app

  /** Entrada já lançada com o mesmo número e fornecedor (agora, não na hora da leitura) */
  async function jaLancada(l: Partial<NotaCompraLida>) {
    if (!l.numero || !l.fornecedor?.cnpj) return null
    return prisma.estoqueEntrada.findFirst({ where: { notaFiscal: l.numero, fornecedor: { cpfCnpj: l.fornecedor.cnpj } }, select: { id: true, numero: true } })
  }

  /** Quem lança entradas (estoque: criar), ativos */
  async function quemConfere() {
    const usuarios = await prisma.usuario.findMany({
      where: { ativo: true, papel: { ativo: true, permissoes: { some: { permissao: { modulo: 'estoque', acao: 'criar' } } } } },
      select: { id: true },
    })
    return usuarios.map((u) => u.id)
  }

  return {
    /** Guarda a leitura como pendente e avisa no sino quem lança entradas */
    async guardar(lida: NotaCompraLida, arquivo: string | null) {
      const n = await prisma.notaWhatsapp.create({ data: { leitura: lida as unknown as Prisma.InputJsonValue, arquivo: arquivo?.slice(0, 200) ?? null } })
      const r = resumoDaNota(n)
      const itens = `${r.itens} ${r.itens === 1 ? 'item' : 'itens'}`
      await notificarEquipe(app, await quemConfere(), { titulo: tituloDoAvisoDaNota(r), mensagem: `${itens} · total ${formatarMoeda(r.total)}. Nada entra no estoque sem "Registrar entrada".`, link: linkDaNota(n.id) }, true, { estoque: true })
      return n
    },

    /** A faixa de Entradas: as pendentes dos últimos 30 dias, a mais nova primeiro */
    async pendentes(): Promise<NotaWhatsappPendente[]> {
      const lista = await prisma.notaWhatsapp.findMany({
        where: { situacao: 'pendente', createdAt: { gte: new Date(Date.now() - NOTA_PENDENTE_DIAS * 86_400_000) } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      return Promise.all(lista.map(async (n) => resumoDaNota(n, await jaLancada(n.leitura as Partial<NotaCompraLida>))))
    },

    /** A leitura para a Nova entrada, com o "já lançada" de agora; registrada não abre de novo */
    async paraEntrada(id: string): Promise<NotaCompraLida> {
      const n = await prisma.notaWhatsapp.findUnique({ where: { id } })
      if (!n) throw AppError.naoEncontrado('Nota não encontrada.')
      const entrada = n.entradaId ? await prisma.estoqueEntrada.findUnique({ where: { id: n.entradaId }, select: { numero: true } }) : null
      const impedimento = impedimentoDaNota(n.situacao, entrada?.numero ?? null)
      if (impedimento) throw AppError.regraNegocio(impedimento)
      const l = n.leitura as unknown as NotaCompraLida
      const lancada = await jaLancada(l)
      if (!lancada || l.jaLancada) return l
      return { ...l, jaLancada: lancada, avisos: [`Esta nota já foi lançada na entrada ${lancada.numero}. Confira antes de lançar de novo.`, ...l.avisos] }
    },

    async descartar(id: string) {
      const { count } = await prisma.notaWhatsapp.updateMany({ where: { id, situacao: 'pendente' }, data: { situacao: 'descartada', resolvidaEm: new Date() } })
      if (count !== 1) throw AppError.regraNegocio('Esta nota não está mais esperando conferência.')
      return { descartada: true }
    },
  }
}

/**
 * Dentro da transação da entrada: a nota do WhatsApp vira "registrada" (uma vez só: a segunda entrada da mesma nota
 * falha e desfaz tudo)
 */
export async function marcarNotaRegistrada(tx: Prisma.TransactionClient, notaId: string, entradaId: string) {
  const n = await tx.notaWhatsapp.findUnique({ where: { id: notaId }, select: { situacao: true, entradaId: true } })
  if (!n) throw AppError.naoEncontrado('Nota do WhatsApp não encontrada.')
  const antes = n.entradaId ? await tx.estoqueEntrada.findUnique({ where: { id: n.entradaId }, select: { numero: true } }) : null
  const impedimento = impedimentoDaNota(n.situacao, antes?.numero ?? null)
  if (impedimento) throw AppError.regraNegocio(impedimento)
  const { count } = await tx.notaWhatsapp.updateMany({ where: { id: notaId, situacao: { not: 'registrada' } }, data: { situacao: 'registrada', resolvidaEm: new Date(), entradaId } })
  if (count !== 1) throw AppError.regraNegocio('Esta nota do WhatsApp já foi registrada.')
}
