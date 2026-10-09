import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { entradaEstoqueSchema, formatarMoeda, hojeISO, normalizarDecimal } from '@onprint/shared'
import { estoqueApi } from '@/api/estoque'
import { PageHeader } from '@/components/layout/PageHeader'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { NumberInput } from '@/components/shared/inputs'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { buscarFornecedoresEstoque, buscarProdutosEstoque } from '../buscas'
import { useLocaisEstoque } from '../hooks'

interface Linha {
  chave: number
  produto: OpcaoBusca | null
  quantidade: string
  custoUnitario: string
}

const numero = (v: string) => Number(normalizarDecimal(v || '0')) || 0
let proximaChave = 1
const novaLinha = (): Linha => ({ chave: proximaChave++, produto: null, quantidade: '', custoUnitario: '' })

/** Nova entrada de estoque (/estoque/entradas/novo): dados da nota e itens com quantidade e custo. */
export function NovaEntradaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const locais = useLocaisEstoque()
  const ativos = (locais.data ?? []).filter((l) => l.ativo)
  const [fornecedor, setFornecedor] = useState<OpcaoBusca | null>(null)
  const [localId, setLocalId] = useState('')
  const [notaFiscal, setNotaFiscal] = useState('')
  const [dataEntrada, setDataEntrada] = useState(hojeISO())
  const [observacoes, setObservacoes] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>(() => [novaLinha()])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const local = localId || ativos.find((l) => l.padrao)?.id || ativos[0]?.id || ''
  const total = linhas.reduce((s, l) => s + numero(l.quantidade) * numero(l.custoUnitario), 0)

  const alterar = (chave: number, dados: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...dados } : l)))

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const corpo = {
      fornecedorId: fornecedor?.id ?? '',
      localId: local,
      notaFiscal,
      dataEntrada,
      observacoes,
      itens: linhas.filter((l) => l.produto || l.quantidade || l.custoUnitario).map((l) => ({ produtoId: l.produto?.id, quantidade: l.quantidade, custoUnitario: l.custoUnitario })),
    }
    const r = entradaEstoqueSchema.safeParse(corpo)
    if (!r.success) {
      setErros(Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message])))
      toast.error('Confira os campos destacados.')
      return
    }
    setErros({})
    setSalvando(true)
    try {
      const entrada = await estoqueApi.registrarEntrada(r.data)
      toast.success(`Entrada ${entrada.numero} registrada. Estoque atualizado.`)
      await queryClient.invalidateQueries({ queryKey: ['estoque'] })
      navigate('/estoque/entradas')
    } catch (erro) {
      toast.error((erro as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={(e) => void salvar(e)} noValidate>
      <PageHeader
        titulo="Nova entrada de estoque"
        subtitulo="Registre a nota do fornecedor: o saldo e o custo médio são atualizados na hora."
        acoes={
          <>
            <Button asChild variant="outline">
              <Link to="/estoque/entradas">
                <ArrowLeft /> Entradas
              </Link>
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />} Registrar entrada
            </Button>
          </>
        }
      />
      <Card className="mb-4">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <CampoFormulario id="en-forn" rotulo="Fornecedor">
              <SearchSelect id="en-forn" chave="estoque-fornecedores" buscar={buscarFornecedoresEstoque} valor={fornecedor} onChange={setFornecedor} placeholder="Buscar fornecedor…" />
            </CampoFormulario>
          </div>
          <CampoFormulario id="en-nf" rotulo="Nota fiscal">
            <Input id="en-nf" value={notaFiscal} onChange={(e) => setNotaFiscal(e.target.value)} />
          </CampoFormulario>
          <CampoFormulario id="en-data" rotulo="Data da entrada *" erro={erros.dataEntrada}>
            <Input id="en-data" type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} />
          </CampoFormulario>
          <CampoFormulario id="en-local" rotulo="Local *" erro={erros.localId}>
            <Select id="en-local" value={local} onChange={(e) => setLocalId(e.target.value)}>
              {ativos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Select>
          </CampoFormulario>
          <div className="md:col-span-3">
            <CampoFormulario id="en-obs" rotulo="Observações">
              <Textarea id="en-obs" rows={1} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </CampoFormulario>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Itens</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setLinhas((ls) => [...ls, novaLinha()])}>
            <Plus /> Adicionar item
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {erros.itens && <p className="text-sm text-coral-escuro">{erros.itens}</p>}
          {linhas.map((l, i) => (
            <div key={l.chave} className="grid items-start gap-2 rounded-xl border border-border p-3 md:grid-cols-[1fr_140px_160px_120px_40px]">
              <CampoFormulario id={`it-${l.chave}-produto`} rotulo="Produto" erro={erros[`itens.${i}.produtoId`] ? 'Escolha o produto.' : undefined}>
                <SearchSelect id={`it-${l.chave}-produto`} chave="estoque-produtos-busca" buscar={buscarProdutosEstoque} valor={l.produto} onChange={(p) => alterar(l.chave, { produto: p })} placeholder="Insumo ou produto…" invalido={Boolean(erros[`itens.${i}.produtoId`])} />
              </CampoFormulario>
              <CampoFormulario id={`it-${l.chave}-qtd`} rotulo="Quantidade" erro={erros[`itens.${i}.quantidade`]}>
                <NumberInput id={`it-${l.chave}-qtd`} casas={3} value={l.quantidade} onChange={(e) => alterar(l.chave, { quantidade: e.target.value })} />
              </CampoFormulario>
              <CampoFormulario id={`it-${l.chave}-custo`} rotulo="Custo unitário (R$)" erro={erros[`itens.${i}.custoUnitario`]}>
                <NumberInput id={`it-${l.chave}-custo`} casas={4} value={l.custoUnitario} onChange={(e) => alterar(l.chave, { custoUnitario: e.target.value })} />
              </CampoFormulario>
              <div className="space-y-2">
                <p className="text-sm font-medium">Total</p>
                <p className="flex h-10 items-center justify-end font-medium">{formatarMoeda(numero(l.quantidade) * numero(l.custoUnitario))}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-7 text-coral-escuro hover:text-coral-escuro"
                aria-label="Remover item"
                disabled={linhas.length === 1}
                onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <p className="text-right text-lg font-semibold text-tinta">Total da entrada: {formatarMoeda(total)}</p>
        </CardContent>
      </Card>
    </form>
  )
}
