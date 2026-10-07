import { AsyncLocalStorage } from 'node:async_hooks'

/** Empresa assinante em uso: define o schema do banco e a pasta de arquivos. */
export interface EmpresaAtual {
  id: string
  nome: string
  slug: string
  schema: string
}

interface Armazenamento {
  empresa?: EmpresaAtual
}

const als = new AsyncLocalStorage<Armazenamento>()

/**
 * Contexto da empresa por requisição (ou por tarefa agendada). Os services usam `app.prisma`
 * normalmente; o cliente certo (schema da empresa) é escolhido a partir deste contexto.
 */
export const contextoEmpresa = {
  /** Abre um contexto vazio, preenchido depois pela autenticação (hook onRequest). */
  iniciar<T>(fn: () => T): T {
    return als.run({}, fn)
  },
  /** Executa `fn` já dentro da empresa (tarefas agendadas, login, rotas públicas). */
  com<T>(empresa: EmpresaAtual, fn: () => T): T {
    return als.run({ empresa }, fn)
  },
  /** Define a empresa no contexto já aberto pela requisição. */
  definir(empresa: EmpresaAtual) {
    const store = als.getStore()
    if (!store) throw new Error('Contexto de empresa não iniciado para esta requisição.')
    store.empresa = empresa
  },
  atual(): EmpresaAtual | undefined {
    return als.getStore()?.empresa
  },
  exigir(): EmpresaAtual {
    const empresa = als.getStore()?.empresa
    if (!empresa) throw new Error('Nenhuma empresa no contexto: a rota precisa de autenticação ou de contextoEmpresa.com().')
    return empresa
  },
}
