import { createHash, randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  Decimal,
  STATUS_ORCAMENTO_ABERTOS,
  adicionarDias,
  hojeISO,
  lerRegrasDoOrcamento,
  motivosDeLiberacao,
  resumoParaGravar,
  type AnaliseOrcamento,
  type OrigemOrcamento,
  type ResultadoRegras,
  type orcamentoSchema,
  type orcamentosQuerySchema,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { escopoProprio, type ContextoUsuario } from '../../core/escopo'
import { analisarDocumento } from '../produtos/custos'
import { proximoNumero } from '../../core/numeracao'
import { paginacao, paginado } from '../../core/paginacao'
import type { analiseOrcamentoSchema } from './analise'
import { aplicarRegrasNoCalculo, itensParaCriar, recalcularItens, totalDoOrcamento } from './calculo'
import { incluirDetalhe, incluirResumo } from './consultas'

type Dados = z.output<typeof orcamentoSchema>
type Query = z.output<typeof orcamentosQuerySchema>

export const dataBanco = (iso: string) => new Date(`${iso}T00:00:00Z`)
export const gerarToken = () => randomBytes(24).toString('base64url')

/** O que já estava gravado e importa para a liberação do gerente */
interface LiberacaoAnterior {
  liberacaoChave: string | null
  liberadoPorId: string | null
  liberadoEm: Date | null
}

/**
 * Liberação do gerente pelas regras comerciais (pedido de aprovação, bloqueio, preço abaixo do mínimo pelas regras,
 * limite de negociação). A chave resume o que precisa de liberação (motivos + total): se nada mudou desde a
 * liberação, ela continua valendo; mudou, pede de novo. Quem pode aprovar libera ao salvar, menos os bloqueios (esses
 * pedem o clique em "Liberar mesmo assim"). Sem motivo, nada pendente.
 */
export function liberacaoDoOrcamento(r: Pick<ResultadoRegras, 'aprovacoes' | 'bloqueios'>, total: string, ctx: Pick<ContextoUsuario, 'usuarioId' | 'podeAprovar'>, antes?: LiberacaoAnterior | null) {
  const motivos = motivosDeLiberacao(r)
  if (!motivos.length) return { liberacaoPendente: false, liberacaoChave: null, liberadoPorId: null, liberadoEm: null }
  const chave = createHash('sha256').update(JSON.stringify({ motivos, total })).digest('hex').slice(0, 32)
  if (antes?.liberacaoChave === chave && antes.liberadoPorId) return { liberacaoPendente: false, liberacaoChave: chave, liberadoPorId: antes.liberadoPorId, liberadoEm: antes.liberadoEm }
  if (ctx.podeAprovar && r.bloqueios.length === 0) return { liberacaoPendente: false, liberacaoChave: chave, liberadoPorId: ctx.usuarioId, liberadoEm: new Date() }
  return { liberacaoPendente: true, liberacaoChave: chave, liberadoPorId: null, liberadoEm: null }
}

/** Origem de um orçamento novo: Assistente (itens montados por ele) ou a da solicitação (site = vitrine, whatsapp) */
export function origemDoOrcamento(pedida: 'balcao' | 'assistente' | undefined, origemSolicitacao: string | null | undefined): OrigemOrcamento {
  if (pedida === 'assistente') return 'assistente'
  if (origemSolicitacao === 'site') return 'vitrine'
  if (origemSolicitacao === 'whatsapp') return 'whatsapp'
  return 'balcao'
}

/** Descontos sugeridos que o vendedor aplicou: o que veio (sem repetir) ou, ausente, o que já estava gravado */
export const aceitasParaGravar = (vindas: string[] | undefined, antes: string[] | undefined): string[] => [...new Set(vindas ?? antes ?? [])]

const MSG_LIBERACAO = 'Este orçamento precisa da liberação de um gerente antes de ser enviado ou aprovado.'

export function criarOrcamentosService(app: FastifyInstance) {
  const { prisma } = app

  async function obter(id: string, ctx: ContextoUsuario) {
    const o = await prisma.orcamento.findFirst({ where: { id, ...escopoProprio(ctx, 'vendedorId') }, include: incluirDetalhe })
    if (!o) throw AppError.naoEncontrado('Orçamento não encontrado.')
    return o
  }

  /** Regras comerciais: esperando um gerente, o orçamento não é enviado nem aprovado (devolve true para encadear) */
  async function garantirLiberado(id: string, ctx: ContextoUsuario): Promise<true> {
    const o = await prisma.orcamento.findFirst({ where: { id, ...escopoProprio(ctx, 'vendedorId') }, select: { liberacaoPendente: true } })
    if (o?.liberacaoPendente) throw AppError.regraNegocio(MSG_LIBERACAO, { motivo: 'LIBERACAO_PENDENTE' })
    return true
  }

  function garantirAberto(status: string) {
    if (!(STATUS_ORCAMENTO_ABERTOS as readonly string[]).includes(status)) {
      throw AppError.regraNegocio('Só orçamentos em rascunho, enviados ou em negociação podem ser alterados.')
    }
  }

  /**
   * Valida cliente, vendedor e validade e recalcula todos os valores. Pagamento: ao criar, o que veio ou os padrões
   * da empresa (o orçamento guarda o que prometeu, mesmo se a empresa mudar os padrões depois); ao salvar, o que
   * veio ou o que já estava. Observações de pagamento: ao criar sem o campo, o padrão da empresa; vazio = nenhuma.
   * Regras comerciais: aplicadas de novo a cada salvamento (a API é a fonte da verdade), com o resumo gravado.
   */
  async function preparar(dados: Dados, ctx: ContextoUsuario, antes?: Awaited<ReturnType<typeof obter>>) {
    const criando = !antes
    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId } })
    if (!cliente?.ativo) throw AppError.regraNegocio('Cliente inválido ou desativado.')
    if (cliente.situacao === 'bloqueado') throw AppError.regraNegocio('Cliente bloqueado: não é possível orçar.')

    const vendedorId = dados.vendedorId ?? ctx.usuarioId
    if (vendedorId !== ctx.usuarioId && !ctx.veTodos) throw AppError.semPermissao('Você só pode criar orçamentos em seu nome.')
    const vendedor = await prisma.usuario.findUnique({ where: { id: vendedorId } })
    if (!vendedor?.ativo) throw AppError.regraNegocio('Vendedor inválido ou desativado.')

    const empresa = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
    const hoje = hojeISO()
    const validade = dados.validade ?? adicionarDias(hoje, empresa?.validadeOrcamentoDias ?? 7)
    if (validade < hoje) throw AppError.regraNegocio('A validade não pode ser anterior a hoje.')

    const pagamento = {
      sinalPercentual: dados.sinalPercentual ?? (criando ? (empresa?.sinalPercentual.toString() ?? '50') : undefined),
      parcelas: dados.parcelas ?? (criando ? (empresa?.parcelasPadrao ?? 1) : undefined),
      intervaloDias: dados.intervaloDias ?? (criando ? (empresa?.intervaloDiasPadrao ?? 30) : undefined),
    }
    const solicitacao = criando && dados.solicitacaoId ? await prisma.solicitacaoOrcamento.findUnique({ where: { id: dados.solicitacaoId }, select: { origem: true } }) : null
    const origem = antes ? (antes.origem as OrigemOrcamento) : origemDoOrcamento(dados.origem, solicitacao?.origem)
    const dataDesejada = dados.dataDesejada === undefined ? (antes?.dataDesejada?.toISOString().slice(0, 10) ?? null) : dados.dataDesejada

    // Descontos sugeridos que o vendedor aplicou: o que veio ou, ausente, o que já estava
    const regrasAceitas = aceitasParaGravar(dados.regrasAceitas, antes?.regrasAceitas)
    const { calculo, regras } = await aplicarRegrasNoCalculo(prisma, await recalcularItens(prisma, dados.itens, ctx), {
      clienteId: dados.clienteId,
      pagamento: { sinalPercentual: pagamento.sinalPercentual ?? antes?.sinalPercentual.toString() ?? '50', parcelas: pagamento.parcelas ?? antes?.parcelas ?? 1 },
      dataDesejada,
      origem,
      desconto: dados.desconto,
      acrescimo: dados.acrescimo,
      frete: dados.frete,
      aceitas: regrasAceitas,
    })
    const total = totalDoOrcamento(calculo.subtotal, dados.desconto, dados.acrescimo, dados.frete, regras.ajusteOrcamento)
    return {
      calculo,
      cabecalho: {
        origem,
        dataDesejada: dataDesejada ? dataBanco(dataDesejada) : null,
        ajusteRegras: regras.ajusteOrcamento,
        regras: resumoParaGravar(regras) as unknown as Prisma.InputJsonValue,
        regrasAceitas,
        ...liberacaoDoOrcamento(regras, total, ctx, antes),
        clienteId: dados.clienteId,
        solicitacaoId: dados.solicitacaoId ?? null,
        desconto: dados.desconto,
        acrescimo: dados.acrescimo,
        frete: dados.frete,
        observacoes: dados.observacoes ?? null,
        observacoesInternas: dados.observacoesInternas ?? null,
        vendedorId,
        ...pagamento,
        condicoes: dados.condicoes === undefined && criando ? (empresa?.condicoesPadrao ?? null) : (dados.condicoes ?? null),
        validade: dataBanco(validade),
        subtotal: calculo.subtotal,
        total,
        custoEstimado: calculo.custoEstimado,
        prazoDias: calculo.prazoDias,
      },
    }
  }

  async function mudarStatus(
    id: string,
    ctx: ContextoUsuario,
    permitidos: string[],
    data: Prisma.OrcamentoUpdateInput,
    mensagem: string,
    /** Feito pelo sistema (resposta do cliente no WhatsApp): auditoria sem usuário, com o "via" e o detalhe */
    sistema?: { via: string; detalhe?: Record<string, unknown> },
  ) {
    const antes = await obter(id, ctx)
    if (!permitidos.includes(antes.status)) throw AppError.regraNegocio(mensagem)
    return prisma.$transaction(async (tx) => {
      // Transição atômica: só grava se o status ainda for o lido acima (duas respostas ao mesmo tempo)
      const { count } = await tx.orcamento.updateMany({ where: { id, status: antes.status }, data: { status: antes.status } })
      if (count !== 1) throw AppError.regraNegocio(mensagem)
      const o = await tx.orcamento.update({ where: { id }, data, include: incluirDetalhe })
      await registrarAuditoria(tx, {
        tabela: 'orcamentos',
        registroId: id,
        acao: 'editar',
        antes: { status: antes.status },
        depois: { status: o.status, ...(sistema ? { via: sistema.via, ...sistema.detalhe } : {}) },
        usuarioId: sistema ? null : ctx.usuarioId,
      })
      return o
    })
  }

  return {
    obter,

    /** Semáforo do lucro ao vivo (nada é gravado; preço abaixo do mínimo não bloqueia a análise). */
    async analisar(d: z.output<typeof analiseOrcamentoSchema>, ctx: ContextoUsuario): Promise<AnaliseOrcamento> {
      // Com as regras comerciais, como o orçamento vai ser gravado (o ajuste do orçamento entra como desconto/acréscimo)
      const { calculo: calc, regras } = await aplicarRegrasNoCalculo(prisma, await recalcularItens(prisma, d.itens, { usuarioId: ctx.usuarioId, podeAprovar: true }), {
        clienteId: d.clienteId ?? null,
        pagamento: d.sinalPercentual !== undefined ? { sinalPercentual: d.sinalPercentual, parcelas: d.parcelas ?? 1 } : null,
        dataDesejada: d.dataDesejada ?? null,
        origem: d.origem ?? 'balcao',
        desconto: d.desconto,
        acrescimo: d.acrescimo,
        frete: '0',
        aceitas: d.regrasAceitas ?? [],
      })
      const ajuste = new Decimal(regras.ajusteOrcamento)
      return analisarDocumento(
        calc.itens.map((i, k) => ({ total: i.total, custoEstimado: i.custoEstimado, lucroMinimo: calc.lucrosMinimos[k], linhas: i.custoDetalhe.linhas })),
        calc.parametros,
        ctx.veCustos,
        { desconto: Decimal.max(ajuste.neg(), 0).plus(d.desconto).toFixed(2), acrescimo: Decimal.max(ajuste, 0).plus(d.acrescimo).toFixed(2) },
      )
    },

    /** "Liberar" (quem pode aprovar orçamentos): o que as regras pediram passa a valer até o orçamento mudar de novo */
    async liberar(id: string, ctx: ContextoUsuario) {
      const antes = await obter(id, ctx)
      garantirAberto(antes.status)
      if (!antes.liberacaoPendente) throw AppError.regraNegocio('Este orçamento não está esperando liberação.')
      return prisma.$transaction(async (tx) => {
        const o = await tx.orcamento.update({ where: { id }, data: { liberacaoPendente: false, liberadoPorId: ctx.usuarioId, liberadoEm: new Date() }, include: incluirDetalhe })
        await registrarAuditoria(tx, {
          tabela: 'orcamentos',
          registroId: id,
          acao: 'editar',
          antes: { liberacaoPendente: true },
          depois: { liberacaoPendente: false, liberado: motivosDeLiberacao(lerRegrasDoOrcamento(antes.regras)) },
          usuarioId: ctx.usuarioId,
        })
        return o
      })
    },

    async listar(q: Query, ctx: ContextoUsuario) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.OrcamentoWhereInput = {
        ...escopoProprio(ctx, 'vendedorId'),
        ...(q.status ? { status: q.status } : {}),
        ...(q.clienteId ? { clienteId: q.clienteId } : {}),
        ...(q.vendedorId && ctx.veTodos ? { vendedorId: q.vendedorId } : {}),
        ...(texto ? { OR: [{ numero: texto }, { cliente: { nome: texto } }, { cliente: { fantasia: texto } }] } : {}),
        ...(q.kanban === 'true' ? { NOT: { status: { in: ['convertido', 'recusado', 'expirado'] }, updatedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } } : {}),
      }
      const pag = paginacao(q, ['createdAt', 'numero', 'total', 'validade'] as const, { campo: 'createdAt', direcao: 'desc' })
      const [total, data] = await prisma.$transaction([
        prisma.orcamento.count({ where }),
        prisma.orcamento.findMany({
          where,
          ...pag,
          include: { ...incluirResumo, itens: { orderBy: { ordem: 'asc' }, take: 3, select: { descricao: true, quantidade: true } }, _count: { select: { itens: true } } },
        }),
      ])
      const comResumo = data.map(({ itens, _count, ...o }) => ({
        ...o,
        resumo: { itens: _count.itens, principais: itens.map((i) => `${Number(i.quantidade).toLocaleString('pt-BR')} × ${i.descricao}`) },
      }))
      return paginado(comResumo, total, q)
    },

    async criar(dados: Dados, ctx: ContextoUsuario) {
      const { calculo, cabecalho } = await preparar(dados, ctx)
      if (dados.solicitacaoId) {
        const s = await prisma.solicitacaoOrcamento.findUnique({ where: { id: dados.solicitacaoId } })
        if (!s || s.status === 'descartada') throw AppError.regraNegocio('Solicitação inválida ou descartada.')
      }
      return prisma.$transaction(async (tx) => {
        const o = await tx.orcamento.create({
          data: {
            ...cabecalho,
            numero: await proximoNumero(tx, 'orcamento'),
            tokenPublico: gerarToken(),
            createdBy: ctx.usuarioId,
            itens: { create: itensParaCriar(calculo.itens) },
          },
          include: incluirDetalhe,
        })
        if (dados.solicitacaoId) {
          await tx.solicitacaoOrcamento.update({ where: { id: dados.solicitacaoId }, data: { status: 'orcada', clienteId: dados.clienteId } })
        }
        await registrarAuditoria(tx, { tabela: 'orcamentos', registroId: o.id, acao: 'criar', depois: o, usuarioId: ctx.usuarioId })
        return o
      })
    },

    async atualizar(id: string, dados: Dados, ctx: ContextoUsuario) {
      const antes = await obter(id, ctx)
      garantirAberto(antes.status)
      const { calculo, cabecalho } = await preparar({ ...dados, solicitacaoId: antes.solicitacaoId }, ctx, antes)
      return prisma.$transaction(async (tx) => {
        await tx.orcamentoItem.deleteMany({ where: { orcamentoId: id } })
        const o = await tx.orcamento.update({
          where: { id },
          data: { ...cabecalho, itens: { create: itensParaCriar(calculo.itens) } },
          include: incluirDetalhe,
        })
        await registrarAuditoria(tx, { tabela: 'orcamentos', registroId: id, acao: 'editar', antes, depois: o, usuarioId: ctx.usuarioId })
        return o
      })
    },

    marcarEnviado: async (id: string, ctx: ContextoUsuario) =>
      (await garantirLiberado(id, ctx)) &&
      mudarStatus(id, ctx, ['rascunho'], { status: 'enviado', enviadoEm: new Date() }, 'Só rascunhos podem ser marcados como enviados.'),

    emNegociacao: (id: string, ctx: ContextoUsuario) =>
      mudarStatus(id, ctx, ['enviado'], { status: 'em_negociacao' }, 'Só orçamentos enviados podem ir para negociação.'),

    /**
     * "Registrar aprovação" ou, com canal "whatsapp", "Cliente aprovou pelo WhatsApp" (respondeu APROVADO na conversa).
     * Com `resposta`, foi o próprio sistema que leu a resposta do cliente na conversa (enquete ou texto).
     */
    aprovarInterno: async (id: string, nome: string, ctx: ContextoUsuario, canal?: 'whatsapp', resposta?: { via: 'enquete' | 'texto' | 'assistente'; texto: string | null }) =>
      (await garantirLiberado(id, ctx)) &&
      mudarStatus(
        id,
        ctx,
        [...STATUS_ORCAMENTO_ABERTOS],
        {
          status: 'aprovado',
          aprovadoEm: new Date(),
          aprovadoPorNome: `${nome} (${resposta ? `respondeu no WhatsApp${resposta.via === 'enquete' ? ', pela enquete' : resposta.via === 'assistente' ? ', entendido pelo Assistente GrafyGo' : ''}` : canal === 'whatsapp' ? 'pelo WhatsApp, registrado pela equipe' : 'registrado internamente'})`,
          aprovadoIp: null,
        },
        'Este orçamento não pode ser aprovado.',
        resposta ? { via: 'resposta no WhatsApp', detalhe: { resposta: resposta.texto, por: resposta.via } } : undefined,
      ),

    recusar: (id: string, motivo: string, ctx: ContextoUsuario) =>
      mudarStatus(id, ctx, [...STATUS_ORCAMENTO_ABERTOS], { status: 'recusado', recusadoEm: new Date(), motivoRecusa: motivo }, 'Este orçamento não pode ser recusado.'),

    /** Volta para negociação; se a validade já passou, renova pelo prazo padrão da empresa. */
    async reabrir(id: string, ctx: ContextoUsuario) {
      const antes = await obter(id, ctx)
      const empresa = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
      const hoje = hojeISO()
      const vencida = antes.validade.toISOString().slice(0, 10) < hoje
      return mudarStatus(
        id,
        ctx,
        ['aprovado', 'recusado', 'expirado'],
        {
          status: 'em_negociacao',
          aprovadoEm: null,
          aprovadoPorNome: null,
          aprovadoIp: null,
          recusadoEm: null,
          motivoRecusa: null,
          ...(vencida ? { validade: dataBanco(adicionarDias(hoje, empresa?.validadeOrcamentoDias ?? 7)) } : {}),
        },
        'Só orçamentos aprovados, recusados ou expirados podem ser reabertos.',
      )
    },

    /** Novo rascunho com os mesmos itens (valores recalculados com o cadastro atual). */
    async duplicar(id: string, ctx: ContextoUsuario) {
      const o = await obter(id, ctx)
      return this.criar(
        {
          clienteId: o.clienteId,
          vendedorId: ctx.usuarioId,
          solicitacaoId: null,
          validade: null,
          desconto: o.desconto.toString(),
          acrescimo: o.acrescimo.toString(),
          frete: o.frete.toString(),
          sinalPercentual: o.sinalPercentual.toString(),
          parcelas: o.parcelas,
          intervaloDias: o.intervaloDias,
          regrasAceitas: o.regrasAceitas,
          condicoes: o.condicoes,
          observacoes: o.observacoes,
          observacoesInternas: o.observacoesInternas,
          itens: o.itens.map((i) => ({
            produtoId: i.produtoId,
            descricao: i.descricao,
            quantidade: i.quantidade.toString(),
            largura: i.largura?.toString() ?? null,
            altura: i.altura?.toString() ?? null,
            precoUnitario: i.precoUnitario.toString(),
            acabamentoIds: i.acabamentos.map((a) => a.acabamentoId),
            desconto: i.desconto.toString(),
            observacao: i.observacao,
            precisaArte: i.precisaArte,
          })),
        },
        ctx,
      )
    },
  }
}

export type OrcamentosService = ReturnType<typeof criarOrcamentosService>
