/**
 * Cria um administrador do painel da plataforma, ou troca a senha (e reativa) de um que já existe.
 * Uso: npm run admin-plataforma -w @onprint/api -- --email voce@empresa.com.br --senha "SenhaForte123" [--nome "Seu nome"]
 *      npm run admin-plataforma -w @onprint/api -- --email voce@empresa.com.br --desativar
 */
import { parseArgs } from 'node:util'
import argon2 from 'argon2'
import { SENHA_MIN } from '@onprint/shared'
import { conexoesDosScripts, executarScript } from './scripts-banco'

const { values: v } = parseArgs({ options: { email: { type: 'string' }, senha: { type: 'string' }, nome: { type: 'string' }, desativar: { type: 'boolean', default: false } } })
const banco = conexoesDosScripts()

executarScript(async () => {
  const email = v.email?.trim().toLowerCase()
  if (!email) throw new Error('Informe --email.')
  if (v.desativar) {
    await banco.plataforma.adminPlataforma.update({ where: { email }, data: { ativo: false } })
    return console.log(`Administrador ${email} desativado.`)
  }
  if (!v.senha || v.senha.length < SENHA_MIN) throw new Error(`Informe --senha com pelo menos ${SENHA_MIN} caracteres.`)
  const senhaHash = await argon2.hash(v.senha)
  const existente = await banco.plataforma.adminPlataforma.findUnique({ where: { email } })
  await banco.plataforma.adminPlataforma.upsert({
    where: { email },
    create: { email, nome: v.nome ?? 'Administrador da plataforma', senhaHash },
    update: { senhaHash, ativo: true, ...(v.nome ? { nome: v.nome } : {}) },
  })
  console.log(existente ? `Senha de ${email} trocada (e acesso reativado).` : `Administrador ${email} criado.`)
}, banco.fechar)
