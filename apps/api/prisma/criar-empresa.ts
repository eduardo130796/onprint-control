/**
 * Cria uma empresa assinante pela linha de comando (schema, migrations, dados padrão e admin).
 * Uso: npm run empresa:criar -- --nome "Gráfica X" --email admin@graficax.com.br --senha "Senha123" [--slug graficax] [--plano essencial] [--ativa] [--exemplos]
 * Sem --ativa, começa em teste grátis (dias definidos no plano).
 * O admin entra com essa senha e é obrigado a trocá-la no primeiro login.
 */
import { parseArgs } from 'node:util'
import { provisionarEmpresa } from '../src/plataforma/provisionar'
import { conexoesDosScripts, executarScript } from './scripts-banco'

const { values } = parseArgs({
  options: {
    nome: { type: 'string' },
    email: { type: 'string' },
    senha: { type: 'string' },
    slug: { type: 'string' },
    exemplos: { type: 'boolean', default: false },
    plano: { type: 'string' },
    ativa: { type: 'boolean', default: false },
  },
})

const banco = conexoesDosScripts()

executarScript(async () => {
  if (!values.nome || !values.email || !values.senha) throw new Error('Informe --nome, --email e --senha.')
  const empresa = await provisionarEmpresa(
    { plataforma: banco.plataforma, databaseUrl: banco.url, clienteDe: banco.clienteDe },
    {
      nome: values.nome,
      slug: values.slug,
      admin: { nome: 'Administrador', email: values.email, senha: values.senha, deveTrocarSenha: true },
      exemplos: values.exemplos,
      plano: values.plano,
      situacao: values.ativa ? 'ativa' : 'teste',
    },
  )
  console.log(`Empresa criada: ${empresa.nome} (/${empresa.slug}, schema ${empresa.schema}). Admin: ${values.email}`)
}, banco.fechar)
