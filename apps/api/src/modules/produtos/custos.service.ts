import { Prisma, type PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import {
  Decimal,
  analisarPreco,
  medidasDeReferencia,
  precoSugerido,
  type ComposicaoProdutoDetalhe,
  type ParametrosPreco,
  type Precificacao,
  type ProdutoReajuste,
  type aplicarReajusteSchema,
  type composicaoProdutoSchema,
  type precificacaoSchema,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import {
  acabamentosNaReferencia,
  causaCustoInsumo,
  mensagemReajuste,
  parametrosPreco,
  quePioraram,
  referenciaDoProduto,
  resolverProducao,
  situacaoDoProduto,
  type MudancaSituacao,
} from './custos'

type Db = PrismaClient | Prisma.TransactionClient
type ComposicaoInput = z.output<typeof composicaoProdutoSchema>

const maquinaCusto = { select: { id: true, nome: true, custoHora: true, velocidadeM2Hora: true } } as const

/** Tudo o que o cálculo do custo de referência precisa (custos atuais de insumos, máquinas e processos). */
export const incluirComposicao = {
  insumos: {
    include: { insumo: { select: { id: true, codigo: true, nome: true, custo: true, controlaEstoque: true, unidadeMedida: { select: { sigla: true } } } } },
    orderBy: { createdAt: 'asc' },
  },
  processos: {
    include: {
      maquina: maquinaCusto,
      processo: { select: { id: true, nome: true, custoHora: true, tempoPadraoMinutos: true, maquinaPadrao: maquinaCusto } },
    },
    orderBy: { ordem: 'asc' },
  },
  custosExtras: { orderBy: { ordem: 'asc' } },
} satisfies Prisma.ProdutoInclude

/** Insumos que o acabamento consome, com o custo atual (custo do item vendido e baixa de estoque). */
export const incluirAcabamentoCusto = {
  insumos: {
    include: { insumo: { select: { id: true, codigo: true, nome: true, custo: true, controlaEstoque: true, unidadeMedida: { select: { sigla: true } } } } },
    orderBy: { ordem: 'asc' },
  },
} satisfies Prisma.AcabamentoInclude

const semRepetidos = (ids: string[], mensagem: string) => {
  if (new Set(ids).size !== ids.length) throw AppError.regraNegocio(mensagem)
}

/**
 * Composição de custo e preço (docs/PRECIFICACAO.md): composição do produto, recálculo dos custos em lote
 * (com o aviso de reajuste), reajuste de preços e precificação da empresa. O preço nunca muda sozinho.
 */
export function criarCustosService(app: FastifyInstance) {
  const { prisma } = app

  async function configEmpresa(db: Db = prisma) {
    return db.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
  }

  async function parametros(db: Db = prisma): Promise<ParametrosPreco> {
    return parametrosPreco(await configEmpresa(db))
  }

  /**
   * Grava custo (4 casas), detalhamento e data dos produtos em modo composição (todos, ou só os ids).
   * Idempotente. Devolve a situação do lucro antes/depois (para o aviso de reajuste).
   */
  async function recalcularCustos(produtoIds?: string[], opcoes: { db?: Db; parametrosAntes?: ParametrosPreco } = {}): Promise<MudancaSituacao[]> {
    const db = opcoes.db ?? prisma
    if (produtoIds && produtoIds.length === 0) return []
    const par = await parametros(db)
    const antesPar = opcoes.parametrosAntes ?? par
    const produtos = await db.produto.findMany({
      where: { modoCusto: 'composicao', tipo: { not: 'insumo' }, ...(produtoIds ? { id: { in: produtoIds } } : {}) },
      include: incluirComposicao,
    })
    const agora = new Date()
    const mudancas: MudancaSituacao[] = []
    for (const p of produtos) {
      const ref = referenciaDoProduto(p, par)
      const custo = new Decimal(ref.porUnidade).toFixed(4)
      mudancas.push({
        id: p.id,
        nome: p.nome,
        antes: situacaoDoProduto(p, antesPar).situacao,
        depois: situacaoDoProduto({ ...p, custo }, par).situacao,
      })
      await db.produto.update({ where: { id: p.id }, data: { custo, custoDetalhe: ref as unknown as Prisma.InputJsonValue, custoCalculadoEm: agora } })
    }
    return mudancas
  }

  /** Usuários ativos que editam produtos (recebem o aviso de reajuste). */
  async function quemEditaProdutos() {
    const usuarios = await prisma.usuario.findMany({
      where: { ativo: true, papel: { permissoes: { some: { permissao: { modulo: 'produtos', acao: 'editar' } } } } },
      select: { id: true },
    })
    return usuarios.map((u) => u.id)
  }

  /** Uma notificação por gatilho, só se algum produto passou a ficar abaixo do lucro mínimo. */
  async function avisarReajuste(mudancas: MudancaSituacao[], causa: string) {
    // Um produto pode aparecer pela composição e pelos acabamentos obrigatórios: conta uma vez
    const piores = [...new Map(quePioraram(mudancas).map((m) => [m.id, m])).values()]
    if (piores.length === 0) return 0
    const usuarios = await quemEditaProdutos()
    if (usuarios.length === 0) return piores.length
    const titulo = 'Reajuste de preços'
    await prisma.notificacao.createMany({
      data: usuarios.map((usuarioId) => ({ usuarioId, titulo, mensagem: mensagemReajuste(causa, piores.length), link: '/produtos/reajuste' })),
    })
    app.tempoReal.emitir(usuarios.map((u) => `usuario:${u}`), 'notificacao:nova', { titulo })
    return piores.length
  }

  /** Gatilhos rodam depois do commit e nunca derrubam a operação que os causou. */
  async function seguro(descricao: string, fn: () => Promise<unknown>) {
    try {
      await fn()
    } catch (erro) {
      app.log.error({ err: erro }, `Falha ao recalcular custos (${descricao})`)
    }
  }

  async function idsQueUsamInsumo(insumoIds: string[]) {
    const linhas = await prisma.produtoInsumo.findMany({ where: { insumoId: { in: insumoIds }, produto: { modoCusto: 'composicao' } }, select: { produtoId: true } })
    return [...new Set(linhas.map((l) => l.produtoId))]
  }

  /**
   * Produtos cujos acabamentos OBRIGATÓRIOS gastam o insumo: o custo do acabamento não é gravado (é calculado
   * na venda), então a situação antes/depois é comparada aqui, na medida de referência do produto, com o
   * preço e o custo do produto + os dos acabamentos obrigatórios (só para o aviso de reajuste).
   */
  async function mudancasPorAcabamentos(insumoId: string, antes: Decimal.Value, depois: Decimal.Value): Promise<MudancaSituacao[]> {
    const obrigatorios = { obrigatorio: true, acabamento: { ativo: true } }
    const produtos = await prisma.produto.findMany({
      where: { ativo: true, tipo: { not: 'insumo' }, acabamentos: { some: { ...obrigatorios, acabamento: { ativo: true, insumos: { some: { insumoId } } } } } },
      select: {
        id: true,
        nome: true,
        modoCalculo: true,
        larguraPadrao: true,
        alturaPadrao: true,
        custo: true,
        precoVenda: true,
        lucroMinimo: true,
        acabamentos: { where: obrigatorios, select: { acabamento: { include: incluirAcabamentoCusto } } },
      },
    })
    if (produtos.length === 0) return []
    const par = await parametros()
    const comCusto = (custo: Decimal.Value) => (a: (typeof produtos)[number]['acabamentos'][number]) => ({
      ...a.acabamento,
      insumos: a.acabamento.insumos.map((i) => (i.insumoId === insumoId ? { ...i, insumo: { ...i.insumo, custo: new Decimal(custo).toString() } } : i)),
    })
    const situacao = (p: (typeof produtos)[number], custoInsumo: Decimal.Value) => {
      const ac = acabamentosNaReferencia(p, p.acabamentos.map(comCusto(custoInsumo)))
      return situacaoDoProduto({ precoVenda: p.precoVenda.plus(ac.preco).toString(), custo: p.custo.plus(ac.custo).toString(), lucroMinimo: p.lucroMinimo }, par).situacao
    }
    return produtos.map((p) => ({ id: p.id, nome: p.nome, antes: situacao(p, antes), depois: situacao(p, depois) }))
  }

  async function idsDoRoteiro(where: Prisma.ProdutoProcessoWhereInput) {
    const linhas = await prisma.produtoProcesso.findMany({ where: { ...where, produto: { modoCusto: 'composicao' } }, select: { produtoId: true } })
    return [...new Set(linhas.map((l) => l.produtoId))]
  }

  return {
    parametros,
    recalcularCustos,

    /** O custo de um insumo mudou (cadastro da embalagem ou entrada de estoque). */
    aposMudarCustoInsumo: (insumo: { id: string; nome: string; unidade: string | null }, antes: Decimal.Value, depois: Decimal.Value) =>
      seguro(`insumo ${insumo.id}`, async () => {
        if (new Decimal(antes).eq(depois)) return
        const mudancas = await recalcularCustos(await idsQueUsamInsumo([insumo.id]))
        // Os acabamentos obrigatórios que gastam o insumo também contam (fase 3)
        mudancas.push(...(await mudancasPorAcabamentos(insumo.id, antes, depois)))
        await avisarReajuste(mudancas, causaCustoInsumo(insumo.nome, antes.toString(), depois.toString(), insumo.unidade))
      }),

    aposMudarMaquina: (maquina: { id: string; nome: string }) =>
      seguro(`máquina ${maquina.id}`, async () => {
        const ids = await idsDoRoteiro({ OR: [{ maquinaId: maquina.id }, { maquinaId: null, processo: { maquinaPadraoId: maquina.id } }] })
        await avisarReajuste(await recalcularCustos(ids), `O custo da máquina ${maquina.nome} mudou`)
      }),

    aposMudarProcesso: (processo: { id: string; nome: string }) =>
      seguro(`processo ${processo.id}`, async () => {
        const ids = await idsDoRoteiro({ processoId: processo.id })
        await avisarReajuste(await recalcularCustos(ids), `O custo do processo ${processo.nome} mudou`)
      }),

    // ─── Composição do produto ───────────────────────────────────────────

    async obterComposicao(produtoId: string): Promise<ComposicaoProdutoDetalhe> {
      const p = await prisma.produto.findUnique({ where: { id: produtoId }, include: incluirComposicao })
      if (!p) throw AppError.naoEncontrado('Produto não encontrado.')
      const par = await parametros()
      const referencia = referenciaDoProduto(p, par)
      // Custo que vale para o preço: o calculado (composição) ou o digitado (simples)
      const custoAtual = p.modoCusto === 'composicao' ? referencia.porUnidade : p.custo.toString()
      const lucroDesejado = p.lucroDesejado?.toFixed(2) ?? null
      const lucroMinimo = p.lucroMinimo?.toFixed(2) ?? null
      return {
        produtoId: p.id,
        modoCalculo: p.modoCalculo,
        larguraPadrao: p.larguraPadrao?.toString() ?? null,
        alturaPadrao: p.alturaPadrao?.toString() ?? null,
        modoCusto: p.modoCusto === 'composicao' ? 'composicao' : 'simples',
        custoManual: p.modoCusto === 'composicao' ? null : p.custo.toFixed(4),
        materiais: p.insumos.map((i) => ({
          insumoId: i.insumoId,
          codigo: i.insumo.codigo,
          nome: i.insumo.nome,
          unidade: i.insumo.unidadeMedida?.sigla ?? '',
          custoUnitario: i.insumo.custo.toFixed(4),
          quantidade: i.quantidade.toString(),
          base: i.base,
          perdaPercentual: i.perdaPercentual.toFixed(2),
        })),
        producao: p.processos.map((l) => {
          const r = resolverProducao(l)
          return {
            processoId: l.processoId,
            nome: l.processo.nome,
            maquinaId: l.maquinaId,
            maquinaNome: l.maquina?.nome ?? null,
            custoHora: r.custoHora,
            velocidadeM2Hora: r.velocidadeM2Hora ? new Decimal(r.velocidadeM2Hora.toString()).toFixed(2) : null,
            tempoPadraoMinutos: l.processo.tempoPadraoMinutos,
            minutos: l.minutos?.toFixed(2) ?? null,
            base: l.base as ComposicaoProdutoDetalhe['producao'][number]['base'],
            setupMinutos: l.setupMinutos.toFixed(2),
          }
        }),
        extras: p.custosExtras.map((e) => ({ nome: e.nome, valor: e.valor.toFixed(4), base: e.base as ComposicaoProdutoDetalhe['extras'][number]['base'] })),
        lucroDesejado,
        lucroMinimo,
        precoVenda: p.precoVenda.toFixed(2),
        precoMinimo: p.precoMinimo?.toFixed(2) ?? null,
        referencia,
        parametros: par,
        analise: analisarPreco(p.precoVenda.toString(), custoAtual, par.percentuais, lucroMinimo ?? par.lucroMinimoPadrao),
        precoSugerido: Number(custoAtual) > 0 ? precoSugerido(custoAtual, par.percentuais, lucroDesejado ?? par.lucroDesejadoPadrao) : null,
        custoCalculadoEm: p.custoCalculadoEm?.toISOString() ?? null,
      }
    },

    /** Salva tudo numa transação (materiais, produção, extras, lucro e preço) e recalcula o custo. */
    async salvarComposicao(produtoId: string, d: ComposicaoInput, usuarioId: string) {
      const antes = await prisma.produto.findUnique({ where: { id: produtoId }, include: { insumos: true, processos: true, custosExtras: true } })
      if (!antes) throw AppError.naoEncontrado('Produto não encontrado.')
      if (antes.tipo === 'insumo') throw AppError.regraNegocio('Insumo não tem composição de custo (o custo vem da compra).')
      if (d.precoMinimo && new Decimal(d.precoMinimo).gt(d.precoVenda)) throw AppError.regraNegocio('O preço mínimo não pode ser maior que o preço de venda.')

      const insumoIds = d.materiais.map((m) => m.insumoId)
      semRepetidos(insumoIds, 'Material repetido na composição.')
      if (insumoIds.includes(produtoId)) throw AppError.regraNegocio('Um produto não pode ser material dele mesmo.')
      const validos = await prisma.produto.count({ where: { id: { in: insumoIds }, ativo: true, tipo: { in: ['insumo', 'revenda'] } } })
      if (validos !== insumoIds.length) throw AppError.regraNegocio('Os materiais precisam ser insumos (ou produtos de revenda) ativos.')

      semRepetidos(d.producao.map((l) => l.processoId), 'Processo repetido na produção.')
      const processos = await prisma.processo.count({ where: { id: { in: d.producao.map((l) => l.processoId) }, ativo: true } })
      if (processos !== d.producao.length) throw AppError.regraNegocio('Há processos inválidos ou desativados na produção.')
      const maquinas = [...new Set(d.producao.map((l) => l.maquinaId).filter((m): m is string => Boolean(m)))]
      if ((await prisma.maquina.count({ where: { id: { in: maquinas }, ativo: true } })) !== maquinas.length) {
        throw AppError.regraNegocio('Há máquinas inválidas ou desativadas na produção.')
      }

      await prisma.$transaction(async (tx) => {
        await tx.produtoInsumo.deleteMany({ where: { produtoId } })
        await tx.produtoInsumo.createMany({ data: d.materiais.map((m) => ({ produtoId, insumoId: m.insumoId, quantidade: m.quantidade, base: m.base, perdaPercentual: m.perdaPercentual })) })
        await tx.produtoProcesso.deleteMany({ where: { produtoId } })
        await tx.produtoProcesso.createMany({
          data: d.producao.map((l, i) => ({
            produtoId,
            processoId: l.processoId,
            maquinaId: l.maquinaId ?? null,
            ordem: i + 1,
            minutos: l.minutos ?? null,
            base: l.base,
            setupMinutos: l.setupMinutos,
          })),
        })
        await tx.produtoCustoExtra.deleteMany({ where: { produtoId } })
        await tx.produtoCustoExtra.createMany({ data: d.extras.map((e, i) => ({ produtoId, nome: e.nome, valor: e.valor, base: e.base, ordem: i + 1 })) })
        const simples = d.modoCusto === 'simples'
        await tx.produto.update({
          where: { id: produtoId },
          data: {
            modoCusto: d.modoCusto,
            lucroDesejado: d.lucroDesejado ?? null,
            lucroMinimo: d.lucroMinimo ?? null,
            precoVenda: d.precoVenda,
            precoMinimo: d.precoMinimo ?? null,
            ...(simples ? { custoDetalhe: Prisma.DbNull, custoCalculadoEm: null, ...(d.custoManual != null ? { custo: d.custoManual } : {}) } : {}),
          },
        })
        if (!simples) await recalcularCustos([produtoId], { db: tx })
        const { insumos, processos: roteiro, custosExtras, ...produto } = antes
        await registrarAuditoria(tx, {
          tabela: 'produtos',
          registroId: produtoId,
          acao: 'editar',
          antes: { composicao: { modoCusto: produto.modoCusto, custo: produto.custo, precoVenda: produto.precoVenda, precoMinimo: produto.precoMinimo, lucroDesejado: produto.lucroDesejado, lucroMinimo: produto.lucroMinimo, materiais: insumos, producao: roteiro, extras: custosExtras } },
          depois: { composicao: d },
          usuarioId,
        })
      })
    },

    // ─── Reajuste de preços ──────────────────────────────────────────────

    async listarReajuste(situacao: 'abaixo' | 'todos'): Promise<ProdutoReajuste[]> {
      const par = await parametros()
      const produtos = await prisma.produto.findMany({
        where: { ativo: true, tipo: { not: 'insumo' } },
        select: { id: true, codigo: true, nome: true, modoCalculo: true, larguraPadrao: true, alturaPadrao: true, custo: true, precoVenda: true, lucroDesejado: true, lucroMinimo: true },
        orderBy: { nome: 'asc' },
      })
      const linhas = produtos.map((p) => {
        const analise = situacaoDoProduto(p, par)
        const lucroDesejado = p.lucroDesejado?.toFixed(2) ?? par.lucroDesejadoPadrao
        return {
          id: p.id,
          codigo: p.codigo,
          nome: p.nome,
          modoCalculo: p.modoCalculo,
          unidade: medidasDeReferencia({ modoCalculo: p.modoCalculo }).unidade,
          custo: p.custo.toFixed(4),
          precoVenda: p.precoVenda.toFixed(2),
          lucroPercentual: analise.lucroPercentual,
          situacao: analise.situacao,
          // Sem custo não há preço sugerido (0,00 enganaria)
          precoSugerido: Number(p.custo) > 0 ? precoSugerido(p.custo.toString(), par.percentuais, lucroDesejado) : null,
          lucroDesejado,
        }
      })
      return situacao === 'todos' ? linhas : linhas.filter((l) => l.situacao === 'baixo' || l.situacao === 'prejuizo')
    },

    /** Aplica os preços escolhidos (cada produto com auditoria). */
    async aplicarReajuste(itens: z.output<typeof aplicarReajusteSchema>['itens'], usuarioId: string) {
      semRepetidos(itens.map((i) => i.id), 'Produto repetido no reajuste.')
      const produtos = await prisma.produto.findMany({ where: { id: { in: itens.map((i) => i.id) } }, select: { id: true, nome: true, tipo: true, precoVenda: true, precoMinimo: true } })
      if (produtos.length !== itens.length || produtos.some((p) => p.tipo === 'insumo')) throw AppError.regraNegocio('Há produtos inválidos no reajuste.')
      for (const i of itens) {
        const p = produtos.find((x) => x.id === i.id)!
        if (p.precoMinimo && p.precoMinimo.gt(i.precoVenda)) throw AppError.regraNegocio(`${p.nome}: o novo preço fica abaixo do preço mínimo (${p.precoMinimo.toFixed(2)}). Ajuste o preço mínimo no produto.`)
      }
      await prisma.$transaction(async (tx) => {
        for (const i of itens) {
          const p = produtos.find((x) => x.id === i.id)!
          await tx.produto.update({ where: { id: i.id }, data: { precoVenda: i.precoVenda } })
          await registrarAuditoria(tx, { tabela: 'produtos', registroId: i.id, acao: 'editar', antes: { precoVenda: p.precoVenda }, depois: { precoVenda: i.precoVenda, origem: 'reajuste' }, usuarioId })
        }
      })
      return { atualizados: itens.length }
    },

    // ─── Precificação da empresa ─────────────────────────────────────────

    async obterPrecificacao(): Promise<Precificacao> {
      const c = await configEmpresa()
      const par = parametrosPreco(c)
      return {
        impostosPercentual: c?.impostosPercentual.toFixed(2) ?? '0.00',
        comissaoPercentual: c?.comissaoPercentual.toFixed(2) ?? '0.00',
        rateioModo: (c?.rateioModo ?? 'nenhum') as Precificacao['rateioModo'],
        custoFixoPercentual: c?.custoFixoPercentual.toFixed(2) ?? '0.00',
        custoFixoMensal: c?.custoFixoMensal.toFixed(2) ?? '0.00',
        horasProdutivasMes: c?.horasProdutivasMes ?? 0,
        lucroDesejadoPadrao: par.lucroDesejadoPadrao,
        lucroMinimoPadrao: par.lucroMinimoPadrao,
        custoFixoHora: new Decimal(par.custoFixoHora).toFixed(2),
      }
    },

    /** Salva e recalcula todos os produtos em composição (com o aviso de reajuste). */
    async salvarPrecificacao(d: z.output<typeof precificacaoSchema>, usuarioId: string) {
      const antes = (await configEmpresa()) ?? (await prisma.empresaConfig.create({ data: { razaoSocial: 'Minha Empresa' } }))
      const parametrosAntes = parametrosPreco(antes)
      await prisma.$transaction(async (tx) => {
        const depois = await tx.empresaConfig.update({ where: { id: antes.id }, data: d })
        await registrarAuditoria(tx, {
          tabela: 'empresa_config',
          registroId: antes.id,
          acao: 'editar',
          antes: Object.fromEntries(Object.keys(d).map((k) => [k, antes[k as keyof typeof antes]])),
          depois: Object.fromEntries(Object.keys(d).map((k) => [k, depois[k as keyof typeof depois]])),
          usuarioId,
        })
      })
      await seguro('precificação', async () => {
        await avisarReajuste(await recalcularCustos(undefined, { parametrosAntes }), 'A precificação da empresa mudou')
      })
      return this.obterPrecificacao()
    },
  }
}

export type CustosService = ReturnType<typeof criarCustosService>
