import type { Acao, Modulo } from '@onprint/shared'
import {
  BarChart3,
  Boxes,
  Factory,
  FileText,
  Gauge,
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
  /** Permissão exigida além da do módulo (ex.: lucratividade = relatórios + ver custos, que é produtos:editar) */
  tambem?: { modulo: Modulo; acao: Acao }
}

/** Seções do menu (títulos pequenos), na ordem em que aparecem */
export const SECOES_MENU = {
  inicio: '',
  comercial: 'Comercial',
  operacao: 'Operação',
  gestao: 'Gestão',
} as const
export type SecaoMenu = keyof typeof SECOES_MENU

export interface NavModulo {
  modulo: Modulo
  titulo: string
  icone: LucideIcon
  fase: number
  secao: SecaoMenu
  /** Módulo sem filhos visíveis: link direto (as demais telas do grupo são abas dele) */
  path?: string
  novo?: string
  filhos?: NavLeaf[]
}

export const navegacao: NavModulo[] = [
  { modulo: 'dashboard', titulo: 'Início', icone: LayoutDashboard, path: '/', fase: 7, secao: 'inicio' },

  // ─── Comercial ───
  {
    modulo: 'orcamentos',
    titulo: 'Orçamentos',
    icone: FileText,
    fase: 3,
    secao: 'comercial',
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
    secao: 'comercial',
    // Kanban e entregas são abas da tela de pedidos
    path: '/pedidos',
    filhos: [
      { titulo: 'Pedidos de venda', path: '/pedidos', fase: 4, menu: false },
      { titulo: 'Kanban de pedidos', path: '/pedidos/kanban', fase: 4, menu: false },
      { titulo: 'Entregas', path: '/pedidos/entregas', fase: 4, menu: false },
    ],
  },
  { modulo: 'clientes', titulo: 'Clientes', icone: Users, path: '/clientes', fase: 1, novo: 'Novo cliente', secao: 'comercial' },
  {
    modulo: 'caixa',
    titulo: 'Caixa / PDV',
    icone: Store,
    fase: 6,
    secao: 'comercial',
    filhos: [
      { titulo: 'Venda balcão (PDV)', path: '/caixa', fase: 6 },
      { titulo: 'Recebimentos', path: '/caixa/recebimentos', fase: 6 },
      { titulo: 'Sangria e suprimento', path: '/caixa/movimentos', fase: 6 },
      { titulo: 'Sessões de caixa', path: '/caixa/sessoes', fase: 6 },
    ],
  },
  { modulo: 'whatsapp', titulo: 'WhatsApp', icone: MessageCircle, path: '/whatsapp', fase: 9, secao: 'comercial' },

  // ─── Operação ───
  {
    modulo: 'producao',
    titulo: 'Produção',
    icone: Factory,
    fase: 4,
    secao: 'operacao',
    // A lista de ordens é aba do kanban de produção
    path: '/producao',
    filhos: [
      { titulo: 'Kanban de produção', path: '/producao', fase: 4, menu: false },
      { titulo: 'Ordens de produção', path: '/producao/ordens', fase: 4, menu: false },
    ],
  },
  { modulo: 'pcp', titulo: 'PCP / Cockpit', icone: Gauge, path: '/pcp', fase: 4, secao: 'operacao' },

  {
    modulo: 'produtos',
    titulo: 'Produtos',
    icone: Package,
    fase: 2,
    secao: 'operacao',
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
    modulo: 'estoque',
    titulo: 'Estoque',
    icone: Boxes,
    fase: 5,
    secao: 'operacao',
    // Entradas, movimentações e alertas são abas da tela de estoque
    path: '/estoque',
    filhos: [
      { titulo: 'Estoque atual', path: '/estoque', fase: 5, menu: false },
      { titulo: 'Entradas de compra', path: '/estoque/entradas', fase: 5, novo: 'Nova entrada', menu: false },
      { titulo: 'Movimentações de estoque', path: '/estoque/movimentacoes', fase: 5, novo: 'Nova movimentação', menu: false },
      { titulo: 'Alertas de estoque baixo', path: '/estoque/alertas', fase: 5, menu: false },
    ],
  },
  { modulo: 'fornecedores', titulo: 'Fornecedores', icone: Truck, path: '/fornecedores', fase: 1, novo: 'Novo fornecedor', secao: 'operacao' },

  // ─── Gestão ───
  {
    modulo: 'financeiro',
    titulo: 'Financeiro',
    icone: Wallet,
    fase: 6,
    secao: 'gestao',
    filhos: [
      { titulo: 'Contas a receber', path: '/financeiro/receber', fase: 6, novo: 'Nova conta a receber' },
      { titulo: 'Contas a pagar', path: '/financeiro/pagar', fase: 6, novo: 'Nova conta a pagar' },
      { titulo: 'Fluxo de caixa', path: '/financeiro/fluxo-caixa', fase: 6 },
      { titulo: 'Calendário', path: '/financeiro/calendario', fase: 6 },
      { titulo: 'Comissões a pagar', path: '/financeiro/comissoes', fase: 6 },
    ],
  },

  {
    modulo: 'relatorios',
    titulo: 'Relatórios',
    icone: BarChart3,
    fase: 7,
    secao: 'gestao',
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
    secao: 'gestao',
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
      { titulo: 'Máquinas', path: '/configuracoes/maquinas', fase: 2, novo: 'Nova máquina', modulo: 'produtos', menu: false },
      { titulo: 'Processos', path: '/configuracoes/processos', fase: 2, novo: 'Novo processo', modulo: 'produtos', menu: false },
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

/** Módulos do menu agrupados pela seção, na ordem (seções vazias somem) */
export function agruparPorSecao<T extends Pick<NavModulo, 'secao'>>(itens: T[]): { secao: SecaoMenu; titulo: string; itens: T[] }[] {
  return (Object.keys(SECOES_MENU) as SecaoMenu[])
    .map((secao) => ({ secao, titulo: SECOES_MENU[secao], itens: itens.filter((i) => i.secao === secao) }))
    .filter((g) => g.itens.length > 0)
}

/** Primeira tela que o usuário pode abrir (usado quando ele não tem acesso ao Dashboard). */
export function primeiraPaginaPermitida(pode: Pode): string | undefined {
  return paginas.find((p) => p.path !== '/' && podeAbrir(pode, p))?.path
}
