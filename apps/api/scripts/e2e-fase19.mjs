// Teste ponta a ponta da Vitrine online (docs/VITRINE.md) num banco DESCARTÁVEL recém-criado com seed (catálogo de exemplo).
// Critério de aceite: fora do plano o site não abre; liberado o módulo, a gráfica configura e ativa a vitrine, publica
// produtos com galeria; o visitante vê só o publicado (sem custo) e envia a lista de orçamento, que vira Solicitação
// (origem site, com itens) com pré-cadastro do cliente e aviso no sino; robô e excesso de envios não gravam;
// vendedor não edita a vitrine; o Caddy só emite HTTPS para vitrine no ar.
import sharp from 'sharp'
import { BASE, chamar, conferir, entrar, finalizar } from './e2e-util.mjs'

const SLUG = 'principal'
const pub = (caminho, opcoes) => chamar(opcoes?.body ? 'POST' : 'GET', `/publico/${SLUG}/vitrine${caminho}`, opcoes)
const permitida = async (dominio) => (await chamar('GET', `/publico/vitrine-permitida?domain=${encodeURIComponent(dominio)}`)).status

/** Imagem de verdade (o sharp precisa decodificar para gerar o WebP) */
const imagem = (cor, largura = 1600, altura = 900) => sharp({ create: { width: largura, height: altura, channels: 3, background: cor } }).png().toBuffer()
function formulario(conteudo, nome) {
  const form = new FormData()
  form.append('arquivo', new Blob([conteudo], { type: 'image/png' }), nome)
  return form
}

const admin = await entrar('admin@onprint.local', 'admin123', 'Admin12345')
const plataforma = (await chamar('POST', '/plataforma/auth/login', { body: { email: 'plataforma@onprint.local', senha: 'plataforma123' } })).json.accessToken
const empresa = (await chamar('GET', '/plataforma/empresas', { token: plataforma })).json.find((e) => e.slug === SLUG)

console.log('— Fora do plano —')
conferir('site público: 404', (await pub('/')).status, 404)
conferir('vitrine-permitida: 404', await permitida(`${SLUG}.localhost`), 404)
let config = await chamar('GET', '/vitrine/config', { token: admin })
conferir('configuração abre e avisa que o plano não inclui', `${config.status} ${config.json.liberadaNoPlano} ${config.json.ativa}`, '200 false false')
conferir('endereço público em desenvolvimento', config.json.urlPublica, `http://${SLUG}.localhost:5173`)
const corpoConfig = {
  ativa: true,
  titulo: 'Gráfica Exemplo',
  slogan: 'Impressos com qualidade',
  sobre: 'Desde 2010 imprimindo seus sonhos.',
  horario: 'Seg a sex, 8h às 18h',
  instagram: '@graficaexemplo',
  facebook: '',
  tiktok: null,
  youtube: null,
  mostrarEndereco: true,
  mostrarTelefone: false,
  mostrarWhatsapp: true,
  mensagemWhatsapp: 'Olá! Vim pelo site.',
  mensagemPedidoEnviado: 'Recebemos! Respondemos em até 2 horas.',
  seoDescricao: 'Banners, adesivos e cartões.',
}
conferir('salvar fora do plano: 403', (await chamar('PUT', '/vitrine/config', { token: admin, body: corpoConfig })).status, 403)

console.log('\n— Libera o módulo e configura —')
let r = await chamar('POST', `/plataforma/empresas/${empresa.id}/acoes`, { token: plataforma, body: { acao: 'modulos_extras', modulos: ['vitrine'] } })
conferir('painel da plataforma libera a Vitrine online', r.status, 200)
config = (await chamar('GET', '/vitrine/config', { token: admin })).json
conferir('agora liberada no plano, ainda desligada', `${config.liberadaNoPlano} ${config.ativa}`, 'true false')
conferir('desligada: site 404', (await pub('/')).status, 404)
r = await chamar('PUT', '/vitrine/config', { token: admin, body: corpoConfig })
conferir('configura e ativa', `${r.status} ${r.json.ativa} ${r.json.titulo} ${r.json.facebook}`, '200 true Gráfica Exemplo null')
conferir('seo com mais de 160 letras é recusado', (await chamar('PUT', '/vitrine/config', { token: admin, body: { ...corpoConfig, seoDescricao: 'x'.repeat(161) } })).status, 400)

