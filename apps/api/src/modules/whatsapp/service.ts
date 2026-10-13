import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import { CODIGOS_ERRO, type ConexaoWhatsapp, type DisponibilidadeWhatsapp, type EventoWhatsapp, type MensagemWhatsapp, type TipoMensagemWhatsapp, type WhatsappConfig, type mensagensWhatsappQuerySchema, type whatsappConfigSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { paginado } from '../../core/paginacao'
import { ErroWhatsapp, instanciaDaEmpresa, type SituacaoWhatsapp } from '../../integrations/whatsapp'
import { obterConfigWhatsapp, whatsappNoPlano } from './avisos'

type Config = Awaited<ReturnType<typeof obterConfigWhatsapp>>

export const incluirMensagem = {
  cliente: { select: { id: true, nome: true, fantasia: true } },
  pedido: { select: { id: true, numero: true } },
  orcamento: { select: { id: true, numero: true } },
  usuario: { select: { id: true, nome: true } },
} satisfies Prisma.MensagemWhatsappInclude

export function formatarMensagem(m: Prisma.MensagemWhatsappGetPayload<{ include: typeof incluirMensagem }>): MensagemWhatsapp {
  return {
    id: m.id,
    evento: m.evento as TipoMensagemWhatsapp,
    manual: m.manual,
    telefone: m.telefone,
    texto: m.texto,
    status: m.status,
    tentativas: m.tentativas,
    erro: m.erro,
    anexoNome: m.anexoNome,
    agrupadaComId: m.agrupadaComId,
    enviadaEm: m.enviadaEm?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    cliente: m.cliente,
    pedido: m.pedido,
    orcamento: m.orcamento,
    usuario: m.usuario,
  }
}

/** Tela WhatsApp: conexão pelo QR code, eventos ligados, horário, pausa e a fila/histórico dos avisos. */
export function criarWhatsappService(app: FastifyInstance) {
  const { prisma } = app
  const provedor = () => app.whatsapp.provedor
  const instancia = () => instanciaDaEmpresa(contextoEmpresa.exigir().id)

  async function resumo(config: Config, estado?: SituacaoWhatsapp['estado']): Promise<WhatsappConfig> {
    return {
      provedor: provedor().nome,
      liberadoNoPlano: whatsappNoPlano(contextoEmpresa.atual()),
      estado: estado ?? (provedor().simulado || config.conectado ? 'conectado' : 'desconectado'),
      numero: config.numero,
      nomePerfil: provedor().simulado ? 'Modo de teste' : config.nomePerfil,
      conectadoEm: config.conectadoEm?.toISOString() ?? null,
      desconectadoEm: config.desconectadoEm?.toISOString() ?? null,
      eventos: config.eventos as EventoWhatsapp[],
      horarioInicio: config.horarioInicio,
      horarioFim: config.horarioFim,
      pausado: config.pausado,
      pendentes: await prisma.mensagemWhatsapp.count({ where: { status: 'pendente' } }),
    }
  }

  /** Grava o estado lido da Evolution (tela aberta consultando; no futuro, o webhook CONNECTION_UPDATE) */
  async function registrarSituacao(config: Config, s: SituacaoWhatsapp): Promise<Config> {
    if (provedor().simulado) return config
    if (s.estado === 'conectado') {
      if (config.conectado && config.numero === s.numero && config.nomePerfil === s.nomePerfil) return config
      const atualizada = await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { conectado: true, numero: s.numero, nomePerfil: s.nomePerfil, conectadoEm: config.conectado ? config.conectadoEm : new Date(), desconectadoEm: null },
      })
      // Avisos que esperavam a conexão voltam a sair
      app.whatsapp.marcarFila(contextoEmpresa.exigir().id)
      return atualizada
    }
    if (!config.conectado) return config
    return prisma.whatsappConfig.update({ where: { id: config.id }, data: { conectado: false, desconectadoEm: new Date() } })
  }

  function erroDoProvedor(erro: unknown): never {
    if (erro instanceof ErroWhatsapp) throw new AppError(503, CODIGOS_ERRO.SERVICO_INDISPONIVEL, `Não foi possível falar com o WhatsApp agora. ${erro.message}`)
    throw erro
  }

  return {
    async obter() {
      return resumo(await obterConfigWhatsapp(prisma))
    },

    /** O diálogo "Enviar pelo WhatsApp" manda pela conexão ou abre o WhatsApp (último estado conhecido, sem chamar a Evolution) */
    async disponivel(): Promise<DisponibilidadeWhatsapp> {
      const config = await obterConfigWhatsapp(prisma)
      const teste = provedor().simulado
      const motivo = !whatsappNoPlano(contextoEmpresa.atual())
        ? 'O WhatsApp não faz parte do seu plano.'
        : config.pausado
          ? 'Os envios pelo WhatsApp estão pausados (tela WhatsApp).'
          : !teste && !config.conectado
            ? 'O WhatsApp da gráfica não está conectado.'
            : null
      return { conectado: !motivo, motivo, numero: teste ? null : config.numero, teste }
    },

    async salvar(dados: z.output<typeof whatsappConfigSchema>, usuarioId: string) {
      const antes = await obterConfigWhatsapp(prisma)
      const depois = await prisma.$transaction(async (tx) => {
        const c = await tx.whatsappConfig.update({ where: { id: antes.id }, data: { eventos: [...new Set(dados.eventos)], horarioInicio: dados.horarioInicio, horarioFim: dados.horarioFim, pausado: dados.pausado } })
        await registrarAuditoria(tx, { tabela: 'whatsapp_config', registroId: c.id, acao: 'editar', antes: { eventos: antes.eventos, horarioInicio: antes.horarioInicio, horarioFim: antes.horarioFim, pausado: antes.pausado }, depois: dados, usuarioId })
        return c
      })
      if (antes.pausado && !depois.pausado) app.whatsapp.marcarFila(contextoEmpresa.exigir().id)
      return resumo(depois)
    },

    /** Estado atual (a tela consulta a cada poucos segundos enquanto mostra o QR) */
    async estado() {
      let config = await obterConfigWhatsapp(prisma)
      if (provedor().simulado) return resumo(config)
      try {
        const s = await provedor().estado(instancia())
        config = await registrarSituacao(config, s)
        return resumo(config, s.estado)
      } catch (erro) {
        return erroDoProvedor(erro)
      }
    },

    async conectar(usuarioId: string): Promise<ConexaoWhatsapp> {
      if (!whatsappNoPlano(contextoEmpresa.atual())) throw AppError.regraNegocio('O WhatsApp não faz parte do seu plano.')
      const config = await obterConfigWhatsapp(prisma)
      try {
        const r = await provedor().conectar(instancia())
        if (r.estado === 'conectado') {
          const s = await provedor().estado(instancia())
          const c = await registrarSituacao(config, s)
          if (provedor().simulado && !c.conectadoEm) await prisma.whatsappConfig.update({ where: { id: c.id }, data: { conectadoEm: new Date() } })
          return { estado: 'conectado', numero: s.numero, qrBase64: null }
        }
        await registrarAuditoria(prisma, { tabela: 'whatsapp_config', registroId: config.id, acao: 'editar', depois: { conexao: 'qr code gerado' }, usuarioId })
        return { estado: r.estado, numero: null, qrBase64: r.qrBase64 }
      } catch (erro) {
        return erroDoProvedor(erro)
      }
    },

    /** Desconexão de propósito: novos avisos deixam de entrar na fila */
    async desconectar(usuarioId: string) {
      const config = await obterConfigWhatsapp(prisma)
      try {
        await provedor().desconectar(instancia())
      } catch (erro) {
        erroDoProvedor(erro)
      }
      const c = await prisma.whatsappConfig.update({ where: { id: config.id }, data: { conectado: false, numero: null, nomePerfil: null, conectadoEm: null, desconectadoEm: new Date() } })
      await registrarAuditoria(prisma, { tabela: 'whatsapp_config', registroId: c.id, acao: 'editar', antes: { numero: config.numero }, depois: { conexao: 'desconectado' }, usuarioId })
      return resumo(c, 'desconectado')
    },

    async mensagens(q: z.output<typeof mensagensWhatsappQuerySchema>) {
      const where: Prisma.MensagemWhatsappWhereInput = q.status ? { status: q.status } : {}
      const [total, data] = await prisma.$transaction([
        prisma.mensagemWhatsapp.count({ where }),
        prisma.mensagemWhatsapp.findMany({ where, include: incluirMensagem, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      ])
      return paginado(data.map(formatarMensagem), total, q)
    },

    /** Volta para a fila (falhou, não enviada ou parada): sai no próximo ciclo dentro do horário */
    async reenviar(id: string) {
      const m = await prisma.mensagemWhatsapp.findUnique({ where: { id } })
      if (!m) throw AppError.naoEncontrado('Mensagem não encontrada.')
      if (m.status === 'enviada') throw AppError.regraNegocio('Esta mensagem já foi enviada.')
      const atualizada = await prisma.mensagemWhatsapp.update({
        where: { id },
        data: { status: 'pendente', tentativas: 0, erro: null, proximaTentativaEm: null, createdAt: new Date() },
        include: incluirMensagem,
      })
      app.whatsapp.marcarFila(contextoEmpresa.exigir().id)
      return formatarMensagem(atualizada)
    },

    /** Tira da fila (ex.: a gráfica já mandou à mão pelo wa.me) */
    async ignorar(id: string) {
      const m = await prisma.mensagemWhatsapp.findUnique({ where: { id } })
      if (!m) throw AppError.naoEncontrado('Mensagem não encontrada.')
      if (m.status === 'enviada') throw AppError.regraNegocio('Esta mensagem já foi enviada.')
      return formatarMensagem(await prisma.mensagemWhatsapp.update({ where: { id }, data: { status: 'ignorada', erro: 'Tirada da fila pela equipe.' }, include: incluirMensagem }))
    },
  }
}
