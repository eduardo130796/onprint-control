import type { FastifyInstance } from 'fastify'
import type { PassoInicial, PrimeirosPassos } from '@onprint/shared'
import { contextoEmpresa } from '../../core/contexto-empresa'

/**
 * "Primeiros passos" da gráfica que acabou de chegar: o que já foi feito é medido nos próprios dados
 * (nada para marcar à mão), e cada passo leva à tela certa e ao tutorial da central de ajuda.
 */
export function criarPrimeirosPassos(app: FastifyInstance) {
  const { prisma } = app

  return {
    async calcular(): Promise<PrimeirosPassos> {
      const empresa = contextoEmpresa.exigir()
      const temVitrine = !empresa.assinatura || empresa.assinatura.modulos.includes('vitrine')
      const [config, produtosDaGrafica, produtosEditados, orcamentos, enviados, pedidos, usuarios, vitrine, totalProdutos] = await Promise.all([
        prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { logoArquivoId: true, telefone: true, whatsapp: true } }),
        // Produto cadastrado por alguém da equipe (os de exemplo vêm sem autor)…
        prisma.produto.count({ where: { createdBy: { not: null } } }),
        // …ou um produto de exemplo revisado (preço ajustado à realidade da gráfica)
        prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM produtos WHERE updated_at > created_at + interval '1 minute'`,
        prisma.orcamento.count(),
        prisma.orcamento.count({ where: { status: { not: 'rascunho' } } }),
        prisma.pedido.count(),
        prisma.usuario.count({ where: { ativo: true } }),
        temVitrine ? prisma.vitrineConfig.findFirst({ select: { ativa: true } }) : Promise.resolve(null),
        prisma.produto.count({ where: { tipo: { not: 'insumo' } } }),
      ])

      const passos: PassoInicial[] = [
        {
          id: 'empresa',
          titulo: 'Coloque a sua logo e os seus dados',
          descricao: 'Eles aparecem nos orçamentos, pedidos e no link que o cliente recebe.',
          link: '/configuracoes/empresa',
          ajuda: 'configurar-empresa',
          feito: Boolean(config?.logoArquivoId && (config.telefone || config.whatsapp)),
        },
        {
          id: 'produtos',
          titulo: 'Cadastre os seus produtos',
          descricao: 'Cole a tabela de preços que você já tem ou marque o que vende nos modelos prontos: você só digita os preços.',
          // Catálogo vazio: direto para os modelos prontos; com produtos (de exemplo ou não), a lista
          link: totalProdutos ? '/produtos' : '/produtos/cadastrar-varios?modelos=1',
          ajuda: 'cadastrar-produto',
          feito: produtosDaGrafica > 0 || Number(produtosEditados[0]?.n ?? 0) > 0,
        },
        {
          id: 'orcamento',
          titulo: 'Faça o seu primeiro orçamento',
          descricao: 'Escolha o produto, informe as medidas e o preço sai na hora.',
          link: '/orcamentos/novo',
          ajuda: 'fazer-orcamento',
          feito: orcamentos > 0,
        },
        {
          id: 'enviar',
          titulo: 'Mande para o cliente aprovar',
          descricao: 'Por WhatsApp, link ou PDF com a sua marca. O cliente aprova pelo celular.',
          link: '/orcamentos',
          ajuda: 'enviar-orcamento',
          feito: enviados > 0,
        },
        {
          id: 'pedido',
          titulo: 'Transforme em pedido',
          descricao: 'Aprovado, vira pedido com um clique: produção, entrega e pagamentos juntos.',
          link: '/pedidos',
          ajuda: 'orcamento-em-pedido',
          feito: pedidos > 0,
        },
        {
          id: 'equipe',
          titulo: 'Convide a sua equipe',
          descricao: 'Cada pessoa com o próprio acesso e só o que ela precisa ver.',
          link: '/configuracoes/usuarios',
          ajuda: 'convidar-equipe',
          feito: usuarios > 1,
        },
      ]
      if (temVitrine) {
        passos.push({
          id: 'vitrine',
          titulo: 'Ligue a sua vitrine online',
          descricao: 'Um site com os seus produtos para mandar no WhatsApp e receber pedidos organizados.',
          link: '/vitrine',
          ajuda: 'ligar-vitrine',
          feito: Boolean(vitrine?.ativa),
        })
      }
      return { passos, concluidos: passos.filter((p) => p.feito).length, total: passos.length }
    },
  }
}
