import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import type {
  AcabamentoVitrine,
  ModoCalculo,
  Paginado,
  PedidoVitrineEnviado,
  ProdutoCardVitrine,
  ProdutoVitrine,
  VitrinePublica,
  pedidoVitrineSchema,
  produtosPublicosQuerySchema,
} from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { proximoNumero } from '../../core/numeracao'
import { emailPedidoRecebido } from '../../integrations/email/modelos'
import { paginado } from '../../core/paginacao'
import { obterImagem, urlImagemPublica } from './imagens'
import { caminhoDaPagina, resumir, textoPrazoOg, textoPrecoOg, type DadosOg, type PaginaOg } from './og'
import { MODOS_COM_MEDIDAS, linkWhatsappLoja, montarDescricaoSolicitacao, precoExibido, textoMedidas, urlDaVitrine } from './regras'
import { TIPOS_VITRINE, lerConfigVitrine } from './vitrine.service'

type QueryProdutos = z.output<typeof produtosPublicosQuerySchema>
type DadosPedido = z.output<typeof pedidoVitrineSchema>

const MENSAGEM_ENVIADO = 'Recebemos sua lista! Em breve entraremos em contato com o orçamento.'

/** Produto visível no site: publicado, ativo, vendável e com endereço */
const PUBLICADO = { vitrinePublicado: true, ativo: true, tipo: { in: [...TIPOS_VITRINE] }, vitrineSlug: { not: null } } satisfies Prisma.ProdutoWhereInput

const incluirCard = {
  categoria: { select: { id: true, nome: true } },
  imagens: { orderBy: { ordem: 'asc' }, select: { arquivoId: true } },
} satisfies Prisma.ProdutoInclude

type ProdutoCard = Prisma.ProdutoGetPayload<{ include: typeof incluirCard }>

const ORDEM_VITRINE = [{ vitrineOrdem: 'asc' }, { nome: 'asc' }] satisfies Prisma.ProdutoOrderByWithRelationInput[]

/** "Rua X, 120 - Sala 2 - Centro - Cidade/UF" */
function enderecoEmLinha(e: { logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null }) {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ')
  const cidade = [e.cidade, e.uf].filter(Boolean).join('/')
  return [rua, e.complemento, e.bairro, cidade].filter(Boolean).join(' - ') || null
}

/**
 * Site público da gráfica (sem login). A empresa, o plano e a vitrine ativa já foram conferidos no
 * hook das rotas. Só sai o que o visitante pode ver: nada de custo, margem ou dados internos.
 */
