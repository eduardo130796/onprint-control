import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { acharDuplicado, impedimentoDaLinha, type LeituraCadastroLote, type LinhaCadastro } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { notificarEquipe } from '../whatsapp/leituras-presas'
import type { CadastroLote } from '../produtos/cadastro-lote.service'

/*
 * Produtos mandados na conversa "Você" ("novo produto: chaveiro acrílico 5x3 cm, R$ 4 a unidade" ou a foto de uma
 * tabela de preços): a leitura fica guardada como pendente (como as notas em notas_whatsapp), avisa no sino quem
 * cadastra produtos e abre a mesma revisão do "Cadastrar vários" já preenchida (/produtos/cadastrar-varios?leitura=).
 * Nada é criado sem o "Criar" na revisão — ou, num produto só e claro, o "ok" citando o aviso no "Você".
 */

export const linkDaLeituraProdutos = (id: string) => `/produtos/cadastrar-varios?leitura=${id}`

/** Um produto só, com modo, unidade e preço claros, sem nada para conferir e sem nome parecido: pode sair pelo "ok" */
export function prontoParaOk(l: LeituraCadastroLote): boolean {
  if (l.linhas.length !== 1) return false
  const [p] = l.linhas as [LinhaCadastro]
  return !impedimentoDaLinha(p) && !p.conferir.length && !p.duplicado && Boolean(p.unidadeSigla) && p.acabamentos.every((a) => a.id || a.valor)
}

export function criarProdutosWhatsapp(app: FastifyInstance) {
  const { prisma } = app

  /** Quem cadastra produtos (produtos: criar), ativos */
  async function quemCadastra() {
    const usuarios = await prisma.usuario.findMany({
      where: { ativo: true, papel: { ativo: true, permissoes: { some: { permissao: { modulo: 'produtos', acao: 'criar' } } } } },
      select: { id: true },
    })
    return usuarios.map((u) => u.id)
  }

  return {
    /** Guarda a leitura como pendente e avisa no sino */
    async guardar(l: LeituraCadastroLote, origem: 'texto' | 'foto') {
      const salva = await prisma.leituraProdutosWhatsapp.create({ data: { leitura: l as unknown as Prisma.InputJsonValue, origem } })
      const n = l.linhas.length
      const faltaPreco = l.linhas.filter((x) => !x.precoVenda).length
      await notificarEquipe(
        app,
        await quemCadastra(),
        {
          titulo: n === 1 ? `Produto “${l.linhas[0]!.nome}” lido pelo WhatsApp: confira e crie` : `${n} produtos lidos pelo WhatsApp: confira e crie`,
          mensagem: `${faltaPreco ? `${faltaPreco} sem preço. ` : ''}Nada é criado sem você tocar em "Criar".`,
          link: linkDaLeituraProdutos(salva.id),
        },
        true,
      )
      return salva
    },

    /** A leitura para a revisão, com os duplicados de agora (o cadastro pode ter mudado desde a leitura) */
    async paraRevisao(id: string, cadastro: CadastroLote): Promise<LeituraCadastroLote> {
      const r = await prisma.leituraProdutosWhatsapp.findUnique({ where: { id } })
      if (!r) throw AppError.naoEncontrado('Leitura não encontrada.')
      if (r.situacao === 'criada') throw AppError.regraNegocio('Estes produtos já foram criados (pelo WhatsApp ou por esta tela).', { motivo: 'criada', produtosIds: r.produtosIds })
      const l = r.leitura as unknown as LeituraCadastroLote
      const { produtos } = await cadastro.cadastroAtual()
      return { ...l, leituraId: r.id, linhas: l.linhas.map((x) => ({ ...x, duplicado: x.duplicado ?? acharDuplicado(x.nome, produtos) })) }
    },

    async descartar(id: string) {
      const { count } = await prisma.leituraProdutosWhatsapp.updateMany({ where: { id, situacao: 'pendente' }, data: { situacao: 'descartada', resolvidaEm: new Date() } })
      if (count !== 1) throw AppError.regraNegocio('Esta leitura não está mais pendente.')
      return { descartada: true }
    },
  }
}

/**
 * Dentro da transação do "Criar": a leitura vira "criada" (uma vez só: o segundo "Criar" ou "ok" da mesma leitura
 * falha e desfaz tudo — nunca cria duplicado)
 */
export async function marcarLeituraCriada(tx: Prisma.TransactionClient, leituraId: string, produtosIds: string[]) {
  const { count } = await tx.leituraProdutosWhatsapp.updateMany({ where: { id: leituraId, situacao: { not: 'criada' } }, data: { situacao: 'criada', resolvidaEm: new Date(), produtosIds } })
  if (count !== 1) throw AppError.regraNegocio('Estes produtos já foram criados.', { motivo: 'criada' })
}
