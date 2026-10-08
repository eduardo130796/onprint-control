import { Prisma, type Cupom } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { hojeISO, type CupomDetalhe, type CupomPlataforma, type cupomSchema, type TipoCupom } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { diaISO, paraDia } from '../../plataforma/assinaturas'
import { descricaoCupom } from '../../plataforma/beneficios'

type Uso = { assinanteId: string; desde: Date | null; ate: Date | null; encerradoEm: Date | null }
type Paga = { assinanteId: string; valor: Prisma.Decimal; desconto: Prisma.Decimal | null; vencimento: Date }

/** Mensalidades pagas dentro da janela do uso (o desconto registrado nelas e o que entrou). */
function noUso(u: Uso, pagas: Paga[]) {
  const desde = diaISO(u.desde)
  const ate = diaISO(u.ate)
  return pagas.filter((c) => {
    const v = diaISO(c.vencimento) as string
    return c.assinanteId === u.assinanteId && desde != null && v >= desde && (!ate || v <= ate) && c.desconto != null
  })
}

const somar = (valores: Prisma.Decimal[]) => (valores.reduce((t, v) => t + Math.round(Number(v) * 100), 0) / 100).toFixed(2)

/** Cupons de desconto: cadastro, pausa e acompanhamento (usos, desconto concedido e receita). */
export function criarCuponsService(app: FastifyInstance) {
  const { plataforma } = app
  const hoje = () => hojeISO()

  async function montar(cupons: Cupom[]): Promise<(CupomPlataforma & { _usos: (Uso & { id: string; autor: string; createdAt: Date; assinante: { id: string; nome: string; slug: string } })[]; _pagas: Paga[] })[]> {
    const usos = await plataforma.cupomUso.findMany({ where: { cupomId: { in: cupons.map((c) => c.id) } }, include: { assinante: { select: { id: true, nome: true, slug: true } } }, orderBy: { createdAt: 'desc' } })
    const pagas = await plataforma.cobranca.findMany({
      where: { assinanteId: { in: [...new Set(usos.map((u) => u.assinanteId))] }, tipo: 'mensalidade', situacao: 'paga' },
      select: { assinanteId: true, valor: true, desconto: true, vencimento: true },
    })
    const h = hoje()
    return cupons.map((c) => {
      const deste = usos.filter((u) => u.cupomId === c.id)
      const cobradas = deste.flatMap((u) => noUso(u, pagas))
      return {
        id: c.id,
        codigo: c.codigo,
        descricao: c.descricao,
        tipo: c.tipo as TipoCupom,
        valor: c.valor.toFixed(2),
        duracaoMeses: c.duracaoMeses,
        validoAte: diaISO(c.validoAte),
        limiteUsos: c.limiteUsos,
        planos: c.planos,
        ativo: c.ativo,
        resumo: descricaoCupom(c),
        usos: deste.length,
        emUso: deste.filter((u) => !u.encerradoEm && (!u.ate || (diaISO(u.ate) as string) >= h)).length,
        descontoConcedido: somar(cobradas.map((p) => p.desconto as Prisma.Decimal)),
        receita: somar(cobradas.map((p) => p.valor)),
        criadoEm: c.createdAt.toISOString(),
        _usos: deste,
        _pagas: pagas,
      }
    })
  }

  const publico = <T extends { _usos: unknown; _pagas: unknown }>({ _usos, _pagas, ...c }: T) => c

  function dados(d: z.output<typeof cupomSchema>) {
    return {
      codigo: d.codigo,
      descricao: d.descricao ?? null,
      tipo: d.tipo,
      valor: d.valor,
      duracaoMeses: d.duracaoMeses,
      validoAte: d.validoAte ? paraDia(d.validoAte) : null,
      limiteUsos: d.limiteUsos,
      planos: d.planos,
      ativo: d.ativo,
    }
  }

  async function salvarCom<T>(fn: () => Promise<T>) {
    try {
      return await fn()
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') throw AppError.conflito('Já existe um cupom com este código.')
      throw erro
    }
  }

  return {
    async listar(): Promise<CupomPlataforma[]> {
      const cupons = await plataforma.cupom.findMany({ orderBy: [{ ativo: 'desc' }, { createdAt: 'desc' }] })
      return (await montar(cupons)).map(publico)
    },

    async obter(id: string): Promise<CupomDetalhe> {
      const cupom = await plataforma.cupom.findUnique({ where: { id } })
      if (!cupom) throw AppError.naoEncontrado('Cupom não encontrado.')
      const c = (await montar([cupom]))[0] as Awaited<ReturnType<typeof montar>>[number]
      return {
        ...publico(c),
        empresas: c._usos.map((u) => ({
          id: u.assinante.id,
          nome: u.assinante.nome,
          slug: u.assinante.slug,
          desde: diaISO(u.desde),
          ate: diaISO(u.ate),
          aplicadoEm: u.createdAt.toISOString(),
          encerradoEm: u.encerradoEm?.toISOString() ?? null,
          descontoConcedido: somar(noUso(u, c._pagas).map((p) => p.desconto as Prisma.Decimal)),
          autor: u.autor,
        })),
      }
    },

    async criar(d: z.output<typeof cupomSchema>) {
      const c = await salvarCom(() => plataforma.cupom.create({ data: dados(d) }))
      return this.obter(c.id)
    },

    /** Editar não muda o desconto de quem já usa (a janela de cada uso já está gravada; o valor segue o cupom). */
    async atualizar(id: string, d: z.output<typeof cupomSchema>) {
      const atual = await plataforma.cupom.findUnique({ where: { id } })
      if (!atual) throw AppError.naoEncontrado('Cupom não encontrado.')
      const usado = (await plataforma.cupomUso.count({ where: { cupomId: id } })) > 0
      if (usado && (d.tipo !== atual.tipo || d.valor !== atual.valor.toFixed(2) || d.duracaoMeses !== atual.duracaoMeses || d.codigo !== atual.codigo)) {
        throw AppError.regraNegocio('Este cupom já foi usado: código, desconto e duração não mudam mais. Pause este e crie outro.')
      }
      await salvarCom(() => plataforma.cupom.update({ where: { id }, data: dados(d) }))
      return this.obter(id)
    },
  }
}
