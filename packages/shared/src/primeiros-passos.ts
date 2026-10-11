/** "Primeiros passos" (painel de quem acabou de criar a conta): o progresso é medido nos dados da gráfica */
export interface PassoInicial {
  id: string
  titulo: string
  descricao: string
  /** Tela onde se faz o passo */
  link: string
  /** Tutorial da central de ajuda (slug) */
  ajuda: string
  feito: boolean
}

export interface PrimeirosPassos {
  passos: PassoInicial[]
  concluidos: number
  total: number
}
