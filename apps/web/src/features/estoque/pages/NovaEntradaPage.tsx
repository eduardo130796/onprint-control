import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { TIPO_EMBALAGEM_ROTULOS, entradaEstoqueSchema, formatarMoeda, hojeISO, normalizarDecimal } from '@onprint/shared'
import { estoqueApi } from '@/api/estoque'
import { PageHeader } from '@/components/layout/PageHeader'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { formatarCusto } from '@/features/produtos/custos'
import { decimalParaInput } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { buscarFornecedoresEstoque, buscarProdutosEstoque } from '../buscas'
import { buscarEmbalagem, valoresDaLinha, type Embalagem } from '../embalagem'
import { useLocaisEstoque } from '../hooks'

interface Linha {
  chave: number
  produto: OpcaoBusca | null
  quantidade: string
  custoUnitario: string
  /** Insumo comprado em embalagem (rolo, pacote…): permite lançar em embalagens */
  embalagem: Embalagem | null
  /** Lançar em embalagens ("2 rolos") em vez da unidade de uso */
  porEmbalagem: boolean
  embalagens: string
  precoEmbalagem: string
}

const PLURAL: Record<string, string> = { rolo: 'rolos', chapa: 'chapas', pacote: 'pacotes', caixa: 'caixas', galao: 'galões/frascos', unidade: 'unidades' }
const numero = (v: string) => Number(normalizarDecimal(v || '0')) || 0
let proximaChave = 1
const novaLinha = (): Linha => ({ chave: proximaChave++, produto: null, quantidade: '', custoUnitario: '', embalagem: null, porEmbalagem: false, embalagens: '', precoEmbalagem: '' })

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
  const totalLinha = (l: Linha) => {
    const v = valoresDaLinha(l)
    return numero(v.quantidade) * numero(v.custoUnitario)
  }
  const total = linhas.reduce((s, l) => s + totalLinha(l), 0)

  const alterar = (chave: number, dados: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...dados } : l)))

  /** Ao escolher o item: se for insumo comprado em embalagem, já oferece o lançamento em embalagens. */
  async function escolherProduto(chave: number, produto: OpcaoBusca | null) {
    alterar(chave, { produto, embalagem: null, porEmbalagem: false })
    if (!produto) return
    const emb = (await buscarEmbalagem(produto.id))?.embalagem
    if (emb) alterar(chave, { embalagem: emb, porEmbalagem: true, precoEmbalagem: emb.precoEmbalagem ? decimalParaInput(emb.precoEmbalagem) : '' })
  }

  // Atalho da tela do insumo: /estoque/entradas/novo?produto=<id>
  const [params] = useSearchParams()
  const produtoInicial = params.get('produto')
  useEffect(() => {
    if (!produtoInicial) return
    let ativo = true
    void buscarEmbalagem(produtoInicial).then((r) => {
      if (!ativo || !r) return
      const emb = r.embalagem
      setLinhas([
        {
          ...novaLinha(),
          produto: { id: r.insumo.id, rotulo: r.insumo.nome, detalhe: r.insumo.codigo },
          embalagem: emb,
          porEmbalagem: Boolean(emb),
          precoEmbalagem: emb?.precoEmbalagem ? decimalParaInput(emb.precoEmbalagem) : '',
        },
      ])
      const preferido = r.insumo.fornecedorPreferido
      if (preferido) setFornecedor((f) => f ?? { id: preferido.id, rotulo: preferido.nome })
    })
    return () => {
      ativo = false
    }
  }, [produtoInicial])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const corpo = {
      fornecedorId: fornecedor?.id ?? '',
      localId: local,
      notaFiscal,
      dataEntrada,
      observacoes,
      // Em embalagens: converte para a unidade de uso (a API recebe sempre a unidade de uso)
      itens: linhas
        .map((l) => ({ l, v: valoresDaLinha(l) }))
        .filter(({ l, v }) => l.produto || v.quantidade || v.custoUnitario)
        .map(({ l, v }) => ({ produtoId: l.produto?.id, quantidade: v.quantidade, custoUnitario: v.custoUnitario })),
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
      // O custo dos insumos muda com a compra (e o dos produtos que os usam)
      await Promise.all(['estoque', 'insumos', 'produtos'].map((c) => queryClient.invalidateQueries({ queryKey: [c] })))
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
          {linhas.map((l, i) => {
            const emb = l.embalagem
            const v = valoresDaLinha(l)
            const nomeEmb = emb ? TIPO_EMBALAGEM_ROTULOS[emb.tipo].toLowerCase() : ''
            return (
              <div key={l.chave} className="space-y-3 rounded-xl border border-border p-3">
                <div className="grid items-start gap-2 md:grid-cols-[1fr_140px_160px_120px_40px]">
                  <CampoFormulario id={`it-${l.chave}-produto`} rotulo="Produto" erro={erros[`itens.${i}.produtoId`] ? 'Escolha o produto.' : undefined}>
                    <SearchSelect id={`it-${l.chave}-produto`} chave="estoque-produtos-busca" buscar={buscarProdutosEstoque} valor={l.produto} onChange={(p) => void escolherProduto(l.chave, p)} placeholder="Insumo ou produto…" invalido={Boolean(erros[`itens.${i}.produtoId`])} />
                  </CampoFormulario>
                  {l.porEmbalagem && emb ? (
                    <>
                      <CampoFormulario id={`it-${l.chave}-emb`} rotulo={`Quantidade (${nomeEmb})`} erro={erros[`itens.${i}.quantidade`]}>
                        <NumberInput id={`it-${l.chave}-emb`} casas={3} value={l.embalagens} onChange={(e) => alterar(l.chave, { embalagens: e.target.value })} />
                      </CampoFormulario>
                      <CampoFormulario id={`it-${l.chave}-pemb`} rotulo={`Preço por ${nomeEmb}`} erro={erros[`itens.${i}.custoUnitario`]}>
                        <MoneyInput id={`it-${l.chave}-pemb`} value={l.precoEmbalagem} onChange={(e) => alterar(l.chave, { precoEmbalagem: e.target.value })} />
                      </CampoFormulario>
                    </>
                  ) : (
                    <>
                      <CampoFormulario id={`it-${l.chave}-qtd`} rotulo={emb ? `Quantidade (${emb.sigla})` : 'Quantidade'} erro={erros[`itens.${i}.quantidade`]}>
                        <NumberInput id={`it-${l.chave}-qtd`} casas={3} value={l.quantidade} onChange={(e) => alterar(l.chave, { quantidade: e.target.value })} />
                      </CampoFormulario>
                      <CampoFormulario id={`it-${l.chave}-custo`} rotulo="Custo unitário (R$)" erro={erros[`itens.${i}.custoUnitario`]}>
                        <NumberInput id={`it-${l.chave}-custo`} casas={4} value={l.custoUnitario} onChange={(e) => alterar(l.chave, { custoUnitario: e.target.value })} />
                      </CampoFormulario>
                    </>
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Total</p>
                    <p className="flex h-10 items-center justify-end font-medium">{formatarMoeda(totalLinha(l))}</p>
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
                {emb && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div role="radiogroup" aria-label="Lançar em" className="flex rounded-lg bg-fundo p-0.5">
                      {(
                        [
                          [true, `Em ${nomeEmb}`],
                          [false, `Em ${emb.sigla}`],
                        ] as const
                      ).map(([valor, rotulo]) => (
                        <button
                          key={String(valor)}
                          type="button"
                          role="radio"
                          aria-checked={l.porEmbalagem === valor}
                          onClick={() => {
                            // Ao passar para a unidade de uso, leva os valores já convertidos
                            if (!valor && l.porEmbalagem) alterar(l.chave, { porEmbalagem: false, quantidade: v.quantidade ? decimalParaInput(v.quantidade, 3) : '', custoUnitario: v.custoUnitario ? decimalParaInput(v.custoUnitario, 4) : '' })
                            else alterar(l.chave, { porEmbalagem: valor })
                          }}
                          className={cn('rounded-md px-2.5 py-1 font-semibold', l.porEmbalagem === valor ? 'bg-card text-tinta shadow-sm' : 'text-texto-secundario')}
                        >
                          {rotulo}
                        </button>
                      ))}
                    </div>
                    {l.porEmbalagem && numero(l.embalagens) > 0 ? (
                      <span className="text-texto-secundario">
                        {l.embalagens} {numero(l.embalagens) > 1 ? PLURAL[emb.tipo] : nomeEmb} = <strong className="text-tinta">{numero(v.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {emb.sigla}</strong>
                        {numero(l.precoEmbalagem) > 0 && <> · {formatarCusto(v.custoUnitario)} / {emb.sigla}</>}
                      </span>
                    ) : (
                      l.porEmbalagem && (
                        <span className="text-texto-secundario">
                          Cada {nomeEmb} tem {emb.fator.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {emb.sigla}.
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <p className="text-right text-lg font-semibold text-tinta">Total da entrada: {formatarMoeda(total)}</p>
        </CardContent>
      </Card>
    </form>
  )
}
