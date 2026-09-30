import { ACOES, MODULOS, type Acao, type CodigoPapel, type Modulo } from '@onprint/shared'

type Matriz = Partial<Record<Modulo, readonly Acao[]>>

const LEITURA = ['visualizar'] as const
const CRUD = ['visualizar', 'criar', 'editar', 'excluir'] as const
const TODAS = ACOES

/** Matriz padrão (seção 7). Aplicada só quando o papel ainda não tem permissões. */
const MATRIZ: Record<Exclude<CodigoPapel, 'admin' | 'gerente'>, Matriz> = {
  vendedor: {
    dashboard: LEITURA,
    clientes: ['visualizar', 'criar', 'editar'],
    orcamentos: ['visualizar', 'criar', 'editar', 'exportar'],
    pedidos: ['visualizar', 'criar', 'editar'],
    producao: LEITURA,
    whatsapp: LEITURA,
  },
  designer: {
    dashboard: LEITURA,
    pedidos: ['visualizar', 'ver_todos'],
    artes: ['visualizar', 'criar', 'editar', 'ver_todos'],
    producao: LEITURA,
  },
  producao: {
    dashboard: LEITURA,
    producao: ['visualizar', 'criar', 'editar', 'ver_todos'],
    pcp: ['visualizar', 'editar'],
    estoque: ['visualizar', 'criar', 'editar'],
    pedidos: ['visualizar', 'ver_todos'],
    produtos: LEITURA,
  },
  financeiro: {
    dashboard: LEITURA,
    financeiro: TODAS,
    caixa: TODAS,
    relatorios: ['visualizar', 'exportar'],
    clientes: LEITURA,
    fornecedores: CRUD,
  },
  // A grade do PDV vem de /caixa/produtos: o caixa não precisa do módulo Produtos
  caixa: {
    caixa: ['visualizar', 'criar', 'editar'],
    clientes: ['visualizar', 'criar'],
  },
}

/** Retorna a lista "modulo:acao" padrão de um papel. */
export function permissoesPadrao(papel: CodigoPapel): string[] {
  if (papel === 'admin') return MODULOS.flatMap((m) => ACOES.map((a) => `${m}:${a}`))
  if (papel === 'gerente') {
    return MODULOS.filter((m) => m !== 'usuarios' && m !== 'permissoes').flatMap((m) =>
      ACOES.map((a) => `${m}:${a}`),
    )
  }
  const matriz = MATRIZ[papel]
  return Object.entries(matriz).flatMap(([modulo, acoes]) => acoes.map((a) => `${modulo}:${a}`))
}