export function criarVitrinePublicaService(app: FastifyInstance) {
  const { prisma } = app
  const slugEmpresa = () => contextoEmpresa.exigir().slug

  function card(p: ProdutoCard): ProdutoCardVitrine {
    const capa = p.imagens[0]?.arquivoId
    return {
      slug: p.vitrineSlug as string,
      nome: p.vitrineNome || p.nome,
      categoria: p.categoria,
      capaUrl: capa ? urlImagemPublica(slugEmpresa(), capa, '480') : null,
      preco: precoExibido({ vitrineModoPreco: p.vitrineModoPreco, precoVenda: p.precoVenda, modoCalculo: p.modoCalculo as ModoCalculo }),
      prazoDias: p.prazoProducaoDias,
      destaque: p.vitrineDestaque,
    }
  }

  return {
    async inicio(): Promise<VitrinePublica> {
      const slug = slugEmpresa()
      const [config, empresa, destaques, porCategoria] = await Promise.all([
        lerConfigVitrine(prisma),
        prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } }),
        prisma.produto.findMany({ where: { ...PUBLICADO, vitrineDestaque: true }, orderBy: ORDEM_VITRINE, take: 12, include: incluirCard }),
        prisma.produto.groupBy({ by: ['categoriaId'], where: { ...PUBLICADO, categoriaId: { not: null } }, _count: { _all: true } }),
      ])
      const categorias = await prisma.categoria.findMany({
        where: { id: { in: porCategoria.map((c) => c.categoriaId as string) }, ativo: true },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      const quantidade = new Map(porCategoria.map((c) => [c.categoriaId, c._count._all]))
      const nome = empresa?.nomeFantasia || empresa?.razaoSocial || contextoEmpresa.exigir().nome
      return {
        slug,
        empresa: {
          nome,
          titulo: config.titulo || nome,
          slogan: config.slogan,
          sobre: config.sobre,
          horario: config.horario,
          logoUrl: empresa?.logoArquivoId ? urlImagemPublica(slug, empresa.logoArquivoId, '480') : null,
          corTema: empresa?.corTema ?? null,
          whatsapp: config.mostrarWhatsapp ? (empresa?.whatsapp ?? null) : null,
          telefone: config.mostrarTelefone ? (empresa?.telefone ?? null) : null,
          email: empresa?.email ?? null,
          endereco: config.mostrarEndereco && empresa ? enderecoEmLinha(empresa) : null,
          redes: { instagram: config.instagram, facebook: config.facebook, tiktok: config.tiktok, youtube: config.youtube },
          mensagemWhatsapp: config.mensagemWhatsapp,
          mensagemPedidoEnviado: config.mensagemPedidoEnviado,
          seoDescricao: config.seoDescricao,
        },
        banners: config.banners.map((id) => urlImagemPublica(slug, id, '1200')),
        categorias: categorias.map((c) => ({ ...c, quantidade: quantidade.get(c.id) ?? 0 })),
        destaques: destaques.map(card),
      }
    },

    async listar(q: QueryProdutos): Promise<Paginado<ProdutoCardVitrine>> {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.ProdutoWhereInput = {
        ...PUBLICADO,
        ...(q.categoriaId ? { categoriaId: q.categoriaId } : {}),
        ...(texto ? { OR: [{ vitrineNome: texto }, { nome: texto }, { vitrineDescricao: texto }] } : {}),
      }
      const [total, data] = await prisma.$transaction([
        prisma.produto.count({ where }),
        prisma.produto.findMany({ where, orderBy: ORDEM_VITRINE, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: incluirCard }),
      ])
      return paginado(data.map(card), total, q)
    },

    async obter(slugProduto: string): Promise<ProdutoVitrine> {
      const p = await prisma.produto.findFirst({
        where: { ...PUBLICADO, vitrineSlug: slugProduto },
        include: { ...incluirCard, acabamentos: { where: { acabamento: { ativo: true } }, include: { acabamento: true }, orderBy: { createdAt: 'asc' } } },
      })
      if (!p) throw AppError.naoEncontrado('Produto não encontrado.')
      const modo = p.modoCalculo as ModoCalculo
      const dec = (v: Prisma.Decimal | null) => v?.toString() ?? null
      return {
        ...card(p),
        descricao: p.vitrineDescricao,
        imagens: p.imagens.map((i) => urlImagemPublica(slugEmpresa(), i.arquivoId, '1200')),
        modoCalculo: modo,
        medidas: MODOS_COM_MEDIDAS.includes(modo)
          ? { larguraPadrao: dec(p.larguraPadrao), alturaPadrao: dec(p.alturaPadrao), larguraMaxima: dec(p.larguraMaxima), alturaMaxima: dec(p.alturaMaxima) }
          : null,
        acabamentos: p.acabamentos.map(
          (pa): AcabamentoVitrine => ({ id: pa.acabamento.id, nome: pa.acabamento.nome, descricao: pa.acabamento.descricao, obrigatorio: pa.obrigatorio, padrao: pa.padrao || pa.obrigatorio }),
        ),
      }
    },

    /**
     * Prévia do link (Open Graph) da página: início (título + slogan; 1º banner, senão logo), produto (nome, preço
     * exibido e prazo; capa) ou categoria (nome e quantidade). Produto ou categoria que não está no site → início.
     * A imagem JPEG de 1200 px é gerada aqui (fica no cache): o leitor de link pede logo em seguida.
     */
    async previaLink(pagina: PaginaOg, origem: string): Promise<DadosOg> {
      const slug = slugEmpresa()
      const [config, empresa] = await Promise.all([
        lerConfigVitrine(prisma),
        prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { nomeFantasia: true, razaoSocial: true, logoArquivoId: true } }),
      ])
      const site = config.titulo || empresa?.nomeFantasia || empresa?.razaoSocial || contextoEmpresa.exigir().nome
      const imagemInicio = config.banners[0] ?? empresa?.logoArquivoId ?? null
      let alvo = { pagina: { tipo: 'inicio' } as PaginaOg, titulo: site, tituloAba: site, descricao: config.slogan || config.seoDescricao, imagemId: imagemInicio }

      if (pagina.tipo === 'produto') {
        const p = await prisma.produto.findFirst({
          where: { ...PUBLICADO, vitrineSlug: pagina.slug },
          select: { nome: true, vitrineNome: true, vitrineDescricao: true, vitrineModoPreco: true, precoVenda: true, modoCalculo: true, prazoProducaoDias: true, imagens: { orderBy: { ordem: 'asc' }, take: 1, select: { arquivoId: true } } },
        })
        if (p) {
          const nome = p.vitrineNome || p.nome
          const preco = textoPrecoOg(precoExibido({ vitrineModoPreco: p.vitrineModoPreco, precoVenda: p.precoVenda, modoCalculo: p.modoCalculo as ModoCalculo }))
          const linha = [preco, textoPrazoOg(p.prazoProducaoDias)].filter(Boolean).join(' · ')
          const texto = p.vitrineDescricao ? resumir(p.vitrineDescricao, 400) : null
          alvo = { pagina, titulo: nome, tituloAba: `${nome} | ${site}`, descricao: texto ? `${linha} — ${texto}` : linha, imagemId: p.imagens[0]?.arquivoId ?? imagemInicio }
        }
      } else if (pagina.tipo === 'categoria') {
        const noSite = { ...PUBLICADO, categoriaId: pagina.id }
        const [categoria, quantidade, capa] = await Promise.all([
          prisma.categoria.findFirst({ where: { id: pagina.id, ativo: true }, select: { nome: true } }),
          prisma.produto.count({ where: noSite }),
          prisma.produtoImagem.findFirst({ where: { produto: noSite }, orderBy: [{ produto: { vitrineOrdem: 'asc' } }, { ordem: 'asc' }], select: { arquivoId: true } }),
        ])
        if (categoria && quantidade) {
          const descricao = `${quantidade} ${quantidade === 1 ? 'produto' : 'produtos'} · ${site}`
          alvo = { pagina, titulo: categoria.nome, tituloAba: `${categoria.nome} | ${site}`, descricao, imagemId: capa?.arquivoId ?? imagemInicio }
        }
      }

      let imagem: DadosOg['imagem'] = null
      if (alvo.imagemId) {
        imagem = { url: `${origem}${urlImagemPublica(slug, alvo.imagemId, '1200')}&f=jpg`, largura: null, altura: null }
        // Tamanho real da imagem (og:image:width/height); sem ele a prévia sai do mesmo jeito
        const arquivo = await prisma.arquivo.findUnique({ where: { id: alvo.imagemId }, select: { caminho: true } })
        const jpg = arquivo ? await obterImagem(app.storage, arquivo.caminho, '1200', 'jpg') : null
        if (jpg) {
          const { width, height } = await sharp(jpg).metadata().catch(() => ({ width: undefined, height: undefined }))
          imagem = { ...imagem, largura: width ?? null, altura: height ?? null }
        }
      }
      return { titulo: alvo.titulo, tituloAba: alvo.tituloAba, descricao: alvo.descricao, url: `${origem}${caminhoDaPagina(alvo.pagina)}`, siteNome: site, imagem }
    },

    /** Arquivo que o site pode mostrar: banner, logo ou imagem de produto publicado (null = não pode) */
    async arquivoPublico(arquivoId: string) {
      const [config, empresa] = await Promise.all([lerConfigVitrine(prisma), prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { logoArquivoId: true } })])
      const liberado =
        config.banners.includes(arquivoId) ||
        empresa?.logoArquivoId === arquivoId ||
        Boolean(await prisma.produtoImagem.findFirst({ where: { arquivoId, produto: PUBLICADO }, select: { id: true } }))
      return liberado ? prisma.arquivo.findUnique({ where: { id: arquivoId }, select: { caminho: true } }) : null
    },

    /**
     * Lista de orçamento do visitante → Solicitação "nova" (origem site) com os itens, cliente achado pelo
     * WhatsApp ou pré-cadastrado, e aviso no sino de quem atende orçamentos.
     */
    async enviarPedido(dados: DadosPedido, ip: string): Promise<PedidoVitrineEnviado> {
      const config = await lerConfigVitrine(prisma)
      const mensagem = config.mensagemPedidoEnviado || MENSAGEM_ENVIADO
      // Campo-isca preenchido: robô. Responde como se tivesse dado certo e não grava nada.
      if (dados.site?.trim()) return { numero: '', mensagem }

      const slugs = [...new Set(dados.itens.map((i) => i.produtoSlug))]
      const produtos = await prisma.produto.findMany({
        where: { ...PUBLICADO, vitrineSlug: { in: slugs } },
        include: { acabamentos: { where: { acabamento: { ativo: true } }, include: { acabamento: { select: { id: true, nome: true } } } } },
      })
      const porSlug = new Map(produtos.map((p) => [p.vitrineSlug as string, p]))

      const itens = dados.itens.map((item, ordem) => {
        const p = porSlug.get(item.produtoSlug)
        if (!p) throw AppError.regraNegocio('Um dos produtos da lista não está mais disponível. Remova-o e envie de novo.', { produtoSlug: item.produtoSlug })
        const nome = p.vitrineNome || p.nome
        const comMedidas = MODOS_COM_MEDIDAS.includes(p.modoCalculo as ModoCalculo)
        const largura = comMedidas ? (item.largura ?? null) : null
        const altura = comMedidas ? (item.altura ?? null) : null
        if (p.modoCalculo === 'm2' && (!largura || !altura)) throw AppError.regraNegocio(`Informe a largura e a altura de "${nome}".`)
        if (p.modoCalculo === 'metro_linear' && !largura && !altura) throw AppError.regraNegocio(`Informe a medida de "${nome}".`)
        if (largura && p.larguraMaxima && Number(largura) > Number(p.larguraMaxima)) throw AppError.regraNegocio(`A largura máxima de "${nome}" é ${p.larguraMaxima.toString().replace('.', ',')} m.`)
        if (altura && p.alturaMaxima && Number(altura) > Number(p.alturaMaxima)) throw AppError.regraNegocio(`A altura máxima de "${nome}" é ${p.alturaMaxima.toString().replace('.', ',')} m.`)
        // Só acabamentos do produto; os obrigatórios entram mesmo sem marcar
        const escolhidos = new Set(item.acabamentoIds)
        const acabamentos = p.acabamentos.filter((pa) => pa.obrigatorio || escolhidos.has(pa.acabamentoId)).map((pa) => ({ id: pa.acabamento.id, nome: pa.acabamento.nome }))
        return { produtoId: p.id, descricao: nome, quantidade: item.quantidade, largura, altura, acabamentos, observacao: item.observacao ?? null, ordem }
      })

      const whatsapp = dados.whatsapp as string
      const email = dados.email ?? null
      const solicitacao = await prisma.$transaction(async (tx) => {
        let cliente = await tx.cliente.findUnique({ where: { whatsapp }, select: { id: true, email: true } })
        if (!cliente) {
          try {
            cliente = await tx.cliente.create({ data: { nome: dados.nome, whatsapp, email, origem: 'site', situacao: 'pre_cadastro' }, select: { id: true, email: true } })
          } catch (erro) {
            // Dois envios ao mesmo tempo com o mesmo número: o outro acabou de cadastrar
            if (!(erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002')) throw erro
            throw AppError.conflito('Recebemos outro envio com este WhatsApp agora mesmo. Tente de novo em instantes.')
          }
          await registrarAuditoria(tx, { tabela: 'clientes', registroId: cliente.id, acao: 'criar', depois: { nome: dados.nome, whatsapp, email, origem: 'site', via: 'vitrine', ip }, usuarioId: null })
        } else if (!cliente.email && email) {
          await tx.cliente.update({ where: { id: cliente.id }, data: { email } })
        }
        const s = await tx.solicitacaoOrcamento.create({
          data: {
            numero: await proximoNumero(tx, 'solicitacao'),
            clienteId: cliente.id,
            origem: 'site',
            descricao: montarDescricaoSolicitacao(itens, dados.mensagem),
            status: 'nova',
            email,
            itens: { create: itens },
          },
          select: { id: true, numero: true },
        })
        await registrarAuditoria(tx, { tabela: 'solicitacoes_orcamento', registroId: s.id, acao: 'criar', depois: { numero: s.numero, origem: 'site', itens: itens.length, via: 'vitrine', ip }, usuarioId: null })

        // Sino de quem atende orçamentos
        const usuarios = await tx.usuario.findMany({
          where: { ativo: true, papel: { ativo: true, permissoes: { some: { permissao: { modulo: 'orcamentos', acao: 'visualizar' } } } } },
          select: { id: true },
        })
        await tx.notificacao.createMany({
          data: usuarios.map((u) => ({
            usuarioId: u.id,
            titulo: `Pedido pelo site: ${s.numero}`,
            mensagem: `${dados.nome} enviou uma lista com ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}.`,
            link: `/orcamentos/solicitacoes?id=${s.id}`,
          })),
        })
        return { ...s, usuarios: usuarios.map((u) => u.id) }
      })
      // Lista vazia não pode ir para o emitir (sem salas, o Socket.IO manda para todos)
      if (solicitacao.usuarios.length) {
        app.tempoReal.emitir(
          solicitacao.usuarios.map((u) => `usuario:${u}`),
          'notificacao:nova',
          { titulo: `Pedido pelo site: ${solicitacao.numero}` },
        )
      }
      // Confirmação para o cliente (se deixou o e-mail), em nome da gráfica: a resposta vai para o atendimento dela
      if (email) {
        const empresa = await prisma.empresaConfig.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { nomeFantasia: true, razaoSocial: true, corTema: true, email: true, whatsapp: true },
        })
        const nome = config.titulo || empresa?.nomeFantasia || empresa?.razaoSocial || contextoEmpresa.exigir().nome
        const whatsappLoja =
          config.mostrarWhatsapp && empresa?.whatsapp ? linkWhatsappLoja(empresa.whatsapp, `Olá! Enviei pelo site o pedido de orçamento ${solicitacao.numero}.`) : null
        void app.email.enviar(
          email,
          emailPedidoRecebido({
            empresa: nome,
            tema: empresa?.corTema ?? null,
            responderPara: empresa?.email ?? null,
            nome: dados.nome,
            numero: solicitacao.numero,
            mensagem,
            itens: itens.map((i) => ({
              descricao: i.descricao,
              quantidade: i.quantidade,
              medidas: textoMedidas(i.largura, i.altura),
              acabamentos: i.acabamentos.map((a) => a.nome),
            })),
            whatsapp: whatsappLoja,
            site: urlDaVitrine(contextoEmpresa.exigir(), app.config),
          }),
        )
      }
      return { numero: solicitacao.numero, mensagem }
    },
  }
}
