import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  Decimal,
  descreverRegra,
  type CondicoesRegra,
  type AcaoRegra,
  type RegraComercialDados,
  type RegraComercialMotor,
  type simulacaoRegrasSchema,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { aplicarRegrasNoCalculo, carregarRegras, recalcularItens } from '../orcamentos/calculo'

/*
 * Regras comerciais (Configurações → Regras comerciais): cadastro, ordem, liga/desliga, simulador e o manual do
 * atendente. Quem aplica é o motor puro de @onprint/shared (no editor, no simulador e ao salvar o orçamento).
 */

type Simulacao = z.output<typeof simulacaoRegrasSchema>

/** Nomes dos cadastros citados nas regras (para "Quando o produto for Cartão…"); removidos ficam de fora */
async function nomesDasRegras(prisma: FastifyInstance['prisma'], regras: { condicoes: CondicoesRegra; acao: AcaoRegra }[]) {
  const produtos = new Set<string>()
  const categorias = new Set<string>()
  const clientes = new Set<string>()
  for (const r of regras) {
    r.condicoes.produtoIds?.forEach((id) => produtos.add(id))
    r.condicoes.categoriaIds?.forEach((id) => categorias.add(id))
    r.condicoes.clienteIds?.forEach((id) => clientes.add(id))
    if (r.acao.tipo === 'sugerir_item' && r.acao.produtoId) produtos.add(r.acao.produtoId)
  }
  const [p, c, cl] = await Promise.all([
    produtos.size ? prisma.produto.findMany({ where: { id: { in: [...produtos] } }, select: { id: true, nome: true } }) : [],
    categorias.size ? prisma.categoria.findMany({ where: { id: { in: [...categorias] } }, select: { id: true, nome: true } }) : [],
    clientes.size ? prisma.cliente.findMany({ where: { id: { in: [...clientes] } }, select: { id: true, nome: true, fantasia: true } }) : [],
  ])
  return {
    produtos: Object.fromEntries(p.map((x) => [x.id, x.nome])),
    categorias: Object.fromEntries(c.map((x) => [x.id, x.nome])),
    clientes: Object.fromEntries(cl.map((x) => [x.id, x.fantasia || x.nome])),
  }
}

