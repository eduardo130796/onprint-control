import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  CONFIANCA_CONFERIR,
  Decimal,
  MODO_CALCULO_SUFIXO,
  TIPO_COBRANCA_ROTULOS,
  calcularPreco,
  nomeCliente,
  normalizarNumeroWhatsapp,
  type DescricaoSugerida,
  type ItemOrcamentoSugerido,
  type ModoCalculo,
  type OrcamentoDeTexto,
  type ProdutoSugerido,
  type descricaoAssistenteSchema,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { palavras, pontuar } from '../../integrations/ia/texto'
import type { ResultadoIA } from './assistente'
import { criarAssistenteEmpresa, mensagemSemResultado, nomeDaGrafica } from './empresa.service'
import { pedidoDescricao, pedidoOrcamentoDeTexto, pedidoProdutoDeTexto, type ItemLido, type ProdutoParaIA } from './prompts-equipe'

/*
 * Ajudas internas do Assistente GrafyGo: montar orçamento a partir do texto do cliente, preencher produto e escrever
 * descrição. A IA só sugere; o sistema confere tudo contra o cadastro (ids, acabamentos do produto, medidas) e calcula
 * os preços com o motor de preços (@onprint/shared/pricing). Nada é salvo aqui: a tela mostra para a pessoa revisar.
 */

/** Acima disto o catálogo vai filtrado pelas palavras do pedido (prompt menor e mais barato) */
export const MAX_PRODUTOS_NO_PROMPT = 40
export const MAX_INSUMOS_NO_PROMPT = 60

/**
 * Catálogo grande: só os produtos com mais palavras em comum com o pedido (nome e categoria), até `max`. Nenhum em
 * comum: os primeiros (o Assistente diz que não achou). Catálogo pequeno vai inteiro.
 */
export function filtrarPorPalavras<T>(lista: T[], texto: string, nome: (x: T) => string, max: number): T[] {
  if (lista.length <= max) return lista
  const pedido = palavras(texto)
  const comNota = lista.map((x, i) => ({ x, i, nota: pontuar(pedido, palavras(nome(x))) }))
  const achados = comNota.filter((c) => c.nota > 0).sort((a, b) => b.nota - a.nota || a.i - b.i)
  return (achados.length ? achados : comNota).slice(0, max).map((c) => c.x)
}

const decimal = (v: Prisma.Decimal | null | undefined) => (v === null || v === undefined ? null : v.toString())
/** Número da IA → texto decimal da API ("2.5") */
const paraDecimal = (n: number) => new Decimal(n).toDecimalPlaces(3).toString()

const selecionarProduto = {
  id: true,
  nome: true,
  codigo: true,
  modoCalculo: true,
  precisaArte: true,
  precoVenda: true,
  precoMinimo: true,
  custo: true,
  larguraPadrao: true,
  alturaPadrao: true,
  larguraMaxima: true,
  alturaMaxima: true,
  categoria: { select: { nome: true } },
  acabamentos: {
    orderBy: { createdAt: 'asc' },
    select: { obrigatorio: true, padrao: true, acabamento: { select: { id: true, nome: true, tipoCobranca: true, valor: true, custo: true, ativo: true } } },
  },
} satisfies Prisma.ProdutoSelect

type ProdutoCatalogo = Prisma.ProdutoGetPayload<{ select: typeof selecionarProduto }>

/** Produto do banco → o que vai ao prompt (sem preço nem custo) */
const paraIA = (p: ProdutoCatalogo): ProdutoParaIA => ({
  id: p.id,
  nome: p.nome,
  codigo: p.codigo,
  categoria: p.categoria?.nome ?? null,
  modoCalculo: p.modoCalculo,
  precisaArte: p.precisaArte,
  larguraPadrao: decimal(p.larguraPadrao),
  alturaPadrao: decimal(p.alturaPadrao),
  larguraMaxima: decimal(p.larguraMaxima),
  alturaMaxima: decimal(p.alturaMaxima),
  acabamentos: p.acabamentos.filter((a) => a.acabamento.ativo).map((a) => ({ id: a.acabamento.id, nome: a.acabamento.nome, obrigatorio: a.obrigatorio, padrao: a.padrao })),
})

