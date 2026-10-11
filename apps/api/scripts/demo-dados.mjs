// Empresa de DEMONSTRAÇÃO "Ponto Visual Comunicação" com dados realistas para as telas de marketing.
// Cria a empresa (plano Completo, ativa, catálogo de exemplo), a equipe, clientes, fornecedores, catálogo,
// estoque, orçamentos, pedidos em cada etapa (com artes, OPs e pagamentos), financeiro, caixa e vitrine.
// Tudo passa pela API; no fim as datas são espalhadas pelos últimos meses direto no schema DESTA empresa
// (a API grava "agora" em tudo), para o painel, o fluxo de caixa e os relatórios terem histórico.
//
// Uso (no container da API):
//   1. (opcional, no computador) python apps/api/scripts/demo-imagens.py <pasta>  → imagens dos produtos, banners, logo e artes
//      docker compose cp <pasta> api:/tmp/demo-imagens
//   2. node apps/api/scripts/demo-dados.mjs http://127.0.0.1:3333/api/v1 [/tmp/demo-imagens]
// Login: demo@pontovisual.local / Demo12345 · vitrine: http://pontovisual.localhost:5173
// Se a empresa já existir com dados, não faz nada.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import { chamar, entrar } from './e2e-util.mjs'

const PASTA_IMAGENS = process.argv[3] ?? null
const EMAIL = 'demo@pontovisual.local'
const SENHA = 'Demo12345'
const SENHA_PROVISORIA = 'Provisoria123'
const SLUG = 'pontovisual'
const NOME_EMPRESA = 'Ponto Visual Comunicação'
const PASTA_API = fileURLToPath(new URL('..', import.meta.url))

// ─── Utilitários ────────────────────────────────────────────────────────────

let token = null
async function api(metodo, caminho, body, form) {
  const r = await chamar(metodo, caminho, { token, ...(form ? { form } : body !== undefined ? { body } : {}) })
  if (r.status >= 300) throw new Error(`${metodo} ${caminho} → ${r.status}: ${JSON.stringify(r.json)?.slice(0, 600)}`)
  return r.json
}
const lista = (j) => (Array.isArray(j) ? j : (j?.data ?? []))