r = await chamar('POST', '/vitrine/banners', { token: admin, form: formulario(await imagem('#2255ee'), 'banner.png') })
conferir('envia imagem do banner', `${r.status} ${r.json.banners?.length}`, '201 1')
const bannerId = r.json.banners[0].arquivoId
conferir('banner disfarçado (HTML com .png) é recusado', (await chamar('POST', '/vitrine/banners', { token: admin, form: formulario('<html>oi</html>', 'falso.png') })).status, 422)

console.log('\n— Produtos na vitrine —')
let lista = await chamar('GET', '/vitrine/produtos', { token: admin })
conferir('lista produtos e serviços ativos (sem insumos)', `${lista.status} ${lista.json.some((p) => p.nome.startsWith('Lona'))}`, '200 false')
conferir('nunca traz custo', JSON.stringify(lista.json).includes('custo'), false)
const banner = lista.json.find((p) => p.nome === 'Banner em lona 440 g')
const adesivo = lista.json.find((p) => p.nome === 'Adesivo vinil impresso')
const caneca = lista.json.find((p) => p.nome === 'Caneca personalizada')
conferir('padrão: não publicado, sob consulta', `${banner.publicado} ${banner.modoPreco} ${banner.slug}`, 'false sob_consulta null')

// Galeria
r = await chamar('POST', `/produtos/${banner.id}/imagens`, { token: admin, form: formulario(await imagem('#ff0000'), 'frente.png') })
conferir('envia 1ª imagem da galeria', `${r.status} ${r.json.length}`, '201 1')
r = await chamar('POST', `/produtos/${banner.id}/imagens`, { token: admin, form: formulario(await imagem('#00aa00', 800, 800), 'verso.png') })
conferir('envia 2ª imagem', `${r.status} ${r.json.length}`, '201 2')
const [frente, verso] = r.json
conferir('imagem disfarçada é recusada', (await chamar('POST', `/produtos/${banner.id}/imagens`, { token: admin, form: formulario('GIF89a', 'x.png') })).status, 422)
conferir('capa do produto = 1ª da galeria', (await chamar('GET', `/produtos/${banner.id}`, { token: admin })).json.imagemArquivoId, frente.arquivoId)
r = await chamar('PUT', `/produtos/${banner.id}/imagens/ordem`, { token: admin, body: { ids: [verso.id, frente.id] } })
conferir('reordena a galeria', r.json.map((i) => i.id).join(','), `${verso.id},${frente.id}`)
conferir('a capa acompanha a nova primeira', (await chamar('GET', `/produtos/${banner.id}`, { token: admin })).json.imagemArquivoId, verso.arquivoId)
conferir('ordem incompleta é recusada', (await chamar('PUT', `/produtos/${banner.id}/imagens/ordem`, { token: admin, body: { ids: [verso.id] } })).status, 422)
const miniatura = await fetch(BASE.replace('/api/v1', '') + r.json[0].url)
conferir('miniatura da área logada (link assinado, WebP)', `${miniatura.status} ${miniatura.headers.get('content-type')}`, '200 image/webp')

// Publicar
const vitrine = (dados) => ({ publicado: true, destaque: false, nomePublico: '', descricaoPublica: '', modoPreco: 'fixo', slug: '', ordem: 0, ...dados })
r = await chamar('PATCH', `/produtos/${banner.id}/vitrine`, { token: admin, body: vitrine({ destaque: true, modoPreco: 'a_partir_de', descricaoPublica: 'Lona 440 g com ótima resistência.', ordem: 1 }) })
conferir('publica com slug gerado do nome', `${r.status} ${r.json.publicado} ${r.json.slug}`, '200 true banner-em-lona-440-g')
conferir('slug repetido à mão: 409', (await chamar('PATCH', `/produtos/${adesivo.id}/vitrine`, { token: admin, body: vitrine({ slug: 'banner-em-lona-440-g' }) })).status, 409)
conferir('slug fora do padrão: 400', (await chamar('PATCH', `/produtos/${adesivo.id}/vitrine`, { token: admin, body: vitrine({ slug: 'Com Espaço' }) })).status, 400)
r = await chamar('PATCH', `/produtos/${adesivo.id}/vitrine`, { token: admin, body: vitrine({ nomePublico: 'Banner em lona 440 g' }) })
conferir('nome igual gera slug com sufixo', r.json.slug, 'banner-em-lona-440-g-2')
r = await chamar('PATCH', `/produtos/${adesivo.id}/vitrine`, { token: admin, body: vitrine({ nomePublico: 'Adesivo vinil', slug: 'adesivo-vinil', ordem: 2 }) })
conferir('slug escolhido à mão', `${r.status} ${r.json.slug}`, '200 adesivo-vinil')
await chamar('DELETE', `/produtos/${caneca.id}`, { token: admin })
conferir('produto inativo não pode ser publicado', (await chamar('PATCH', `/produtos/${caneca.id}/vitrine`, { token: admin, body: vitrine({}) })).status, 422)
conferir('contagem de publicados', (await chamar('GET', '/vitrine/config', { token: admin })).json.produtosPublicados, 2)

