import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { permissoesPadrao } from '../prisma/seed/permissoes-padrao'
import { formatarNumero } from '../src/core/numeracao'
import { filtroAtivo, paginacao } from '../src/core/paginacao'
import { DiscoLocalStorage, nomeSeguro } from '../src/core/storage/disco-local'

describe('paginacao', () => {
  it('calcula skip/take e aceita só campos permitidos', () => {
    const r = paginacao({ page: 3, pageSize: 20, sort: 'nome:desc' }, ['nome'] as const, { campo: 'nome', direcao: 'asc' })
    expect(r).toEqual({ skip: 40, take: 20, orderBy: { nome: 'desc' } })
    const invalido = paginacao({ page: 1, pageSize: 10, sort: 'senhaHash:asc' }, ['nome'] as const, { campo: 'nome', direcao: 'asc' })
    expect(invalido.orderBy).toEqual({ nome: 'asc' })
  })

  it('filtro ativo', () => {
    expect(filtroAtivo('todos')).toEqual({})
    expect(filtroAtivo('false')).toEqual({ ativo: false })
  })
})

describe('numeração', () => {
  it('formata com prefixo, ano e 4 dígitos', () => {
    expect(formatarNumero('ORC', 2026, 1)).toBe('ORC-2026-0001')
    expect(formatarNumero('PED', 2026, 12345)).toBe('PED-2026-12345')
  })
})

describe('permissões padrão', () => {
  it('gerente tem tudo, menos usuários e permissões', () => {
    const gerente = permissoesPadrao('gerente')
    expect(gerente).toContain('configuracoes:editar')
    expect(gerente.some((p) => p.startsWith('usuarios:') || p.startsWith('permissoes:'))).toBe(false)
  })

  it('vendedor não acessa configurações nem vê pedidos de todos', () => {
    const vendedor = permissoesPadrao('vendedor')
    expect(vendedor.some((p) => p.startsWith('configuracoes:'))).toBe(false)
    expect(vendedor).not.toContain('pedidos:ver_todos')
    expect(vendedor).toContain('clientes:criar')
  })

  // Matriz da seção 7: módulos que cada papel acessa (qualquer ação) e ações que NÃO pode ter
  const modulos = (papel: Parameters<typeof permissoesPadrao>[0]) => [...new Set(permissoesPadrao(papel).map((p) => p.split(':')[0]))].sort()
  it.each([
    ['vendedor', ['clientes', 'dashboard', 'orcamentos', 'pedidos', 'producao', 'vitrine', 'whatsapp'], ['producao:editar', 'financeiro:visualizar', 'orcamentos:ver_todos', 'vitrine:editar']],
    ['designer', ['artes', 'dashboard', 'pedidos', 'producao'], ['pedidos:editar', 'producao:editar', 'clientes:visualizar']],
    ['producao', ['dashboard', 'estoque', 'pcp', 'pedidos', 'producao', 'produtos'], ['pedidos:editar', 'estoque:aprovar', 'financeiro:visualizar', 'producao:aprovar']],
    ['financeiro', ['caixa', 'clientes', 'dashboard', 'financeiro', 'fornecedores', 'relatorios'], ['clientes:editar', 'pedidos:visualizar', 'usuarios:visualizar']],
    ['caixa', ['caixa', 'clientes'], ['clientes:editar', 'caixa:aprovar', 'financeiro:visualizar', 'dashboard:visualizar']],
  ] as const)('%s acessa só os módulos da matriz', (papel, esperados, proibidas) => {
    expect(modulos(papel)).toEqual(esperados)
    for (const p of proibidas) expect(permissoesPadrao(papel)).not.toContain(p)
  })

  it('só o admin gerencia usuários e permissões', () => {
    for (const papel of ['gerente', 'vendedor', 'designer', 'producao', 'financeiro', 'caixa'] as const) {
      expect(permissoesPadrao(papel).some((p) => p.startsWith('usuarios:') || p.startsWith('permissoes:'))).toBe(false)
    }
    expect(permissoesPadrao('admin')).toContain('permissoes:editar')
  })
})

describe('DiscoLocalStorage', () => {
  let raiz: string
  let storage: DiscoLocalStorage

  beforeAll(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'onprint-'))
    storage = new DiscoLocalStorage(raiz, 'segredo', '/api/v1')
  })
  afterAll(() => rm(raiz, { recursive: true, force: true }))

  it('gera nomes seguros', () => {
    expect(nomeSeguro('Arte Final – Fachada (v2).pdf')).toBe('Arte-Final-Fachada-v2-.pdf')
    expect(nomeSeguro('../../etc/passwd')).toBe('etc-passwd')
  })

  it('salva, lê e remove', async () => {
    const salvo = await storage.salvar(Readable.from(['olá']), { categoria: 'anexo', nomeOriginal: 'teste.txt' })
    expect(salvo.caminho).toMatch(/^anexo\/\d{4}\/\d{2}\/[0-9a-f-]{36}-teste\.txt$/)
    expect(salvo.tamanho).toBe(4)
    const partes: Buffer[] = []
    for await (const parte of storage.abrir(salvo.caminho)) partes.push(parte as Buffer)
    expect(Buffer.concat(partes).toString()).toBe('olá')
    await storage.remover(salvo.caminho)
  })

  it('bloqueia path traversal', () => {
    expect(() => storage.abrir('../fora.txt')).toThrow()
  })

  it('assina e valida URL temporária', () => {
    const url = storage.gerarUrlTemporaria('abc', 60)
    const token = url.split('/').pop() as string
    expect(storage.validarTokenTemporario(token)).toBe('abc')
    expect(storage.validarTokenTemporario(token.replace('abc', 'xyz'))).toBeNull()
    const expirada = storage.gerarUrlTemporaria('abc', -1).split('/').pop() as string
    expect(storage.validarTokenTemporario(expirada)).toBeNull()
  })
})
