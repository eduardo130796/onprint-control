import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { calcularVendaPdv, formatarMoeda, normalizarDecimal, type CaixaSessaoDetalhe, type ProdutoPdv } from '@onprint/shared'
import { caixaApi } from '@/api/financeiro'
import { EmptyState } from '@/components/shared/EmptyState'
import { MoneyInput } from '@/components/shared/inputs'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/useDebounce'
import { buscarClientes } from '@/features/orcamentos/buscas'
import { decimalParaInput } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { TelaDeCaixa } from '../components/CabecalhoCaixa'
import { UltimasVendas } from '../components/UltimasVendas'
import { useFormasCaixa } from '../hooks'

type Item = { produto: ProdutoPdv; quantidade: number }
type Pagamento = { formaPagamentoId: string; valor: string }
const numero = (v: string) => normalizarDecimal(v || '0')

function Venda({ sessao }: { sessao: CaixaSessaoDetalhe }) {
  const queryClient = useQueryClient()
  const formas = useFormasCaixa()
  const [busca, setBusca] = useState('')
  const termo = useDebounce(busca.trim())
  const produtos = useQuery({ queryKey: ['caixa', 'produtos', termo], queryFn: () => caixaApi.produtos(termo) })
  const [itens, setItens] = useState<Item[]>([])
  const [cliente, setCliente] = useState<OpcaoBusca | null>(null)
  const [desconto, setDesconto] = useState('')
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [finalizando, setFinalizando] = useState(false)

  const tipoDa = (id: string) => formas.data?.find((f) => f.id === id)?.tipo
  const calc = calcularVendaPdv(
    itens.map((i) => ({ quantidade: i.quantidade, precoUnitario: i.produto.precoVenda })),
    numero(desconto),
    pagamentos.map((p) => ({ valor: numero(p.valor), dinheiro: tipoDa(p.formaPagamentoId) === 'dinheiro' })),
  )
  const falta = Math.max(0, Number(calc.total) - Number(calc.recebido))

  const adicionar = (p: ProdutoPdv) =>
    setItens((l) => (l.some((i) => i.produto.id === p.id) ? l.map((i) => (i.produto.id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i)) : [...l, { produto: p, quantidade: 1 }]))
  const mudarQtd = (id: string, delta: number) => setItens((l) => l.map((i) => (i.produto.id === id ? { ...i, quantidade: Math.max(1, i.quantidade + delta) } : i)))
  const pagarCom = (formaPagamentoId: string) => setPagamentos((l) => [...l, { formaPagamentoId, valor: decimalParaInput(falta.toFixed(2)) }])

  async function finalizar() {
    setFinalizando(true)
    try {
      const v = await caixaApi.vender({
        clienteId: cliente?.id ?? null,
        itens: itens.map((i) => ({ produtoId: i.produto.id, quantidade: String(i.quantidade) })),
        desconto: numero(desconto),
        pagamentos: pagamentos.map((p) => ({ formaPagamentoId: p.formaPagamentoId, valor: numero(p.valor) })),
      })
      toast.success(`Venda ${v.numero} concluída${Number(v.troco) > 0 ? ` · troco ${formatarMoeda(v.troco)}` : ''}.`, { duration: 8000 })
      setItens([])
      setPagamentos([])
      setDesconto('')
      setCliente(null)
      await Promise.all(['caixa', 'estoque', 'financeiro'].map((c) => queryClient.invalidateQueries({ queryKey: [c] })))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setFinalizando(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-secundario" />
          <Input className="pl-9" autoFocus placeholder="Buscar produto por nome ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produto" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {produtos.data?.map((p) => {
            const semEstoque = p.controlaEstoque && Number(p.saldo) <= 0
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => adicionar(p)}
                className={cn('rounded-xl border border-border bg-card p-3 text-left text-sm shadow-sm transition hover:border-marca hover:shadow', semEstoque && 'opacity-60')}
              >
                <p className="line-clamp-2 min-h-10 font-medium">{p.nome}</p>
                <p className="mt-1 text-base font-semibold text-tinta">{formatarMoeda(p.precoVenda)}</p>
                <p className={cn('text-xs', semEstoque ? 'text-coral-escuro' : 'text-texto-secundario')}>
                  {p.controlaEstoque ? `estoque ${Number(p.saldo).toLocaleString('pt-BR')}` : (p.categoria ?? p.codigo)}
                </p>
              </button>
            )
          })}
        </div>
        {produtos.data?.length === 0 && <EmptyState icone={ShoppingBag} titulo="Nenhum produto" descricao="O PDV mostra produtos ativos vendidos por unidade." />}
        <UltimasVendas sessaoId={sessao.id} />
      </div>

      <Card className="h-fit lg:sticky lg:top-24">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Venda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {itens.length === 0 ? (
            <p className="py-6 text-center text-texto-secundario">Toque nos produtos para adicionar.</p>
          ) : (
            <ul className="divide-y divide-border">
              {itens.map((i) => (
                <li key={i.produto.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.produto.nome}</span>
                    <span className="text-xs text-texto-secundario">{formatarMoeda(i.produto.precoVenda)} cada</span>
                  </span>
                  <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Menos" onClick={() => mudarQtd(i.produto.id, -1)}>
                    <Minus />
                  </Button>
                  <span className="w-6 text-center font-semibold">{i.quantidade}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Mais" onClick={() => mudarQtd(i.produto.id, 1)}>
                    <Plus />
                  </Button>
                  <span className="w-20 text-right font-medium">{formatarMoeda(i.quantidade * Number(i.produto.precoVenda))}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-coral-escuro hover:text-coral-escuro" aria-label="Remover" onClick={() => setItens((l) => l.filter((x) => x.produto.id !== i.produto.id))}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <SearchSelect chave="clientes-busca" buscar={buscarClientes} valor={cliente} onChange={setCliente} placeholder="Cliente (opcional)" />
          <div className="flex items-center justify-between gap-2">
            <span>Desconto</span>
            <div className="w-36">
              <MoneyInput aria-label="Desconto" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
            </div>
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <span className="font-semibold text-tinta">Total</span>
            <span className="text-2xl font-bold text-tinta">{formatarMoeda(calc.total)}</span>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Pagamento</p>
            <div className="flex flex-wrap gap-1.5">
              {formas.data?.map((f) => (
                <Button key={f.id} size="sm" variant="outline" disabled={itens.length === 0} onClick={() => pagarCom(f.id)}>
                  {f.nome}
                </Button>
              ))}
            </div>
            {pagamentos.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-32 truncate">{formas.data?.find((f) => f.id === p.formaPagamentoId)?.nome}</span>
                <MoneyInput aria-label="Valor do pagamento" value={p.valor} onChange={(e) => setPagamentos((l) => l.map((x, j) => (j === idx ? { ...x, valor: e.target.value } : x)))} />
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Remover pagamento" onClick={() => setPagamentos((l) => l.filter((_, j) => j !== idx))}>
                  <X />
                </Button>
              </div>
            ))}
          </div>

          <div className={cn('rounded-lg p-3 text-center font-medium', calc.ok ? 'bg-verde/10 text-green-800' : 'bg-fundo')}>
            {calc.ok ? (Number(calc.troco) > 0 ? `Troco: ${formatarMoeda(calc.troco)}` : 'Pagamento completo') : itens.length ? `Falta ${formatarMoeda(falta)}` : 'Carrinho vazio'}
          </div>
          <Button className="h-12 w-full text-base" disabled={!calc.ok || finalizando} onClick={() => void finalizar()}>
            {finalizando && <Loader2 className="animate-spin" />} Finalizar venda
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/** Venda balcão (/caixa): grade de produtos, carrinho e várias formas de pagamento. */
export function PdvPage() {
  return (
    <TelaDeCaixa titulo="Venda balcão (PDV)" subtitulo="Abra o caixa para começar a vender.">
      {(s) => <Venda sessao={s} />}
    </TelaDeCaixa>
  )
}