// Bainha obrigatória no banner (entra na solicitação mesmo sem marcar)
const detalheBanner = (await chamar('GET', `/produtos/${banner.id}`, { token: admin })).json
const acab = Object.fromEntries(detalheBanner.acabamentos.map((a) => [a.acabamento.nome, a.acabamentoId]))
await chamar('PUT', `/produtos/${banner.id}/acabamentos`, {
  token: admin,
  body: { itens: detalheBanner.acabamentos.map((a) => ({ acabamentoId: a.acabamentoId, obrigatorio: a.acabamento.nome === 'Bainha', padrao: a.padrao })) },
})

console.log('\n— Site público —')
r = await pub('/')
conferir('início do site', `${r.status} ${r.json.slug} ${r.json.empresa.titulo}`, `200 ${SLUG} Gráfica Exemplo`)
conferir('telefone oculto, mensagem pós-envio', `${r.json.empresa.telefone} ${r.json.empresa.mensagemPedidoEnviado}`, 'null Recebemos! Respondemos em até 2 horas.')
conferir('destaques: só o banner, com preço "a partir de" por m²', r.json.destaques.map((d) => `${d.slug} ${d.preco.modo} ${d.preco.valor} ${d.preco.unidade}`).join(';'), 'banner-em-lona-440-g a_partir_de 65.00 m²')
conferir('categorias com quantidade', r.json.categorias.map((c) => c.quantidade).reduce((a, b) => a + b, 0), 2)
conferir('banner com 1 imagem', r.json.banners.length, 1)
conferir('nada de custo no site', JSON.stringify(r.json).includes('custo'), false)
r = await pub('/produtos')
conferir('lista paginada: publicados, pela ordem', `${r.json.meta.total} ${r.json.data.map((p) => p.slug).join(',')}`, '2 banner-em-lona-440-g,adesivo-vinil')
conferir('busca pelo nome público', (await pub('/produtos?busca=adesivo')).json.data.map((p) => p.nome).join(','), 'Adesivo vinil')
conferir('preço fixo', (await pub('/produtos?busca=adesivo')).json.data[0].preco.valor, '70.00')
r = await pub('/produtos/banner-em-lona-440-g')
conferir('detalhe: galeria (capa primeiro), medidas e acabamentos', `${r.status} ${r.json.imagens.length} ${r.json.medidas.larguraMaxima} ${r.json.acabamentos.length}`, '200 2 3.2 3')
conferir('acabamento obrigatório já vem marcado', r.json.acabamentos.filter((a) => a.obrigatorio && a.padrao).map((a) => a.nome).join(), 'Bainha')
conferir('texto de venda', r.json.descricao, 'Lona 440 g com ótima resistência.')
conferir('nada de custo no detalhe', JSON.stringify(r.json).includes('custo'), false)
conferir('produto não publicado: 404', (await pub('/produtos/caneca-personalizada')).status, 404)

