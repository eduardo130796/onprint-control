// Utilitários dos scripts e2e: chamadas HTTP, verificação e login com troca de senha.
export const BASE = process.argv[2] ?? 'http://127.0.0.1:3334/api/v1'
let falhas = 0

export async function chamar(metodo, caminho, { token, body, form } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const r = await fetch(BASE + caminho, { method: metodo, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) })
  const texto = await r.text()
  let json = null
  try {
    json = texto ? JSON.parse(texto) : null
  } catch {
    json = texto
  }
  return { status: r.status, json }
}

export function conferir(descricao, obtido, esperado) {
  const ok = Array.isArray(esperado) ? esperado.includes(obtido) : obtido === esperado
  if (!ok) falhas++
  console.log(`${ok ? '✔' : '✘'} ${descricao.padEnd(62)} ${obtido}${ok ? '' : `  (esperado ${esperado})`}`)
}

export async function entrar(email, senha, novaSenha) {
  let r = await chamar('POST', '/auth/login', { body: { email, senha } })
  if (r.status !== 200) throw new Error(`Login falhou para ${email}: ${JSON.stringify(r.json)}`)
  if (!r.json.usuario.deveTrocarSenha) return r.json.accessToken
  r = await chamar('POST', '/auth/trocar-senha', { token: r.json.accessToken, body: { senhaAtual: senha, novaSenha } })
  return r.json.accessToken
}

export function finalizar() {
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.')
  process.exit(falhas ? 1 : 0)
}
