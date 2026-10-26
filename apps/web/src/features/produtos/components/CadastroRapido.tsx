import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { TIPOS_COBRANCA, TIPO_COBRANCA_ROTULOS, normalizarDecimal, type Acabamento, type TipoCobranca } from '@onprint/shared'
import { insumosApi } from '@/api/custos'
import { acabamentosApi, categoriasApi } from '@/api/produtos'
import { MoneyInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { decimalParaInput } from '@/lib/mascaras'
import { useUnidades } from '../hooks'

/*
 * Cadastro rápido, sem sair da tela: insumo, acabamento ou categoria que falta é criado ali mesmo, com 2 ou 3 campos
 * (o resto se completa depois no cadastro dele). Usa as mesmas rotas do cadastro completo (permissões e auditoria).
 * Nada é criado sem o toque em "Cadastrar".
 */

/** Unidades de uso mais comuns de um insumo (as outras ficam no cadastro completo) */
const UNIDADES_INSUMO = ['m²', 'm', 'un', 'fl', 'l', 'ml', 'kg']

const valorDoCampo = (v: string) => (v.trim() ? normalizarDecimal(v) : '')

interface CaixaProps {
  titulo: string
  ocupado: boolean
  onCancelar: () => void
  onConfirmar: () => void
  children: React.ReactNode
}

/** A moldura dos mini formulários (empilha no celular; Enter cadastra) */
function Caixa({ titulo, ocupado, onCancelar, onConfirmar, children }: CaixaProps) {
  return (
    <div
      className="space-y-2 rounded-xl border border-marca/40 bg-marca-suave/40 p-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault()
          onConfirmar()
        }
        if (e.key === 'Escape') onCancelar()
      }}
    >
      <p className="text-sm font-semibold text-tinta">{titulo}</p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">{children}</div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar} disabled={ocupado}>
          <X /> Cancelar
        </Button>
        <Button type="button" size="sm" onClick={onConfirmar} disabled={ocupado}>
          {ocupado ? <Loader2 className="animate-spin" /> : <Check />} Cadastrar
        </Button>
      </div>
    </div>
  )
}

export interface InsumoCriado {
  id: string
  nome: string
  unidade: string
  custo: string
}