const img = await fetch(`${BASE}/publico/${SLUG}/vitrine/imagens/${verso.arquivoId}?w=480`)
const bytes = Buffer.from(await img.arrayBuffer())
const meta = await sharp(bytes).metadata()
conferir('imagem WebP redimensionada com cache', `${img.status} ${img.headers.get('content-type')} ${img.headers.get('cache-control')} ${meta.format} ${meta.width}`, '200 image/webp public, max-age=86400 webp 480')
const img2 = await fetch(`${BASE}/publico/${SLUG}/vitrine/imagens/${frente.arquivoId}?w=1200`)
conferir('versão grande (1200 px)', `${img2.status} ${(await sharp(Buffer.from(await img2.arrayBuffer())).metadata()).width}`, '200 1200')
conferir('banner da vitrine também é servido', (await fetch(`${BASE}/publico/${SLUG}/vitrine/imagens/${bannerId}`)).status, 200)
conferir('largura fora da lista: 400', (await fetch(`${BASE}/publico/${SLUG}/vitrine/imagens/${verso.arquivoId}?w=4000`)).status, 400)
r = await chamar('POST', `/produtos/${caneca.id}/reativar`, { token: admin })
const imgCaneca = await chamar('POST', `/produtos/${caneca.id}/imagens`, { token: admin, form: formulario(await imagem('#999999', 300, 300), 'caneca.png') })
conferir('imagem de produto não publicado não é servida', (await fetch(`${BASE}/publico/${SLUG}/vitrine/imagens/${imgCaneca.json[0].arquivoId}`)).status, 404)

console.log('\n— HTTPS sob demanda (Caddy) —')
conferir('vitrine no ar: 200', await permitida(`${SLUG}.localhost`), 200)
conferir('subdomínio reservado: 404', await permitida('www.localhost'), 404)
conferir('empresa inexistente: 404', await permitida('nao-existe.localhost'), 404)
conferir('domínio de fora: 404', await permitida(`${SLUG}.exemplo.com`), 404)

console.log('\n— Vendedor —')
const papeis = (await chamar('GET', '/permissoes', { token: admin })).json.papeis
await chamar('POST', '/usuarios', { token: admin, body: { nome: 'Vendedor Vitrine', email: 'vend@vitrine.local', papelId: papeis.find((p) => p.codigo === 'vendedor').id, senhaProvisoria: 'provisoria1' } })
const vend = await entrar('vend@vitrine.local', 'provisoria1', 'Vendedor123')
conferir('vendedor vê a configuração', (await chamar('GET', '/vitrine/config', { token: vend })).status, 200)
conferir('vendedor vê os produtos da vitrine', (await chamar('GET', '/vitrine/produtos', { token: vend })).status, 200)
conferir('vendedor não edita a configuração', (await chamar('PUT', '/vitrine/config', { token: vend, body: corpoConfig })).status, 403)
conferir('vendedor não publica produto', (await chamar('PATCH', `/produtos/${banner.id}/vitrine`, { token: vend, body: vitrine({}) })).status, 403)
conferir('vendedor não mexe na galeria', (await chamar('PUT', `/produtos/${banner.id}/imagens/ordem`, { token: vend, body: { ids: [frente.id, verso.id] } })).status, 403)

