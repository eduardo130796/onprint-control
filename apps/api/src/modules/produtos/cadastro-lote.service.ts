import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  SIGLA_DO_MODO,
  acabamentoPeloNome,
  formatarMoeda,
  acharDuplicado,
  linhasDoCsv,
  textoDaPlanilha,
  type CadastroAtual,
  type LeituraCadastroLote,
  type LinhaCadastro,
  type OrigemLinha,
  type ResultadoCadastroLote,
  type cadastroLoteSchema,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import type { AnexoIA } from '../../integrations/ia'
import { montarCerebro } from '../assistente/cerebro'
import { criarAssistenteEmpresa, mensagemSemResultado } from '../assistente/empresa.service'
import { pedidoTabelaProdutos, type LeituraTabela } from '../assistente/prompts-catalogo'
import { criarCustosService } from './custos.service'
import { gerarCodigoProduto } from './produtos.service'

type Lote = z.output<typeof cadastroLoteSchema>

/*
 * "Cadastrar vários de uma vez": ler a tabela de preços da gráfica (texto, planilha, foto ou PDF; a IA só estrutura) e
 * criar os produtos revisados numa transação só, com auditoria. Os produtos saem prontos para o orçamento: modo de
 * cálculo, unidade e preço certos, acabamentos ligados (os novos, criados junto com o preço digitado) e, quando vierem,
 * os materiais da composição de custo. Nada é salvo na leitura.
 */

/** Arquivos que a leitura aceita: foto/PDF (IA) e planilha CSV (lida aqui, sem IA, e mandada como texto) */
export const TIPOS_ARQUIVO_TABELA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] as const
export const MAX_ARQUIVO_TABELA_MB = 8

/** Leitura da IA → linhas da revisão: duplicados (no cadastro e repetidos na própria tabela) e a unidade do modo */
export function linhasDaLeitura(l: LeituraTabela, atual: CadastroAtual, origem: OrigemLinha): LinhaCadastro[] {
  const vistos: { id: string; nome: string }[] = []
  const valorDe = new Map(atual.acabamentos.map((a) => [a.id, a.valor]))
  return l.produtos.map((p, i) => {
    const duplicado = acharDuplicado(p.nome, atual.produtos) ?? acharDuplicado(p.nome, vistos)
    vistos.push({ id: `linha-${i}`, nome: p.nome })
    // Acabamento do cadastro com outro valor na tabela: vale o do cadastro, mas a pessoa fica sabendo
    const diferentes = p.acabamentos.flatMap((a) => {
      const doCadastro = a.id ? valorDe.get(a.id) : null
      return a.id && a.valor && doCadastro && Number(a.valor) !== Number(doCadastro) ? [`${a.nome}: na tabela ${formatarMoeda(a.valor)}, no cadastro ${formatarMoeda(doCadastro)} (vale o do cadastro)`] : []
    })
    return {
      chave: `${origem}-${i}`,
      nome: p.nome,
      tipo: p.tipo,
      categoriaId: p.categoriaId,
      categoriaNova: p.categoriaNova,
      modoCalculo: p.modoCalculo,
      unidadeSigla: SIGLA_DO_MODO[p.modoCalculo],
      precoVenda: p.precoVenda,
      larguraPadrao: p.larguraPadrao,
      alturaPadrao: p.alturaPadrao,
      larguraMaxima: p.larguraMaxima,
      alturaMaxima: p.alturaMaxima,
      prazoProducaoDias: p.prazoDias,
      precisaArte: p.precisaArte,
      // Acabamento do cadastro: o preço é o de lá (a tabela não muda o acabamento); novo, só o preço escrito
      acabamentos: p.acabamentos.map((a) => (a.id ? { ...a, valor: valorDe.get(a.id) ?? null } : a)),
      materiais: [],
      descricao: null,
      conferir: [...p.conferir, ...diferentes],
      duplicado: duplicado?.id.startsWith('linha-') ? { id: '', nome: `${duplicado.nome} (repetido na tabela)` } : duplicado,
      origem,
    }
  })
}

