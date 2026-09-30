import type { Modulo } from '@onprint/shared'
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
}

export interface NavModulo {
  modulo: Modulo
  titulo: string
  icone: LucideIcon
  fase: number
  path?: string
  novo?: string
  filhos?: NavLeaf[]
}

export const navegacao: NavModulo[] = [
  { modulo: 'dashboard', titulo: 'Dashboard', icone: LayoutDashboard, path: '/', fase: 7 },
  {
    modulo: 'orcamentos',
    titulo: 'Orçamentos',
    icone: FileText,
    fase: 3,
    filhos: [
      { titulo: 'Solicitações', path: '/orcamentos/solicitacoes', fase: 3, novo: 'Nova solicitação' },
      { titulo: 'Orçamentos', path: '/orcamentos', fase: 3, novo: 'Novo orçamento' },
    ],
  },
  {
    modulo: 'pedidos',
    titulo: 'Pedidos de Venda',
    icone: ShoppingCart,
    fase: 4,
    filhos: [
      { titulo: 'Lista de pedidos', path: '/pedidos', fase: 4 },
      { titulo: 'Kanban de pedidos', path: '/pedidos/kanban', fase: 4 },
      { titulo: 'Entregas', path: '/pedidos/entregas', fase: 4 },
    ],
  },
  {
    modulo: 'producao',
    titulo: 'Produção',
    icone: Factory,
    fase: 4,
    filhos: [
      { titulo: 'Kanban de produção', path: '/producao', fase: 4 },
      { titulo: 'Ordens de produção', path: '/producao/ordens', fase: 4 },
    ],
  },
  { modulo: 'pcp', titulo: 'PCP / Cockpit', icone: Gauge, path: '/pcp', fase: 4 },
  { modulo: 'clientes', titulo: 'Clientes', icone: Users, path: '/clientes', fase: 1, novo: 'Novo cliente' },
  {
    modulo: 'fornecedores',
    titulo: 'Fornecedores',
    icone: Truck,
    path: '/fornecedores',
    fase: 1,
    novo: 'Novo fornecedor',
  },
  {
    modulo: 'produtos',
    titulo: 'Produtos',
    icone: Package,
    fase: 2,
    filhos: [
      { titulo: 'Categorias', path: '/produtos/categorias', fase: 2, novo: 'Nova categoria' },
      { titulo: 'Produtos e Serviços', path: '/produtos', fase: 2, novo: 'Novo produto' },
      { titulo: 'Acabamentos', path: '/produtos/acabamentos', fase: 2, novo: 'Novo acabamento' },
      { titulo: 'Máquinas e Processos', path: '/produtos/maquinas', fase: 2, novo: 'Nova máquina' },
    ],
  },
  {
    modulo: 'estoque',
    titulo: 'Estoque',
    icone: Boxes,
    fase: 5,
    filhos: [
      { titulo: 'Estoque atual', path: '/estoque', fase: 5 },
      { titulo: 'Entrada de estoque', path: '/estoque/entradas', fase: 5, novo: 'Nova entrada' },
      { titulo: 'Movimentações', path: '/estoque/movimentacoes', fase: 5, novo: 'Nova movimentação' },
      { titulo: 'Alertas de estoque baixo', path: '/estoque/alertas', fase: 5 },
    ],
  },
  {
    modulo: 'financeiro',
    titulo: 'Financeiro',
    icone: Wallet,
    fase: 6,
    filhos: [
      { titulo: 'Contas a receber', path: '/financeiro/receber', fase: 6, novo: 'Nova conta a receber' },
      { titulo: 'Contas a pagar', path: '/financeiro/pagar', fase: 6, novo: 'Nova conta a pagar' },
      { titulo: 'Fluxo de caixa', path: '/financeiro/fluxo-caixa', fase: 6 },
      { titulo: 'Calendário financeiro', path: '/financeiro/calendario', fase: 6 },
      { titulo: 'Formas de pagamento', path: '/financeiro/formas-pagamento', fase: 6, novo: 'Nova forma' },
      { titulo: 'Comissões', path: '/financeiro/comissoes', fase: 6 },
    ],
  },
  {
    modulo: 'caixa',
    titulo: 'Caixa / PDV',
    icone: Store,
    fase: 6,
    filhos: [
      { titulo: 'Venda balcão (PDV)', path: '/caixa', fase: 6 },
      { titulo: 'Recebimentos', path: '/caixa/recebimentos', fase: 6 },
      { titulo: 'Sangria e suprimento', path: '/caixa/movimentos', fase: 6 },
      { titulo: 'Histórico de sessões', path: '/caixa/sessoes', fase: 6 },
    ],
  },
  {
    modulo: 'relatorios',
    titulo: 'Relatórios',
    icone: BarChart3,
    fase: 7,
    filhos: [
      { titulo: 'Vendas', path: '/relatorios/vendas', fase: 7 },
      { titulo: 'Conversão de orçamentos', path: '/relatorios/orcamentos', fase: 7 },
      { titulo: 'Produção', path: '/relatorios/producao', fase: 7 },
      { titulo: 'Estoque', path: '/relatorios/estoque', fase: 7 },
      { titulo: 'Financeiro', path: '/relatorios/financeiro', fase: 7 },
      { titulo: 'Comissões', path: '/relatorios/comissoes', fase: 7 },
    ],
  },
  { modulo: 'whatsapp', titulo: 'WhatsApp', icone: MessageCircle, path: '/whatsapp', fase: 9 },
  {
    modulo: 'configuracoes',
    titulo: 'Configurações',
    icone: Settings,
    fase: 1,
    filhos: [
      { titulo: 'Dados da empresa', path: '/configuracoes/empresa', fase: 1 },
      { titulo: 'Usuários', path: '/configuracoes/usuarios', fase: 1, novo: 'Novo usuário', modulo: 'usuarios' },
      { titulo: 'Permissões', path: '/configuracoes/permissoes', fase: 1, modulo: 'permissoes' },
      { titulo: 'Templates de mensagens', path: '/configuracoes/templates', fase: 1, novo: 'Novo template' },
      { titulo: 'Máquinas', path: '/configuracoes/maquinas', fase: 2, novo: 'Nova máquina', modulo: 'produtos' },
      { titulo: 'Processos', path: '/configuracoes/processos', fase: 2, novo: 'Novo processo', modulo: 'produtos' },
      { titulo: 'Status do sistema', path: '/configuracoes/status', fase: 1 },
      { titulo: 'WhatsApp', path: '/configuracoes/whatsapp', fase: 9 },
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

type Pode = (modulo: Modulo) => boolean

/** Menu visível para o usuário: esconde itens sem permissão de visualizar e grupos vazios. */
export function filtrarNavegacao(pode: Pode): NavModulo[] {
  return navegacao.flatMap((m) => {
    if (!m.filhos) return pode(m.modulo) ? [m] : []
    const filhos = m.filhos.filter((f) => pode(f.modulo ?? m.modulo))
    return filhos.length ? [{ ...m, filhos }] : []
  })
}

/** Primeira tela que o usuário pode abrir (usado quando ele não tem acesso ao Dashboard). */
export function primeiraPaginaPermitida(pode: Pode): string | undefined {
  return paginas.find((p) => p.path !== '/' && pode(p.modulo))?.path
}
