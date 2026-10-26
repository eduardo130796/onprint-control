import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import {
  ANEXO_WHATSAPP_MAX_MB,
  EVENTOS_WHATSAPP,
  OPCOES_ENQUETE_ORCAMENTO,
  perguntaEnqueteOrcamento,
  envioWhatsappSchema,
  normalizarNumeroWhatsapp,
  textoParaFormato,
  textoPedeNumeros,
  type Acao,
  type EventoWhatsapp,
  type FormatoRespostaOrcamento,
  type Modulo,
  type ResultadoEnvioWhatsapp,
  type TipoEnvioWhatsapp,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { ErroWhatsapp, instanciaDaEmpresa, type DocumentoWhatsapp, type EnqueteEnviada } from '../../integrations/whatsapp'
import { anexosEscolhidos, anexosJson, enviarAnexos, nomesDosAnexos } from './anexos-arte'
import { formatoAprovacao, obterConfigWhatsapp, whatsappNoPlano } from './avisos'
import { formatarMensagem, incluirMensagem } from './service'
import { versaoDoOrcamento } from './aprovacao'

/** O que entra na versão do orçamento (aprovacao.ts) */
export const camposDaVersao = {
  total: true,
  desconto: true,
  acrescimo: true,
  frete: true,
  sinalPercentual: true,
  parcelas: true,
  intervaloDias: true,
  itens: { orderBy: { ordem: 'asc' }, select: { produtoId: true, descricao: true, quantidade: true, largura: true, altura: true, total: true, acabamentos: { select: { acabamentoId: true } } } },
} as const

export type DadosEnvio = z.output<typeof envioWhatsappSchema>

/** Quem pode mandar cada tipo (basta uma das permissões): quem vê o orçamento manda o orçamento, e assim por diante */
export const PERMISSOES_ENVIO: Record<TipoEnvioWhatsapp, [Modulo, Acao][]> = {
  orcamento_enviado: [['orcamentos', 'visualizar']],
  arte_aprovacao: [
    ['artes', 'visualizar'],
    ['pedidos', 'visualizar'],
  ],
  pedido_acompanhamento: [['pedidos', 'visualizar']],
  pedido_pronto: [['pedidos', 'visualizar']],
  recibo: [['pedidos', 'visualizar']],
  catalogo: [
    ['vitrine', 'visualizar'],
    ['clientes', 'visualizar'],
  ],
  produto: [['vitrine', 'visualizar']],
  vitrine: [['vitrine', 'visualizar']],
  // Resposta pronta das Conversas do WhatsApp ("Seu pedido fica pronto amanhã"): quem atende o WhatsApp ou vê pedidos
  resposta_conversa: [
    ['whatsapp', 'visualizar'],
    ['pedidos', 'visualizar'],
  ],
}

/** PDF anexado: confere o começo do arquivo e o tamanho; o nome que o cliente vê termina em .pdf */
export function validarPdf(conteudo: Buffer, nome: string): DocumentoWhatsapp {
  if (conteudo.length === 0) throw AppError.regraNegocio('O PDF veio vazio.')
  if (conteudo.length > ANEXO_WHATSAPP_MAX_MB * 1024 * 1024) throw new AppError(413, 'VALIDACAO', `O PDF passou de ${ANEXO_WHATSAPP_MAX_MB} MB.`)
  if (conteudo.subarray(0, 5).toString('latin1') !== '%PDF-') throw AppError.regraNegocio('O anexo precisa ser um PDF.')
  const base = nome
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\.pdf$/i, '')
    .trim()
    .slice(0, 120)
  return { conteudo, nomeArquivo: `${base || 'documento'}.pdf`, mime: 'application/pdf' }
}