export function criarCadastroLote(app: FastifyInstance) {
  const { prisma } = app
  const empresa = criarAssistenteEmpresa(app)
  const custos = criarCustosService(app)

  /** Categorias, acabamentos e produtos que já existem (para ligar pelo nome e avisar o duplicado) */
  async function cadastroAtual(): Promise<CadastroAtual> {
    const [categorias, acabamentos, produtos] = await Promise.all([
      prisma.categoria.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
      prisma.acabamento.findMany({ where: { ativo: true }, select: { id: true, nome: true, tipoCobranca: true, valor: true }, orderBy: { nome: 'asc' } }),
      prisma.produto.findMany({ where: { ativo: true, tipo: { not: 'insumo' } }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    ])
    return { categorias, acabamentos: acabamentos.map((a) => ({ ...a, valor: a.valor.toString() })), produtos }
  }

  /** A IA lê a tabela (texto ou arquivo). Lança 422 com a explicação (desligado, limite, não é tabela). */
  async function ler(entrada: { texto: string } | { anexo: AnexoIA }, origem: OrigemLinha): Promise<LeituraCadastroLote> {
    const { assinanteId, recurso } = await empresa.exigir('produtos')
    const [atual, { grafica }, config] = await Promise.all([cadastroAtual(), montarCerebro(prisma), app.assistente.config()])
    const r = await app.assistente.executar({
      assinanteId,
      recurso,
      pedido: pedidoTabelaProdutos({
        grafica,
        texto: 'texto' in entrada ? entrada.texto : null,
        anexo: 'anexo' in entrada ? entrada.anexo : undefined,
        categorias: atual.categorias,
        acabamentos: atual.acabamentos,
      }),
      contar: (d) => d.produtos.length,
    })
    if (!r.ok) throw AppError.regraNegocio(mensagemSemResultado(r), { motivo: r.motivo })
    if (!r.dados.ehTabela) {
      throw AppError.regraNegocio(
        config.provedor === 'simulado' && 'anexo' in entrada
          ? 'Modo de demonstração do Assistente: o simulador não lê imagens. Cole a tabela como texto.'
          : 'Não achei produtos com nome nesse conteúdo. Cole a tabela (um produto por linha, com o preço) ou mande uma foto mais nítida.',
        { motivo: 'nao_e_tabela' },
      )
    }
    const avisos = r.dados.ignorados.length ? [`Fora da lista (não são produtos): ${r.dados.ignorados.slice(0, 5).join('; ')}`] : []
    return { linhas: linhasDaLeitura(r.dados, atual, origem), avisos }
  }

  return {
    cadastroAtual,

    /** Texto colado (ou a planilha já convertida em texto) */
    lerTexto: (texto: string, origem: 'texto' | 'planilha' | 'whatsapp' = 'texto') => ler({ texto }, origem),

    /** Arquivo: CSV vira texto (sem IA para ler); foto e PDF vão para a IA */
    async lerArquivo(arquivo: { nome: string; mediaType: string | null; conteudo: Buffer }, origem: OrigemLinha = 'foto'): Promise<LeituraCadastroLote> {
      if (arquivo.conteudo.length > MAX_ARQUIVO_TABELA_MB * 1024 * 1024) throw AppError.regraNegocio(`Arquivo grande demais (até ${MAX_ARQUIVO_TABELA_MB} MB).`)
      if (!arquivo.mediaType && /\.(csv|txt)$/i.test(arquivo.nome)) {
        const texto = textoDaPlanilha(linhasDoCsv(arquivo.conteudo.toString('utf8')))
        if (texto.length < 3) throw AppError.regraNegocio('A planilha está vazia.')
        return ler({ texto: texto.slice(0, 12_000) }, 'planilha')
      }
      if (/\.(xlsx|xls|ods)$/i.test(arquivo.nome)) throw AppError.regraNegocio('Salve a planilha como CSV (Arquivo → Salvar como → CSV) e mande de novo, ou cole as linhas aqui.')
      if (!arquivo.mediaType || !(TIPOS_ARQUIVO_TABELA as readonly string[]).includes(arquivo.mediaType)) {
        throw AppError.regraNegocio('Mande a foto (JPG, PNG), o PDF ou a planilha em CSV da tabela de preços.')
      }
      return ler({ anexo: { mediaType: arquivo.mediaType as AnexoIA['mediaType'], dados: arquivo.conteudo.toString('base64'), nome: arquivo.nome } }, origem)
    },

    /**
     * "Criar N produtos": tudo numa transação (um erro desfaz tudo), com auditoria de cada produto, categoria e
     * acabamento novo. Nome parecido com um produto do cadastro só passa com `permitirDuplicado` (a pessoa viu o aviso).
     * `depois`: dentro da mesma transação (ex.: marcar a leitura do WhatsApp como criada).
     */
    async criar(dados: Lote, usuarioId: string, depois?: (tx: Prisma.TransactionClient, ids: string[]) => Promise<void>): Promise<ResultadoCadastroLote> {
      const atual = await cadastroAtual()
      const repetidos = dados.itens.filter((i) => !i.permitirDuplicado && acharDuplicado(i.nome, atual.produtos))
      if (repetidos.length) {
        throw AppError.regraNegocio(
          `Já existe produto com nome parecido: ${repetidos
            .slice(0, 3)
            .map((i) => `${i.nome} (${acharDuplicado(i.nome, atual.produtos)!.nome})`)
            .join('; ')}. Desmarque ou confirme o "criar mesmo assim".`,
          { motivo: 'duplicado', nomes: repetidos.map((i) => i.nome) },
        )
      }
      const insumoIds = [...new Set(dados.itens.flatMap((i) => i.materiais.map((m) => m.insumoId)))]
      if (insumoIds.length && (await prisma.produto.count({ where: { id: { in: insumoIds }, ativo: true, tipo: { in: ['insumo', 'revenda'] } } })) !== insumoIds.length) {
        throw AppError.regraNegocio('Algum material não é um insumo ativo: confira a composição.')
      }
      const categoriaIds = [...new Set(dados.itens.flatMap((i) => (i.categoriaId ? [i.categoriaId] : [])))]
      if (categoriaIds.some((id) => !atual.categorias.some((c) => c.id === id))) throw AppError.regraNegocio('Categoria inválida ou desativada.')
      const unidades = await prisma.unidadeMedida.findMany({ where: { ativo: true }, select: { id: true, sigla: true } })

      const resultado = await prisma.$transaction(
        async (tx) => {
          // Os novos, pelo nome em minúsculas (um só por nome no lote)
          const categoriasNovas = new Map<string, { id: string; nome: string }>()
          const acabamentosNovos = new Map<string, { id: string; nome: string }>()
          const criados: ResultadoCadastroLote['criados'] = []
          const comMateriais: string[] = []

          /** Categoria pelo nome (a do cadastro com o mesmo nome, senão criada uma vez só) */
          async function categoria(nome: string) {
            const chave = nome.trim().toLocaleLowerCase('pt-BR')
            const existente = atual.categorias.find((c) => c.nome.toLocaleLowerCase('pt-BR') === chave)
            if (existente) return existente.id
            if (!categoriasNovas.has(chave)) {
              const c = await tx.categoria.create({ data: { nome: nome.trim(), createdBy: usuarioId } })
              await registrarAuditoria(tx, { tabela: 'categorias', registroId: c.id, acao: 'criar', depois: { ...c, via: 'cadastro em lote' }, usuarioId })
              categoriasNovas.set(chave, { id: c.id, nome: c.nome })
            }
            return categoriasNovas.get(chave)!.id
          }

          /** Acabamento novo (com o preço digitado): o do cadastro com o mesmo nome, senão criado uma vez só */
          async function acabamento(a: Lote['itens'][number]['acabamentos'][number]) {
            if (a.id) return a.id
            const existente = acabamentoPeloNome(a.nome, atual.acabamentos)
            if (existente) return existente.id
            if (!a.valor) return null
            const chave = a.nome.toLocaleLowerCase('pt-BR')
            if (!acabamentosNovos.has(chave)) {
              const novo = await tx.acabamento.create({ data: { nome: a.nome, tipoCobranca: a.tipoCobranca, valor: a.valor, createdBy: usuarioId } })
              await registrarAuditoria(tx, { tabela: 'acabamentos', registroId: novo.id, acao: 'criar', depois: { ...novo, via: 'cadastro em lote' }, usuarioId })
              acabamentosNovos.set(chave, { id: novo.id, nome: novo.nome })
            }
            return acabamentosNovos.get(chave)!.id
          }

          for (const item of dados.itens) {
            // permitirDuplicado já foi conferido acima: não é campo do produto
            const { categoriaNova, unidadeSigla, acabamentos, materiais, permitirDuplicado, ...campos } = item
            void permitirDuplicado
            const categoriaId = campos.categoriaId ?? (categoriaNova ? await categoria(categoriaNova) : null)
            const sigla = unidadeSigla ?? SIGLA_DO_MODO[campos.modoCalculo]
            const unidadeMedidaId = campos.unidadeMedidaId ?? unidades.find((u) => u.sigla === sigla)?.id ?? null
            const codigo = campos.codigo ?? (await gerarCodigoProduto(tx))
            const p = await tx.produto.create({
              data: {
                ...campos,
                codigo,
                categoriaId,
                unidadeMedidaId,
                // Com materiais, o custo sai da composição (recalculado abaixo); sem, fica o simples (custo 0 até a pessoa dizer)
                modoCusto: materiais.length ? 'composicao' : (campos.modoCusto ?? 'simples'),
                precisaArte: campos.precisaArte ?? false,
                createdBy: usuarioId,
              },
            })
            const acabIds = [...new Set((await Promise.all(acabamentos.map(acabamento))).filter((id): id is string => Boolean(id)))]
            if (acabIds.length) {
              await tx.produtoAcabamento.createMany({
                data: acabIds.map((acabamentoId) => ({ produtoId: p.id, acabamentoId, padrao: acabamentos.some((a) => a.padrao && (a.id === acabamentoId || acabamentosNovos.get(a.nome.toLocaleLowerCase('pt-BR'))?.id === acabamentoId)) })),
              })
            }
            if (materiais.length) {
              await tx.produtoInsumo.createMany({ data: materiais.map((m) => ({ produtoId: p.id, insumoId: m.insumoId, quantidade: m.quantidade, base: m.base, perdaPercentual: m.perdaPercentual })) })
              comMateriais.push(p.id)
            }
            await registrarAuditoria(tx, { tabela: 'produtos', registroId: p.id, acao: 'criar', depois: { ...p, via: 'cadastro em lote', acabamentos: acabIds, materiais }, usuarioId })
            criados.push({ id: p.id, codigo: p.codigo, nome: p.nome })
          }
          if (comMateriais.length) await custos.recalcularCustos(comMateriais, { db: tx })
          await depois?.(tx, criados.map((c) => c.id))
          return { criados, categoriasNovas: [...categoriasNovas.values()].map((c) => c.nome), acabamentosNovos: [...acabamentosNovos.values()].map((a) => a.nome) }
        },
        { timeout: 60_000 },
      )
      return resultado
    },
  }
}

export type CadastroLote = ReturnType<typeof criarCadastroLote>
