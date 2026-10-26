import type { FastifyInstance, FastifyRequest } from 'fastify'
import { Decimal, NAO_SEI_FAZER, documentoDoTexto, nomeCliente, type Acao, type Modulo, type NotaCompraLida, type RespostaPedir } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import type { AnexoIA } from '../../integrations/ia'
import { criarAjudasAssistente } from './ajudas.service'
import { montarCerebro } from './cerebro'
import { criarAssistenteEmpresa, mensagemSemResultado } from './empresa.service'
import { ErroNfe, lerNfe, type NotaBruta } from './nfe'
import { conciliarNota } from './nota-compra'
import { criarPerguntasService } from './perguntas.service'
import { pedidoIntencao, pedidoNotaCompra, type LeituraIntencao, type LeituraNotaIA } from './prompts-pedir'

/*
 * "Peça ao Assistente": uma caixa só para o dia a dia. O Assistente entende o pedido (tarefa "intencao") e o sistema
 * faz com as ferramentas que já existem — monta o orçamento (orcamentoDeTexto), abre o cadastro do cliente (com a busca
 * do CNPJ), o do produto (preenchido pelo Assistente), lê a nota de compra (XML exato; foto/PDF pela IA) ou responde
 * as perguntas rápidas com consultas no banco. Cada tarefa exige a permissão de quem faria à mão. Nada é salvo aqui.
 */

/** Texto que é só um CPF/CNPJ (com ou sem pontuação): cliente, sem gastar a IA */
const soDocumento = (texto: string) => /^[\d\s./-]+$/.test(texto.trim()) && documentoDoTexto(texto) !== null

/** Tipo do arquivo pelo conteúdo (não pelo que o navegador disse): xml, pdf, jpeg, png, webp, gif ou null */
export function tipoDoArquivo(b: Buffer): string | null {
  const trecho = (de: number, ate: number) => b.subarray(de, ate).toString('latin1')
  if (trecho(0, 4) === '%PDF') return 'application/pdf'
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (trecho(1, 4) === 'PNG') return 'image/png'
  if (trecho(0, 4) === 'RIFF' && trecho(8, 12) === 'WEBP') return 'image/webp'
  if (trecho(0, 4) === 'GIF8') return 'image/gif'
  // XML (com ou sem a marca BOM no começo)
  const inicio = b.subarray(0, 200).toString('utf8')
  if ((inicio.charCodeAt(0) === 0xfeff ? inicio.slice(1) : inicio).trimStart().startsWith('<')) return 'text/xml'
  return null
}

/** Arquivo da nota: XML (exato) ou foto/PDF (IA) */
export interface ArquivoNota {
  nome: string
  /** Pelo conteúdo (tipoDoArquivo): text/xml, application/pdf, image/… */
  mediaType: string
  conteudo: Buffer
}

export const TIPOS_FOTO_NOTA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] as const
/** Limite da foto/PDF lidos pela IA (a API aceita mais; a nota cabe folgada) */
export const MAX_ARQUIVO_NOTA_MB = 8

/** Leitura da IA → o mesmo formato do XML (valores como texto decimal) */
export function notaDaLeitura(l: LeituraNotaIA): NotaBruta {
  const d = (n: number) => new Decimal(n).toDecimalPlaces(4).toString()
  const totalProdutos = l.itens.reduce((s, i) => s.plus(new Decimal(i.valorTotal)), new Decimal(0))
  return {
    chave: null,
    numero: l.numero,
    serie: l.serie,
    emissao: l.emissao,
    emitente: { documento: l.cnpj, nome: l.fornecedor ?? 'Fornecedor (confira na nota)', fantasia: null, ie: null, telefone: null, endereco: null },
    itens: l.itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, ncm: null, cfop: null, unidade: i.unidade, quantidade: d(i.quantidade), valorUnitario: d(i.valorUnitario), valorTotal: new Decimal(i.valorTotal).toFixed(2) })),
    totalProdutos: totalProdutos.toFixed(2),
    totalNota: l.totalNota !== null ? new Decimal(l.totalNota).toFixed(2) : totalProdutos.toFixed(2),
    parcelas: l.parcelas.map((p, i) => ({ numero: String(i + 1).padStart(3, '0'), vencimento: p.vencimento, valor: new Decimal(p.valor).toFixed(2) })),
    pagamentos: [],
  }
}

