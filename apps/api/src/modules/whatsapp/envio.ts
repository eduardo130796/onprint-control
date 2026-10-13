import type { FastifyInstance } from 'fastify'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { ErroWhatsapp, instanciaDaEmpresa, type ProvedorWhatsapp } from '../../integrations/whatsapp'
import { obterConfigWhatsapp, whatsappNoPlano } from './avisos'
import { MAX_POR_HORA, MAX_TENTATIVAS, VALIDADE_PENDENTE_MS, dentroDoHorario, esperaDaTentativa, intervaloEntreEnvios } from './regras'

/** De quanto em quanto tempo o envio olha as filas */
export const CICLO_ENVIO_MS = 10_000

/**
 * Envio dos avisos na fila, uma empresa por vez e no máximo uma mensagem por empresa a cada ciclo:
 * dentro do horário, com intervalo sorteado entre mensagens, teto por hora e novas tentativas nas falhas temporárias.
 * Só as empresas com fila são consultadas (o conjunto em memória é refeito ao subir a API).
 */
export function criarEnvioWhatsapp(app: FastifyInstance, provedor: ProvedorWhatsapp) {
  const comFila = new Set<string>()
  const proximoEnvio = new Map<string, number>()
  let rodando = false

  /** Conexão caiu: avisos ficam na fila e os administradores recebem a notificação (só na primeira vez). */
  async function marcarDesconectado(configId: string, estavaConectado: boolean) {
    if (!estavaConectado) return
    const { prisma } = app
    await prisma.whatsappConfig.update({ where: { id: configId }, data: { conectado: false, desconectadoEm: new Date() } })
    const admins = await prisma.usuario.findMany({ where: { ativo: true, papel: { codigo: 'admin' } }, select: { id: true } })
    const titulo = 'WhatsApp desconectado — leia o QR de novo'
    for (const a of admins) {
      await prisma.notificacao.create({
        data: { usuarioId: a.id, titulo, mensagem: 'Os avisos automáticos dos pedidos estão parados na fila. Abra WhatsApp e conecte de novo pelo QR code.', link: '/whatsapp' },
      })
      app.tempoReal.emitir(`usuario:${a.id}`, 'notificacao:nova', { titulo })
    }
    app.log.warn({ empresa: contextoEmpresa.atual()?.slug }, 'WhatsApp desconectado: avisos parados na fila')
  }

  /** Envia (no máximo) uma mensagem da empresa. Devolve se ainda há fila. */
  async function processarEmpresa(empresa: EmpresaAtual): Promise<boolean> {
    const { prisma } = app
    const agora = new Date()
    await prisma.mensagemWhatsapp.updateMany({
      where: { status: 'pendente', createdAt: { lt: new Date(agora.getTime() - VALIDADE_PENDENTE_MS) } },
      data: { status: 'ignorada', erro: 'Não saiu em 48 horas (WhatsApp desconectado ou pausado).' },
    })
    if ((await prisma.mensagemWhatsapp.count({ where: { status: 'pendente' } })) === 0) return false
    if (!whatsappNoPlano(empresa)) return true
    const config = await obterConfigWhatsapp(prisma)
    if (config.pausado || !dentroDoHorario(agora, config.horarioInicio, config.horarioFim)) return true
    if ((proximoEnvio.get(empresa.id) ?? 0) > agora.getTime()) return true
    const naUltimaHora = await prisma.mensagemWhatsapp.count({ where: { status: 'enviada', enviadaEm: { gte: new Date(agora.getTime() - 3_600_000) } } })
    if (naUltimaHora >= MAX_POR_HORA) return true

    const msg = await prisma.mensagemWhatsapp.findFirst({
      where: { status: 'pendente', OR: [{ proximaTentativaEm: null }, { proximaTentativaEm: { lte: agora } }] },
      orderBy: { createdAt: 'asc' },
      include: { cliente: { select: { receberAvisosWhatsapp: true } } },
    })
    if (!msg) return true
    // O cliente pode ter pedido para não receber depois que o aviso entrou na fila
    if (!msg.cliente.receberAvisosWhatsapp) {
      await prisma.mensagemWhatsapp.update({ where: { id: msg.id }, data: { status: 'ignorada', erro: 'O cliente não quer receber avisos pelo WhatsApp.' } })
      return true
    }

    const instancia = instanciaDaEmpresa(empresa.id)
    try {
      if (!provedor.simulado) {
        const situacao = await provedor.estado(instancia)
        if (situacao.estado !== 'conectado') {
          await marcarDesconectado(config.id, config.conectado)
          return true
        }
        // Voltou sozinha (a Evolution reconecta depois de reiniciar)
        if (!config.conectado) await prisma.whatsappConfig.update({ where: { id: config.id }, data: { conectado: true, numero: situacao.numero ?? config.numero } })
      }
      const r = await provedor.enviarTexto(instancia, msg.telefone, msg.texto)
      await prisma.mensagemWhatsapp.update({
        where: { id: msg.id },
        data: { status: 'enviada', enviadaEm: new Date(), idExterno: r.id, tentativas: { increment: 1 }, erro: null, proximaTentativaEm: null },
      })
    } catch (erro) {
      const e = erro instanceof ErroWhatsapp ? erro : new ErroWhatsapp('temporario', (erro as Error).message)
      if (e.tipo === 'desconectado') {
        await marcarDesconectado(config.id, config.conectado)
      } else if (e.tipo === 'numero_invalido') {
        await prisma.mensagemWhatsapp.update({ where: { id: msg.id }, data: { status: 'falhou', erro: e.message, tentativas: { increment: 1 } } })
      } else {
        const tentativas = msg.tentativas + 1
        await prisma.mensagemWhatsapp.update({
          where: { id: msg.id },
          data:
            tentativas >= MAX_TENTATIVAS
              ? { status: 'falhou', erro: e.message, tentativas }
              : { erro: e.message, tentativas, proximaTentativaEm: new Date(Date.now() + esperaDaTentativa(tentativas)) },
        })
      }
      app.log.warn({ err: e, empresa: empresa.slug, mensagem: msg.id }, 'Aviso do WhatsApp não enviado')
    }
    // No modo de teste (log) não há o que espaçar
    proximoEnvio.set(empresa.id, Date.now() + (provedor.simulado ? 1_000 : intervaloEntreEnvios()))
    return true
  }

  async function ciclo() {
    if (rodando) return
    rodando = true
    try {
      for (const id of [...comFila]) {
        const empresa = await app.empresas.porId(id)
        if (!empresa) {
          comFila.delete(id)
          continue
        }
        try {
          if (!(await contextoEmpresa.com(empresa, () => processarEmpresa(empresa)))) comFila.delete(id)
        } catch (erro) {
          app.log.error({ err: erro, empresa: empresa.slug }, 'Envio dos avisos do WhatsApp falhou')
        }
      }
    } finally {
      rodando = false
    }
  }

  /** Ao subir: empresas que ficaram com aviso na fila */
  async function recuperarFilas() {
    for (const empresa of await app.empresas.listar()) {
      try {
        const pendentes = await contextoEmpresa.com(empresa, () => app.prisma.mensagemWhatsapp.count({ where: { status: 'pendente' } }))
        if (pendentes) comFila.add(empresa.id)
      } catch (erro) {
        app.log.error({ err: erro, empresa: empresa.slug }, 'Não foi possível ler a fila do WhatsApp')
      }
    }
  }

  return {
    /** Empresa ganhou aviso na fila */
    marcarFila: (empresaId: string) => void comFila.add(empresaId),
    ciclo,
    recuperarFilas,
    processarEmpresa,
  }
}