// Datas no horário de Brasília
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const dia = (n) => new Date(Date.parse(`${hoje}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)
const doisDigitos = (n) => String(n).padStart(2, '0')
/** Momento no dia `n` (relativo a hoje), às hh:mm de Brasília */
const em = (n, hh, mm = 0) => new Date(`${dia(n)}T${doisDigitos(hh)}:${doisDigitos(mm)}:00-03:00`)
/** CPF/CNPJ fictício com os dígitos verificadores recalculados (mantém o formato) */
function doc(texto) {
  const n = [...texto.replace(/\D/g, '')].map(Number)
  const tam = n.length === 14 ? 12 : 9
  const base = n.slice(0, tam)
  const digito = (nums, pesos) => {
    const resto = nums.reduce((s, x, i) => s + x * pesos[i], 0) % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const pesos1 = tam === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [10, 9, 8, 7, 6, 5, 4, 3, 2]
  const pesos2 = tam === 12 ? [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
  base.push(digito(base, pesos1))
  base.push(digito(base, pesos2))
  const d = base.join('')
  return tam === 12 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}
const reais = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Aleatório com semente: os dados saem iguais a cada execução
let semente = 20261010
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648)
const entre = (a, b) => a + Math.floor(aleatorio() * (b - a + 1))

// Imagens: da pasta gerada pelo demo-imagens.py; sem ela, um quadro colorido simples
const CORES = ['#2563eb', '#f97316', '#16a34a', '#db2777', '#7c3aed', '#0891b2', '#ca8a04']
async function imagem(nome) {
  const caminho = PASTA_IMAGENS && `${PASTA_IMAGENS}/${nome}.png`
  if (caminho && existsSync(caminho)) return readFileSync(caminho)
  const cor = CORES[[...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES.length]
  return sharp({ create: { width: 1000, height: 1000, channels: 3, background: cor } }).png().toBuffer()
}
async function formulario(nome) {
  const form = new FormData()
  form.append('arquivo', new Blob([await imagem(nome)], { type: 'image/png' }), `${nome}.png`)
  return form
}

// ─── Empresa ────────────────────────────────────────────────────────────────

const existente = await chamar('POST', '/auth/login', { body: { email: EMAIL, senha: SENHA } })
if (existente.status === 200) {
  token = existente.json.accessToken
  const clientes = await chamar('GET', '/clientes?pageSize=1', { token })
  if (clientes.json?.meta?.total > 0) {
    console.log(`A empresa de demonstração já existe com dados (${EMAIL}). Nada foi criado.`)
    process.exit(0)
  }
} else {
  console.log('— Criando a empresa (plano Completo, ativa, com catálogo de exemplo) —')
  execFileSync(
    'npx',
    ['tsx', 'prisma/criar-empresa.ts', '--nome', NOME_EMPRESA, '--email', EMAIL, '--senha', SENHA_PROVISORIA, '--slug', SLUG, '--plano', 'completo', '--ativa', '--exemplos'],
    { cwd: PASTA_API, stdio: 'inherit' },
  )
  token = await entrar(EMAIL, SENHA_PROVISORIA, SENHA)
}

// Acesso direto ao schema da empresa (só para espalhar as datas no fim de cada bloco)
const plataforma = new PrismaClient({ datasourceUrl: comSchema('plataforma') })
const [{ schema }] = await plataforma.$queryRawUnsafe('SELECT schema FROM plataforma.assinantes WHERE slug = $1', SLUG)
await plataforma.$disconnect()
if (!/^emp_[a-z0-9]+$/.test(schema)) throw new Error(`Schema inesperado para ${SLUG}: ${schema}`)
const db = new PrismaClient({ datasourceUrl: comSchema(schema) })
function comSchema(nome) {
  const url = new URL(process.env.DATABASE_URL)
  url.searchParams.set('schema', nome)
  return url.toString()
}
const sql = (q, ...p) => db.$executeRawUnsafe(q, ...p)
const consulta = (q, ...p) => db.$queryRawUnsafe(q, ...p)

console.log('\n— Dados da empresa, logo e equipe —')
const empresa = await api('GET', '/empresa')
await api('PUT', '/empresa', {
  razaoSocial: 'Ponto Visual Comunicação Ltda',
  nomeFantasia: 'Ponto Visual',
  cnpj: '11.222.333/0001-81',
  ie: '123.456.789.110',
  email: 'contato@pontovisual.local',
  telefone: '(11) 3333-4455',
  whatsapp: '(11) 98765-4321',
  site: 'pontovisual.localhost:5173',
  cep: '04101-300',
  logradouro: 'Rua Domingos de Morais',
  numero: '1250',
  complemento: 'Loja 2',
  bairro: 'Vila Mariana',
  cidade: 'São Paulo',
  uf: 'SP',
  validadeOrcamentoDias: 10,
  condicoesPadrao: 'Sinal de 50% na aprovação e saldo na retirada. Prazo de produção contado a partir da aprovação da arte.',
  sinalPercentual: '50',
  chavePix: '11.222.333/0001-81',
  areaMinimaM2: empresa.areaMinimaM2 ?? '0.5',
  ...(empresa.inatividadeMinutos ? { inatividadeMinutos: empresa.inatividadeMinutos } : {}),
})
await api('POST', '/empresa/logo', undefined, await formulario('logo')).catch((e) => console.warn(`  (logo não enviado: ${e.message})`))
console.log('✔ Ponto Visual Comunicação Ltda · CNPJ 11.222.333/0001-81')

const matriz = await api('GET', '/permissoes')
const papel = (codigo) => matriz.papeis.find((p) => p.codigo === codigo).id
const eu = await api('GET', '/auth/me')
const meuId = eu.id ?? eu.usuario?.id
await api('PUT', `/usuarios/${meuId}`, { nome: 'Carla Mendes', email: EMAIL, telefone: '(11) 98765-4321', papelId: papel('admin'), comissaoPercentual: '0', ativo: true })
const equipe = {}
for (const [chave, nome, email, p, comissao] of [
  ['rafael', 'Rafael Nunes', 'rafael@pontovisual.local', 'vendedor', '3'],
  ['bianca', 'Bianca Torres', 'bianca@pontovisual.local', 'vendedor', '3'],
  ['thiago', 'Thiago Ramos', 'thiago@pontovisual.local', 'designer', '0'],
  ['diego', 'Diego Alves', 'diego@pontovisual.local', 'producao', '0'],
  ['sueli', 'Sueli Costa', 'sueli@pontovisual.local', 'financeiro', '0'],
]) {
  equipe[chave] = (await api('POST', '/usuarios', { nome, email, papelId: papel(p), senhaProvisoria: SENHA_PROVISORIA, comissaoPercentual: comissao })).id
  console.log(`✔ ${nome} (${p})`)
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

console.log('\n— Catálogo: máquinas, processos, insumos, acabamentos e produtos —')
const unidades = await api('GET', '/unidades-medida')
const un = (sigla) => unidades.find((u) => u.sigla === sigla).id
const categorias = lista(await api('GET', '/categorias?pageSize=100'))
const categoria = (nome) => categorias.find((c) => c.nome === nome)?.id
const catFachadas = (await api('POST', '/categorias', { nome: 'Fachadas e placas', paiId: categoria('Comunicação visual') })).id
const catImpressos = categoria('Gráfica rápida')
const catPersonalizados = categoria('Personalizados')
const catMateriais = categoria('Materiais (insumos)')
const catBalcao = (await api('POST', '/categorias', { nome: 'Balcão e papelaria' })).id
await api('PUT', `/categorias/${catImpressos}`, { nome: 'Impressos', ativo: true })

const maquinasExistentes = lista(await api('GET', '/maquinas?pageSize=100'))
const maquina = (inicio) => maquinasExistentes.find((m) => m.nome.startsWith(inicio))?.id
const mq = {
  plotter: maquina('Plotter eco-solvente'),
  laser: maquina('Impressora laser'),
  prensa: maquina('Prensa térmica de caneca'),
  router: (await api('POST', '/maquinas', { nome: 'Router CNC 1,30 × 2,50 m', tipo: 'Corte e fresa', custoHora: '60', observacoes: 'Corte de ACM, PVC e acrílico' })).id,
  uv: (await api('POST', '/maquinas', { nome: 'Impressora UV mesa plana', tipo: 'Impressão direta em chapas', larguraUtil: '1.25', velocidadeM2Hora: '8', custoHora: '70' })).id,
  recorte: (await api('POST', '/maquinas', { nome: 'Plotter de recorte 1,30 m', tipo: 'Recorte de vinil', custoHora: '20' })).id,
  prensaPlana: (await api('POST', '/maquinas', { nome: 'Prensa térmica plana 40 × 60', tipo: 'Sublimação têxtil', custoHora: '12' })).id,
}
const processos = lista(await api('GET', '/processos?pageSize=100'))
const processo = (nome) => processos.find((p) => p.nome === nome)?.id
const pr = {
  impressao: processo('Impressão digital'),
  acabamento: processo('Acabamento'),
  corte: processo('Corte e refile'),
  sublimacao: processo('Sublimação'),
  cnc: (await api('POST', '/processos', { nome: 'Corte CNC', maquinaPadraoId: mq.router, tempoPadraoMinutos: 20 })).id,
  montagem: (await api('POST', '/processos', { nome: 'Montagem e dobra', tempoPadraoMinutos: 30, custoHora: '35' })).id,
  uv: (await api('POST', '/processos', { nome: 'Impressão UV', maquinaPadraoId: mq.uv })).id,
  costura: (await api('POST', '/processos', { nome: 'Costura e acabamento têxtil', tempoPadraoMinutos: 15, custoHora: '25' })).id,
  subTextil: (await api('POST', '/processos', { nome: 'Sublimação têxtil', maquinaPadraoId: mq.prensaPlana, tempoPadraoMinutos: 4 })).id,
}

const insumosExistentes = lista(await api('GET', '/insumos?pageSize=100'))
const insumo = (inicio) => insumosExistentes.find((i) => i.nome.startsWith(inicio))?.id
const ins = {
  lona: insumo('Lona 440'),
  vinil: insumo('Vinil adesivo branco'),
  couche300: insumo('Papel couché 300'),
  caneca: insumo('Caneca branca'),
  tinta: insumo('Tinta eco-solvente'),
  ilhos: insumo('Ilhós'),
}
const novoInsumo = async (dados) => (await api('POST', '/insumos', { categoriaId: catMateriais, ...dados })).id
ins.acm = await novoInsumo({ nome: 'Chapa ACM 3 mm branca (1,22 × 5,00 m)', unidadeMedidaId: un('m²'), embalagem: 'chapa', embalagemLargura: '1.22', embalagemComprimento: '5', precoEmbalagem: '690', estoqueMinimo: '12' })
ins.pvc = await novoInsumo({ nome: 'Chapa PVC expandido 3 mm (1,22 × 2,44 m)', unidadeMedidaId: un('m²'), embalagem: 'chapa', embalagemLargura: '1.22', embalagemComprimento: '2.44', precoEmbalagem: '145', estoqueMinimo: '10' })
ins.perfurado = await novoInsumo({ nome: 'Vinil perfurado one way (rolo 1,37 m)', unidadeMedidaId: un('m²'), embalagem: 'rolo', embalagemLargura: '1.37', embalagemComprimento: '50', precoEmbalagem: '980', estoqueMinimo: '30' })
ins.couche115 = await novoInsumo({ nome: 'Papel couché 115 g (folha SRA3)', unidadeMedidaId: un('fl'), embalagem: 'pacote', embalagemConteudo: '500', precoEmbalagem: '165', estoqueMinimo: '1000' })
ins.camiseta = await novoInsumo({ nome: 'Camiseta poliéster branca (P a GG)', unidadeMedidaId: un('un'), embalagem: 'caixa', embalagemConteudo: '50', precoEmbalagem: '690', estoqueMinimo: '30' })
ins.tecido = await novoInsumo({ nome: 'Tecido oxford para sublimação (rolo 1,60 m)', unidadeMedidaId: un('m²'), embalagem: 'rolo', embalagemLargura: '1.6', embalagemComprimento: '50', precoEmbalagem: '520', estoqueMinimo: '20' })
ins.kitWind = await novoInsumo({ nome: 'Kit haste + base para wind banner 2,5 m', unidadeMedidaId: un('un'), embalagem: 'unidade', precoEmbalagem: '150', estoqueMinimo: '4' })

const acabamentosLista = lista(await api('GET', '/acabamentos?pageSize=100'))
const ac = Object.fromEntries(acabamentosLista.map((a) => [a.nome, a.id]))
ac['Recorte eletrônico'] = (await api('POST', '/acabamentos', { nome: 'Recorte eletrônico', tipoCobranca: 'por_m2', valor: '18', custo: '5' })).id
ac['Aplicação no local'] = (await api('POST', '/acabamentos', { nome: 'Aplicação no local', tipoCobranca: 'por_m2', valor: '25', custo: '10', prazoAdicionalDias: 1 })).id
ac['Fita dupla face'] = (await api('POST', '/acabamentos', { nome: 'Fita dupla face', tipoCobranca: 'por_unidade', valor: '4', custo: '1.2' })).id
ac['Laminação fosca frente'] = (await api('POST', '/acabamentos', { nome: 'Laminação fosca frente', descricao: 'Para cartões e impressos pequenos (por lote)', tipoCobranca: 'fixo', valor: '45', custo: '15' })).id
ac['Cantos arredondados'] = (await api('POST', '/acabamentos', { nome: 'Cantos arredondados', tipoCobranca: 'fixo', valor: '25', custo: '5' })).id

const produtosLista = lista(await api('GET', '/produtos?pageSize=100'))
const produtoExistente = (inicio) => produtosLista.find((p) => p.nome.startsWith(inicio))
const P = {
  banner: produtoExistente('Banner em lona'),
  adesivo: produtoExistente('Adesivo vinil'),
  cartao: produtoExistente('Cartão de visita'),
  caneca: produtoExistente('Caneca personalizada'),
  instalacao: produtoExistente('Instalação'),
}
async function novoProduto(dados, composicao, acabamentos = []) {
  const p = await api('POST', '/produtos', dados)
  if (composicao) await api('PUT', `/produtos/${p.id}/composicao`, { modoCusto: 'composicao', extras: [], precoVenda: dados.precoVenda, ...composicao })
  if (acabamentos.length) await api('PUT', `/produtos/${p.id}/acabamentos`, { itens: acabamentos.map(([nome, padrao = false]) => ({ acabamentoId: ac[nome], padrao })) })
  return api('GET', `/produtos/${p.id}`)
}
P.fachada = await novoProduto(
  { nome: 'Fachada em ACM com impressão', descricao: 'Painel em ACM 3 mm com adesivo impresso e laminado, estrutura em metalon.', modoCalculo: 'm2', precoVenda: '480', precoMinimo: '420', larguraMaxima: '12', alturaMaxima: '3', prazoProducaoDias: 7, unidadeMedidaId: un('m²'), categoriaId: catFachadas },
  {
    materiais: [{ insumoId: ins.acm, quantidade: '1', base: 'por_m2', perdaPercentual: '12' }, { insumoId: ins.vinil, quantidade: '1', base: 'por_m2', perdaPercentual: '8' }, { insumoId: ins.tinta, quantidade: '10', base: 'por_m2', perdaPercentual: '5' }],
    producao: [{ processoId: pr.impressao, maquinaId: mq.plotter, base: 'por_m2' }, { processoId: pr.cnc, maquinaId: mq.router, base: 'por_m2', minutos: '12' }, { processoId: pr.montagem, base: 'por_m2', minutos: '25' }],
    extras: [{ nome: 'Estrutura em metalon', valor: '38', base: 'por_m2' }],
    lucroDesejado: '45',
    precoMinimo: '420',
  },
  [['Criação de arte']],
)
P.placa = await novoProduto(
  { nome: 'Placa em PVC 3 mm', descricao: 'Placa em PVC expandido com impressão UV direta. Ideal para sinalização interna.', modoCalculo: 'm2', precoVenda: '180', precoMinimo: '150', larguraMaxima: '2.4', alturaMaxima: '1.2', prazoProducaoDias: 3, unidadeMedidaId: un('m²'), categoriaId: catFachadas },
  {
    materiais: [{ insumoId: ins.pvc, quantidade: '1', base: 'por_m2', perdaPercentual: '10' }],
    producao: [{ processoId: pr.uv, maquinaId: mq.uv, base: 'por_m2' }, { processoId: pr.cnc, maquinaId: mq.router, base: 'por_m2', minutos: '8' }],
    lucroDesejado: '50',
    precoMinimo: '150',
  },
  [['Fita dupla face'], ['Cantos arredondados'], ['Criação de arte']],
)
P.perfurado = await novoProduto(
  { nome: 'Adesivo perfurado para vidro', descricao: 'Vinil perfurado one way: quem está dentro enxerga a rua, quem está fora vê a sua marca.', modoCalculo: 'm2', precoVenda: '95', precoMinimo: '80', larguraMaxima: '6', alturaMaxima: '30', prazoProducaoDias: 2, unidadeMedidaId: un('m²'), categoriaId: categoria('Adesivos') },
  {
    materiais: [{ insumoId: ins.perfurado, quantidade: '1', base: 'por_m2', perdaPercentual: '8' }, { insumoId: ins.tinta, quantidade: '10', base: 'por_m2', perdaPercentual: '5' }],
    producao: [{ processoId: pr.impressao, maquinaId: mq.plotter, base: 'por_m2', setupMinutos: '5' }],
    lucroDesejado: '55',
    precoMinimo: '80',
  },
  [['Aplicação no local'], ['Criação de arte']],
)
P.panfleto = await novoProduto(
  { nome: 'Panfleto 10 × 15 cm 4×0 couché 115 g', descricao: 'Panfleto colorido frente, papel couché brilho 115 g.', modoCalculo: 'milheiro', precoVenda: '160', prazoProducaoDias: 3, unidadeMedidaId: un('mil'), categoriaId: catImpressos },
  {
    materiais: [{ insumoId: ins.couche115, quantidade: '0.0834', base: 'por_unidade', perdaPercentual: '3' }],
    producao: [{ processoId: pr.impressao, maquinaId: mq.laser, base: 'por_unidade', minutos: '0.05' }, { processoId: pr.corte, base: 'por_item', minutos: '15' }],
    lucroDesejado: '50',
  },
  [['Criação de arte']],
)
P.wind = await novoProduto(
  { nome: 'Wind banner 2,5 m com base', descricao: 'Bandeira em tecido sublimado com haste flexível e base para enchimento com água.', modoCalculo: 'unidade', precoVenda: '390', precoMinimo: '340', prazoProducaoDias: 4, unidadeMedidaId: un('un'), categoriaId: categoria('Banners e lonas') },
  {
    materiais: [{ insumoId: ins.tecido, quantidade: '1.4', base: 'por_unidade', perdaPercentual: '10' }, { insumoId: ins.kitWind, quantidade: '1', base: 'por_unidade' }],
    producao: [{ processoId: pr.subTextil, maquinaId: mq.prensaPlana, base: 'por_unidade', minutos: '12' }, { processoId: pr.costura, base: 'por_unidade', minutos: '20' }],
    lucroDesejado: '45',
    precoMinimo: '340',
  },
  [['Criação de arte']],
)
P.camiseta = await novoProduto(
  { nome: 'Camiseta personalizada (sublimação)', descricao: 'Camiseta poliéster com estampa sublimada frente. Tamanhos P ao GG.', modoCalculo: 'unidade', precoVenda: '45', precoMinimo: '38', prazoProducaoDias: 5, unidadeMedidaId: un('un'), categoriaId: catPersonalizados },
  {
    materiais: [{ insumoId: ins.camiseta, quantidade: '1', base: 'por_unidade', perdaPercentual: '3' }],
    producao: [{ processoId: pr.subTextil, maquinaId: mq.prensaPlana, base: 'por_unidade', minutos: '4' }],
    lucroDesejado: '50',
    precoMinimo: '38',
  },
  [['Embalagem individual'], ['Criação de arte']],
)
// Itens do balcão (PDV)
P.impressaoA4 = await novoProduto({ nome: 'Impressão A4 colorida', tipo: 'servico', modoCalculo: 'unidade', precoVenda: '2.50', custo: '0.60', unidadeMedidaId: un('un'), categoriaId: catBalcao })
P.copia = await novoProduto({ nome: 'Cópia A4 preto e branco', tipo: 'servico', modoCalculo: 'unidade', precoVenda: '0.50', custo: '0.10', unidadeMedidaId: un('un'), categoriaId: catBalcao })
P.plastificacao = await novoProduto({ nome: 'Plastificação A4', tipo: 'servico', modoCalculo: 'unidade', precoVenda: '6', custo: '1.50', unidadeMedidaId: un('un'), categoriaId: catBalcao })
P.encadernacao = await novoProduto({ nome: 'Encadernação espiral (até 100 folhas)', tipo: 'servico', modoCalculo: 'unidade', precoVenda: '12', custo: '3.50', unidadeMedidaId: un('un'), categoriaId: catBalcao })
P.pasta = await novoProduto({ nome: 'Pasta polionda A4 com elástico', tipo: 'revenda', modoCalculo: 'unidade', precoVenda: '9.90', custo: '4.20', controlaEstoque: true, estoqueMinimo: '10', unidadeMedidaId: un('un'), categoriaId: catBalcao })
// Acabamentos dos produtos do exemplo (a lista é substituída inteira)
await api('PUT', `/produtos/${P.banner.id}/acabamentos`, { itens: [{ acabamentoId: ac['Ilhós a cada 50 cm'], padrao: true }, { acabamentoId: ac.Bainha, padrao: true }, { acabamentoId: ac['Bastão e cordão'] }, { acabamentoId: ac['Criação de arte'] }] })
await api('PUT', `/produtos/${P.adesivo.id}/acabamentos`, { itens: [{ acabamentoId: ac['Laminação fosca'] }, { acabamentoId: ac['Recorte eletrônico'] }, { acabamentoId: ac['Aplicação no local'] }, { acabamentoId: ac['Criação de arte'] }] })
await api('PUT', `/produtos/${P.cartao.id}/acabamentos`, { itens: [{ acabamentoId: ac['Laminação fosca frente'] }, { acabamentoId: ac['Cantos arredondados'] }, { acabamentoId: ac['Criação de arte'] }] })
await api('PUT', `/produtos/${P.caneca.id}/acabamentos`, { itens: [{ acabamentoId: ac['Embalagem individual'] }, { acabamentoId: ac['Criação de arte'] }] })
console.log(`✔ ${Object.keys(P).length} produtos e serviços · ${Object.keys(ins).length} insumos · ${Object.keys(ac).length} acabamentos · ${Object.keys(mq).length} máquinas`)

// ─── Clientes e fornecedores ────────────────────────────────────────────────

console.log('\n— Clientes —')
const clientes = {}
const contatos = {}
for (const [chave, contato, dados, end] of [
  ['padaria', 'Antônio Ferreira', { tipoPessoa: 'PJ', nome: 'Panificadora Pão Dourado Ltda', fantasia: 'Padaria Pão Dourado', cpfCnpj: '12.345.678/0001-95', whatsapp: '(11) 98112-3301', email: 'compras@paodourado.com.br', origem: 'whatsapp', tags: ['alimentação'] }, ['Rua Cardeal Arcoverde', '1890', 'Pinheiros', '05408-002']],
  ['academia', 'Lucas Pimentel', { tipoPessoa: 'PJ', nome: 'Força Total Academia Ltda', fantasia: 'Academia Força Total', cpfCnpj: '23.456.789/0001-08', whatsapp: '(11) 97455-1020', email: 'marketing@forcatotal.com.br', origem: 'instagram', tags: ['fitness'] }, ['Av. Jabaquara', '1580', 'Saúde', '04046-200']],
  ['clinica', 'Dra. Fernanda Alves', { tipoPessoa: 'PJ', nome: 'Sorriso Pleno Odontologia S/S', fantasia: 'Clínica Sorriso Pleno', cpfCnpj: '34.567.890/0001-11', whatsapp: '(11) 99630-7788', email: 'recepcao@sorrisopleno.com.br', origem: 'site', tags: ['saúde'] }, ['Av. Ibirapuera', '2120', 'Moema', '04028-001']],
  ['escola', 'Patrícia Gomes', { tipoPessoa: 'PJ', nome: 'Escola Pequeno Saber Ltda', fantasia: 'Escola Pequeno Saber', cpfCnpj: '45.678.901/0001-34', telefone: '(11) 5581-4400', whatsapp: '(11) 98820-4400', email: 'secretaria@pequenosaber.com.br', origem: 'indicacao', tags: ['educação'] }, ['Rua Dona Inácia Uchoa', '310', 'Vila Mariana', '04110-020']],
  ['autocenter', 'Roberto Siqueira', { tipoPessoa: 'PJ', nome: 'Rodão Auto Center Ltda', fantasia: 'Auto Center Rodão', cpfCnpj: '56.789.012/0001-57', telefone: '(11) 4433-2211', whatsapp: '(11) 97001-2233', origem: 'telefone', tags: ['automotivo'] }, ['Av. Industrial', '900', 'Jardim', '09080-510', 'Santo André']],
  ['hortifruti', 'Sandra Okada', { tipoPessoa: 'PJ', nome: 'Vila Verde Comércio de Hortifrutigranjeiros Ltda', fantasia: 'Hortifruti Vila Verde', cpfCnpj: '67.890.123/0001-70', whatsapp: '(11) 98345-6677', email: 'financeiro@hortivilaverde.com.br', origem: 'balcao', tags: ['alimentação'] }, ['Rua Clélia', '1500', 'Lapa', '05042-000']],
  ['cafe', 'Gabriel Moura', { tipoPessoa: 'PJ', nome: 'Café Aroma Cafeteria e Bistrô Ltda', fantasia: 'Café Aroma', cpfCnpj: '78.901.234/0001-93', whatsapp: '(11) 99211-3040', email: 'gabriel@cafearoma.com.br', origem: 'instagram', tags: ['alimentação'] }, ['Rua Harmonia', '455', 'Vila Madalena', '05435-000']],
  ['otica', 'Cláudia Ventura', { tipoPessoa: 'PJ', nome: 'Ótica Vista Clara Ltda', fantasia: 'Ótica Vista', cpfCnpj: '89.012.345/0001-06', whatsapp: '(11) 98567-1122', email: 'contato@oticavista.com.br', origem: 'whatsapp', tags: ['varejo'] }, ['Rua Tuiuti', '2200', 'Tatuapé', '03307-000']],
  ['pizzaria', 'Giovanni Russo', { tipoPessoa: 'PJ', nome: 'Bella Massa Pizzaria Ltda', fantasia: 'Pizzaria Bella Massa', cpfCnpj: '90.123.456/0001-29', whatsapp: '(11) 99456-7788', telefone: '(11) 3456-7788', origem: 'whatsapp', tags: ['alimentação'] }, ['Rua da Mooca', '3010', 'Mooca', '03104-002']],
  ['eventos', 'Marina Couto', { tipoPessoa: 'PJ', nome: 'Celebrar Eventos e Cerimonial Ltda', fantasia: 'Celebrar Eventos', cpfCnpj: '01.234.567/0001-42', whatsapp: '(11) 97788-9900', email: 'marina@celebrareventos.com.br', origem: 'indicacao', tags: ['eventos'] }, ['Rua Voluntários da Pátria', '2600', 'Santana', '02402-100']],
  ['imobiliaria', 'Eduardo Prado', { tipoPessoa: 'PJ', nome: 'Lar Ideal Negócios Imobiliários Ltda', fantasia: 'Lar Ideal Imóveis', cpfCnpj: '13.579.246/0001-80', telefone: '(11) 3721-0099', email: 'eduardo@larideal.com.br', origem: 'email', tags: ['imobiliário'] }, ['Av. Corifeu de Azevedo Marques', '1200', 'Butantã', '05582-001']],
  ['petshop', 'Aline Barros', { tipoPessoa: 'PJ', nome: 'Pet Feliz Banho e Tosa Ltda', fantasia: 'Pet Feliz', cpfCnpj: '24.680.135/0001-03', whatsapp: '(11) 96123-4567', origem: 'instagram', tags: ['pet'] }, ['Av. dos Autonomistas', '4500', 'Centro', '06090-010', 'Osasco']],
  ['construtora', 'Henrique Lacerda', { tipoPessoa: 'PJ', nome: 'Alicerce Engenharia e Construções Ltda', fantasia: 'Alicerce Engenharia', cpfCnpj: '35.791.468/0001-26', telefone: '(11) 4195-3300', email: 'obras@alicerce.eng.br', origem: 'email', tags: ['construção'] }, ['Alameda Rio Negro', '500', 'Alphaville', '06454-000', 'Barueri']],
  ['fernanda', null, { tipoPessoa: 'PF', nome: 'Fernanda Lima Ribeiro', cpfCnpj: '529.982.247-25', whatsapp: '(11) 98234-5566', email: 'fernanda.ribeiro@email.com', origem: 'whatsapp' }, null],
  ['marcelo', null, { tipoPessoa: 'PF', nome: 'Marcelo Augusto Pereira', cpfCnpj: '153.509.460-56', whatsapp: '(11) 99812-7654', origem: 'indicacao' }, null],
  ['juliana', null, { tipoPessoa: 'PF', nome: 'Juliana Rocha Santos', whatsapp: '(11) 97650-3321', email: 'ju.rocha@email.com', origem: 'instagram' }, null],
]) {
  if (dados.cpfCnpj) dados.cpfCnpj = doc(dados.cpfCnpj)
  const c = await api('POST', '/clientes', { situacao: 'ativo', ...dados })
  if (end) {
    const [logradouro, numero, bairro, cep, cidade = 'São Paulo'] = end
    await api('POST', `/clientes/${c.id}/enderecos`, { logradouro, numero, bairro, cep, cidade, uf: 'SP' }).catch((e) => console.warn(`  (endereço: ${e.message})`))
  }
  clientes[chave] = c.id
  contatos[chave] = contato ?? dados.nome
  console.log(`✔ ${dados.fantasia ?? dados.nome}`)
}

console.log('\n— Fornecedores —')
const fornecedores = {}
for (const [chave, dados] of [
  ['lonas', { nome: 'Lonax Distribuidora de Lonas Ltda', fantasia: 'Lonax', cpfCnpj: '46.802.579/0001-49', telefone: '(11) 2268-4400', email: 'vendas@lonax.com.br', contato: 'Wagner', categoriaFornecimento: 'Lonas e tecidos', prazoMedioDias: 2, condicoesPagamento: '28/56 dias no boleto' }],
  ['vinil', { nome: 'VinilSul Comércio de Adesivos Ltda', fantasia: 'VinilSul', cpfCnpj: '57.913.680/0001-62', telefone: '(11) 2955-1200', email: 'pedidos@vinilsul.com.br', contato: 'Renata', categoriaFornecimento: 'Vinil e adesivos', prazoMedioDias: 3, condicoesPagamento: '30 dias' }],
  ['tintas', { nome: 'Tintas & Cia Suprimentos Gráficos Ltda', fantasia: 'Tintas & Cia', cpfCnpj: '68.024.791/0001-85', telefone: '(11) 3315-7788', email: 'comercial@tintasecia.com.br', contato: 'Fábio', categoriaFornecimento: 'Tintas e suprimentos', prazoMedioDias: 2 }],
  ['acm', { nome: 'ACM Center Chapas e Perfis Ltda', fantasia: 'ACM Center', cpfCnpj: '79.135.802/0001-08', telefone: '(11) 4704-2020', email: 'orcamento@acmcenter.com.br', contato: 'Sérgio', categoriaFornecimento: 'ACM, PVC e acrílico', prazoMedioDias: 5, condicoesPagamento: '30/60 dias' }],
  ['brindes', { nome: 'Brindes Paulista Importadora Ltda', fantasia: 'Brindes Paulista', cpfCnpj: '80.246.913/0001-21', telefone: '(11) 3229-6060', email: 'vendas@brindespaulista.com.br', contato: 'Larissa', categoriaFornecimento: 'Canecas, camisetas e brindes', prazoMedioDias: 4 }],
  ['papel', { nome: 'Atacadão do Papel Distribuidora Ltda', fantasia: 'Atacadão do Papel', cpfCnpj: '91.357.024/0001-44', telefone: '(11) 2694-3030', email: 'pedidos@atacadaodopapel.com.br', contato: 'Marcos', categoriaFornecimento: 'Papéis e papelaria', prazoMedioDias: 1 }],
  ['imobiliaria', { nome: 'Moreira Administração de Imóveis Ltda', fantasia: 'Moreira Imóveis', telefone: '(11) 5084-1100', categoriaFornecimento: 'Aluguel do galpão' }],
  ['contador', { nome: 'Exata Contabilidade e Assessoria Ltda', fantasia: 'Exata Contabilidade', email: 'atendimento@exatacontabil.com.br', categoriaFornecimento: 'Contabilidade' }],
]) {
  if (dados.cpfCnpj) dados.cpfCnpj = doc(dados.cpfCnpj)
  fornecedores[chave] = (await api('POST', '/fornecedores', dados)).id
  console.log(`✔ ${dados.fantasia}`)
}
await sql(`UPDATE fornecedores SET created_at = now() - interval '200 days'`)

// ─── Estoque: compras dos últimos meses ─────────────────────────────────────

console.log('\n— Entradas de estoque —')
const formas = lista(await api('GET', '/financeiro/formas?pageSize=50'))
const forma = (tipo) => formas.find((f) => f.tipo === tipo).id
const almox = (await api('GET', '/estoque/locais')).find((l) => l.padrao)
// Saldo com que a empresa começou a usar o sistema
for (const conta of lista(await api('GET', '/financeiro/contas?pageSize=50'))) {
  const saldoInicial = conta.tipo === 'banco' ? '18000.00' : conta.tipo === 'caixa' ? '300.00' : null
  if (saldoInicial) await api('PUT', `/financeiro/contas/${conta.id}`, { nome: conta.nome, tipo: conta.tipo, banco: conta.banco ?? null, agencia: conta.agencia ?? null, numeroConta: conta.numeroConta ?? null, saldoInicial, ativo: true })
}
let nf = 18240
async function compra(d, fornecedor, itens, parcelasDias = null) {
  // Em centavos, item a item (como a API arredonda)
  const centavos = itens.reduce((s, [, q, c]) => s + Math.round(Number(q) * Number(c) * 100), 0)
  const total = centavos / 100
  let contaPagar
  if (parcelasDias) {
    const n = parcelasDias.length
    const parcela = Math.floor(centavos / n)
    contaPagar = { formaPagamentoId: forma('boleto'), parcelas: parcelasDias.map((p, i) => ({ vencimento: dia(-d + p), valor: ((i === n - 1 ? centavos - parcela * (n - 1) : parcela) / 100).toFixed(2) })) }
  }
  const e = await api('POST', '/estoque/entradas', {
    fornecedorId: fornecedores[fornecedor],
    localId: almox.id,
    notaFiscal: String(nf++),
    dataEntrada: dia(-d),
    itens: itens.map(([produtoId, quantidade, custoUnitario]) => ({ produtoId, quantidade: String(quantidade), custoUnitario: String(custoUnitario) })),
    ...(contaPagar && { contaPagar }),
  })
  const quando = em(-d, 10, entre(0, 50))
  await sql(`UPDATE estoque_entradas SET created_at = $1::timestamptz WHERE id = $2::uuid`, quando, e.id)
  await sql(`UPDATE estoque_movimentacoes SET created_at = $1::timestamptz WHERE entrada_id = $2::uuid`, quando, e.id)
  await sql(`UPDATE contas_pagar SET created_at = $1::timestamptz WHERE documento LIKE $2`, quando, `%${e.numero}%`).catch(() => {})
  console.log(`✔ ${e.numero} · ${fornecedor.padEnd(8)} ${reais(total)}${contaPagar ? ` em ${contaPagar.parcelas.length}x no boleto` : ' à vista'}`)
  return e
}
// d = dias atrás; prazos das parcelas contados da data da compra
await compra(150, 'lonas', [[ins.lona, 320, '9.06'], [ins.tecido, 80, '6.50']], [28, 56])
await compra(146, 'vinil', [[ins.vinil, 190, '12.00'], [ins.perfurado, 68.5, '14.31']], [30])
await compra(140, 'acm', [[ins.acm, 61, '113.11'], [ins.pvc, 29.77, '48.71']], [30, 60])
await compra(138, 'tintas', [[ins.tinta, 20000, '0.09'], [ins.ilhos, 400, '0.06']], null)
await compra(132, 'brindes', [[ins.caneca, 144, '8.00'], [ins.camiseta, 250, '13.80'], [ins.kitWind, 16, '150.00']], [30])
await compra(130, 'papel', [[ins.couche300, 2500, '1.20'], [ins.couche115, 6000, '0.33'], [P.pasta.id, 40, '4.20']], null)
await compra(88, 'lonas', [[ins.lona, 160, '9.20']], [28])
await compra(75, 'acm', [[ins.acm, 30.5, '115.00'], [ins.pvc, 29.77, '49.50']], [30, 60])
await compra(60, 'vinil', [[ins.vinil, 127, '12.20']], [30])
await compra(41, 'brindes', [[ins.caneca, 72, '8.20'], [ins.camiseta, 100, '14.10']], [30])
await compra(26, 'lonas', [[ins.lona, 160, '9.35'], [ins.tecido, 40, '6.60']], [28, 56])
await compra(12, 'acm', [[ins.acm, 30.5, '116.50']], [30, 60])
await compra(5, 'tintas', [[ins.tinta, 10000, '0.092']], null)

// ─── Pedidos ────────────────────────────────────────────────────────────────

const it = (produto, quantidade, largura, altura, acabamentos = [], observacao) => ({
  produtoId: produto.id,
  quantidade,
  ...(largura && { largura: String(largura), altura: String(altura) }),
  acabamentoIds: acabamentos.map((a) => ac[a]),
  ...(observacao && { observacao }),
})
const ARTE_DO_PRODUTO = {
  [P.banner.id]: 'produto-banner-lona',
  [P.adesivo.id]: 'produto-adesivo-vinil',
  [P.cartao.id]: 'produto-cartao-visita',
  [P.caneca.id]: 'produto-caneca',
  [P.fachada.id]: 'produto-fachada-acm',
  [P.placa.id]: 'produto-placa-pvc',
  [P.perfurado.id]: 'produto-adesivo-perfurado',
  [P.panfleto.id]: 'produto-panfleto',
  [P.wind.id]: 'produto-wind-banner',
  [P.camiseta.id]: 'produto-camiseta',
}
const ETAPAS = ['fila', 'pre_impressao', 'impressao', 'acabamento', 'conferencia', 'concluido']

/** Orçamento → enviado → aprovado (link ou interno) → pedido. */
async function orcamentoAprovado(c) {
  const orc = await api('POST', '/orcamentos', { clienteId: clientes[c.cliente], vendedorId: equipe[c.vendedor] ?? null, itens: c.itens, desconto: c.desconto ?? '0', frete: c.frete ?? '0', observacoes: c.obs ?? null })
  await api('POST', `/orcamentos/${orc.id}/enviar`)
  if (c.link) await api('POST', `/publico/${SLUG}/orcamentos/${orc.tokenPublico}/aprovar`, { nome: contatos[c.cliente], aceite: true })
  else await api('POST', `/orcamentos/${orc.id}/aprovar`, { nome: `${contatos[c.cliente]} (WhatsApp)` })
  return orc
}

async function enviarArte(item, nome) {
  return api('POST', `/pedidos/itens/${item.id}/artes`, undefined, await formulario(nome))
}

/** Arte de cada item: `acoes[i]` = 'aprovar' | 'link' | 'enviar' | 'ajuste' | 'subir' | null */
async function artes(pedido, acoes, arquivos = [], ajuste) {
  for (const [i, item] of pedido.itens.entries()) {
    const acao = acoes[i] ?? acoes[acoes.length - 1]
    if (!acao || !ARTE_DO_PRODUTO[item.produtoId]) continue
    const arte = await enviarArte(item, arquivos[i] ?? ARTE_DO_PRODUTO[item.produtoId])
    if (acao === 'subir') continue
    await api('POST', `/artes/${arte.id}/enviar`)
    if (acao === 'aprovar') await api('POST', `/artes/${arte.id}/aprovar`, { nome: `${pedido.contato} (WhatsApp)` })
    if (acao === 'link') await api('POST', `/publico/${SLUG}/artes/${arte.tokenPublico}/aprovar`, { nome: pedido.contato, aceite: true })
    if (acao === 'ajuste') await api('POST', `/publico/${SLUG}/artes/${arte.tokenPublico}/ajuste`, { nome: pedido.contato, comentario: ajuste })
  }
}

const opsDo = async (pedido) => lista(await api('GET', `/producao/ops?pedidoId=${pedido.id}&incluirConcluidas=true&pageSize=50`))
async function levar(op, destino) {
  const atual = ETAPAS.indexOf(op.etapaAtual)
  for (const etapa of ETAPAS.slice(atual + 1, ETAPAS.indexOf(destino) + 1)) {
    const r = await chamar('POST', `/producao/ops/${op.id}/mover`, { token, body: { etapa, ordemIds: [] } })
    // Serviço (instalação) não tem arte: a gerente libera
    if (r.json?.error?.details?.motivo === 'ARTE_NAO_APROVADA') await api('POST', `/producao/ops/${op.id}/mover`, { etapa, ordemIds: [], override: true, motivo: 'Serviço de instalação, sem arte' })
    else if (r.status >= 300) throw new Error(`mover OP → ${r.status}: ${JSON.stringify(r.json)}`)
  }
}

/**
 * Pedido completo. `d` = dias atrás da aprovação; `etapas` = etapa final de cada OP (na ordem dos itens);
 * `pagamentos` = [[dias atrás, valor | 'sinal' | 'saldo', tipo da forma]]; `entregue` = dias atrás da entrega.
 */
const pedidos = []
const orcamentos = []
async function pedido(c) {
  const referencia = Date.now()
  const orc = await orcamentoAprovado(c)
  const conv = await api('POST', `/orcamentos/${orc.id}/converter`, {
    sinalPercentual: String(c.sinal ?? 50),
    parcelas: c.parcelas ?? 1,
    intervaloDias: c.intervalo ?? 30,
    tipoEntrega: c.entrega ?? 'retirada',
    prioridade: c.prioridade ?? 'normal',
    observacoes: c.obsPedido ?? null,
  })
  let p = { ...(await api('GET', `/pedidos/${conv.pedidoId}`)), contato: contatos[c.cliente] }
  await artes(p, c.artes ?? ['aprovar'], c.arquivos ?? [], c.ajuste)
  const ops = await opsDo(p)
  const etapas = c.etapas ?? []
  for (const [i, item] of p.itens.entries()) {
    const op = ops.find((o) => o.pedidoItemId === item.id)
    if (!op) continue
    const maquinaId = op.maquina?.id ?? op.maquinaId ?? undefined
    await api('PUT', `/producao/ops/${op.id}`, {
      maquinaId: maquinaId ?? null,
      responsavelId: equipe.diego,
      prioridade: c.prioridade ?? 'normal',
      dataInicioPrevista: dia(-c.d),
      dataFimPrevista: dia(c.previsao ?? -c.d + 3),
      observacoes: c.obsOp?.[i] ?? null,
    })
    const destino = etapas[i] ?? etapas[etapas.length - 1]
    if (destino && destino !== 'fila') await levar(op, destino)
  }
  if (c.entregue !== undefined) {
    const e = await api('POST', `/pedidos/${p.id}/entregas`, { tipo: c.entrega ?? 'retirada' })
    await api('POST', `/entregas/${e.id}/realizar`, { recebidoPor: contatos[c.cliente], dataRealizada: em(-c.entregue, entre(9, 17), entre(0, 59)).toISOString() })
  }
  p = await api('GET', `/pedidos/${p.id}`)
  for (const [dPag, valor, tipo] of c.pagamentos ?? []) {
    const atual = await api('GET', `/pedidos/${p.id}`)
    const falta = Number(atual.total) - Number(atual.valorPago)
    const v = valor === 'saldo' ? falta : valor === 'sinal' ? Number(atual.total) * (c.sinal ?? 50) / 100 : Number(valor)
    if (v <= 0.009) continue
    await api('POST', `/financeiro/receber/pedido/${p.id}`, { valorRecebido: Math.min(v, falta).toFixed(2), data: dia(-dPag), formaPagamentoId: forma(tipo ?? 'pix') })
  }
  await datarPedido(p, orc, c, referencia)
  p = await api('GET', `/pedidos/${p.id}`)
  pedidos.push({ ...p, orcamentoId: orc.id, d: c.d })
  console.log(`✔ ${p.numero} · ${(contatos[c.cliente] ?? '').padEnd(20)} ${reais(p.total).padStart(13)} · ${p.status.padEnd(17)} · ${p.statusFinanceiro}`)
  return p
}

/** Espalha as datas do pedido (e do que nasceu com ele) para `d` dias atrás, em horário comercial. */
async function datarPedido(p, orc, c, referencia) {
  const base = em(-c.d, entre(9, 15), entre(0, 59))
  const deslocamento = `${Math.round((referencia - base.getTime()) / 1000)} seconds`
  const desloca = (tabela, coluna, onde, ...params) => sql(`UPDATE ${tabela} SET ${coluna} = ${coluna} - $1::interval WHERE ${onde}`, deslocamento, ...params)
  const ops = await consulta(`SELECT id::text, etapa_atual::text AS etapa FROM ordens_producao WHERE pedido_id = $1::uuid`, p.id)
  const itens = await consulta(`SELECT id::text FROM pedido_itens WHERE pedido_id = $1::uuid`, p.id)
  const opIds = ops.map((o) => o.id)
  const itemIds = itens.map((i) => i.id)

  // Orçamento: criado ~2 dias antes, enviado no dia seguinte, aprovado no dia do pedido
  const criadoOrc = new Date(base.getTime() - (c.diasOrcamento ?? 2) * 86400e3 - 2 * 3600e3)
  await sql(
    `UPDATE orcamentos SET created_at = $1::timestamptz, enviado_em = $2::timestamptz, aprovado_em = $3::timestamptz, updated_at = $3::timestamptz,
       validade = ($1::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date + 10 WHERE id = $4::uuid`,
    criadoOrc, new Date(criadoOrc.getTime() + 3 * 3600e3), new Date(base.getTime() - 15 * 60e3), orc.id,
  )
  await sql(
    `UPDATE pedidos SET created_at = $1::timestamptz, updated_at = greatest(updated_at - $2::interval, $1::timestamptz), data_prevista_entrega = $3::date WHERE id = $4::uuid`,
    base, deslocamento, dia(c.previsao ?? -c.d + 3), p.id,
  )
  // Títulos: as parcelas nasceram contadas de hoje → contadas da data do pedido
  await sql(`UPDATE contas_receber SET created_at = $1::timestamptz, vencimento = vencimento - $2::int WHERE pedido_id = $3::uuid`, base, c.d, p.id)
  await sql(`UPDATE contas_receber SET status = 'vencido' WHERE pedido_id = $1::uuid AND status = 'aberto' AND vencimento < $2::date`, p.id, hoje)
  await desloca('comissoes', 'created_at', 'pedido_id = $2::uuid', p.id)
  if (itemIds.length) {
    await desloca('artes', 'created_at', 'pedido_item_id = ANY($2::uuid[])', itemIds)
    await desloca('artes', 'updated_at', 'pedido_item_id = ANY($2::uuid[])', itemIds)
    await desloca('artes', 'aprovada_em', 'pedido_item_id = ANY($2::uuid[]) AND aprovada_em IS NOT NULL', itemIds)
    await sql(`UPDATE arte_comentarios SET created_at = created_at - $1::interval WHERE arte_id IN (SELECT id FROM artes WHERE pedido_item_id = ANY($2::uuid[]))`, deslocamento, itemIds).catch(() => {})
  }
  await desloca('auditoria', 'created_at', 'registro_id = ANY($2::text[])', [p.id, orc.id, ...opIds, ...itemIds])

  // Linha do tempo das OPs: da aprovação da arte até a etapa atual
  const inicio = new Date(base.getTime() + 2 * 3600e3)
  const prazoDias = c.diasProducao ?? 2
  for (const op of ops) {
    const concluida = op.etapa === 'concluido'
    const fim = concluida
      ? new Date(Math.min(em(-c.d + prazoDias, 16, entre(0, 59)).getTime(), Date.now() - 3600e3))
      : new Date(Math.max(inicio.getTime() + 3600e3, Date.now() - entre(2, 20) * 3600e3))
    const historico = await consulta(`SELECT id::text FROM op_etapas_historico WHERE op_id = $1::uuid ORDER BY created_at, id`, op.id)
    const n = historico.length
    let anterior = null
    for (const [i, h] of historico.entries()) {
      const t = n === 1 ? inicio : new Date(i === 0 ? base.getTime() + 600e3 : inicio.getTime() + ((fim - inicio) * i) / (n - 1))
      await sql(`UPDATE op_etapas_historico SET created_at = $1::timestamptz, segundos_na_etapa = $2::int WHERE id = $3::uuid`, t, anterior ? Math.round((t - anterior) / 1000) : 0, h.id)
      anterior = t
    }
    const ultimo = anterior ?? base
    await sql(
      `UPDATE ordens_producao SET created_at = $1::timestamptz, updated_at = $2::timestamptz, entrou_etapa_em = $2::timestamptz,
         data_inicio_real = CASE WHEN data_inicio_real IS NULL THEN NULL ELSE $3::timestamptz END,
         data_fim_real = CASE WHEN data_fim_real IS NULL THEN NULL ELSE $2::timestamptz END WHERE id = $4::uuid`,
      base, ultimo, inicio, op.id,
    )
    await sql(`UPDATE estoque_movimentacoes SET created_at = $1::timestamptz WHERE op_id = $2::uuid`, ultimo, op.id)
  }
  if (c.entregue !== undefined) {
    const quando = em(-c.entregue, entre(9, 17), entre(0, 59))
    await sql(`UPDATE entregas SET created_at = $1::timestamptz - interval '2 hours', updated_at = $1::timestamptz, data_realizada = $1::timestamptz WHERE pedido_id = $2::uuid`, quando, p.id)
    await sql(`UPDATE pedidos SET updated_at = $1::timestamptz WHERE id = $2::uuid`, quando, p.id)
  }
  await sql(`UPDATE comissoes SET liberada_em = (SELECT max(pago_em)::timestamptz + interval '15 hours' FROM contas_receber WHERE pedido_id = $1::uuid) WHERE pedido_id = $1::uuid AND liberada_em IS NOT NULL`, p.id)
}

console.log('\n— Pedidos entregues dos últimos meses —')
const historico = [
  { d: 165, cliente: 'construtora', vendedor: 'rafael', itens: [it(P.placa, 8, 1.2, 0.8, ['Fita dupla face'], 'Placas de identificação da obra Residencial Jardins'), it(P.banner, 2, 5, 1)], pagamentos: [[165, 'sinal', 'boleto'], [158, 'saldo', 'boleto']], entregue: 159, entrega: 'entrega' },
  { d: 160, cliente: 'padaria', vendedor: 'bianca', itens: [it(P.fachada, 1, 5, 1.1, [], 'Fachada principal com logo em relevo'), it(P.instalacao, 4)], pagamentos: [[160, 'sinal', 'pix'], [150, 'saldo', 'pix']], entregue: 151, entrega: 'instalacao', diasProducao: 8 },
  { d: 153, cliente: 'cafe', vendedor: 'bianca', itens: [it(P.adesivo, 3, 1.5, 1, ['Laminação fosca', 'Recorte eletrônico']), it(P.cartao, 2000, null, null, ['Laminação fosca frente'])], pagamentos: [[153, 'saldo', 'cartao_credito']], sinal: 100, parcelas: 0, entregue: 149 },
  { d: 146, cliente: 'escola', vendedor: 'rafael', itens: [it(P.banner, 3, 3, 1, ['Ilhós a cada 50 cm', 'Bainha']), it(P.panfleto, 10000)], pagamentos: [[146, 'sinal', 'pix'], [141, 'saldo', 'boleto']], entregue: 142 },
  { d: 139, cliente: 'eventos', vendedor: 'rafael', itens: [it(P.banner, 2, 3, 2, ['Bainha', 'Bastão e cordão']), it(P.wind, 4)], pagamentos: [[139, 'sinal', 'pix'], [134, 'saldo', 'pix']], entregue: 135, diasProducao: 4 },
  { d: 161, perdido: true, cliente: 'eventos', vendedor: 'rafael', status: 'recusado', motivo: 'Evento cancelado pelo cliente.', itens: [it(P.banner, 4, 3, 2, ['Bainha'])] },
  { d: 150, perdido: true, cliente: 'academia', vendedor: 'rafael', status: 'recusado', motivo: 'Achou o prazo de instalação longo.', itens: [it(P.fachada, 1, 6, 1), it(P.instalacao, 5)] },
  { d: 135, perdido: true, cliente: 'imobiliaria', vendedor: 'rafael', status: 'expirado', itens: [it(P.placa, 30, 0.6, 0.4)] },
  { d: 131, cliente: 'otica', vendedor: 'bianca', itens: [it(P.perfurado, 1, 4, 2, ['Aplicação no local']), it(P.fachada, 1, 4, 0.8)], pagamentos: [[131, 'sinal', 'pix'], [122, 'saldo', 'cartao_credito']], entregue: 123, entrega: 'instalacao', diasProducao: 7 },
  { d: 127, cliente: 'construtora', vendedor: 'rafael', itens: [it(P.fachada, 1, 10, 1.5, [], 'Stand de vendas Residencial Jardins'), it(P.instalacao, 10)], pagamentos: [[127, 'sinal', 'boleto'], [115, 'saldo', 'boleto']], entregue: 116, entrega: 'instalacao', diasProducao: 9 },
  { d: 124, cliente: 'pizzaria', vendedor: 'bianca', itens: [it(P.panfleto, 20000), it(P.cartao, 1000), it(P.adesivo, 6, 1, 1, ['Recorte eletrônico'])], pagamentos: [[124, 'sinal', 'dinheiro'], [119, 'saldo', 'pix']], entregue: 120 },
  { d: 117, cliente: 'academia', vendedor: 'rafael', itens: [it(P.fachada, 1, 7, 1.2), it(P.instalacao, 6), it(P.perfurado, 1, 3, 2.2)], pagamentos: [[117, 'sinal', 'pix'], [107, 'saldo', 'boleto']], entregue: 108, entrega: 'instalacao', diasProducao: 8 },
  { d: 114, cliente: 'eventos', vendedor: 'rafael', itens: [it(P.wind, 6), it(P.banner, 3, 4, 2, ['Bainha', 'Bastão e cordão'], 'Feira de noivas — estande 32')], pagamentos: [[114, 'sinal', 'pix'], [109, 'saldo', 'pix']], entregue: 109, diasProducao: 4 },
  { d: 112, perdido: true, cliente: 'cafe', vendedor: 'bianca', status: 'recusado', motivo: 'Cliente decidiu fazer só o cardápio por enquanto.', itens: [it(P.fachada, 1, 5, 1), it(P.instalacao, 4)] },
  { d: 110, cliente: 'marcelo', vendedor: 'bianca', itens: [it(P.camiseta, 80, null, null, ['Embalagem individual']), it(P.caneca, 30)], pagamentos: [[110, 'sinal', 'pix'], [104, 'saldo', 'pix']], entregue: 104, diasProducao: 5 },
  { d: 102, cliente: 'clinica', vendedor: 'rafael', itens: [it(P.placa, 14, 0.5, 0.3, ['Fita dupla face']), it(P.adesivo, 2, 2, 1, ['Laminação fosca'])], pagamentos: [[102, 'sinal', 'pix'], [97, 'saldo', 'pix']], entregue: 98 },
  { d: 104, perdido: true, cliente: 'petshop', vendedor: 'bianca', status: 'expirado', itens: [it(P.camiseta, 20), it(P.caneca, 20)] },
  { d: 99, cliente: 'hortifruti', vendedor: 'bianca', itens: [it(P.perfurado, 1, 6, 2, ['Aplicação no local']), it(P.placa, 10, 0.5, 0.35, ['Fita dupla face'])], pagamentos: [[99, 'sinal', 'pix'], [95, 'saldo', 'pix']], entregue: 95 },
  { d: 97, perdido: true, cliente: 'juliana', vendedor: 'bianca', status: 'recusado', motivo: 'Preferiu fazer só as canecas em outra ocasião.', itens: [it(P.banner, 1, 2, 1), it(P.caneca, 40)] },
  { d: 95, cliente: 'imobiliaria', vendedor: 'rafael', itens: [it(P.placa, 40, 0.6, 0.4, [], 'Placas "Vende-se" e "Aluga-se"'), it(P.banner, 3, 2, 1)], pagamentos: [[95, 'sinal', 'boleto'], [65, 'saldo', 'boleto']], entregue: 91 },
  { d: 92, cliente: 'escola', vendedor: 'rafael', itens: [it(P.panfleto, 20000), it(P.banner, 3, 3, 1, ['Ilhós a cada 50 cm', 'Bainha']), it(P.camiseta, 40)], pagamentos: [[92, 'sinal', 'pix'], [86, 'saldo', 'boleto']], entregue: 87, diasProducao: 4 },
  { d: 89, perdido: true, cliente: 'otica', vendedor: 'bianca', status: 'recusado', motivo: 'Orçamento acima do previsto para o mês.', itens: [it(P.perfurado, 1, 5, 2, ['Aplicação no local'])] },
  { d: 87, cliente: 'petshop', vendedor: 'bianca', itens: [it(P.wind, 3), it(P.perfurado, 1, 2.5, 1.5)], pagamentos: [[87, 'sinal', 'pix'], [82, 'saldo', 'cartao_debito']], entregue: 83, diasProducao: 4 },
  { d: 80, cliente: 'autocenter', vendedor: 'rafael', itens: [it(P.banner, 4, 4, 1, ['Ilhós a cada 50 cm', 'Bainha']), it(P.adesivo, 4, 3, 0.5)], pagamentos: [[80, 'sinal', 'pix'], [76, 'saldo', 'dinheiro']], entregue: 76 },
  { d: 84, cliente: 'imobiliaria', vendedor: 'rafael', itens: [it(P.fachada, 1, 6, 1), it(P.instalacao, 6)], pagamentos: [[84, 'sinal', 'boleto'], [75, 'saldo', 'boleto']], entregue: 76, entrega: 'instalacao', diasProducao: 7 },
  { d: 73, cliente: 'hortifruti', vendedor: 'bianca', itens: [it(P.fachada, 1, 6, 1.2), it(P.instalacao, 5), it(P.banner, 2, 2, 1)], pagamentos: [[73, 'sinal', 'pix'], [63, 'saldo', 'pix']], entregue: 64, entrega: 'instalacao', diasProducao: 8 },
  { d: 70, cliente: 'padaria', vendedor: 'bianca', itens: [it(P.camiseta, 30, null, null, [], 'Uniforme da equipe — logo frente'), it(P.caneca, 50, null, null, ['Embalagem individual']), it(P.adesivo, 6, 0.5, 0.5, ['Recorte eletrônico'])], pagamentos: [[70, 'sinal', 'pix'], [64, 'saldo', 'pix']], entregue: 64, diasProducao: 5 },
  { d: 66, cliente: 'juliana', vendedor: 'bianca', itens: [it(P.caneca, 40, null, null, ['Embalagem individual']), it(P.banner, 1, 2, 1.2, ['Bastão e cordão'])], pagamentos: [[66, 'saldo', 'pix']], sinal: 100, parcelas: 0, entregue: 62 },
  { d: 63, cliente: 'pizzaria', vendedor: 'bianca', itens: [it(P.fachada, 1, 5, 1.2), it(P.instalacao, 5)], pagamentos: [[63, 'sinal', 'pix'], [55, 'saldo', 'pix']], entregue: 56, entrega: 'instalacao', diasProducao: 7 },
  { d: 59, cliente: 'escola', vendedor: 'rafael', itens: [it(P.camiseta, 150, null, null, [], 'Uniforme da gincana — tamanhos conforme lista'), it(P.banner, 2, 3, 1)], pagamentos: [[59, 'sinal', 'pix'], [52, 'saldo', 'boleto']], entregue: 53, diasProducao: 5 },
  { d: 56, cliente: 'otica', vendedor: 'bianca', itens: [it(P.placa, 20, 0.4, 0.3, ['Fita dupla face']), it(P.perfurado, 1, 3, 1.5, ['Aplicação no local'])], pagamentos: [[56, 'saldo', 'cartao_credito']], sinal: 100, parcelas: 0, entregue: 52 },
  { d: 52, cliente: 'eventos', vendedor: 'rafael', itens: [it(P.banner, 2, 4, 2.5, ['Bainha'], 'Backdrop para casamento'), it(P.adesivo, 8, 1, 1, ['Recorte eletrônico'])], pagamentos: [[52, 'sinal', 'pix'], [49, 'saldo', 'pix']], entregue: 49 },
  { d: 47, cliente: 'petshop', vendedor: 'bianca', itens: [it(P.fachada, 1, 4, 1), it(P.instalacao, 4)], pagamentos: [[47, 'sinal', 'pix'], [40, 'saldo', 'pix']], entregue: 40, entrega: 'instalacao', diasProducao: 6 },
  { d: 45, cliente: 'construtora', vendedor: 'rafael', itens: [it(P.banner, 4, 6, 1.5, ['Ilhós a cada 50 cm', 'Bainha']), it(P.placa, 10, 1, 0.7)], pagamentos: [[45, 'sinal', 'boleto'], [38, 'saldo', 'boleto']], entregue: 40, entrega: 'entrega' },
  { d: 43, cliente: 'autocenter', vendedor: 'rafael', itens: [it(P.fachada, 1, 8, 1.5, [], 'Fachada nova com testeira iluminada'), it(P.instalacao, 10)], pagamentos: [[43, 'sinal', 'pix'], [33, 'saldo', 'boleto']], entregue: 34, entrega: 'instalacao', diasProducao: 8 },
  { d: 36, cliente: 'padaria', vendedor: 'bianca', itens: [it(P.cartao, 2000), it(P.panfleto, 10000), it(P.adesivo, 4, 1, 1, ['Recorte eletrônico'])], pagamentos: [[36, 'sinal', 'pix'], [32, 'saldo', 'pix']], entregue: 32 },
  { d: 34, cliente: 'eventos', vendedor: 'rafael', itens: [it(P.camiseta, 60, null, null, ['Embalagem individual'], 'Kit staff — evento corporativo'), it(P.caneca, 50, null, null, ['Embalagem individual'])], pagamentos: [[34, 'sinal', 'pix'], [27, 'saldo', 'pix']], entregue: 27, diasProducao: 6 },
  { d: 32, cliente: 'fernanda', vendedor: 'bianca', itens: [it(P.caneca, 30, null, null, ['Embalagem individual'], 'Chá de panela — Fernanda & Lucas')], pagamentos: [[32, 'saldo', 'pix']], sinal: 100, parcelas: 0, entregue: 28, diasProducao: 3 },
  { d: 30, cliente: 'otica', vendedor: 'bianca', itens: [it(P.cartao, 1000, null, null, ['Cantos arredondados']), it(P.banner, 2, 1.5, 1)], pagamentos: [[30, 'saldo', 'cartao_credito']], sinal: 100, parcelas: 0, entregue: 27 },
  { d: 25, cliente: 'cafe', vendedor: 'bianca', itens: [it(P.perfurado, 1, 3, 1.8, ['Aplicação no local']), it(P.caneca, 60, null, null, ['Embalagem individual'])], pagamentos: [[25, 'sinal', 'pix'], [20, 'saldo', 'pix']], entregue: 20, diasProducao: 4 },
  { d: 23, cliente: 'construtora', vendedor: 'rafael', itens: [it(P.placa, 30, 0.6, 0.4, [], 'Sinalização de segurança — obra Vila Nova'), it(P.banner, 5, 3, 1, ['Ilhós a cada 50 cm', 'Bainha'])], pagamentos: [[23, 'sinal', 'boleto'], [16, 'saldo', 'boleto']], entregue: 17, entrega: 'entrega' },
  { d: 18, cliente: 'academia', vendedor: 'rafael', itens: [it(P.camiseta, 60), it(P.wind, 2)], pagamentos: [[18, 'sinal', 'pix'], [13, 'saldo', 'pix']], entregue: 13, diasProducao: 5 },
  { d: 15, cliente: 'clinica', vendedor: 'rafael', itens: [it(P.cartao, 3000, null, null, ['Laminação fosca frente']), it(P.placa, 6, 0.4, 0.25, ['Fita dupla face'])], pagamentos: [[15, 'sinal', 'pix'], [9, 'saldo', 'pix']], entregue: 9 },
]
for (const c of historico) {
  if (c.perdido) await orcamento(c)
  else await pedido({ etapas: ['concluido'], previsao: -c.d + (c.diasProducao ?? 2) + 1, ...c })
}

console.log('\n— Pedidos em andamento —')
// Entregue há 30 dias com a 2ª parcela vencida
await pedido({ d: 40, cliente: 'imobiliaria', vendedor: 'rafael', itens: [it(P.placa, 20, 0.6, 0.4), it(P.adesivo, 6, 1.2, 0.8, ['Laminação fosca'])], etapas: ['concluido'], pagamentos: [[40, 'sinal', 'boleto']], parcelas: 1, intervalo: 32, entregue: 31, previsao: -33 })
// Entregue nesta semana, pago
await pedido({ d: 11, cliente: 'pizzaria', vendedor: 'bianca', itens: [it(P.panfleto, 10000), it(P.wind, 2)], etapas: ['concluido'], pagamentos: [[11, 'sinal', 'pix'], [3, 'saldo', 'dinheiro']], entregue: 3, previsao: -4, diasProducao: 4 })
// Pronto aguardando retirada (saldo na retirada)
await pedido({ d: 7, cliente: 'hortifruti', vendedor: 'bianca', itens: [it(P.banner, 3, 3, 1, ['Ilhós a cada 50 cm', 'Bainha']), it(P.adesivo, 4, 1, 0.6, ['Recorte eletrônico'])], arquivos: ['arte-mercado'], artes: ['link'], etapas: ['concluido'], pagamentos: [[7, 'sinal', 'pix']], previsao: 0, diasProducao: 3 })
// Atrasado (previsão ontem), urgente, em acabamento/conferência
await pedido({ d: 9, cliente: 'autocenter', vendedor: 'rafael', prioridade: 'urgente', itens: [it(P.banner, 1, 4, 1, ['Ilhós a cada 50 cm', 'Bainha']), it(P.wind, 3)], arquivos: ['arte-autocenter'], artes: ['link'], etapas: ['conferencia', 'acabamento'], pagamentos: [[9, 'sinal', 'pix']], previsao: -1, obsOp: [null, 'Costura reforçada na lateral'] })
// Em impressão, entrega hoje
await pedido({ d: 5, cliente: 'padaria', vendedor: 'bianca', prioridade: 'alta', itens: [it(P.banner, 1, 3, 1, ['Ilhós a cada 50 cm', 'Bainha'], 'Arte nova "Pão quentinho toda hora"'), it(P.cartao, 2000, null, null, ['Laminação fosca frente']), it(P.caneca, 50, null, null, ['Embalagem individual'], 'Brinde Dia das Crianças')], arquivos: ['arte-padaria'], artes: ['link', 'aprovar'], etapas: ['impressao', 'acabamento', 'pre_impressao'], pagamentos: [[5, 'sinal', 'pix']], previsao: 0 })
// Entrega amanhã
await pedido({ d: 6, cliente: 'clinica', vendedor: 'rafael', itens: [it(P.placa, 12, 0.6, 0.4, ['Fita dupla face'], 'Placas de porta dos consultórios'), it(P.adesivo, 3, 1.2, 1, ['Laminação fosca'])], arquivos: ['arte-clinica'], artes: ['link', 'aprovar'], etapas: ['pre_impressao', 'acabamento'], pagamentos: [[6, 'sinal', 'pix']], previsao: 1 })
// Camisetas em conferência
await pedido({ d: 4, cliente: 'marcelo', vendedor: 'bianca', itens: [it(P.camiseta, 45, null, null, ['Embalagem individual'], 'Corrida Solidária 2026 — 15 P, 20 M, 10 G')], artes: ['link'], etapas: ['conferencia'], pagamentos: [[4, 'sinal', 'pix']], previsao: 2 })
// Canecas e adesivo em impressão / fila
await pedido({ d: 3, cliente: 'petshop', vendedor: 'bianca', prioridade: 'alta', itens: [it(P.caneca, 36, null, null, ['Embalagem individual']), it(P.adesivo, 1, 1.2, 0.6, ['Recorte eletrônico'])], artes: ['aprovar'], etapas: ['impressao', 'fila'], pagamentos: [[3, 'sinal', 'cartao_debito']], previsao: 3 })
// Fachada na fila (produção longa, instalação)
await pedido({ d: 2, cliente: 'cafe', vendedor: 'bianca', entrega: 'instalacao', itens: [it(P.fachada, 1, 6, 1.2, [], 'Letreiro "Café Aroma" com recorte nas letras'), it(P.instalacao, 6), it(P.perfurado, 1, 2.4, 1.6, ['Aplicação no local'])], artes: ['link'], etapas: ['pre_impressao', 'fila', 'impressao'], pagamentos: [[2, 'sinal', 'pix']], previsao: 6 })
// Arte com ajuste pedido pelo cliente
await pedido({ d: 4, cliente: 'academia', vendedor: 'rafael', itens: [it(P.perfurado, 1, 3, 1.5, ['Aplicação no local']), it(P.banner, 1, 2, 1, ['Ilhós a cada 50 cm', 'Bainha'])], arquivos: ['arte-academia'], artes: ['ajuste', 'enviar'], ajuste: 'Aumentar o telefone e trocar o vermelho do rodapé por preto, por favor.', pagamentos: [[4, 'sinal', 'pix']], previsao: 4 })
// Arte enviada para aprovação
await pedido({ d: 2, cliente: 'escola', vendedor: 'rafael', itens: [it(P.panfleto, 10000), it(P.banner, 2, 2, 1, ['Ilhós a cada 50 cm', 'Bainha'])], arquivos: ['arte-escola', 'arte-escola'], artes: ['enviar'], pagamentos: [[2, 'sinal', 'boleto']], previsao: 5 })
// Aguardando arte (acabou de fechar)
await pedido({ d: 1, cliente: 'eventos', vendedor: 'rafael', itens: [it(P.banner, 2, 3, 1, ['Bainha', 'Bastão e cordão']), it(P.wind, 2)], artes: [null], pagamentos: [[1, 'sinal', 'pix']], previsao: 6, obsPedido: 'Evento corporativo dia 20 — cliente envia o logo em vetor' })

// ─── Orçamentos em aberto, recusados e vencidos ─────────────────────────────

console.log('\n— Orçamentos —')
async function orcamento(c) {
  const validade = dia(c.validade ?? -c.d + 10)
  const orc = await api('POST', '/orcamentos', { clienteId: clientes[c.cliente], vendedorId: equipe[c.vendedor] ?? null, itens: c.itens, ...(validade >= hoje && { validade }), desconto: c.desconto ?? '0', observacoes: c.obs ?? null, condicoes: c.condicoes ?? null })
  if (c.status !== 'rascunho') await api('POST', `/orcamentos/${orc.id}/enviar`)
  if (c.status === 'em_negociacao') await api('POST', `/orcamentos/${orc.id}/negociacao`)
  if (c.status === 'aprovado') await api('POST', `/publico/${SLUG}/orcamentos/${orc.tokenPublico}/aprovar`, { nome: contatos[c.cliente], aceite: true })
  if (c.status === 'recusado') await api('POST', `/orcamentos/${orc.id}/recusar`, { motivo: c.motivo })
  const criado = em(-c.d, entre(9, 17), entre(0, 59))
  await sql(
    `UPDATE orcamentos SET created_at = $1::timestamptz, updated_at = $1::timestamptz + interval '1 day' * least($3::int, 1),
       enviado_em = CASE WHEN enviado_em IS NULL THEN NULL ELSE $1::timestamptz + interval '40 minutes' END,
       aprovado_em = CASE WHEN aprovado_em IS NULL THEN NULL ELSE $1::timestamptz + interval '1 day' END,
       recusado_em = CASE WHEN recusado_em IS NULL THEN NULL ELSE $1::timestamptz + interval '3 days' END
     WHERE id = $2::uuid`,
    criado, orc.id, c.d,
  )
  await sql(`UPDATE orcamentos SET validade = $1::date WHERE id = $2::uuid`, validade, orc.id)
  if (c.status === 'expirado') await sql(`UPDATE orcamentos SET status = 'expirado' WHERE id = $1::uuid`, orc.id)
  await sql(`UPDATE auditoria SET created_at = $1::timestamptz WHERE registro_id = $2`, criado, orc.id)
  const final = await api('GET', `/orcamentos/${orc.id}`)
  orcamentos.push(final)
  console.log(`✔ ${final.numero} · ${(contatos[c.cliente] ?? '').padEnd(20)} ${reais(final.total).padStart(13)} · ${final.status}`)
}
await orcamento({ d: 24, cliente: 'imobiliaria', vendedor: 'rafael', status: 'recusado', motivo: 'Fechou com outro fornecedor pelo preço.', itens: [it(P.fachada, 1, 8, 1.5), it(P.instalacao, 8)] })
await orcamento({ d: 21, cliente: 'academia', vendedor: 'rafael', status: 'recusado', motivo: 'Cliente adiou a campanha para o próximo trimestre.', itens: [it(P.camiseta, 60), it(P.caneca, 60, null, null, ['Embalagem individual'])] })
await orcamento({ d: 19, cliente: 'hortifruti', vendedor: 'bianca', status: 'expirado', validade: -4, itens: [it(P.placa, 12, 0.4, 0.3), it(P.adesivo, 4, 1, 0.5, ['Recorte eletrônico'])] })
await orcamento({ d: 9, cliente: 'construtora', vendedor: 'rafael', status: 'em_negociacao', itens: [it(P.banner, 3, 10, 2, ['Ilhós a cada 50 cm', 'Bainha'], 'Tapume do Residencial Vila Nova'), it(P.placa, 4, 1.2, 0.8)], desconto: '150', obs: 'Cliente pediu 5% de desconto para fechar os três tapumes.' })
await orcamento({ d: 8, cliente: 'pizzaria', vendedor: 'bianca', status: 'aprovado', itens: [it(P.wind, 2), it(P.perfurado, 1, 2, 1.2, ['Aplicação no local'])] })
await orcamento({ d: 7, cliente: 'otica', vendedor: 'bianca', status: 'enviado', validade: 1, itens: [it(P.perfurado, 1, 3, 2, ['Aplicação no local']), it(P.fachada, 1, 4, 1)], obs: 'Inclui retirada do letreiro antigo.' })
await orcamento({ d: 6, cliente: 'cafe', vendedor: 'bianca', status: 'em_negociacao', itens: [it(P.panfleto, 5000), it(P.adesivo, 6, 0.3, 0.3, ['Recorte eletrônico'])] })
await orcamento({ d: 5, cliente: 'fernanda', vendedor: 'bianca', status: 'enviado', validade: 2, itens: [it(P.caneca, 80, null, null, ['Embalagem individual'], 'Lembrancinha de casamento — Fernanda & Lucas'), it(P.adesivo, 2, 0.5, 0.5, ['Recorte eletrônico'])] })
await orcamento({ d: 4, cliente: 'escola', vendedor: 'rafael', status: 'enviado', itens: [it(P.camiseta, 120, null, null, [], 'Uniforme de educação física 2027'), it(P.placa, 8, 0.4, 0.3, ['Fita dupla face'])] })
await orcamento({ d: 3, cliente: 'eventos', vendedor: 'rafael', status: 'enviado', itens: [it(P.banner, 1, 3, 2, ['Bainha', 'Bastão e cordão'], 'Backdrop formatura'), it(P.adesivo, 10, 0.6, 0.6, ['Recorte eletrônico']), it(P.wind, 2)] })
await orcamento({ d: 2, cliente: 'petshop', vendedor: 'bianca', status: 'rascunho', itens: [it(P.wind, 2), it(P.cartao, 1000)] })
await orcamento({ d: 1, cliente: 'construtora', vendedor: 'rafael', status: 'rascunho', itens: [it(P.placa, 15, 0.6, 0.4, [], 'Sinalização de segurança da obra'), it(P.banner, 1, 5, 1)] })
await orcamento({ d: 0, cliente: 'juliana', vendedor: 'bianca', status: 'rascunho', itens: [it(P.caneca, 25, null, null, ['Embalagem individual'], 'Aniversário de 15 anos da Laura'), it(P.banner, 1, 1.5, 1, ['Bastão e cordão'])] })

// ─── Financeiro: contas fixas, compras e avulsos ────────────────────────────

console.log('\n— Contas a pagar e a receber —')
const categoriasFin = lista(await api('GET', '/financeiro/categorias?pageSize=100'))
const catFin = (nome) => categoriasFin.find((c) => c.nome === nome)?.id
// POST /financeiro/categorias responde 500 nesta versão (createdBy no modelo sem a coluna): direto no schema da empresa
const novaCategoriaFin = async (nome) =>
  (await consulta(`INSERT INTO categorias_financeiras (nome, tipo, pai_id, updated_at) VALUES ($1, 'despesa', $2::uuid, now()) RETURNING id::text`, nome, catFin('Despesas operacionais')))[0].id
const catContab = await novaCategoriaFin('Contabilidade')
const catManut = await novaCategoriaFin('Manutenção de equipamentos')
async function contaPagar({ descricao, valor, vencimento, categoriaId, fornecedorId, documento, pago, tipo = 'pix' }) {
  const [t] = await api('POST', '/financeiro/pagar', { descricao, valor: Number(valor).toFixed(2), vencimento, categoriaId, fornecedorId, documento })
  if (pago) await api('POST', `/financeiro/pagar/${t.id}/baixa`, { valorRecebido: Number(valor).toFixed(2), data: pago, formaPagamentoId: forma(tipo) })
  await sql(`UPDATE contas_pagar SET created_at = ($1::date - 12)::timestamptz + interval '13 hours' WHERE id = $2::uuid`, vencimento, t.id)
  return t
}
// Mês a mês (junho a outubro) + o aluguel de novembro
const [ano, mes] = hoje.split('-').map(Number)
const dataDoMes = (deslocamento, d) => {
  const data = new Date(Date.UTC(ano, mes - 1 + deslocamento, d))
  return data.toISOString().slice(0, 10)
}
const energia = [612.3, 689.55, 655.4, 702.1, 676.75]
const das = [1380.2, 1512.45, 1455.9, 1620.3, 1548.6]
for (let m = -4; m <= 0; m++) {
  const i = m + 4
  const pagoAte = (venc) => (venc < hoje ? venc : null)
  const contas = [
    { descricao: 'Aluguel do galpão', valor: 2800, d: 5, categoriaId: catFin('Aluguel'), fornecedorId: fornecedores.imobiliaria, tipo: 'boleto' },
    { descricao: 'Folha de pagamento', valor: 6200, d: 5, categoriaId: catFin('Salários e encargos'), tipo: 'transferencia' },
    { descricao: 'Honorários contábeis', valor: 480, d: 10, categoriaId: catContab, fornecedorId: fornecedores.contador, tipo: 'boleto' },
    { descricao: 'Energia elétrica', valor: energia[i], d: 12, categoriaId: catFin('Energia e água') },
    { descricao: 'Internet fibra e telefone', valor: 179.9, d: 15, categoriaId: catFin('Internet e telefone'), tipo: 'boleto' },
    { descricao: 'Simples Nacional (DAS)', valor: das[i], d: 20, categoriaId: catFin('Impostos') },
  ]
  for (const c of contas) {
    const vencimento = dataDoMes(m, c.d)
    await contaPagar({ ...c, vencimento, documento: c.descricao.startsWith('Simples') ? `DAS ${vencimento.slice(5, 7)}/${vencimento.slice(0, 4)}` : null, pago: pagoAte(vencimento) })
  }
}
await contaPagar({ descricao: 'Aluguel do galpão', valor: 2800, vencimento: dataDoMes(1, 5), categoriaId: catFin('Aluguel'), fornecedorId: fornecedores.imobiliaria })
await contaPagar({ descricao: 'Folha de pagamento', valor: 6200, vencimento: dataDoMes(1, 5), categoriaId: catFin('Salários e encargos') })
await contaPagar({ descricao: 'Manutenção da plotter (troca de cabeça de impressão)', valor: 1480, vencimento: dia(-3), categoriaId: catManut, documento: 'OS 3381' })
await contaPagar({ descricao: 'Instalação terceirizada — fachada Hortifruti Vila Verde', valor: 650, vencimento: dia(-60), categoriaId: catFin('Terceirização'), pago: dia(-60) })
await contaPagar({ descricao: 'Instalação terceirizada — fachada Academia Força Total', valor: 780, vencimento: dia(-105), categoriaId: catFin('Terceirização'), pago: dia(-105) })
// Boletos das compras de insumos já vencidos: pagos no vencimento
const boletos = await consulta(`SELECT id::text, valor::text, vencimento::text FROM contas_pagar WHERE status IN ('aberto', 'vencido') AND vencimento < $1::date AND descricao NOT LIKE 'Manutenção%' ORDER BY vencimento`, hoje)
for (const b of boletos) await api('POST', `/financeiro/pagar/${b.id}/baixa`, { valorRecebido: b.valor, data: b.vencimento, formaPagamentoId: forma('boleto') })
console.log(`✔ contas fixas de 5 meses, ${boletos.length} boletos de compras pagos no vencimento`)

const [frota] = await api('POST', '/financeiro/receber', { clienteId: clientes.construtora, descricao: 'Adesivação da frota (3 caminhonetes) — serviço avulso', valor: '2400.00', vencimento: dia(-20), parcelas: 2, intervaloDias: 30, categoriaId: catFin('Pedidos') })
await api('POST', `/financeiro/receber/${frota.id}/baixa`, { valorRecebido: '1200.00', data: dia(-20), formaPagamentoId: forma('boleto') })
await api('POST', '/financeiro/receber', { clienteId: clientes.fernanda, descricao: 'Plastificação e impressões avulsas (fiado)', valor: '86.50', vencimento: dia(-6) })
console.log('✔ contas a receber avulsas')

// ─── Caixa / PDV ────────────────────────────────────────────────────────────

console.log('\n— Caixa —')
const vender = (itens, pagamentos, clienteId) =>
  api('POST', '/caixa/vendas', { ...(clienteId && { clienteId }), itens: itens.map(([p, q]) => ({ produtoId: p.id, quantidade: String(q) })), pagamentos: pagamentos.map(([tipo, valor]) => ({ formaPagamentoId: forma(tipo), valor: Number(valor).toFixed(2) })) })
async function sessao(d, vendas, fechar) {
  const s = await api('POST', '/caixa/abrir', { valorAbertura: '150.00' })
  const feitas = []
  for (const v of vendas) feitas.push(await vender(...v))
  if (fechar) await api('POST', '/caixa/movimentos', { tipo: 'sangria', valor: '200.00', motivo: 'Depósito no banco' })
  let atual = await api('GET', '/caixa/atual')
  if (fechar) atual = await api('POST', `/caixa/sessoes/${s.id}/fechar`, { informados: atual.porForma.map((f) => ({ formaPagamentoId: f.formaPagamentoId, valor: f.calculado })), observacao: 'Conferido sem diferença.' })
  // Horários do dia: abre às 8h, vendas ao longo do dia, fecha às 18h
  const abertura = em(-d, 8, 2)
  await sql(`UPDATE caixa_sessoes SET aberta_em = $1::timestamptz, fechada_em = CASE WHEN fechada_em IS NULL THEN NULL ELSE $2::timestamptz END WHERE id = $3::uuid`, abertura, em(-d, 18, 7), s.id)
  for (const [i, v] of feitas.entries()) {
    const quando = em(-d, 9 + Math.floor((i * 8) / Math.max(feitas.length, 1)), entre(0, 59))
    await sql(`UPDATE vendas_pdv SET created_at = $1::timestamptz WHERE id = $2::uuid`, quando, v.id)
    await sql(`UPDATE caixa_movimentos SET created_at = $1::timestamptz WHERE venda_pdv_id = $2::uuid`, quando, v.id).catch(() => {})
    await sql(`UPDATE estoque_movimentacoes SET created_at = $1::timestamptz WHERE venda_pdv_id = $2::uuid`, quando, v.id)
    await sql(`UPDATE movimentos_financeiros SET data = $1::date, created_at = $2::timestamptz WHERE venda_pdv_id = $3::uuid`, dia(-d), quando, v.id)
  }
  await sql(`UPDATE caixa_movimentos SET created_at = $1::timestamptz WHERE sessao_id = $2::uuid AND venda_pdv_id IS NULL`, em(-d, 17, 40), s.id).catch(() => {})
  await sql(`UPDATE movimentos_financeiros SET data = $1::date WHERE caixa_sessao_id = $2::uuid`, dia(-d), s.id)
  console.log(`✔ sessão ${fechar ? 'fechada' : 'aberta'} (${dia(-d)}) com ${feitas.length} vendas`)
}
await sessao(1, [
  [[[P.impressaoA4, 40], [P.encadernacao, 2]], [['pix', 124]]],
  [[[P.copia, 120]], [['dinheiro', 60]]],
  [[[P.plastificacao, 4], [P.pasta, 2]], [['dinheiro', 50]]],
  [[[P.caneca, 2]], [['cartao_debito', 70]]],
  [[[P.impressaoA4, 15], [P.copia, 30]], [['pix', 52.5]]],
  [[[P.pasta, 5], [P.encadernacao, 1]], [['cartao_credito', 61.5]]],
], true)
await sessao(0, [
  [[[P.impressaoA4, 25], [P.plastificacao, 2]], [['pix', 74.5]]],
  [[[P.copia, 80], [P.pasta, 1]], [['dinheiro', 50]]],
  [[[P.encadernacao, 3]], [['cartao_debito', 36]]],
  [[[P.caneca, 1], [P.impressaoA4, 10]], [['pix', 60]]],
], false)

// ─── Vitrine ────────────────────────────────────────────────────────────────

console.log('\n— Vitrine —')
await api('PUT', '/vitrine/config', {
  ativa: true,
  titulo: 'Ponto Visual',
  slogan: 'Comunicação visual que faz sua marca ser vista',
  sobre:
    'Somos uma gráfica e empresa de comunicação visual na Vila Mariana, em São Paulo, desde 2014. Produzimos fachadas em ACM, banners, adesivos, placas, impressos e brindes personalizados — com arte, produção e instalação feitas pela nossa equipe.\n\nVocê aprova a arte pelo celular e acompanha cada etapa do pedido até a entrega.',
  horario: 'Seg a sex, 8h às 18h · Sáb, 9h às 13h',
  instagram: '@pontovisual.sp',
  facebook: 'pontovisualsp',
  tiktok: null,
  youtube: null,
  mostrarEndereco: true,
  mostrarTelefone: true,
  mostrarWhatsapp: true,
  mensagemWhatsapp: 'Olá! Vim pelo site da Ponto Visual e gostaria de um orçamento.',
  mensagemPedidoEnviado: 'Recebemos sua lista! Respondemos com o orçamento em até 2 horas úteis.',
  seoDescricao: 'Fachadas em ACM, banners, adesivos, placas, cartões e brindes personalizados na Vila Mariana, São Paulo.',
})
for (const b of ['vitrine-banner-1', 'vitrine-banner-2', 'vitrine-banner-3']) await api('POST', '/vitrine/banners', undefined, await formulario(b))
const vitrine = [
  [P.fachada, 'produto-fachada-acm', { destaque: true, modoPreco: 'a_partir_de', nomePublico: 'Fachada em ACM', descricaoPublica: 'Painel em ACM 3 mm com impressão de alta resolução e laminação UV, montado sobre estrutura metálica. Medimos no local, criamos a arte e instalamos — você só aprova pelo celular.' }],
  [P.banner, 'produto-banner-lona', { destaque: true, modoPreco: 'a_partir_de', nomePublico: 'Banner em lona', descricaoPublica: 'Lona 440 g com impressão eco-solvente resistente ao sol e à chuva. Acabamento com bainha e ilhós ou bastão e cordão. Ideal para fachadas temporárias, eventos e promoções.' }],
  [P.adesivo, 'produto-adesivo-vinil', { destaque: true, modoPreco: 'a_partir_de', nomePublico: 'Adesivo vinil impresso', descricaoPublica: 'Vinil branco ou transparente com impressão colorida, recorte eletrônico no formato que você quiser e laminação opcional. Para vitrines, embalagens, carros e brindes.' }],
  [P.cartao, 'produto-cartao-visita', { destaque: true, modoPreco: 'fixo', nomePublico: 'Cartão de visita (1.000 un.)', descricaoPublica: 'Cartão 9 × 5 cm em couché 300 g, impressão frente e verso colorida. Opcional: laminação fosca e cantos arredondados. Pronto em 3 dias úteis.' }],
  [P.wind, 'produto-wind-banner', { modoPreco: 'fixo', descricaoPublica: 'Bandeira de 2,5 m em tecido sublimado com haste flexível e base para encher com água. Chama a atenção na calçada e se monta em minutos.' }],
  [P.perfurado, 'produto-adesivo-perfurado', { modoPreco: 'a_partir_de', descricaoPublica: 'Vinil perfurado one way: sua marca aparece do lado de fora e a luz continua entrando. Perfeito para vitrines e vidros de carros.' }],
  [P.placa, 'produto-placa-pvc', { modoPreco: 'a_partir_de', descricaoPublica: 'Placa em PVC expandido 3 mm com impressão UV direta. Sinalização de portas, recepção, rotas de fuga e identificação de ambientes.' }],
  [P.panfleto, 'produto-panfleto', { modoPreco: 'a_partir_de', nomePublico: 'Panfleto 10 × 15 cm', descricaoPublica: 'Panfleto colorido em couché brilho 115 g. A partir de 1.000 unidades, com criação de arte opcional.' }],
  [P.caneca, 'produto-caneca', { modoPreco: 'fixo', descricaoPublica: 'Caneca de cerâmica branca 325 ml com sua arte sublimada. Pode ir ao micro-ondas. Embalagem individual opcional.' }],
  [P.camiseta, 'produto-camiseta', { modoPreco: 'a_partir_de', descricaoPublica: 'Camiseta em poliéster com estampa sublimada de alta definição. Para eventos, equipes, corridas e uniformes. Tamanhos P ao GG.' }],
]
for (const [ordem, [p, imagemNome, dados]] of vitrine.entries()) {
  await api('POST', `/produtos/${p.id}/imagens`, undefined, await formulario(imagemNome))
  await api('PATCH', `/produtos/${p.id}/vitrine`, { publicado: true, destaque: false, nomePublico: '', descricaoPublica: '', slug: '', ordem: ordem + 1, ...dados })
}
console.log(`✔ vitrine ativa com ${vitrine.length} produtos publicados (4 destaques) e 3 banners`)

const publicos = await api('GET', `/publico/${SLUG}/vitrine/produtos?pageSize=48`)
const slugDe = (p) => lista(publicos).find((x) => x.id === p.id || x.nome === (vitrine.find(([v]) => v.id === p.id)?.[2].nomePublico || p.nome))?.slug
const acabPublico = async (slug, nome) => (await api('GET', `/publico/${SLUG}/vitrine/produtos/${slug}`)).acabamentos.find((a) => a.nome === nome)?.id
for (const s of [
  { nome: 'Renata Albuquerque', whatsapp: '(11) 98123-4501', email: 'renata@studiobelezarenata.com.br', mensagem: 'Estou abrindo um estúdio de beleza e preciso da fachada e do adesivo da porta de vidro. Podem medir no local?', itens: [{ p: P.fachada, quantidade: 1, largura: '4', altura: '0,8' }, { p: P.perfurado, quantidade: 1, largura: '1', altura: '2,1', acab: 'Aplicação no local' }] },
  { nome: 'Thiago Martins', whatsapp: '(11) 99654-2210', email: '', mensagem: 'Cartões para a equipe de vendas (3 pessoas, 1.000 de cada).', itens: [{ p: P.cartao, quantidade: 3000 }] },
  { nome: 'Colégio Novo Horizonte', whatsapp: '(11) 3277-1800', email: 'eventos@colegionovohorizonte.com.br', mensagem: 'Festa junina fora de época da escola: banners e canecas de lembrança. Precisamos até o dia 25.', itens: [{ p: P.banner, quantidade: 2, largura: '3', altura: '1', acab: 'Ilhós a cada 50 cm' }, { p: P.caneca, quantidade: 50 }] },
]) {
  const itens = []
  for (const i of s.itens) {
    const slug = slugDe(i.p)
    itens.push({ produtoSlug: slug, quantidade: i.quantidade, ...(i.largura && { largura: i.largura, altura: i.altura }), acabamentoIds: i.acab ? [await acabPublico(slug, i.acab)].filter(Boolean) : [] })
  }
  let r
  for (let tentativa = 0; tentativa < 11; tentativa++) {
    r = await chamar('POST', `/publico/${SLUG}/vitrine/pedidos`, { body: { nome: s.nome, whatsapp: s.whatsapp, email: s.email, mensagem: s.mensagem, site: '', itens } })
    if (r.status !== 429) break
    console.log('  (limite de envios do site: aguardando 1 minuto)')
    await new Promise((ok) => setTimeout(ok, 61_000))
  }
  if (r.status !== 200) console.warn(`  (pedido do site não enviado: ${r.status} ${JSON.stringify(r.json).slice(0, 300)})`)
  else console.log(`✔ pedido do site ${r.json.numero} · ${s.nome}`)
}
await api('POST', '/solicitacoes', { novoCliente: { nome: 'Vanessa Duarte', whatsapp: '(11) 97321-0098' }, origem: 'whatsapp', descricao: 'Adesivos redondos 5 cm para potes de doces — 500 unidades, arte própria. Quer retirar na sexta.', prazoDesejado: dia(4) })
console.log('✔ solicitação pelo WhatsApp')
// Pedidos do site: um de ontem, um de hoje cedo e um de agora há pouco
const sols = await consulta(`SELECT id::text FROM solicitacoes_orcamento ORDER BY created_at`)
for (const [i, s] of sols.entries()) {
  const quando = [em(-1, 15, 22), em(0, 8, 41), em(0, 11, 5), em(0, 14, 30)][i] ?? new Date()
  await sql(`UPDATE solicitacoes_orcamento SET created_at = $1::timestamptz, updated_at = $1::timestamptz WHERE id = $2::uuid`, quando, s.id)
}

// ─── Estoque: inventário final ──────────────────────────────────────────────

console.log('\n— Estoque: reposição e alertas —')
const posicao = lista(await api('GET', '/estoque/posicao?pageSize=100'))
// Estes ficam abaixo do mínimo (alerta no painel); o resto é reposto com folga
const emAlerta = new Set([ins.ilhos, ins.perfurado, ins.caneca, ins.camiseta])
const reposicao = []
for (const l of posicao) {
  const id = l.produto.id
  const minimo = Number(l.estoqueMinimo)
  const saldo = Number(l.saldo)
  const custo = Number(l.custoMedio) || 1
  if (emAlerta.has(id)) {
    if (saldo < minimo * 0.3) reposicao.push([id, Math.ceil(minimo * 0.6 - saldo), custo])
    else if (saldo >= minimo) {
      const dados = await api('GET', `/insumos/${id}`)
      const campos = ['codigo', 'nome', 'descricao', 'embalagem', 'embalagemLargura', 'embalagemComprimento', 'embalagemConteudo', 'precoEmbalagem', 'controlaEstoque', 'ativo']
      const corpo = Object.fromEntries(campos.filter((c) => dados[c] !== undefined && dados[c] !== null).map((c) => [c, dados[c]]))
      await api('PUT', `/insumos/${id}`, { ...corpo, categoriaId: dados.categoriaId ?? null, unidadeMedidaId: dados.unidadeMedidaId ?? dados.unidadeMedida?.id, fornecedorPreferidoId: dados.fornecedorPreferidoId ?? null, estoqueMinimo: String(Math.ceil(saldo * 1.6)) })
    }
  } else if (saldo < Math.max(minimo * 1.3, 1)) reposicao.push([id, Math.ceil(Math.max(minimo * 2.5, 10) - saldo), custo])
}
const fornecedorDo = { [ins.lona]: 'lonas', [ins.tecido]: 'lonas', [ins.vinil]: 'vinil', [ins.perfurado]: 'vinil', [ins.acm]: 'acm', [ins.pvc]: 'acm', [ins.tinta]: 'tintas', [ins.ilhos]: 'tintas', [ins.couche300]: 'papel', [ins.couche115]: 'papel', [P.pasta.id]: 'papel' }
const porFornecedor = Object.groupBy(reposicao, ([id]) => fornecedorDo[id] ?? 'brindes')
for (const [fornecedor, itens] of Object.entries(porFornecedor)) await compra(3, fornecedor, itens.map(([id, q, c]) => [id, q, c.toFixed(2)]), [28])
// Contagem do mês: peças e folhas em número inteiro (as perdas da produção deixam frações)
for (const l of lista(await api('GET', '/estoque/posicao?pageSize=100'))) {
  const saldo = Number(l.saldo)
  if (['un', 'fl'].includes(l.produto.unidadeMedida?.sigla ?? l.produto.unidade) && saldo > 1 && saldo % 1 !== 0) {
    await api('POST', '/estoque/movimentacoes', { tipo: 'ajuste', produtoId: l.produto.id, localId: almox.id, saldoContado: String(Math.floor(saldo)), motivo: 'Contagem mensal' })
  }
}
await sql(`UPDATE estoque_movimentacoes SET created_at = $1::timestamptz WHERE tipo = 'ajuste' AND created_at > now() - interval '10 minutes'`, em(-1, 17, 30))
const fila = lista(await api('GET', '/etiquetas/fila'))
if (fila.length > 3) await api('POST', '/etiquetas/fila/marcar-impressas', { ids: fila.slice(0, -3).map((e) => e.id) })

// ─── Acabamento ─────────────────────────────────────────────────────────────

// Clientes cadastrados ao longo do último ano; avisos antigos já lidos
const todosClientes = await consulta(`SELECT id::text FROM clientes WHERE situacao = 'ativo' ORDER BY created_at`)
for (const [i, c] of todosClientes.entries()) await sql(`UPDATE clientes SET created_at = $1::timestamptz WHERE id = $2::uuid`, em(-(300 - i * 9), 10, 15), c.id)
await sql(`UPDATE notificacoes SET lida = true WHERE id NOT IN (SELECT id FROM notificacoes ORDER BY created_at DESC LIMIT 5)`)
await db.$disconnect()

const resumo = {
  pedidos: pedidos.length,
  orcamentosAbertos: orcamentos.length,
  exemploPedido: pedidos.find((p) => p.status === 'em_producao')?.id,
}
console.log(`\nPronto. Entre com ${EMAIL} / ${SENHA}. Vitrine: http://${SLUG}.localhost:5173`)
console.log(JSON.stringify(resumo))
