// Utilitários dos scripts e2e: chamadas HTTP, verificação e login com troca de senha.
export const BASE = process.argv[2] ?? 'http://127.0.0.1:3334/api/v1'
let falhas = 0

export async function chamar(metodo, caminho, { token, body, form, headers: extras } = {}) {
  const headers = { ...extras }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const enviar = () => fetch(BASE + caminho, { method: metodo, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) })
  let r
  try {
    r = await enviar()
  } catch (erro) {
    // Conexão reaproveitada que a API já fechou (keep-alive vencido enquanto um comando síncrono travava o teste): tenta de novo
    if (erro?.cause?.code !== 'UND_ERR_SOCKET') throw erro
    r = await enviar()
  }
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

/**
 * Os testes de cobrança fazem as contas com estes preços (os de venda mudam no painel e na migration de lançamento):
 * fixa-os pelo painel da plataforma antes de começar. Sem anual, para os fluxos mensais de sempre.
 */
export async function fixarPrecosDeTeste(precos = { essencial: '149.00', profissional: '279.00', completo: '449.00' }) {
  const login = await chamar('POST', '/plataforma/auth/login', { body: { email: 'plataforma@onprint.local', senha: 'plataforma123' } })
  if (login.status !== 200) throw new Error(`Login da plataforma falhou: ${JSON.stringify(login.json)}`)
  const token = login.json.accessToken
  const planos = (await chamar('GET', '/plataforma/planos', { token })).json
  for (const p of planos) {
    if (!precos[p.codigo]) continue
    const r = await chamar('PUT', `/plataforma/planos/${p.id}`, { token, body: { ...p, valorMensal: precos[p.codigo] } })
    if (r.status !== 200) throw new Error(`Preço de teste do plano ${p.codigo} não foi gravado: ${JSON.stringify(r.json)}`)
  }
}

export function finalizar() {
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.')
  process.exit(falhas ? 1 : 0)
}
