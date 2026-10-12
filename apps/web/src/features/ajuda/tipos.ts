/**
 * Central de ajuda: tutoriais passo a passo (com imagens e vídeo) de cada tarefa do sistema.
 * O conteúdo fica em `conteudo/`; as imagens e os vídeos são gerados por `scripts/tutoriais/` na empresa de
 * demonstração e ficam em `public/ajuda/{slug}/`. Abre em grafygo.com.br/ajuda e dentro do sistema (/ajuda e "?").
 */

export const CATEGORIAS_AJUDA = {
  comecar: { titulo: 'Primeiros passos', descricao: 'Deixe o sistema com a cara da sua gráfica.' },
  vendas: { titulo: 'Orçamentos e pedidos', descricao: 'Do orçamento em segundos ao pedido aprovado.' },
  producao: { titulo: 'Produção', descricao: 'Ordens, etapas e entregas.' },
  financeiro: { titulo: 'Financeiro e caixa', descricao: 'Receber, pagar e vender no balcão.' },
  vitrine: { titulo: 'Vitrine e WhatsApp', descricao: 'Seu site de produtos e a divulgação.' },
  conta: { titulo: 'Sua conta', descricao: 'Plano, pagamento e equipe.' },
} as const

export type CategoriaAjuda = keyof typeof CATEGORIAS_AJUDA

export interface PassoTutorial {
  titulo: string
  texto: string
  /** Captura do passo: /ajuda/{slug}/{n}.webp (gerada pelo script do tutorial) */
  imagem?: string
  /** Observação curta (atalho, cuidado, dica de quem já usa) */
  dica?: string
}

export interface Tutorial {
  slug: string
  titulo: string
  /** Uma frase: o que a pessoa vai conseguir fazer */
  resumo: string
  categoria: CategoriaAjuda
  /** Tempo para fazer (não para ler) */
  minutos: number
  /** Rotas do sistema onde o botão "?" abre este tutorial (prefixos, ex.: "/orcamentos") */
  telas: string[]
  /** Vídeo gravado na empresa de demonstração (mp4) e a capa */
  video?: { arquivo: string; capa: string; segundos: number }
  /** Versão narrada no YouTube (quando existir, aparece no lugar do vídeo gravado). Só o id do vídeo. */
  youtube?: string
  passos: PassoTutorial[]
  /** Outros tutoriais para seguir depois (slugs) */
  proximos?: string[]
}
