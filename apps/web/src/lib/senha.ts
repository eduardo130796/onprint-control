/** Sugere uma senha provisória fácil de ditar (o usuário troca no primeiro acesso). */
export function sugerirSenha(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz'
  const aleatorio = crypto.getRandomValues(new Uint32Array(5))
  const parte = Array.from(aleatorio.slice(0, 4), (n) => letras[n % letras.length]).join('')
  return `${parte}${((aleatorio[4] ?? 0) % 9000) + 1000}`
}
