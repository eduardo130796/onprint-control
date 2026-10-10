import type { Prisma, VitrineConfig as VitrineConfigBanco } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  MAX_BANNERS_VITRINE,
  MAX_IMAGENS_PRODUTO,
  type ImagemProdutoVitrine,
  type ModoCalculo,
  type ModoPrecoVitrine,
  type ProdutoVitrineResumo,
  type VitrineConfig,
  type produtoVitrineSchema,
  type produtosVitrineQuerySchema,
  type vitrineConfigSchema,
  MAX_CATALOGOS_VITRINE,
  type CatalogoPublicado,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { comConflitoAmigavel } from '../../core/prisma-erros'
import type { ArquivosService } from '../arquivos/service'
import { sincronizarCapa } from './galeria'
import { EXTENSOES_FOTO, urlMiniaturaLogada } from './imagens'
import { criarDominioVitrine } from './dominio'
import { normalizarSlug, slugLivre, urlDaVitrine, urlPublicaVitrine } from './regras'

type DadosConfig = z.output<typeof vitrineConfigSchema>
type DadosProduto = z.output<typeof produtoVitrineSchema>
type QueryProdutos = z.output<typeof produtosVitrineQuerySchema>

/** Produtos que podem ir para a vitrine (insumo não é vendido no site) */
export const TIPOS_VITRINE = ['produto', 'servico', 'revenda'] as const

/** Configuração ainda não salva: vitrine desligada, contatos visíveis */
const CONFIG_PADRAO: Omit<VitrineConfigBanco, 'id' | 'createdAt' | 'updatedAt'> = {
  ativa: false,
  titulo: null,
  slogan: null,
  sobre: null,
  horario: null,
  instagram: null,
  facebook: null,
  tiktok: null,
  youtube: null,
  mostrarEndereco: true,
  mostrarTelefone: true,
  mostrarWhatsapp: true,
  mensagemWhatsapp: null,
  mensagemPedidoEnviado: null,
  seoDescricao: null,
  banners: [],
}

/** Configuração da vitrine (linha única; padrão enquanto não for salva) */
export async function lerConfigVitrine(prisma: Prisma.TransactionClient) {
  return (await prisma.vitrineConfig.findFirst({ orderBy: { createdAt: 'asc' } })) ?? { id: null, ...CONFIG_PADRAO }
}

/** O plano da empresa do contexto inclui a vitrine (empresa sem assinatura = sem limite de módulos) */
export function vitrineNoPlano() {
  const assinatura = contextoEmpresa.exigir().assinatura
  return !assinatura || assinatura.modulos.includes('vitrine')
}

const incluirProduto = {
  categoria: { select: { id: true, nome: true } },
  imagens: { orderBy: { ordem: 'asc' }, select: { id: true, arquivoId: true, ordem: true } },
} satisfies Prisma.ProdutoInclude

type ProdutoComImagens = Prisma.ProdutoGetPayload<{ include: typeof incluirProduto }>

