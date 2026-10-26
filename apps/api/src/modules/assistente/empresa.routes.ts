import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest } from 'fastify'
import type { Acao, Modulo } from '@onprint/shared'
import { controlesAssistenteSchema, descricaoAssistenteSchema, idParamSchema, lerTabelaSchema, orcamentoDeTextoSchema, pedirAssistenteSchema, produtoDeTextoSchema, regrasDeTextoSchema } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { criarAjudasAssistente } from './ajudas.service'
import { criarAssistenteEmpresa } from './empresa.service'
import { criarCadastroLote } from '../produtos/cadastro-lote.service'
import { criarNotasWhatsapp } from './notas-whatsapp'
import { criarProdutosWhatsapp } from './produtos-whatsapp'
import { criarPedirService, tipoDoArquivo } from './pedir.service'

const tags = ['assistente']

/**
 * Assistente GrafyGo na empresa (/assistente…): os controles e o uso do mês (Configurações → Assistente) e as ajudas
 * internas. Cada ajuda exige a permissão de quem faria a tarefa à mão (montar orçamento, cadastrar produto…).
 */
export const assistenteEmpresaRoutes: FastifyPluginAsyncZod = async (app) => {
  const empresa = criarAssistenteEmpresa(app)
  const ajudas = criarAjudasAssistente(app)
  const pedir = criarPedirService(app)
  const notas = criarNotasWhatsapp(app)
  const lote = criarCadastroLote(app)
  const produtosWhatsapp = criarProdutosWhatsapp(app)
  // Uma IA por clique: limite generoso por pessoa (as descrições em lote vão uma a uma)
  const limite = (max: number) => ({ rateLimit: { max, timeWindow: '1 minute' } })

  /** Alguma das permissões (ex.: orçamento novo ou edição de um existente) */
  async function exigirAlguma(request: FastifyRequest, opcoes: [Modulo, Acao][]) {
    for (const [modulo, acao] of opcoes) if (await app.temPermissao(request, modulo, acao)) return
    throw AppError.semPermissao()
  }

  // Qualquer usuário logado: as telas precisam saber se mostram os botões do Assistente
  app.get('/', { onRequest: [app.autenticar], schema: { tags, summary: 'Controles do Assistente na empresa, o que está liberado e o uso do mês' } }, () => empresa.obter())
  app.put(
    '/',
    { onRequest: [app.exigirPermissao('configuracoes', 'editar')], schema: { tags, summary: 'Liga e desliga o Assistente e cada ajuda', body: controlesAssistenteSchema } },
    (request) => empresa.salvar(request.body, request.user.sub),
  )

  app.post(
    '/orcamento-texto',
    { onRequest: [app.autenticar], config: limite(20), schema: { tags, summary: 'Monta itens de orçamento a partir do pedido do cliente (não salva)', body: orcamentoDeTextoSchema } },
    async (request) => {
      await exigirAlguma(request, [['orcamentos', 'criar'], ['orcamentos', 'editar']])
      return ajudas.orcamentoDeTexto(request.body.texto)
    },
  )
  app.post(
    '/produto-texto',
    { onRequest: [app.autenticar], config: limite(20), schema: { tags, summary: 'Sugere o cadastro de um produto a partir da descrição (não salva)', body: produtoDeTextoSchema } },
    async (request) => {
      await exigirAlguma(request, [['produtos', 'criar'], ['produtos', 'editar']])
      return ajudas.produtoDeTexto(request.body.texto)
    },
  )
  app.post(
    '/regras-texto',
    {
      onRequest: [app.exigirPermissao('configuracoes', 'editar')],
      config: limite(20),
      schema: { tags, summary: 'Lê como o dono dá desconto e preenche as perguntas das regras comerciais (não salva)', body: regrasDeTextoSchema },
    },
    (request) => ajudas.regrasDeTexto(request.body.texto),
  )
  // "Peça ao Assistente" (barra do topo): entende o pedido e devolve o que abrir ou a resposta (não salva nada)
  app.post(
    '/pedir',
    { onRequest: [app.autenticar], config: limite(30), schema: { tags, summary: 'Peça ao Assistente: entende o pedido (orçamento, nota, cliente, produto, pergunta)', body: pedirAssistenteSchema } },
    (request) => pedir.pedir(request, request.body.texto),
  )
  app.post(
    '/pedir/nota',
    { onRequest: [app.autenticar], config: limite(20), schema: { tags, summary: 'Lê a nota de compra (XML exato; foto ou PDF pelo Assistente) para a entrada de estoque (multipart, campo "arquivo"; não salva)', consumes: ['multipart/form-data'] } },
    async (request) => {
      const parte = await request.file()
      if (!parte) throw AppError.regraNegocio('Anexe o XML, a foto ou o PDF da nota.')
      const conteudo = await parte.toBuffer()
      const mediaType = tipoDoArquivo(conteudo)
      if (!mediaType) throw AppError.regraNegocio('Envie o XML da nota, uma foto (JPG, PNG) ou o PDF do DANFE.')
      return pedir.nota(request, { nome: parte.filename, mediaType, conteudo })
    },
  )
  // Notas mandadas na conversa "Você" do WhatsApp: a faixa de Entradas (pendentes), a leitura guardada que abre a
  // "Nova entrada" preenchida e o descarte (nada é registrado aqui: a entrada registra e marca a nota)
  app.get('/notas-whatsapp', { onRequest: [app.exigirPermissao('estoque', 'criar')], schema: { tags, summary: 'Notas lidas pelo WhatsApp esperando conferência' } }, () =>
    notas.pendentes(),
  )
  app.get(
    '/notas-whatsapp/:id',
    { onRequest: [app.exigirPermissao('estoque', 'criar')], schema: { tags, summary: 'Nota de compra lida no WhatsApp (canal "Você") para a Nova entrada', params: idParamSchema } },
    (request) => notas.paraEntrada(request.params.id),
  )
  app.post(
    '/notas-whatsapp/:id/descartar',
    { onRequest: [app.exigirPermissao('estoque', 'criar')], schema: { tags, summary: 'Tira a nota lida pelo WhatsApp da faixa de conferência', params: idParamSchema } },
    (request) => notas.descartar(request.params.id),
  )
  // "Cadastrar vários de uma vez": a tabela de preços (texto, planilha, foto ou PDF) vira linhas para revisar (não salva)
  app.post(
    '/tabela-produtos',
    { onRequest: [app.exigirPermissao('produtos', 'criar')], config: limite(10), schema: { tags, summary: 'Lê a tabela de preços colada (ou a planilha como texto) para o cadastro em lote (não salva)', body: lerTabelaSchema } },
    (request) => lote.lerTexto(request.body.texto, request.body.origem),
  )
  app.post(
    '/tabela-produtos/arquivo',
    {
      onRequest: [app.exigirPermissao('produtos', 'criar')],
      config: limite(10),
      schema: { tags, summary: 'Lê a foto, o PDF ou a planilha CSV da tabela de preços (multipart, campo "arquivo"; não salva)', consumes: ['multipart/form-data'] },
    },
    async (request) => {
      const parte = await request.file()
      if (!parte) throw AppError.regraNegocio('Anexe a foto, o PDF ou a planilha da tabela.')
      const conteudo = await parte.toBuffer()
      const tipo = tipoDoArquivo(conteudo)
      return lote.lerArquivo({ nome: parte.filename, mediaType: tipo === 'text/xml' ? null : tipo, conteudo })
    },
  )
  // Produtos mandados no "Você" do WhatsApp: a leitura guardada abre a revisão preenchida
  app.get('/produtos-whatsapp/:id', { onRequest: [app.exigirPermissao('produtos', 'criar')], schema: { tags, summary: 'Produtos lidos no WhatsApp (canal "Você") para a revisão', params: idParamSchema } }, (request) =>
    produtosWhatsapp.paraRevisao(request.params.id, lote),
  )
  app.post(
    '/produtos-whatsapp/:id/descartar',
    { onRequest: [app.exigirPermissao('produtos', 'criar')], schema: { tags, summary: 'Descarta a leitura de produtos do WhatsApp', params: idParamSchema } },
    (request) => produtosWhatsapp.descartar(request.params.id),
  )
  app.post(
    '/descricao',
    { onRequest: [app.autenticar], config: limite(60), schema: { tags, summary: 'Escreve a descrição do produto ou o texto da vitrine (não salva)', body: descricaoAssistenteSchema } },
    async (request) => {
      await exigirAlguma(request, request.body.destino === 'vitrine' ? [['vitrine', 'editar'], ['produtos', 'editar']] : [['produtos', 'criar'], ['produtos', 'editar']])
      return ajudas.descricao(request.body)
    },
  )
}