export function criarRegrasService(app: FastifyInstance) {
  const { prisma } = app

  async function obter(id: string) {
    const r = await prisma.regraComercial.findUnique({ where: { id } })
    if (!r) throw AppError.naoEncontrado('Regra não encontrada.')
    return r
  }

  /** Todas as regras (inclusive as desligadas) na ordem, com a frase "Quando… → …" e os nomes citados */
  async function listar() {
    const regras = await carregarRegras(prisma, false)
    const linhas = await prisma.regraComercial.findMany({ where: { id: { in: regras.map((r) => r.id) } }, select: { id: true, createdAt: true, updatedAt: true, criador: { select: { nome: true } } } })
    const extra = new Map(linhas.map((l) => [l.id, l]))
    const nomes = await nomesDasRegras(prisma, regras)
    return {
      regras: regras.map((r) => ({ ...r, descricao: descreverRegra(r, nomes), criadoPor: extra.get(r.id)?.criador?.nome ?? null, updatedAt: extra.get(r.id)?.updatedAt.toISOString() ?? null })),
      nomes,
    }
  }

  const paraGravar = (d: RegraComercialDados) => ({
    nome: d.nome,
    ativa: d.ativa,
    tipo: d.tipo,
    condicoes: d.condicoes as Prisma.InputJsonValue,
    acao: d.acao as unknown as Prisma.InputJsonValue,
    combinacao: d.combinacao,
  })

  return {
    listar,

    /** Só as ativas, para o editor de orçamento (ao vivo) e o "o que vale hoje" */
    vigentes: () => carregarRegras(prisma),

    async criar(d: RegraComercialDados, usuarioId: string) {
      const ultima = await prisma.regraComercial.aggregate({ _max: { prioridade: true } })
      return prisma.$transaction(async (tx) => {
        const r = await tx.regraComercial.create({ data: { ...paraGravar(d), prioridade: (ultima._max.prioridade ?? 0) + 1, criadoPor: usuarioId } })
        await registrarAuditoria(tx, { tabela: 'regras_comerciais', registroId: r.id, acao: 'criar', depois: r, usuarioId })
        return r
      })
    },

    async atualizar(id: string, d: RegraComercialDados, usuarioId: string) {
      const antes = await obter(id)
      return prisma.$transaction(async (tx) => {
        const r = await tx.regraComercial.update({ where: { id }, data: paraGravar(d) })
        await registrarAuditoria(tx, { tabela: 'regras_comerciais', registroId: id, acao: 'editar', antes, depois: r, usuarioId })
        return r
      })
    },

    async ativar(id: string, ativa: boolean, usuarioId: string) {
      const antes = await obter(id)
      return prisma.$transaction(async (tx) => {
        const r = await tx.regraComercial.update({ where: { id }, data: { ativa } })
        await registrarAuditoria(tx, { tabela: 'regras_comerciais', registroId: id, acao: ativa ? 'editar' : 'desativar', antes: { ativa: antes.ativa }, depois: { ativa }, usuarioId })
        return r
      })
    },

    /** Nova ordem: a lista completa de ids, a primeira vale primeiro */
    async ordenar(ids: string[], usuarioId: string) {
      const todas = await prisma.regraComercial.findMany({ select: { id: true, prioridade: true } })
      if (new Set(ids).size !== ids.length || ids.length !== todas.length || !todas.every((r) => ids.includes(r.id))) {
        throw AppError.regraNegocio('A lista de regras mudou. Recarregue a tela e tente de novo.')
      }
      await prisma.$transaction(async (tx) => {
        for (const [i, id] of ids.entries()) await tx.regraComercial.update({ where: { id }, data: { prioridade: i + 1 } })
        await registrarAuditoria(tx, { tabela: 'regras_comerciais', registroId: ids[0]!, acao: 'editar', antes: { ordem: todas.sort((a, b) => a.prioridade - b.prioridade).map((r) => r.id) }, depois: { ordem: ids }, usuarioId })
      })
      return listar()
    },

    async remover(id: string, usuarioId: string) {
      const antes = await obter(id)
      await prisma.$transaction(async (tx) => {
        await tx.regraComercial.delete({ where: { id } })
        await registrarAuditoria(tx, { tabela: 'regras_comerciais', registroId: id, acao: 'excluir', antes, usuarioId })
      })
    },

    /**
     * Simulador: os produtos e quantidades escolhidos viram itens (medidas e acabamentos padrão do produto) e passam
     * pelo mesmo cálculo do orçamento, com as regras ativas ou com a regra que está sendo editada (`regra`).
     */
    async simular(d: Simulacao, ctx: { usuarioId: string }, regraEmEdicao?: RegraComercialMotor | null) {
      const produtos = await prisma.produto.findMany({
        where: { id: { in: d.itens.map((i) => i.produtoId) } },
        select: { id: true, nome: true, larguraPadrao: true, alturaPadrao: true, acabamentos: { where: { padrao: true, acabamento: { ativo: true } }, select: { acabamentoId: true } } },
      })
      const itens = d.itens.map((i) => {
        const p = produtos.find((x) => x.id === i.produtoId)
        if (!p) throw AppError.regraNegocio('Produto não encontrado.')
        return {
          produtoId: p.id,
          descricao: null,
          quantidade: i.quantidade,
          largura: i.largura ?? p.larguraPadrao?.toString() ?? null,
          altura: i.altura ?? p.alturaPadrao?.toString() ?? null,
          precoUnitario: null,
          acabamentoIds: p.acabamentos.map((a) => a.acabamentoId),
          desconto: '0',
          observacao: null,
        }
      })
      const ativas = await carregarRegras(prisma)
      // Regra em edição: entra no lugar da gravada (ou como nova, por último), mesmo desligada
      const regras = regraEmEdicao ? [...ativas.filter((r) => r.id !== regraEmEdicao.id), { ...regraEmEdicao, ativa: true }] : ativas
      const base = await recalcularItens(prisma, itens, { usuarioId: ctx.usuarioId, podeAprovar: true })
      const { calculo, regras: r } = await aplicarRegrasNoCalculo(
        prisma,
        base,
        {
          clienteId: d.clienteId ?? null,
          pagamento: { sinalPercentual: d.sinalPercentual, parcelas: d.parcelas },
          dataDesejada: d.dataDesejada ?? null,
          origem: d.origem,
          desconto: d.descontoManual ?? '0',
          acrescimo: '0',
          frete: '0',
          hoje: d.data ?? undefined,
        },
        regras,
      )
      return {
        itens: calculo.itens.map((i, k) => ({
          descricao: i.descricao,
          quantidade: i.quantidade,
          bruto: r.itens[k]!.bruto,
          ajuste: r.itens[k]!.ajuste,
          total: i.total,
          regras: r.itens[k]!.regras,
        })),
        subtotalBruto: r.itens.reduce((s, i) => s.plus(i.bruto), new Decimal(0)).toFixed(2),
        resultado: r,
      }
    },

    async obterManual() {
      const e = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { manualAtendente: true } })
      return { manualAtendente: e?.manualAtendente ?? null }
    },

    async salvarManual(texto: string | null, usuarioId: string) {
      const e = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, manualAtendente: true } })
      if (!e) throw AppError.regraNegocio('Cadastre os dados da empresa antes.')
      await prisma.$transaction(async (tx) => {
        await tx.empresaConfig.update({ where: { id: e.id }, data: { manualAtendente: texto } })
        await registrarAuditoria(tx, { tabela: 'empresa_config', registroId: e.id, acao: 'editar', antes: { manualAtendente: e.manualAtendente }, depois: { manualAtendente: texto }, usuarioId })
      })
      return { manualAtendente: texto }
    },
  }
}
