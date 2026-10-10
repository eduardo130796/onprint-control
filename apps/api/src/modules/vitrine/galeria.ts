import type { Prisma } from '@prisma/client'

/**
 * Galeria do produto (produto_imagens): a primeira imagem é a capa. `imagem_arquivo_id` do produto
 * acompanha a primeira, porque o resto do sistema (orçamento, PDV, listas) usa só ela.
 */
export async function sincronizarCapa(tx: Prisma.TransactionClient, produtoId: string) {
  const imagens = await tx.produtoImagem.findMany({ where: { produtoId }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }], select: { id: true, arquivoId: true, ordem: true } })
  // Ordem sem buracos (0, 1, 2…) depois de excluir ou incluir na frente
  for (const [i, img] of imagens.entries()) {
    if (img.ordem !== i) await tx.produtoImagem.update({ where: { id: img.id }, data: { ordem: i } })
  }
  await tx.produto.update({ where: { id: produtoId }, data: { imagemArquivoId: imagens[0]?.arquivoId ?? null } })
}