/**
 * "Enviar pelo WhatsApp" da equipe: sai na hora pela conexão da gráfica (respeita a pausa, não o horário dos avisos),
 * fica registrado em mensagens_whatsapp (manual) e tira da fila o mesmo aviso automático, se estiver esperando.
 * Primeiro o texto (com o link no fim, que mostra a prévia), depois o PDF ou os arquivos das artes (até 6).
 * Orçamento, conforme a empresa escolheu na tela WhatsApp: na conversa natural (padrão: só o texto, o cliente responde
 * do jeito dele), por último a enquete "✅ Aprovado / ✏️ Quero modificações", ou o texto pede "responda 1 / 2". O voto, o 1/2 ou um "aprovado" escrito volta pelo webhook e segue
 * sozinho (respostas.service.ts). A linha de aprovação padrão do texto é trocada aqui também (textoParaFormato: o diálogo
 * aberto antes de a gráfica mudar o formato não manda a linha errada); linha editada fica como veio.
 */
export function criarEnvioManual(app: FastifyInstance) {
  const { prisma } = app

  async function vinculos(d: DadosEnvio) {
    const orcamento = d.orcamentoId ? await prisma.orcamento.findUnique({ where: { id: d.orcamentoId }, select: { id: true, clienteId: true, numero: true, liberacaoPendente: true, ...camposDaVersao } }) : null
    if (d.orcamentoId && !orcamento) throw AppError.naoEncontrado('Orçamento não encontrado.')
    // Regras comerciais: orçamento esperando um gerente não sai para o cliente
    if (d.tipo === 'orcamento_enviado' && orcamento?.liberacaoPendente) throw AppError.regraNegocio('Este orçamento precisa da liberação de um gerente antes de ser enviado.')
    const pedido = d.pedidoId ? await prisma.pedido.findUnique({ where: { id: d.pedidoId }, select: { id: true, clienteId: true } }) : null
    if (d.pedidoId && !pedido) throw AppError.naoEncontrado('Pedido não encontrado.')
    if (d.arteId) {
      const arte = await prisma.arte.findFirst({ where: { id: d.arteId, pedidoItem: { pedidoId: d.pedidoId ?? undefined } }, select: { id: true } })
      if (!arte) throw AppError.naoEncontrado('Arte não encontrada.')
    }
    if (d.clienteId && !(await prisma.cliente.findUnique({ where: { id: d.clienteId }, select: { id: true } }))) throw AppError.naoEncontrado('Cliente não encontrado.')
    return { clienteId: d.clienteId ?? orcamento?.clienteId ?? pedido?.clienteId ?? null, orcamento }
  }

  return async function enviar(d: DadosEnvio, anexo: DocumentoWhatsapp | null, usuarioId: string): Promise<ResultadoEnvioWhatsapp> {
    const empresa = contextoEmpresa.exigir()
    if (!whatsappNoPlano(empresa)) throw AppError.regraNegocio('O WhatsApp não faz parte do seu plano.')
    const config = await obterConfigWhatsapp(prisma)
    if (config.pausado) throw AppError.regraNegocio('Os envios pelo WhatsApp estão pausados. Tire a pausa na tela WhatsApp ou use "Abrir no WhatsApp".')
    const provedor = app.whatsapp.provedor
    if (!provedor.simulado && !config.conectado) throw AppError.regraNegocio('O WhatsApp da gráfica não está conectado. Use "Abrir no WhatsApp" ou conecte pelo QR code.')
    const { clienteId, orcamento } = await vinculos(d)
    // Artes: os arquivos (já no servidor) vão logo depois do texto, dentro do limite
    const anexosArte = d.pedidoId && d.arquivoIds?.length ? await anexosEscolhidos(prisma, d.pedidoId, d.arquivoIds) : []
    const numero = normalizarNumeroWhatsapp(d.telefone)!
    const instancia = instanciaDaEmpresa(empresa.id)
    const ehOrcamento = d.tipo === 'orcamento_enviado' && Boolean(orcamento)
    const formato = formatoAprovacao(config)
    const texto = ehOrcamento ? textoParaFormato(d.texto, formato) : d.texto
    // Como o orçamento saiu: "numeros" só se o texto pede mesmo o 1 (linha padrão ou editada dizendo "responda 1")
    let formatoResposta: FormatoRespostaOrcamento | null = !ehOrcamento ? null : formato === 'numeros' ? (textoPedeNumeros(texto) ? 'numeros' : 'texto') : formato
    const base = {
      clienteId,
      pedidoId: d.pedidoId ?? null,
      orcamentoId: d.orcamentoId ?? null,
      referenciaId: d.arteId ?? null,
      evento: d.tipo,
      manual: true,
      usuarioId,
      telefone: numero,
      texto,
      anexoNome: anexo?.nomeArquivo ?? nomesDosAnexos(anexosArte),
      anexos: anexosJson(anexosArte),
      // A versão do orçamento que o cliente vai ver: a aprovação pela resposta só sai sozinha se nada mudou depois
      ...(ehOrcamento && orcamento ? { versaoEnviada: versaoDoOrcamento(orcamento), totalEnviado: orcamento.total } : {}),
    }

    let idExterno: string | null
    try {
      idExterno = (await provedor.enviarTexto(instancia, numero, texto)).id
    } catch (erro) {
      const e = erro instanceof ErroWhatsapp ? erro : new ErroWhatsapp('temporario', (erro as Error).message)
      if (e.tipo === 'desconectado' && config.conectado) await prisma.whatsappConfig.update({ where: { id: config.id }, data: { conectado: false, desconectadoEm: new Date() } })
      await prisma.mensagemWhatsapp.create({ data: { ...base, formatoResposta, status: 'falhou', erro: e.message, tentativas: 1 } })
      app.log.warn({ err: e, empresa: empresa.slug }, 'Envio do WhatsApp pela equipe falhou')
      const motivo = e.tipo === 'numero_invalido' ? e.message : e.tipo === 'desconectado' ? 'O WhatsApp da gráfica está desconectado.' : `Não foi possível enviar agora. ${e.message}`
      throw AppError.regraNegocio(`${motivo} Use "Abrir no WhatsApp" para mandar pelo seu celular.`)
    }

    let aviso: string | null = null
    if (anexo) {
      try {
        await provedor.enviarDocumento(instancia, numero, anexo)
      } catch (erro) {
        aviso = `A mensagem foi, mas o PDF não: ${(erro as Error).message}`
        app.log.warn({ err: erro, empresa: empresa.slug }, 'PDF do WhatsApp não enviado')
      }
    }
    if (anexosArte.length) aviso = await enviarAnexos(app, provedor, instancia, numero, anexosArte)

    // Orçamento com enquete: a enquete de aprovação logo depois (o cliente toca numa opção em vez de digitar)
    let enquete: EnqueteEnviada | null = null
    if (ehOrcamento && orcamento && formatoResposta === 'enquete') {
      try {
        enquete = await provedor.enviarEnquete(instancia, numero, perguntaEnqueteOrcamento(orcamento.numero), Object.values(OPCOES_ENQUETE_ORCAMENTO))
      } catch (erro) {
        aviso = [aviso, 'A enquete de aprovação não foi; o cliente ainda pode responder APROVADO na conversa.'].filter(Boolean).join(' ')
        formatoResposta = 'texto'
        app.log.warn({ err: erro, empresa: empresa.slug }, 'Enquete do orçamento não enviada')
      }
    }

    const criada = await prisma.mensagemWhatsapp.create({
      data: {
        ...base,
        status: 'enviada',
        enviadaEm: new Date(),
        idExterno,
        tentativas: 1,
        erro: aviso,
        formatoResposta,
        ...(enquete ? { enqueteId: enquete.id, enqueteSegredo: enquete.segredo, enqueteJid: enquete.jid } : {}),
      },
      include: incluirMensagem,
    })
    // O mesmo aviso automático esperando na fila (arte, pedido pronto) não sai de novo
    if (d.pedidoId && (EVENTOS_WHATSAPP as readonly string[]).includes(d.tipo)) {
      await prisma.mensagemWhatsapp.updateMany({
        where: { status: 'pendente', manual: false, pedidoId: d.pedidoId, evento: d.tipo as EventoWhatsapp, ...(d.arteId ? { referenciaId: d.arteId } : {}) },
        data: { status: 'ignorada', erro: 'Enviada pela equipe em "Enviar pelo WhatsApp".' },
      })
    }
    return { mensagem: formatarMensagem(criada), aviso }
  }
}