/** "Lona 440 g: não está no cadastro · Cadastrar agora": nome, unidade de uso e custo por unidade */
export function NovoInsumoRapido({ nome: nomeInicial, unidade: unidadeInicial, custo: custoInicial, onCriado, onCancelar }: { nome: string; unidade?: string | null; custo?: string | null; onCriado: (i: InsumoCriado) => void; onCancelar: () => void }) {
  const queryClient = useQueryClient()
  const unidades = useUnidades()
  const [nome, setNome] = useState(nomeInicial)
  const [sigla, setSigla] = useState(unidadeInicial && UNIDADES_INSUMO.includes(unidadeInicial) ? unidadeInicial : 'un')
  const [custo, setCusto] = useState(custoInicial ? decimalParaInput(custoInicial) : '')
  const [ocupado, setOcupado] = useState(false)
  const opcoes = (unidades.data ?? []).filter((u) => UNIDADES_INSUMO.includes(u.sigla))

  async function cadastrar() {
    const unidade = opcoes.find((u) => u.sigla === sigla)
    if (nome.trim().length < 2) return toast.error('Informe o nome do insumo.')
    if (!unidade) return toast.error('Escolha a unidade.')
    setOcupado(true)
    try {
      // Comprado por unidade de uso: o custo digitado é o custo de cada m², metro, folha… (a embalagem fica para depois)
      const i = await insumosApi.criar({ nome: nome.trim(), unidadeMedidaId: unidade.id, embalagem: 'unidade', precoEmbalagem: valorDoCampo(custo) || null, controlaEstoque: false })
      await queryClient.invalidateQueries({ queryKey: ['insumos'] })
      await queryClient.invalidateQueries({ queryKey: ['composicao-insumos'] })
      toast.success(`Insumo “${i.nome}” cadastrado.`)
      onCriado({ id: i.id, nome: i.nome, unidade: unidade.sigla, custo: i.custo ?? '0' })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Caixa titulo="Cadastrar insumo" ocupado={ocupado} onCancelar={onCancelar} onConfirmar={() => void cadastrar()}>
      <Input aria-label="Nome do insumo" value={nome} autoFocus maxLength={160} onChange={(e) => setNome(e.target.value)} />
      <Select aria-label="Unidade de uso" value={sigla} onChange={(e) => setSigla(e.target.value)}>
        {opcoes.map((u) => (
          <option key={u.id} value={u.sigla}>
            por {u.sigla}
          </option>
        ))}
      </Select>
      <MoneyInput aria-label="Custo por unidade (opcional)" placeholder="custo" value={custo} onChange={(e) => setCusto(e.target.value)} />
    </Caixa>
  )
}

/** Acabamento que falta: nome, como cobra e o valor (o resto, como prazo e materiais, no cadastro dele) */
export function NovoAcabamentoRapido({
  nome: nomeInicial,
  tipoCobranca,
  valor: valorInicial,
  onCriado,
  onCancelar,
}: {
  nome: string
  tipoCobranca?: TipoCobranca
  valor?: string | null
  onCriado: (a: Acabamento) => void
  onCancelar: () => void
}) {
  const queryClient = useQueryClient()
  const [nome, setNome] = useState(nomeInicial)
  const [tipo, setTipo] = useState<TipoCobranca>(tipoCobranca ?? 'fixo')
  const [valor, setValor] = useState(valorInicial ? decimalParaInput(valorInicial) : '')
  const [ocupado, setOcupado] = useState(false)

  async function cadastrar() {
    if (nome.trim().length < 2) return toast.error('Informe o nome do acabamento.')
    if (!valorDoCampo(valor) || Number(valorDoCampo(valor)) <= 0) return toast.error('Informe quanto você cobra pelo acabamento.')
    setOcupado(true)
    try {
      const a = await acabamentosApi.criar({ nome: nome.trim(), tipoCobranca: tipo, valor: valorDoCampo(valor) })
      await queryClient.invalidateQueries({ queryKey: ['acabamentos'] })
      toast.success(`Acabamento “${a.nome}” cadastrado.`)
      onCriado(a)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Caixa titulo="Cadastrar acabamento" ocupado={ocupado} onCancelar={onCancelar} onConfirmar={() => void cadastrar()}>
      <Input aria-label="Nome do acabamento" value={nome} autoFocus maxLength={160} onChange={(e) => setNome(e.target.value)} />
      <Select aria-label="Como cobra" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCobranca)}>
        {TIPOS_COBRANCA.map((t) => (
          <option key={t} value={t}>
            {TIPO_COBRANCA_ROTULOS[t]}
          </option>
        ))}
      </Select>
      <MoneyInput aria-label="Valor cobrado" value={valor} onChange={(e) => setValor(e.target.value)} />
    </Caixa>
  )
}

/** Categoria nova (só o nome) */
export function NovaCategoriaRapida({ nome: nomeInicial = '', onCriada, onCancelar }: { nome?: string; onCriada: (c: { id: string; nome: string }) => void; onCancelar: () => void }) {
  const queryClient = useQueryClient()
  const [nome, setNome] = useState(nomeInicial)
  const [ocupado, setOcupado] = useState(false)

  async function cadastrar() {
    if (nome.trim().length < 2) return toast.error('Informe o nome da categoria.')
    setOcupado(true)
    try {
      const c = await categoriasApi.criar({ nome: nome.trim() })
      await queryClient.invalidateQueries({ queryKey: ['categorias'] })
      toast.success(`Categoria “${c.nome}” criada.`)
      onCriada({ id: c.id, nome: c.nome })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div
      className="flex gap-2"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void cadastrar()
        }
        if (e.key === 'Escape') onCancelar()
      }}
    >
      <Input aria-label="Nome da categoria nova" placeholder="Nome da categoria" value={nome} autoFocus maxLength={160} onChange={(e) => setNome(e.target.value)} />
      <Button type="button" size="icon" aria-label="Criar categoria" onClick={() => void cadastrar()} disabled={ocupado}>
        {ocupado ? <Loader2 className="animate-spin" /> : <Check />}
      </Button>
      <Button type="button" size="icon" variant="ghost" aria-label="Cancelar" onClick={onCancelar} disabled={ocupado}>
        <X />
      </Button>
    </div>
  )
}