/**
 * Item lido pela IA → item sugerido, com o preço do motor de preços (o mesmo cálculo do orçamento): obrigatórios do
 * produto sempre entram; sem acabamento pedido, os que vêm marcados no produto; m² sem medida usa a padrão (conferir).
 */
export function itemSugerido(i: ItemLido, produto: ProdutoCatalogo | undefined, areaMinimaM2: string | null): ItemOrcamentoSugerido {
  const avisos = [...i.avisos]
  if (!produto) {
    return {
      produto: null,
      descricao: i.descricao,
      quantidade: paraDecimal(i.quantidade),
      largura: i.largura === null ? null : paraDecimal(i.largura),
      altura: i.altura === null ? null : paraDecimal(i.altura),
      acabamentos: [],
      observacao: i.observacao,
      confianca: i.confianca,
      motivo: i.motivo,
      conferir: true,
      avisos,
      preco: null,
    }
  }
  const ativos = produto.acabamentos.filter((a) => a.acabamento.ativo)
  const escolhidos = i.acabamentoIds.length ? i.acabamentoIds : ativos.filter((a) => a.padrao).map((a) => a.acabamento.id)
  const ids = new Set([...ativos.filter((a) => a.obrigatorio).map((a) => a.acabamento.id), ...escolhidos])
  const acabs = ativos.filter((a) => ids.has(a.acabamento.id)).map((a) => a.acabamento)
  let largura = i.largura
  let altura = i.altura
  const precisaMedidas = produto.modoCalculo === 'm2' || produto.modoCalculo === 'metro_linear'
  if (precisaMedidas && (largura === null || (produto.modoCalculo === 'm2' && altura === null))) {
    if (produto.larguraPadrao && (produto.modoCalculo === 'metro_linear' || produto.alturaPadrao)) {
      largura ??= Number(produto.larguraPadrao)
      if (produto.modoCalculo === 'm2') altura ??= Number(produto.alturaPadrao)
      avisos.push('O pedido não diz a medida: ficou a medida padrão do produto.')
    } else avisos.push('O pedido não diz a medida: preencha largura e altura.')
  }
  const quantidade = paraDecimal(i.quantidade)
  const r = calcularPreco({
    modoCalculo: produto.modoCalculo,
    precoUnitario: produto.precoVenda.toString(),
    custoUnitario: produto.custo.toString(),
    precoMinimo: decimal(produto.precoMinimo),
    quantidade,
    largura: largura === null ? null : paraDecimal(largura),
    altura: altura === null ? null : paraDecimal(altura),
    areaMinimaM2,
    medidasMaximas: { largura: decimal(produto.larguraMaxima), altura: decimal(produto.alturaMaxima) },
    acabamentos: acabs.map((a) => ({ id: a.id, nome: a.nome, tipoCobranca: a.tipoCobranca, valor: a.valor.toString(), custo: a.custo.toString() })),
  })
  return {
    produto: { id: produto.id, nome: produto.nome, codigo: produto.codigo, modoCalculo: produto.modoCalculo, precisaArte: produto.precisaArte },
    descricao: i.descricao,
    quantidade,
    largura: largura === null ? null : paraDecimal(largura),
    altura: altura === null ? null : paraDecimal(altura),
    acabamentos: acabs.map((a) => ({ id: a.id, nome: a.nome })),
    observacao: i.observacao,
    confianca: i.confianca,
    motivo: i.motivo,
    conferir: i.confianca < CONFIANCA_CONFERIR || avisos.length > 0 || !r.ok,
    avisos,
    preco: { ok: r.ok, precoUnitario: new Decimal(produto.precoVenda.toString()).toFixed(2), total: r.total, erros: r.erros },
  }
}