console.log('\n— Lista de orçamento —')
const pedido = {
  nome: 'Ana Visitante',
  whatsapp: '(11) 97777-6666',
  email: 'ana@visitante.local',
  mensagem: 'Preciso até sexta.',
  site: '',
  itens: [
    { produtoSlug: 'banner-em-lona-440-g', quantidade: 2, largura: '1,50', altura: '0,80', acabamentoIds: [acab['Bastão e cordão']], observacao: 'Arte própria' },
    { produtoSlug: 'adesivo-vinil', quantidade: 10, largura: '0,5', altura: '0,5', acabamentoIds: [acab['Bastão e cordão']] },
  ],
}
r = await pub('/pedidos', { body: pedido })
if (r.status !== 200) console.log(JSON.stringify(r.json))
conferir('envio cria a solicitação', `${r.status} ${/^SOL-\d{4}-\d{4}$/.test(r.json.numero)} ${r.json.mensagem}`, '200 true Recebemos! Respondemos em até 2 horas.')
const numero = r.json.numero
let sols = (await chamar('GET', '/solicitacoes?origem=site', { token: admin })).json
const sol = sols.data[0]
conferir('solicitação nova, origem site, com e-mail', `${sols.meta.total} ${sol.numero} ${sol.status} ${sol.origem} ${sol.email}`, `1 ${numero} nova site ana@visitante.local`)
conferir('cliente pré-cadastrado', `${sol.cliente.nome} ${sol.cliente.situacao} ${sol.cliente.whatsapp}`, 'Ana Visitante pre_cadastro 11977776666')
conferir('itens com medidas', sol.itens.map((i) => `${i.descricao}|${i.quantidade}|${i.largura}|${i.altura}`).join(';'), 'Banner em lona 440 g|2|1.5|0.8;Adesivo vinil|10|0.5|0.5')
conferir('acabamentos: obrigatório + escolhido; de outro produto é ignorado', sol.itens.map((i) => i.acabamentos.map((a) => a.nome).sort().join('+')).join(';'), 'Bainha+Bastão e cordão;')
conferir('descrição montada com os itens e a mensagem', sol.descricao.split('\n')[1], '1. Banner em lona 440 g · Qtd.: 2 · 1,5 × 0,8 m · Acabamentos: Bainha, Bastão e cordão · Obs.: Arte própria')
conferir('detalhe traz os itens', (await chamar('GET', `/solicitacoes/${sol.id}`, { token: admin })).json.itens.length, 2)
conferir('filtro por outra origem não traz', (await chamar('GET', '/solicitacoes?origem=balcao', { token: admin })).json.meta.total, 0)
const avisoAdmin = (await chamar('GET', '/notificacoes', { token: admin })).json.data.find((n) => n.titulo === `Pedido pelo site: ${numero}`)
conferir('aviso no sino de quem vê orçamentos', `${Boolean(avisoAdmin)} ${avisoAdmin?.link}`, `true /orcamentos/solicitacoes?id=${sol.id}`)
conferir('vendedor (vê orçamentos) também é avisado', (await chamar('GET', '/notificacoes', { token: vend })).json.data.some((n) => n.titulo === `Pedido pelo site: ${numero}`), true)

r = await pub('/pedidos', { body: { ...pedido, nome: 'Ana V.', email: '', itens: [pedido.itens[1]] } })
sols = (await chamar('GET', '/solicitacoes?origem=site', { token: admin })).json
conferir('mesmo WhatsApp = mesmo cliente', `${r.status} ${sols.meta.total} ${new Set(sols.data.map((s) => s.cliente.id)).size}`, '200 2 1')

r = await pub('/pedidos', { body: { ...pedido, whatsapp: '11955554444', site: 'http://spam.example' } })
conferir('campo-isca: 200 sem gravar', `${r.status} ${r.json.numero} ${(await chamar('GET', '/solicitacoes?origem=site', { token: admin })).json.meta.total}`, '200  2')
conferir('produto que não está na vitrine: 422', (await pub('/pedidos', { body: { ...pedido, itens: [{ produtoSlug: 'caneca-personalizada', quantidade: 1 }] } })).status, 422)
conferir('m² sem medidas: 422', (await pub('/pedidos', { body: { ...pedido, itens: [{ produtoSlug: 'banner-em-lona-440-g', quantidade: 1 }] } })).status, 422)
conferir('6º envio em 10 min do mesmo IP: 429', (await pub('/pedidos', { body: pedido })).status, 429)
conferir('só 2 solicitações gravadas', (await chamar('GET', '/solicitacoes?origem=site', { token: admin })).json.meta.total, 2)

console.log('\n— Desligar —')
await chamar('PUT', '/vitrine/config', { token: admin, body: { ...corpoConfig, ativa: false } })
conferir('vitrine desligada: site 404', (await pub('/')).status, 404)
conferir('vitrine desligada: imagens 404', (await fetch(`${BASE}/publico/${SLUG}/vitrine/imagens/${verso.arquivoId}`)).status, 404)
conferir('vitrine desligada: Caddy não emite', await permitida(`${SLUG}.localhost`), 404)
await chamar('PUT', '/vitrine/config', { token: admin, body: corpoConfig })
await chamar('POST', `/plataforma/empresas/${empresa.id}/acoes`, { token: plataforma, body: { acao: 'modulos_extras', modulos: [] } })
conferir('módulo retirado do plano: site 404', (await pub('/')).status, 404)

console.log('\n— Slug de empresa reservado —')
r = await chamar('POST', '/plataforma/empresas', { token: plataforma, body: { nome: 'API', email: 'dono@api.local', responsavel: 'Dono API', plano: 'essencial', situacao: 'ativa' } })
conferir('empresa chamada "API" não fica com o subdomínio reservado', `${r.status} ${r.json.slug}`, '201 api-2')

finalizar()