/** Vitrine → Configurar vitrine e Vitrine → Produtos (área logada). Nunca devolve custo. */
export function criarVitrineService(app: FastifyInstance, arquivos: ArquivosService) {
  const { prisma, storage } = app

  const imagem = (i: { id: string; arquivoId: string; ordem: number }): ImagemProdutoVitrine => ({
    id: i.id,
    arquivoId: i.arquivoId,
    ordem: i.ordem,
    url: urlMiniaturaLogada(storage, i.arquivoId),
  })

  function resumo(p: ProdutoComImagens): ProdutoVitrineResumo {
    return {
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      categoria: p.categoria,
      modoCalculo: p.modoCalculo as ModoCalculo,
      precoVenda: p.precoVenda.toFixed(2),
      ativo: p.ativo,
      publicado: p.vitrinePublicado,
      destaque: p.vitrineDestaque,
      nomePublico: p.vitrineNome,
      descricaoPublica: p.vitrineDescricao,
      modoPreco: p.vitrineModoPreco as ModoPrecoVitrine,
      slug: p.vitrineSlug,
      ordem: p.vitrineOrdem,
      imagens: p.imagens.map(imagem),
    }
  }

  const dominios = criarDominioVitrine(app)

  async function montarConfig(): Promise<VitrineConfig> {
    const { banners, ...c } = await lerConfigVitrine(prisma)
    const [produtosPublicados, dominio] = await Promise.all([
      prisma.produto.count({ where: { vitrinePublicado: true, ativo: true, tipo: { in: [...TIPOS_VITRINE] } } }),
      dominios.info(),
    ])
    return {
      ativa: c.ativa,
      titulo: c.titulo,
      slogan: c.slogan,
      sobre: c.sobre,
      horario: c.horario,
      instagram: c.instagram,
      facebook: c.facebook,
      tiktok: c.tiktok,
      youtube: c.youtube,
      mostrarEndereco: c.mostrarEndereco,
      mostrarTelefone: c.mostrarTelefone,
      mostrarWhatsapp: c.mostrarWhatsapp,
      mensagemWhatsapp: c.mensagemWhatsapp,
      mensagemPedidoEnviado: c.mensagemPedidoEnviado,
      seoDescricao: c.seoDescricao,
      banners: banners.map((arquivoId) => ({ arquivoId, url: urlMiniaturaLogada(storage, arquivoId) })),
      // Lido agora (e não do contexto em cache): logo depois de verificar, os links já usam o domínio próprio
      urlPublica: dominio.endereco && dominio.verificadoEm ? `https://${dominio.endereco}` : urlPublicaVitrine(contextoEmpresa.exigir().slug, app.config),
      dominio,
      liberadaNoPlano: vitrineNoPlano(),
      produtosPublicados,
    }
  }

  /** Grava a configuração (cria a linha na primeira vez) */
  async function salvarConfig(tx: Prisma.TransactionClient, dados: Partial<Omit<VitrineConfigBanco, 'id' | 'createdAt' | 'updatedAt'>>) {
    const atual = await tx.vitrineConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
    return atual ? tx.vitrineConfig.update({ where: { id: atual.id }, data: dados }) : tx.vitrineConfig.create({ data: { ...CONFIG_PADRAO, ...dados } })
  }

  async function produtoDaVitrine(id: string) {
    const p = await prisma.produto.findUnique({ where: { id }, include: incluirProduto })
    if (!p) throw AppError.naoEncontrado('Produto não encontrado.')
    return p
  }

  async function galeria(produtoId: string) {
    const imagens = await prisma.produtoImagem.findMany({ where: { produtoId }, orderBy: { ordem: 'asc' }, select: { id: true, arquivoId: true, ordem: true } })
    return imagens.map(imagem)
  }

  return {
    obterConfig: montarConfig,

    async atualizarConfig(dados: DadosConfig, usuarioId: string) {
      const antes = await lerConfigVitrine(prisma)
      await prisma.$transaction(async (tx) => {
        const c = await salvarConfig(tx, {
          ...dados,
          titulo: dados.titulo ?? null,
          slogan: dados.slogan ?? null,
          sobre: dados.sobre ?? null,
          horario: dados.horario ?? null,
          instagram: dados.instagram ?? null,
          facebook: dados.facebook ?? null,
          tiktok: dados.tiktok ?? null,
          youtube: dados.youtube ?? null,
          mensagemWhatsapp: dados.mensagemWhatsapp ?? null,
          mensagemPedidoEnviado: dados.mensagemPedidoEnviado ?? null,
          seoDescricao: dados.seoDescricao ?? null,
        })
        await registrarAuditoria(tx, { tabela: 'vitrine_config', registroId: c.id, acao: 'editar', antes, depois: c, usuarioId })
      })
      return montarConfig()
    },

    async enviarBanner(request: FastifyRequest, usuarioId: string) {
      if ((await lerConfigVitrine(prisma)).banners.length >= MAX_BANNERS_VITRINE) {
        throw AppError.regraNegocio(`O banner tem no máximo ${MAX_BANNERS_VITRINE} imagens. Remova uma para enviar outra.`)
      }
      const arquivo = await arquivos.receberUpload(request, { entidade: 'empresa', entidadeId: null, categoria: 'banner_vitrine', extensoes: EXTENSOES_FOTO }, usuarioId)
      await prisma.$transaction(async (tx) => {
        const { banners } = await lerConfigVitrine(tx)
        await salvarConfig(tx, { banners: [...banners, arquivo.id].slice(-MAX_BANNERS_VITRINE) })
      })
      return montarConfig()
    },

    /**
     * Guarda o PDF do catálogo gerado no navegador para mandar por link (o WhatsApp não anexa arquivo por link).
     * Mantém só os MAX_CATALOGOS_VITRINE mais recentes.
     */
    async publicarCatalogo(request: FastifyRequest, usuarioId: string): Promise<CatalogoPublicado> {
      const arquivo = await arquivos.receberUpload(request, { entidade: 'empresa', entidadeId: null, categoria: 'catalogo_vitrine', extensoes: ['pdf'] }, usuarioId)
      const antigos = await prisma.arquivo.findMany({
        where: { categoria: 'catalogo_vitrine' },
        orderBy: { createdAt: 'desc' },
        skip: MAX_CATALOGOS_VITRINE,
        select: { id: true },
      })
      for (const a of antigos) await arquivos.remover(a.id, usuarioId).catch(() => undefined)
      return { id: arquivo.id, url: `${urlDaVitrine(contextoEmpresa.exigir(), app.config)}/catalogo/${arquivo.id}` }
    },

    async removerBanner(arquivoId: string, usuarioId: string) {
      const { banners } = await lerConfigVitrine(prisma)
      if (!banners.includes(arquivoId)) throw AppError.naoEncontrado('Imagem do banner não encontrada.')
      await prisma.$transaction((tx) => salvarConfig(tx, { banners: banners.filter((b) => b !== arquivoId) }))
      await arquivos.remover(arquivoId, usuarioId)
      return montarConfig()
    },

    async ordenarBanners(ids: string[]) {
      const { banners } = await lerConfigVitrine(prisma)
      if (ids.length !== banners.length || new Set(ids).size !== ids.length || ids.some((id) => !banners.includes(id))) {
        throw AppError.regraNegocio('Envie todas as imagens do banner, cada uma uma vez.')
      }
      await prisma.$transaction((tx) => salvarConfig(tx, { banners: ids }))
      return montarConfig()
    },

    async listarProdutos(q: QueryProdutos): Promise<ProdutoVitrineResumo[]> {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const produtos = await prisma.produto.findMany({
        where: {
          ativo: true,
          tipo: { in: [...TIPOS_VITRINE] },
          ...(q.categoriaId ? { categoriaId: q.categoriaId } : {}),
          ...(q.publicado ? { vitrinePublicado: q.publicado === 'true' } : {}),
          ...(texto ? { OR: [{ nome: texto }, { codigo: texto }, { vitrineNome: texto }] } : {}),
        },
        orderBy: [{ vitrinePublicado: 'desc' }, { vitrineOrdem: 'asc' }, { nome: 'asc' }],
        include: incluirProduto,
      })
      return produtos.map(resumo)
    },

    /** Publica/edita o produto na vitrine. Slug vazio = gerado do nome (único, com -2, -3…); repetido à mão = 409. */
    async atualizarProduto(id: string, dados: DadosProduto, usuarioId: string): Promise<ProdutoVitrineResumo> {
      const antes = await produtoDaVitrine(id)
      if (!(TIPOS_VITRINE as readonly string[]).includes(antes.tipo)) throw AppError.regraNegocio('Insumos não aparecem na vitrine.')
      if (dados.publicado && !antes.ativo) throw AppError.regraNegocio('Reative o produto antes de publicá-lo na vitrine.')

      let slug = dados.slug ?? null
      if (slug) {
        const dono = await prisma.produto.findFirst({ where: { vitrineSlug: slug, id: { not: id } }, select: { nome: true } })
        if (dono) throw AppError.conflito(`O endereço "${slug}" já é usado pelo produto "${dono.nome}". Escolha outro.`, { campo: 'slug' })
      } else {
        const base = normalizarSlug(dados.nomePublico || antes.nome) || 'produto'
        const ocupados = await prisma.produto.findMany({ where: { vitrineSlug: { startsWith: base }, id: { not: id } }, select: { vitrineSlug: true } })
        slug = slugLivre(base, new Set(ocupados.map((o) => o.vitrineSlug as string)))
      }

      await comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const p = await tx.produto.update({
              where: { id },
              data: {
                vitrinePublicado: dados.publicado,
                vitrineDestaque: dados.destaque,
                vitrineNome: dados.nomePublico ?? null,
                vitrineDescricao: dados.descricaoPublica ?? null,
                vitrineModoPreco: dados.modoPreco,
                vitrineSlug: slug,
                vitrineOrdem: dados.ordem,
              },
            })
            await registrarAuditoria(tx, { tabela: 'produtos', registroId: id, acao: 'editar', antes: { vitrine: dadosVitrine(antes) }, depois: { vitrine: dadosVitrine(p) }, usuarioId })
          }),
        { vitrine_slug: 'Este endereço acabou de ser usado por outro produto. Escolha outro.' },
      )
      return resumo(await produtoDaVitrine(id))
    },

    // ─── Galeria ───────────────────────────────────────────────────────────

    galeria,

    async enviarImagem(request: FastifyRequest, produtoId: string, usuarioId: string) {
      await produtoDaVitrine(produtoId)
      if ((await prisma.produtoImagem.count({ where: { produtoId } })) >= MAX_IMAGENS_PRODUTO) {
        throw AppError.regraNegocio(`O produto tem no máximo ${MAX_IMAGENS_PRODUTO} imagens. Remova uma para enviar outra.`)
      }
      const arquivo = await arquivos.receberUpload(request, { entidade: 'produto', entidadeId: produtoId, categoria: 'imagem_produto', extensoes: EXTENSOES_FOTO }, usuarioId)
      await prisma.$transaction(async (tx) => {
        const ultima = await tx.produtoImagem.aggregate({ where: { produtoId }, _max: { ordem: true } })
        await tx.produtoImagem.create({ data: { produtoId, arquivoId: arquivo.id, ordem: (ultima._max.ordem ?? -1) + 1 } })
        await sincronizarCapa(tx, produtoId)
      })
      return galeria(produtoId)
    },

    async removerImagem(produtoId: string, imagemId: string, usuarioId: string) {
      const img = await prisma.produtoImagem.findFirst({ where: { id: imagemId, produtoId } })
      if (!img) throw AppError.naoEncontrado('Imagem não encontrada.')
      // Apagar o arquivo apaga a linha da galeria (cascata); a capa passa para a próxima
      await arquivos.remover(img.arquivoId, usuarioId)
      await prisma.$transaction((tx) => sincronizarCapa(tx, produtoId))
      return galeria(produtoId)
    },

    async ordenarImagens(produtoId: string, ids: string[]) {
      const atuais = await prisma.produtoImagem.findMany({ where: { produtoId }, select: { id: true } })
      const conjunto = new Set(atuais.map((a) => a.id))
      if (ids.length !== atuais.length || new Set(ids).size !== ids.length || ids.some((id) => !conjunto.has(id))) {
        throw AppError.regraNegocio('Envie todas as imagens do produto, cada uma uma vez.')
      }
      await prisma.$transaction(async (tx) => {
        for (const [ordem, id] of ids.entries()) await tx.produtoImagem.update({ where: { id }, data: { ordem } })
        await sincronizarCapa(tx, produtoId)
      })
      return galeria(produtoId)
    },
  }
}

/** Só os campos da vitrine, para a auditoria */
function dadosVitrine(p: { vitrinePublicado: boolean; vitrineDestaque: boolean; vitrineNome: string | null; vitrineModoPreco: string; vitrineSlug: string | null; vitrineOrdem: number }) {
  return { publicado: p.vitrinePublicado, destaque: p.vitrineDestaque, nome: p.vitrineNome, modoPreco: p.vitrineModoPreco, slug: p.vitrineSlug, ordem: p.vitrineOrdem }
}

export type VitrineService = ReturnType<typeof criarVitrineService>