/** Telefones escritos no pedido, como o cadastro guarda (DDD + número). Ficam no servidor: só acham o cliente. */
export function telefonesDoTexto(texto: string): string[] {
  const numeros = (texto.match(/\+?\d[\d\s().-]{8,}\d/g) ?? []).map((t) => normalizarNumeroWhatsapp(t)?.replace(/^55/, '')).filter((t): t is string => Boolean(t))
  return [...new Set(numeros)]
}

export function criarAjudasAssistente(app: FastifyInstance) {
  const { prisma } = app
  const empresa = criarAssistenteEmpresa(app)

  function exigirResultado<T>(r: ResultadoIA<T>): T {
    if (!r.ok) throw AppError.regraNegocio(mensagemSemResultado(r), { motivo: r.motivo })
    return r.dados
  }

  /** Cliente do cadastro pelo telefone escrito no pedido ou, sem ele, pelo nome citado (só se for um só) */
  async function acharCliente(texto: string, nome: string | null): Promise<{ id: string; rotulo: string } | null> {
    const select = { id: true, nome: true, fantasia: true, tipoPessoa: true } as const
    const locais = telefonesDoTexto(texto)
    // O cadastro guarda sem o 55 (e às vezes com): procura dos dois jeitos
    const telefones = [...locais, ...locais.map((t) => `55${t}`)]
    if (telefones.length) {
      const porTelefone = await prisma.cliente.findMany({ where: { ativo: true, OR: [{ whatsapp: { in: telefones } }, { telefone: { in: telefones } }] }, select, take: 2 })
      if (porTelefone.length === 1) return { id: porTelefone[0]!.id, rotulo: nomeCliente(porTelefone[0]!) }
    }
    if (!nome || nome.length < 3) return null
    const porNome = await prisma.cliente.findMany({
      where: { ativo: true, OR: [{ nome: { contains: nome, mode: 'insensitive' } }, { fantasia: { contains: nome, mode: 'insensitive' } }] },
      select,
      take: 2,
    })
    return porNome.length === 1 ? { id: porNome[0]!.id, rotulo: nomeCliente(porNome[0]!) } : null
  }

  return {
    /** "Montar com o Assistente": o pedido do cliente vira itens do catálogo com o preço do sistema */
    async orcamentoDeTexto(texto: string): Promise<OrcamentoDeTexto> {
      const { assinanteId, recurso } = await empresa.exigir('orcamentoTexto')
      const [produtos, config, grafica] = await Promise.all([
        prisma.produto.findMany({ where: { ativo: true, tipo: { in: ['produto', 'servico', 'revenda'] } }, select: selecionarProduto, orderBy: { nome: 'asc' } }),
        prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { areaMinimaM2: true } }),
        nomeDaGrafica(prisma),
      ])
      if (!produtos.length) throw AppError.regraNegocio('Cadastre seus produtos antes: o Assistente monta o orçamento com o catálogo da gráfica.')
      const catalogo = filtrarPorPalavras(produtos, texto, (p) => `${p.nome} ${p.categoria?.nome ?? ''}`, MAX_PRODUTOS_NO_PROMPT)
      const leitura = exigirResultado(
        await app.assistente.executar({
          assinanteId,
          recurso,
          pedido: pedidoOrcamentoDeTexto({ grafica, pedido: texto, catalogo: catalogo.map(paraIA) }),
          contar: (d) => d.itens.filter((i) => i.produtoId).length,
        }),
      )
      const porId = new Map(catalogo.map((p) => [p.id, p]))
      const area = config?.areaMinimaM2.toString() ?? null
      return {
        itens: leitura.itens.map((i) => itemSugerido(i, i.produtoId ? porId.get(i.produtoId) : undefined, area)),
        cliente: { mencionado: leitura.clienteNome, encontrado: await acharCliente(texto, leitura.clienteNome) },
        prazoDesejado: leitura.prazoDesejado,
        observacoes: leitura.observacoes,
        naoIdentificados: leitura.naoIdentificados,
      }
    },

    /** "Preencher com o Assistente": a descrição da pessoa vira um cadastro sugerido (nada é salvo) */
    async produtoDeTexto(texto: string): Promise<ProdutoSugerido> {
      const { assinanteId, recurso } = await empresa.exigir('produtos')
      const [categorias, unidades, insumos, acabamentos, processos, maquinas, grafica] = await Promise.all([
        prisma.categoria.findMany({ where: { ativo: true }, select: { id: true, nome: true, paiId: true }, orderBy: { nome: 'asc' } }),
        prisma.unidadeMedida.findMany({ where: { ativo: true }, select: { id: true, sigla: true, nome: true }, orderBy: { sigla: 'asc' } }),
        prisma.produto.findMany({
          where: { ativo: true, tipo: 'insumo' },
          select: { id: true, nome: true, modoCalculo: true, custo: true, unidadeMedida: { select: { sigla: true } } },
          orderBy: { nome: 'asc' },
        }),
        prisma.acabamento.findMany({ where: { ativo: true }, select: { id: true, nome: true, tipoCobranca: true }, orderBy: { nome: 'asc' } }),
        prisma.processo.findMany({ where: { ativo: true }, select: { id: true, nome: true, maquinaPadraoId: true }, orderBy: { nome: 'asc' } }),
        prisma.maquina.findMany({ where: { ativo: true }, select: { id: true, nome: true, tipo: true }, orderBy: { nome: 'asc' } }),
        nomeDaGrafica(prisma),
      ])
      const nomesCategorias = new Map(categorias.map((c) => [c.id, c.nome]))
      const caminho = (c: { nome: string; paiId: string | null }) => (c.paiId && nomesCategorias.get(c.paiId) ? `${nomesCategorias.get(c.paiId)} › ${c.nome}` : c.nome)
      // A unidade de uso do insumo: a do cálculo (m², m) ou a do cadastro (un, fl…)
      const unidadeDoInsumo = (i: (typeof insumos)[number]) => (i.modoCalculo === 'm2' || i.modoCalculo === 'metro_linear' ? MODO_CALCULO_SUFIXO[i.modoCalculo] : (i.unidadeMedida?.sigla ?? 'un'))
      const insumosNoPrompt = filtrarPorPalavras(insumos, texto, (i) => i.nome, MAX_INSUMOS_NO_PROMPT)

      const l = exigirResultado(
        await app.assistente.executar({
          assinanteId,
          recurso,
          pedido: pedidoProdutoDeTexto({
            grafica,
            descricao: texto,
            categorias: categorias.map((c) => ({ id: c.id, nome: caminho(c) })),
            unidades,
            insumos: insumosNoPrompt.map((i) => ({ id: i.id, nome: i.nome, unidade: unidadeDoInsumo(i), custo: i.custo.toString() })),
            acabamentos: acabamentos.map((a) => ({ id: a.id, nome: a.nome, cobranca: TIPO_COBRANCA_ROTULOS[a.tipoCobranca].toLowerCase() })),
            processos,
            maquinas,
          }),
          contar: () => 1,
        }),
      )
      const insumoPorId = new Map(insumos.map((i) => [i.id, i]))
      const categoria = l.categoriaId ? categorias.find((c) => c.id === l.categoriaId) : undefined
      // Sem unidade sugerida: a que combina com a cobrança (m² para m², un para unidade…)
      const unidadeMedidaId = l.unidadeMedidaId ?? unidades.find((u) => u.sigla === ({ m2: 'm²', metro_linear: 'm', milheiro: 'mil', hora: 'h', unidade: 'un' } as Record<ModoCalculo, string>)[l.modoCalculo])?.id ?? null
      return {
        nome: l.nome,
        tipo: l.tipo,
        categoria: categoria ? { id: categoria.id, nome: caminho(categoria) } : l.categoriaNova ? { id: null, nome: l.categoriaNova } : null,
        modoCalculo: l.modoCalculo,
        unidadeMedidaId,
        larguraPadrao: l.larguraPadrao === null ? null : paraDecimal(l.larguraPadrao),
        alturaPadrao: l.alturaPadrao === null ? null : paraDecimal(l.alturaPadrao),
        prazoProducaoDias: l.prazoDias,
        precisaArte: l.precisaArte,
        insumos: l.insumos.map((i) => {
          const ins = insumoPorId.get(i.insumoId)!
          return { insumoId: ins.id, nome: ins.nome, unidade: unidadeDoInsumo(ins), custoUnitario: ins.custo.toString(), quantidade: String(i.quantidade), base: i.base }
        }),
        processos: l.processos.map((p) => ({ ...p, nome: processos.find((x) => x.id === p.processoId)!.nome })),
        acabamentos: l.acabamentoIds.map((id) => ({ id, nome: acabamentos.find((a) => a.id === id)!.nome })),
        margem: l.margem === null ? null : String(l.margem),
        descricao: l.descricao,
        avisos: l.avisos,
      }
    },

    /** "Escrever com o Assistente": descrição do produto (orçamento) ou texto da vitrine, com os dados do cadastro */
    async descricao(dados: z.output<typeof descricaoAssistenteSchema>): Promise<DescricaoSugerida> {
      const { assinanteId, recurso } = await empresa.exigir('descricoes')
      const grafica = await nomeDaGrafica(prisma)
      let produto: Parameters<typeof pedidoDescricao>[0]['produto']
      if (dados.produtoId) {
        const p = await prisma.produto.findFirst({
          where: { id: dados.produtoId, tipo: { not: 'insumo' } },
          select: {
            nome: true,
            vitrineNome: true,
            descricao: true,
            vitrineDescricao: true,
            modoCalculo: true,
            larguraPadrao: true,
            alturaPadrao: true,
            larguraMaxima: true,
            alturaMaxima: true,
            prazoProducaoDias: true,
            precisaArte: true,
            categoria: { select: { nome: true } },
            acabamentos: { select: { acabamento: { select: { nome: true, ativo: true } } } },
            insumos: { select: { insumo: { select: { nome: true } } } },
          },
        })
        if (!p) throw AppError.naoEncontrado('Produto não encontrado.')
        const medida = (l: Prisma.Decimal | null, a: Prisma.Decimal | null) => (l && a ? `${Number(l).toLocaleString('pt-BR')} × ${Number(a).toLocaleString('pt-BR')} m` : null)
        produto = {
          nome: (dados.destino === 'vitrine' && p.vitrineNome) || p.nome,
          categoria: p.categoria?.nome ?? null,
          modoCalculo: p.modoCalculo,
          medidaPadrao: medida(p.larguraPadrao, p.alturaPadrao),
          medidaMaxima: medida(p.larguraMaxima, p.alturaMaxima),
          acabamentos: p.acabamentos.filter((a) => a.acabamento.ativo).map((a) => a.acabamento.nome),
          // Nome do material sem o tamanho da embalagem ("Lona 440 g (rolo 3,20 m)" → "Lona 440 g")
          materiais: p.insumos.map((i) => i.insumo.nome.replace(/\s*\([^)]*\)\s*$/, '')),
          prazoDias: p.prazoProducaoDias || null,
          precisaArte: p.precisaArte,
          descricaoAtual: (dados.destino === 'vitrine' ? p.vitrineDescricao || p.descricao : p.descricao) || null,
        }
      } else if (dados.rascunho) {
        produto = {
          nome: dados.rascunho.nome,
          categoria: dados.rascunho.categoria ?? null,
          modoCalculo: dados.rascunho.modoCalculo ?? null,
          medidaPadrao: null,
          medidaMaxima: null,
          acabamentos: [],
          materiais: [],
          prazoDias: null,
          precisaArte: null,
          descricaoAtual: null,
        }
      } else throw AppError.regraNegocio('Preencha o nome do produto antes de pedir a descrição.')
      return exigirResultado(await app.assistente.executar({ assinanteId, recurso, pedido: pedidoDescricao({ grafica, destino: dados.destino, produto }), contar: () => 1 }))
    },
  }
}
