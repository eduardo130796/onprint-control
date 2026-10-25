import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { nomeCliente } from '@onprint/shared'

/*
 * Leitura do Assistente GrafyGo que ficou pela metade. A resposta do cliente é gravada como "lendo"
 * (resposta_via = assistente_pendente) e lida em segundo plano; se a API reinicia (ou trava) no meio, ninguém volta
 * para ela. Esta tarefa (ao subir e a cada minuto, empresa por empresa) pega as que estão "lendo" há mais de
 * 2 minutos, faz o que seria feito sem o Assistente — avisa o vendedor (ou os administradores) — e marca a resposta
 * como tratada. A leitura que ainda voltar depois não avisa de novo (respostas.service confere antes de aplicar).
 */

/** resposta_via enquanto o Assistente lê */
export const VIA_LENDO = 'assistente_pendente'

/** Bem acima do tempo de uma leitura (15 s por tentativa, com as tentativas do SDK) */
export const LEITURA_PRESA_MS = 2 * 60_000

type App = Pick<FastifyInstance, 'prisma' | 'tempoReal' | 'log'>

/** O vendedor do orçamento (se ativo) ou os administradores */
export async function quemAvisar(prisma: PrismaClient, vendedorId: string | null): Promise<string[]> {
  if (vendedorId) {
    const v = await prisma.usuario.findUnique({ where: { id: vendedorId }, select: { ativo: true } })
    if (v?.ativo) return [vendedorId]
  }
  const admins = await prisma.usuario.findMany({ where: { ativo: true, papel: { codigo: 'admin' } }, select: { id: true } })
  return admins.map((a) => a.id)
}

/** Notificação no sino (e o aviso flutuante, com `toast`) de cada usuário */
export async function notificarEquipe(app: App, usuarios: string[], dados: { titulo: string; mensagem: string; link: string }, toast: boolean) {
  for (const usuarioId of usuarios) {
    await app.prisma.notificacao.create({ data: { usuarioId, ...dados } })
    app.tempoReal.emitir(`usuario:${usuarioId}`, 'notificacao:nova', { titulo: dados.titulo, link: dados.link, toast })
  }
}

/** Trata as leituras presas da empresa do contexto. Devolve quantas foram tratadas. */
export async function recuperarLeiturasPresas(app: App, agora = new Date()): Promise<number> {
  const { prisma } = app
  const presas = await prisma.mensagemWhatsapp.findMany({
    where: { respostaVia: VIA_LENDO, respostaEm: { lt: new Date(agora.getTime() - LEITURA_PRESA_MS) } },
    select: {
      id: true,
      respostaTexto: true,
      orcamento: { select: { id: true, numero: true, vendedorId: true, cliente: { select: { nome: true, fantasia: true, tipoPessoa: true } } } },
    },
    orderBy: { respostaEm: 'asc' },
    take: 50,
  })
  let tratadas = 0
  for (const l of presas) {
    // Só quem tirar do "lendo" avisa (outra instância ou a leitura atrasada não repetem o aviso)
    const { count } = await prisma.mensagemWhatsapp.updateMany({ where: { id: l.id, respostaVia: VIA_LENDO }, data: { respostaVia: 'texto' } })
    if (count !== 1) continue
    tratadas++
    if (!l.orcamento) continue
    const cliente = nomeCliente(l.orcamento.cliente)
    const disse = l.respostaTexto ? `“${l.respostaTexto.slice(0, 200)}”` : 'uma mensagem'
    await notificarEquipe(
      app,
      await quemAvisar(prisma, l.orcamento.vendedorId),
      {
        titulo: `${cliente} respondeu o orçamento ${l.orcamento.numero} no WhatsApp`,
        mensagem: `${cliente} respondeu: ${disse}. O Assistente GrafyGo não terminou de ler a resposta: confira e responda o cliente.`,
        link: `/orcamentos/${l.orcamento.id}`,
      },
      true,
    )
  }
  if (tratadas) app.log.warn({ tratadas }, 'Respostas do WhatsApp presas em "lendo" (leitura do Assistente interrompida): equipe avisada')
  return tratadas
}