export function criarPedirService(app: FastifyInstance) {
  const { prisma } = app
  const empresa = criarAssistenteEmpresa(app)
  const ajudas = criarAjudasAssistente(app)
  const perguntas = criarPerguntasService(app)

  const pode = (req: FastifyRequest, modulo: Modulo, acao: Acao) => app.temPermissao(req, modulo, acao)
  const semPermissao = (o: string): RespostaPedir => ({ tipo: 'nao_sei', mensagem: `Você não tem permissão para ${o}. Peça a quem administra o sistema.` })

  async function cliente(req: FastifyRequest, texto: string, nome: string | null): Promise<RespostaPedir> {
    if (!(await pode(req, 'clientes', 'criar'))) return semPermissao('cadastrar clientes')
    const documento = documentoDoTexto(texto)
    const existente = documento ? await prisma.cliente.findFirst({ where: { cpfCnpj: documento }, select: { id: true, nome: true, fantasia: true } }) : null
    return { tipo: 'cliente', documento, nome, existente: existente ? { id: existente.id, rotulo: nomeCliente(existente) } : null }
  }

  /** O que a pessoa quer (tarefa "intencao", barata): a caixa do sistema e a conversa "Você" do WhatsApp. Lança 422. */
  async function entender(texto: string): Promise<LeituraIntencao> {
    const { assinanteId, recurso } = await empresa.exigirLigado('intencao')
    const { grafica } = await montarCerebro(prisma)
    const r = await app.assistente.executar({ assinanteId, recurso, pedido: pedidoIntencao({ grafica, texto }) })
    if (!r.ok) throw AppError.regraNegocio(mensagemSemResultado(r), { motivo: r.motivo })
    return r.dados
  }

  return {
    entender,

    async pedir(req: FastifyRequest, texto: string): Promise<RespostaPedir> {
      if (soDocumento(texto)) return cliente(req, texto, null)
      const l = await entender(texto)
      switch (l.intencao) {
        case 'pergunta':
          return { tipo: 'pergunta', resposta: await perguntas.responder(req, l.pergunta!, l.periodo) }
        case 'cliente':
          return cliente(req, texto, l.nomeCliente)
        case 'produto':
          return (await pode(req, 'produtos', 'criar')) ? { tipo: 'produto', texto } : semPermissao('cadastrar produtos')
        case 'ajuda':
          // A resposta sai do tutorial (a tela mostra o resumo e o link): sem outra chamada à IA
          return { tipo: 'ajuda', tema: l.tema, pergunta: texto }
        case 'nota_compra':
          return (await pode(req, 'estoque', 'criar'))
            ? { tipo: 'anexar_nota', mensagem: 'Anexe o XML da nota (o mais exato), a foto ou o PDF do DANFE: eu preencho a entrada para você conferir.' }
            : semPermissao('lançar notas de compra')
        case 'orcamento': {
          if (!(await pode(req, 'orcamentos', 'criar'))) return semPermissao('criar orçamentos')
          try {
            return { tipo: 'orcamento', texto, leitura: await ajudas.orcamentoDeTexto(texto) }
          } catch (erro) {
            // Ajuda desligada, catálogo vazio ou limite do mês: a explicação vai para a caixa
            if (erro instanceof AppError && erro.statusCode === 422) return { tipo: 'nao_sei', mensagem: erro.message }
            throw erro
          }
        }
        default:
          return { tipo: 'nao_sei', mensagem: NAO_SEI_FAZER }
      }
    },

    /** Nota de compra anexada: XML lido sem IA; foto/PDF pelo Assistente (tudo com "confira"). Nada é salvo. */
    async nota(req: FastifyRequest, arquivo: ArquivoNota): Promise<NotaCompraLida> {
      if (!(await pode(req, 'estoque', 'criar'))) throw AppError.semPermissao()
      if (arquivo.mediaType === 'text/xml') {
        try {
          return await conciliarNota(prisma, lerNfe(arquivo.conteudo.toString('utf8')), 'xml')
        } catch (erro) {
          if (erro instanceof ErroNfe) throw AppError.regraNegocio(erro.message)
          throw erro
        }
      }
      if (!(TIPOS_FOTO_NOTA as readonly string[]).includes(arquivo.mediaType)) throw AppError.regraNegocio('Envie o XML da nota, uma foto (JPG, PNG) ou o PDF do DANFE.')
      if (arquivo.conteudo.length > MAX_ARQUIVO_NOTA_MB * 1024 * 1024) throw AppError.regraNegocio(`Arquivo grande demais (até ${MAX_ARQUIVO_NOTA_MB} MB).`)
      const { assinanteId, recurso } = await empresa.exigirLigado('nota_compra')
      const [{ grafica }, config] = await Promise.all([montarCerebro(prisma), app.assistente.config()])
      const anexo: AnexoIA = { mediaType: arquivo.mediaType as AnexoIA['mediaType'], dados: arquivo.conteudo.toString('base64'), nome: arquivo.nome }
      const r = await app.assistente.executar({ assinanteId, recurso, pedido: pedidoNotaCompra({ grafica, anexo }), contar: (d) => d.itens.length })
      if (!r.ok) throw AppError.regraNegocio(mensagemSemResultado(r), { motivo: r.motivo })
      if (!r.dados.ehNota || !r.dados.itens.length) {
        throw AppError.regraNegocio(
          config.provedor === 'simulado'
            ? 'Modo de demonstração do Assistente: o simulador só lê os arquivos de exemplo. Use o XML da nota ou ligue o Assistente de verdade.'
            : 'Não consegui ler uma nota fiscal neste arquivo. Tente uma foto mais nítida, o PDF do DANFE ou, melhor, o XML da nota.',
          { motivo: 'nao_e_nota' },
        )
      }
      return conciliarNota(prisma, notaDaLeitura(r.dados), arquivo.mediaType === 'application/pdf' ? 'pdf' : 'foto', [
        'Lido pelo Assistente a partir da imagem: confira cada valor com a nota antes de registrar.',
        ...r.dados.avisos,
      ])
    },
  }
}
