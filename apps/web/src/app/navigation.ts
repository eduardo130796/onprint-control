import type { Acao, Modulo } from '@onprint/shared'
import {
  BarChart3,
  Boxes,
  Factory,
  FileText,
  Gauge,
  Globe,
  Handshake,
  House,
  LayoutDashboard,
  MessageCircle,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/**
 * Fonte única da navegação: gera o menu lateral, as rotas, a busca "Localizar…" e o FAB.
 * `modulo` é a chave usada pelas permissões (Fase 1).
 * `fase` indica em qual fase do ROADMAP a tela será implementada.
 * `novo` define o rótulo do botão flutuante "+" (rota `${path}/novo`).
 */
export interface NavLeaf {
  /** Módulo de permissão, quando diferente do módulo pai */
  modulo?: Modulo
  titulo: string
  path: string
  fase: number
  novo?: string
  /** Ação exigida além de visualizar (ex.: reajuste de preços só para quem edita produtos) */
  acao?: Acao
  /** Tela que é aba de outra (kanban, entregas…) ou rota antiga: gera rota e aparece na busca, mas não no menu */
  menu?: false
  /** Rota antiga mantida só para links salvos: fica fora dos atalhos "Novo…" do menu */
  legado?: true
  /** Permissão exigida além da do módulo (ex.: lucratividade = relatórios + ver custos, que é produtos:editar) */
  tambem?: { modulo: Modulo; acao: Acao }
}

/**
 * Áreas do menu: o trilho escuro à esquerda mostra as áreas; o painel ao lado mostra só as telas da área
 * escolhida (menu focado no que a pessoa está fazendo). `rotulo` é o nome curto embaixo do ícone.
 */
export const AREAS_MENU = {
  inicio: { titulo: 'Início', rotulo: 'Início', icone: House, descricao: 'Resumo do dia e atalhos' },
  comercial: { titulo: 'Comercial', rotulo: 'Comercial', icone: Handshake, descricao: 'Vendas, pedidos e clientes' },
  producao: { titulo: 'Produção', rotulo: 'Produção', icone: Factory, descricao: 'Ordens e planejamento' },
  catalogo: { titulo: 'Catálogo', rotulo: 'Catálogo', icone: Package, descricao: 'Produtos, insumos e preços' },
  vitrine: { titulo: 'Vitrine', rotulo: 'Vitrine', icone: Globe, descricao: 'Seu site de produtos' },
  estoque: { titulo: 'Estoque e compras', rotulo: 'Estoque', icone: Boxes, descricao: 'Saldo, compras e fornecedores' },
  financeiro: { titulo: 'Financeiro', rotulo: 'Financeiro', icone: Wallet, descricao: 'Contas, fluxo e caixa' },
  relatorios: { titulo: 'Relatórios', rotulo: 'Relatórios', icone: BarChart3, descricao: 'Os números do negócio' },
  configuracoes: { titulo: 'Configurações', rotulo: 'Ajustes', icone: Settings, descricao: 'Empresa, equipe e sistema' },
} as const satisfies Record<string, { titulo: string; rotulo: string; icone: LucideIcon; descricao: string }>
export type AreaMenu = keyof typeof AREAS_MENU

export interface NavModulo {
  modulo: Modulo
  titulo: string
  icone: LucideIcon
  fase: number
  area: AreaMenu
  /** Título do bloco no painel quando a área tem mais de um grupo (ex.: Financeiro → "Contas" e "Caixa / PDV") */
  grupo?: string
  /** Módulo sem filhos visíveis: link direto (as demais telas do grupo são abas dele) */
  path?: string
  novo?: string
  filhos?: NavLeaf[]
}

export const navegacao: NavModulo[] = [
  { modulo: 'dashboard', titulo: 'Visão geral', icone: LayoutDashboard, path: '/', fase: 7, area: 'inicio' },

  {
    modulo: 'orcamentos',
    titulo: 'Orçamentos',
    icone: FileText,
    fase: 3,
    area: 'comercial',
    // Solicitações e kanban são abas da tela de orçamentos
    path: '/orcamentos',
    filhos: [
      { titulo: 'Orçamentos', path: '/orcamentos', fase: 3, novo: 'Novo orçamento', menu: false },
      { titulo: 'Solicitações de orçamento', path: '/orcamentos/solicitacoes', fase: 3, novo: 'Nova solicitação', menu: false },
      { titulo: 'Kanban de orçamentos', path: '/orcamentos/kanban', fase: 3, menu: false },
    ],
  },
  {
    modulo: 'pedidos',
    titulo: 'Pedidos',
    icone: ShoppingCart,
    fase: 4,
    area: 'comercial',
    // Kanban e entregas são abas da tela de pedidos
    path: '/pedidos',
    filhos: [
      { titulo: 'Pedidos de venda', path: '/pedidos', fase: 4, menu: false },
      { titulo: 'Kanban de pedidos', path: '/pedidos/kanban', fase: 4, menu: false },
      { titulo: 'Entregas', path: '/pedidos/entregas', fase: 4, menu: false },
    ],
  },
  { modulo: 'clientes', titulo: 'Clientes', icone: Users, path: '/clientes', fase: 1, novo: 'Novo cliente', area: 'comercial' },
  { modulo: 'whatsapp', titulo: 'WhatsApp', icone: MessageCircle, path: '/whatsapp', fase: 9, area: 'comercial' },

  {
    modulo: 'producao',
    titulo: 'Produção',
    icone: Factory,
    fase: 4,
    area: 'producao',
    // A lista de ordens é aba do kanban de produção
    path: '/producao',
    filhos: [
      { titulo: 'Kanban de produção', path: '/producao', fase: 4, menu: false },
      { titulo: 'Ordens de produção', path: '/producao/ordens', fase: 4, menu: false },
    ],
  },
  { modulo: 'pcp', titulo: 'PCP / Cockpit', icone: Gauge, path: '/pcp', fase: 4, area: 'producao' },

  {
    modulo: 'produtos',
    titulo: 'Produtos',
    icone: Package,
    fase: 2,
    area: 'catalogo',
    filhos: [
      { titulo: 'Produtos e serviços', path: '/produtos', fase: 2, novo: 'Novo produto' },
      { titulo: 'Insumos e materiais', path: '/produtos/insumos', fase: 2, novo: 'Novo insumo' },
      { titulo: 'Acabamentos', path: '/produtos/acabamentos', fase: 2, novo: 'Novo acabamento' },
      { titulo: 'Categorias', path: '/produtos/categorias', fase: 2, novo: 'Nova categoria' },
      { titulo: 'Máquinas e processos', path: '/produtos/maquinas', fase: 2, novo: 'Nova máquina' },
      { titulo: 'Reajuste de preços', path: '/produtos/reajuste', fase: 2, acao: 'editar' },
    ],
  },

  {
    modulo: 'vitrine',
    titulo: 'Vitrine online',
    icone: Globe,
    fase: 19,
    area: 'vitrine',
    filhos: [
      { titulo: 'Configurar vitrine', path: '/vitrine', fase: 19 },
      { titulo: 'Produtos na vitrine', path: '/vitrine/produtos', fase: 19 },
      // Atalho para Orçamentos → Solicitações filtrado por origem "Site" (rota própria só redireciona)
      { titulo: 'Pedidos do site', path: '/vitrine/pedidos', fase: 19, tambem: { modulo: 'orcamentos', acao: 'visualizar' } },
    ],
  },

  {
    modulo: 'estoque',
    titulo: 'Estoque',
    icone: Boxes,
    fase: 5,
    area: 'estoque',
    // Entradas, movimentações e alertas são abas da tela de estoque
    path: '/estoque',
    filhos: [
      { titulo: 'Estoque atual', path: '/estoque', fase: 5, menu: false },
      { titulo: 'Entradas de compra', path: '/estoque/entradas', fase: 5, novo: 'Nova entrada', menu: false },
      { titulo: 'Movimentações de estoque', path: '/estoque/movimentacoes', fase: 5, novo: 'Nova movimentação', menu: false },
      { titulo: 'Alertas de estoque baixo', path: '/estoque/alertas', fase: 5, menu: false },
    ],
  },
  { modulo: 'fornecedores', titulo: 'Fornecedores', icone: Truck, path: '/fornecedores', fase: 1, novo: 'Novo fornecedor', area: 'estoque' },

  {
    modulo: 'financeiro',
    titulo: 'Financeiro',
    icone: Wallet,
    fase: 6,
    area: 'financeiro',
    grupo: 'Contas',
    filhos: [
      { titulo: 'Contas a receber', path: '/financeiro/receber', fase: 6, novo: 'Nova conta a receber' },
      { titulo: 'Contas a pagar', path: '/financeiro/pagar', fase: 6, novo: 'Nova conta a pagar' },
      { titulo: 'Fluxo de caixa', path: '/financeiro/fluxo-caixa', fase: 6 },
      { titulo: 'Calendário', path: '/financeiro/calendario', fase: 6 },
      { titulo: 'Comissões a pagar', path: '/financeiro/comissoes', fase: 6 },
    ],
  },

  {
    modulo: 'caixa',
    titulo: 'Caixa / PDV',
    icone: Store,
    fase: 6,
    area: 'financeiro',
    grupo: 'Caixa / PDV',
    filhos: [
      { titulo: 'Venda balcão (PDV)', path: '/caixa', fase: 6 },
      { titulo: 'Recebimentos', path: '/caixa/recebimentos', fase: 6 },
      { titulo: 'Sangria e suprimento', path: '/caixa/movimentos', fase: 6 },
      { titulo: 'Sessões de caixa', path: '/caixa/sessoes', fase: 6 },
    ],
  },
  {
    modulo: 'relatorios',
    titulo: 'Relatórios',
    icone: BarChart3,
    fase: 7,
    area: 'relatorios',
    filhos: [
      { titulo: 'Vendas', path: '/relatorios/vendas', fase: 7 },
      { titulo: 'Lucratividade', path: '/relatorios/lucratividade', fase: 7, tambem: { modulo: 'produtos', acao: 'editar' } },
      { titulo: 'Conversão de orçamentos', path: '/relatorios/orcamentos', fase: 7 },
      { titulo: 'Produção', path: '/relatorios/producao', fase: 7 },
      { titulo: 'Estoque', path: '/relatorios/estoque', fase: 7 },
      { titulo: 'Financeiro', path: '/relatorios/financeiro', fase: 7 },
      { titulo: 'Comissões por vendedor', path: '/relatorios/comissoes', fase: 7 },
    ],
  },

  {
    modulo: 'configuracoes',
    titulo: 'Configurações',
    icone: Settings,
    fase: 1,
    area: 'configuracoes',
    filhos: [
      { titulo: 'Dados da empresa', path: '/configuracoes/empresa', fase: 1 },
      { titulo: 'Aparência', path: '/configuracoes/aparencia', fase: 14 },
      { titulo: 'Precificação', path: '/configuracoes/precificacao', fase: 2 },
      { titulo: 'Usuários', path: '/configuracoes/usuarios', fase: 1, novo: 'Novo usuário', modulo: 'usuarios' },
      { titulo: 'Permissões', path: '/configuracoes/permissoes', fase: 1, modulo: 'permissoes' },
      { titulo: 'Formas de pagamento', path: '/financeiro/formas-pagamento', fase: 6, novo: 'Nova forma', modulo: 'financeiro' },
      { titulo: 'Mensagens prontas', path: '/configuracoes/templates', fase: 1, novo: 'Novo template' },
      { titulo: 'Status do sistema', path: '/configuracoes/status', fase: 1 },
      { titulo: 'Conexão do WhatsApp', path: '/configuracoes/whatsapp', fase: 9 },
      { titulo: 'Minha assinatura', path: '/assinatura', fase: 11 },
      // Rotas antigas (as mesmas telas de Produtos → Máquinas e processos)
      { titulo: 'Máquinas', path: '/configuracoes/maquinas', fase: 2, novo: 'Nova máquina', modulo: 'produtos', menu: false, legado: true },
      { titulo: 'Processos', path: '/configuracoes/processos', fase: 2, novo: 'Novo processo', modulo: 'produtos', menu: false, legado: true },
    ],
  },
]

export interface PaginaNav extends NavLeaf {
  modulo: Modulo
  moduloTitulo: string
  icone: LucideIcon
}

/** Lista achatada de todas as páginas navegáveis (rotas, busca e FAB). */
export const paginas: PaginaNav[] = navegacao.flatMap((m) =>
  m.filhos
    ? m.filhos.map((f) => ({ ...f, modulo: f.modulo ?? m.modulo, moduloTitulo: m.titulo, icone: m.icone }))
    : [
        {
          titulo: m.titulo,
          path: m.path ?? '/',
          fase: m.fase,
          novo: m.novo,
          modulo: m.modulo,
          moduloTitulo: m.titulo,
          icone: m.icone,
        },
      ],
)

/** Página correspondente ao caminho atual (inclui sub-rotas como /clientes/novo). */
export function paginaAtual(pathname: string): PaginaNav | undefined {
  const exata = paginas.find((p) => p.path === pathname)
  if (exata) return exata
  return paginas
    .filter((p) => p.path !== '/' && pathname.startsWith(`${p.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

type Pode = (modulo: Modulo, acao?: Acao) => boolean

/** A pessoa pode abrir a página: permissão do módulo (+ a ação) e a permissão extra, se houver. */
export function podeAbrir(pode: Pode, p: Pick<NavLeaf, 'acao' | 'tambem'> & { modulo: Modulo }): boolean {
  return pode(p.modulo, p.acao) && (!p.tambem || pode(p.tambem.modulo, p.tambem.acao))
}

/**
 * Menu visível para o usuário: esconde itens sem permissão e grupos vazios. Grupo cujas telas são só abas
 * (orçamentos, pedidos, produção) vira um link direto (`path`) e guarda as abas em `abas` para marcar ativo.
 */
export function filtrarNavegacao(pode: Pode): (NavModulo & { abas?: NavLeaf[] })[] {
  return navegacao.flatMap((m) => {
    if (!m.filhos) return pode(m.modulo) ? [m] : []
    const permitidos = m.filhos.filter((f) => podeAbrir(pode, { ...f, modulo: f.modulo ?? m.modulo }))
    if (!permitidos.length) return []
    const visiveis = permitidos.filter((f) => f.menu !== false)
    if (visiveis.length) return [{ ...m, filhos: visiveis }]
    // Só abas: link direto para a principal (ou a primeira permitida)
    const destino = permitidos.find((f) => f.path === m.path) ?? permitidos[0]
    return [{ ...m, path: destino?.path, filhos: undefined, abas: permitidos }]
  })
}

const naRota = (path: string, pathname: string) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`))

/** Área da tela atual (a do módulo cuja tela casa com o caminho mais longo) */
export function areaDaRota(pathname: string): AreaMenu | undefined {
  let melhor: { area: AreaMenu; tamanho: number } | undefined
  for (const m of navegacao) {
    for (const path of [m.path, ...(m.filhos ?? []).map((f) => f.path)]) {
      if (path && naRota(path, pathname) && (!melhor || path.length > melhor.tamanho)) melhor = { area: m.area, tamanho: path.length }
    }
  }
  return melhor?.area
}

/** Linha do painel: uma tela (ou um módulo cujas outras telas são abas, em `chaves`) */
export interface LinhaMenu {
  titulo: string
  path: string
  /** Caminhos que deixam a linha ativa (a tela e suas abas) */
  chaves: string[]
}

export interface AreaVisivel {
  area: AreaMenu
  titulo: string
  rotulo: string
  icone: LucideIcon
  descricao: string
  /** Blocos do painel; `titulo` só quando a área tem mais de um grupo */
  blocos: { titulo?: string; linhas: LinhaMenu[] }[]
  /** Atalhos "Novo…" das telas da área que a pessoa pode criar */
  acoes: { titulo: string; path: string }[]
}

/** Áreas que a pessoa pode ver, na ordem, com as telas e os atalhos de cada uma (áreas vazias somem) */
export function montarAreas(pode: Pode): AreaVisivel[] {
  const itens = filtrarNavegacao(pode)
  const acoesDe = (area: AreaMenu) =>
    paginas
      .filter((p) => p.novo && !p.legado && areaDaRota(p.path) === area && podeAbrir(pode, { ...p, acao: 'criar' }))
      .map((p) => ({ titulo: p.novo ?? '', path: `${p.path}/novo` }))
  const areas = (Object.keys(AREAS_MENU) as AreaMenu[]).map((area): AreaVisivel => {
    const daArea = itens.filter((m) => m.area === area)
    const varios = daArea.filter((m) => m.filhos).length > 1
    const blocos: AreaVisivel['blocos'] = []
    for (const m of daArea) {
      if (m.filhos) {
        blocos.push({ titulo: varios ? (m.grupo ?? m.titulo) : undefined, linhas: m.filhos.map((f) => ({ titulo: f.titulo, path: f.path, chaves: [f.path] })) })
        continue
      }
      const linha = { titulo: m.titulo, path: m.path ?? '/', chaves: [m.path ?? '/', ...(m.abas ?? []).map((a) => a.path)] }
      const ultimo = blocos[blocos.length - 1]
      if (ultimo && !ultimo.titulo) ultimo.linhas.push(linha)
      else blocos.push({ linhas: [linha] })
    }
    return { area, ...AREAS_MENU[area], blocos, acoes: acoesDe(area) }
  })
  const visiveis = areas.filter((a) => a.blocos.length > 0)
  // Início: o principal atalho de cada área
  const inicio = visiveis.find((a) => a.area === 'inicio')
  if (inicio) inicio.acoes = visiveis.flatMap((a) => a.acoes.slice(0, 1)).slice(0, 5)
  return visiveis
}

/** Linha ativa do painel: a que casa com o caminho mais longo (não marca /produtos em /produtos/insumos) */
export function linhaAtiva(linhas: LinhaMenu[], pathname: string): LinhaMenu | undefined {
  let melhor: { linha: LinhaMenu; tamanho: number } | undefined
  for (const linha of linhas) {
    for (const c of linha.chaves) if (naRota(c, pathname) && (!melhor || c.length > melhor.tamanho)) melhor = { linha, tamanho: c.length }
  }
  return melhor?.linha
}

/** Primeira tela que o usuário pode abrir (usado quando ele não tem acesso ao Dashboard). */
export function primeiraPaginaPermitida(pode: Pode): string | undefined {
  return paginas.find((p) => p.path !== '/' && podeAbrir(pode, p))?.path
}
