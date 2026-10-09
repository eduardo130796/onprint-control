/**
 * Contador em memória por chave (ex.: e-mail) numa janela de tempo. Protege uma conta contra
 * adivinhação de senha vinda de vários IPs, o que o limite por IP sozinho não pega.
 * Fica na memória do processo: a API roda numa instância só (ver DEPLOY_VPS).
 */
export function criarContadorTentativas(opcoes: { max: number; janelaMs: number; maxChaves?: number }) {
  const { max, janelaMs, maxChaves = 10_000 } = opcoes
  const registros = new Map<string, { total: number; inicio: number }>()

  function atual(chave: string, agora: number) {
    const r = registros.get(chave)
    if (r && agora - r.inicio < janelaMs) return r
    if (r) registros.delete(chave)
    return undefined
  }

  return {
    /** true quando a chave já usou todas as tentativas da janela. */
    bloqueado(chave: string, agora = Date.now()) {
      return (atual(chave, agora)?.total ?? 0) >= max
    },
    /** Conta mais uma tentativa (falha de login, pedido de link…). */
    registrar(chave: string, agora = Date.now()) {
      const r = atual(chave, agora)
      if (r) {
        r.total++
        // Chegou ao limite: a trava conta a partir daqui (janela inteira)
        if (r.total >= max) r.inicio = agora
      } else {
        registros.set(chave, { total: 1, inicio: agora })
        // Teto de memória: descarta a chave mais antiga
        if (registros.size > maxChaves) registros.delete(registros.keys().next().value as string)
      }
    },
    /** Zera a chave (login certo). */
    limpar(chave: string) {
      registros.delete(chave)
    },
  }
}

export type ContadorTentativas = ReturnType<typeof criarContadorTentativas>

/** Login: 10 senhas erradas em 15 min travam o e-mail por 15 min, venham de qualquer IP. */
export const LOGIN_MAX_FALHAS = 10
export const LOGIN_JANELA_MS = 15 * 60_000
export const MSG_LOGIN_TRAVADO = 'Muitas tentativas de login com este e-mail. Aguarde 15 minutos e tente de novo.'
