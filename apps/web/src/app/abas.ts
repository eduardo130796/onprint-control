/** Abas das telas irmãs de Pedidos e Produção (usadas com <AbasNavegacao>). */
export const ABAS_PEDIDOS = [
  { para: '/pedidos', titulo: 'Lista', fim: true },
  { para: '/pedidos/kanban', titulo: 'Kanban' },
  { para: '/pedidos/entregas', titulo: 'Entregas' },
]

export const ABAS_PRODUCAO = [
  { para: '/producao', titulo: 'Kanban', fim: true },
  { para: '/producao/ordens', titulo: 'Ordens de produção' },
]

export const ABAS_ESTOQUE = [
  { para: '/estoque', titulo: 'Estoque atual', fim: true },
  { para: '/estoque/entradas', titulo: 'Entradas' },
  { para: '/estoque/movimentacoes', titulo: 'Movimentações' },
  { para: '/estoque/alertas', titulo: 'Alertas' },
]
