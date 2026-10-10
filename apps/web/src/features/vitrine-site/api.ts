import type { Paginado, PedidoVitrineEnviado, PedidoVitrineInput, ProdutoCardVitrine, ProdutoVitrine, VitrinePublica } from '@onprint/shared'

/** Cliente da API pública da vitrine (sem login): /api/v1/publico/{slug}/vitrine/… */

export class ErroVitrine extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ErroVitrine'
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  } catch {
    throw new ErroVitrine(0, 'Sem conexão. Confira sua internet e tente de novo.')
  }
  if (!resposta.ok) {
    let mensagem = resposta.status === 429 ? 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.' : 'Não foi possível carregar agora. Tente de novo.'
    try {
      const corpo = (await resposta.json()) as { error?: { message?: string } }
      if (corpo.error?.message) mensagem = corpo.error.message
    } catch {
      // corpo sem JSON: fica a mensagem padrão
    }
    throw new ErroVitrine(resposta.status, mensagem)
  }
  return (await resposta.json()) as T
}

export interface FiltroProdutos {
  busca?: string
  categoriaId?: string
  page?: number
  pageSize?: number
}

export function criarVitrineApi(slug: string) {
  const base = `/api/v1/publico/${encodeURIComponent(slug)}/vitrine`
  return {
    inicio: () => pedir<VitrinePublica>(base),
    produtos: (filtro: FiltroProdutos) => {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(filtro)) if (v !== undefined && v !== '') qs.set(k, String(v))
      const sufixo = qs.toString()
      return pedir<Paginado<ProdutoCardVitrine>>(`${base}/produtos${sufixo ? `?${sufixo}` : ''}`)
    },
    produto: (produtoSlug: string) => pedir<ProdutoVitrine>(`${base}/produtos/${encodeURIComponent(produtoSlug)}`),
    enviarPedido: (dados: PedidoVitrineInput) =>
      pedir<PedidoVitrineEnviado>(`${base}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      }),
  }
}

export type VitrineApi = ReturnType<typeof criarVitrineApi>

/** 404 da vitrine = módulo fora do plano, site desativado ou empresa bloqueada */
export const naoEncontrado = (erro: unknown) => erro instanceof ErroVitrine && erro.status === 404
