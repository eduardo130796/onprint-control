import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowDown, ArrowUp, Copy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { MODO_CALCULO_SUFIXO, TIPO_COBRANCA_ROTULOS, formatarMoeda, type AnaliseLucro, type ModoCalculo } from '@onprint/shared'
import { orcamentosApi } from '@/api/comercial'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LucroDoItem } from '@/features/produtos/components/custo/LucroAnalise'
import { decimalParaInput } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { buscarProdutos } from '../../buscas'
import { itemComProduto, type ItemForm } from './formOrcamento'
import { chaveProdutoCatalogo, type ItemCalculadoTela } from './useCalculoOrcamento'

interface ItemOrcamentoProps {
  indice: number
  total: number
  item: ItemForm
  calculo: ItemCalculadoTela
  /** Semáforo do lucro do item (números só para quem vê custos) */
  analise?: AnaliseLucro
  analiseDesatualizada?: boolean
  editavel: boolean
  onChange: (item: ItemForm) => void
  onRemover: () => void
  onDuplicar: () => void
  onMover: (direcao: -1 | 1) => void
}

export function ItemOrcamento({ indice, total, item, calculo, analise, analiseDesatualizada, editavel, onChange, onRemover, onDuplicar, onMover }: ItemOrcamentoProps) {
  const queryClient = useQueryClient()
  const produto = calculo.produto
  const r = calculo.resultado
  const modo = produto?.modoCalculo as ModoCalculo | undefined
  const usaMedidas = modo === 'm2' || modo === 'metro_linear' || Boolean(produto?.acabamentos.some((a) => a.acabamento.tipoCobranca !== 'fixo' && a.acabamento.tipoCobranca !== 'por_unidade'))
  const id = (campo: string) => `item-${item.chave}-${campo}`
  const set = (dados: Partial<ItemForm>) => onChange({ ...item, ...dados })

  async function escolherProduto(opcao: OpcaoBusca | null) {
    if (!opcao) return set({ produto: null, acabamentoIds: [] })
    try {
      const p = await queryClient.fetchQuery({ queryKey: chaveProdutoCatalogo(opcao.id), queryFn: () => orcamentosApi.produto(opcao.id), staleTime: 5 * 60 * 1000 })
      onChange(itemComProduto(item, p, opcao))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Card className={cn('p-4', r && !r.ok && 'ring-1 ring-coral/60')}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-grafite text-xs font-semibold text-white">{indice + 1}</span>
        <div className="min-w-0 flex-1">
          <SearchSelect
            id={id('produto')}
            chave="catalogo-busca"
            buscar={buscarProdutos}
            valor={item.produto}
            onChange={(o) => void escolherProduto(o)}
            placeholder="Buscar produto ou serviço…"
            desabilitado={!editavel}
          />
        </div>
        {editavel && (
          <div className="flex shrink-0">
            <AcaoIcone icone={ArrowUp} rotulo="Subir item" onClick={() => onMover(-1)} />
            <AcaoIcone icone={ArrowDown} rotulo="Descer item" onClick={() => onMover(1)} />
            <AcaoIcone icone={Copy} rotulo="Duplicar item" onClick={onDuplicar} />
            {total > 1 && <AcaoIcone icone={Trash2} rotulo="Remover item" perigo onClick={onRemover} />}
          </div>
        )}
      </div>

      {produto && (
        <fieldset disabled={!editavel} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="sm:col-span-2 lg:col-span-6">
              <Label htmlFor={id('descricao')} className="text-xs text-texto-secundario">Descrição no orçamento</Label>
              <Input id={id('descricao')} className="mt-1" value={item.descricao} placeholder={produto.nome} onChange={(e) => set({ descricao: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={id('qtd')} className="text-xs text-texto-secundario">{modo === 'hora' ? 'Horas' : 'Quantidade'}</Label>
              <NumberInput id={id('qtd')} className="mt-1" casas={modo === 'hora' ? 2 : 0} value={item.quantidade} onChange={(e) => set({ quantidade: e.target.value })} />
            </div>
            {usaMedidas && (
              <div>
                <Label htmlFor={id('larg')} className="text-xs text-texto-secundario">{modo === 'metro_linear' ? 'Comprimento' : 'Largura'}</Label>
                <NumberInput id={id('larg')} className="mt-1" casas={3} sufixo="m" value={item.largura} onChange={(e) => set({ largura: e.target.value })} />
              </div>
            )}
            {usaMedidas && modo !== 'metro_linear' && (
              <div>
                <Label htmlFor={id('alt')} className="text-xs text-texto-secundario">Altura</Label>
                <NumberInput id={id('alt')} className="mt-1" casas={3} sufixo="m" value={item.altura} onChange={(e) => set({ altura: e.target.value })} />
              </div>
            )}
            <div>
              <Label htmlFor={id('preco')} className="text-xs text-texto-secundario">Preço / {modo ? MODO_CALCULO_SUFIXO[modo] : ''}</Label>
              <MoneyInput id={id('preco')} className="mt-1" value={item.precoUnitario} placeholder={decimalParaInput(produto.precoVenda)} onChange={(e) => set({ precoUnitario: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={id('desc')} className="text-xs text-texto-secundario">Desconto no item</Label>
              <MoneyInput id={id('desc')} className="mt-1" value={item.desconto} onChange={(e) => set({ desconto: e.target.value })} />
            </div>
          </div>

          {produto.acabamentos.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {produto.acabamentos.map((a) => (
                <label key={a.acabamentoId} className="flex items-center gap-2 text-sm" title={TIPO_COBRANCA_ROTULOS[a.acabamento.tipoCobranca]}>
                  <Checkbox
                    checked={a.obrigatorio || item.acabamentoIds.includes(a.acabamentoId)}
                    disabled={a.obrigatorio}
                    onChange={(e) =>
                      set({ acabamentoIds: e.target.checked ? [...item.acabamentoIds, a.acabamentoId] : item.acabamentoIds.filter((x) => x !== a.acabamentoId) })
                    }
                  />
                  {a.acabamento.nome}
                  <span className="text-xs text-texto-secundario">
                    {r?.acabamentos.find((x) => x.id === a.acabamentoId)?.valor ? formatarMoeda(r.acabamentos.find((x) => x.id === a.acabamentoId)!.valor) : formatarMoeda(a.acabamento.valor)}
                  </span>
                </label>
              ))}
            </div>
          )}

          <Input value={item.observacao} onChange={(e) => set({ observacao: e.target.value })} placeholder="Observação do item (opcional)" aria-label="Observação do item" />
        </fieldset>
      )}

      {produto && r && (
        <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-border pt-3 text-sm">
          {r.ok ? (
            <p className="text-texto-secundario">
              {Number(r.areaUnitaria) > 0 && `${Number(r.areaUnitaria).toLocaleString('pt-BR')} m² por peça · `}
              Produto {formatarMoeda(r.valorProduto)}
              {Number(r.valorAcabamentos) > 0 && ` + acabamentos ${formatarMoeda(r.valorAcabamentos)}`}
              {r.abaixoDoMinimo && <span className="ml-2 font-medium text-amber-800">· abaixo do preço mínimo (exige aprovação)</span>}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-coral-escuro">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {r.erros.join(' ')}
            </p>
          )}
          <p className="text-lg font-semibold text-tinta">{formatarMoeda(calculo.total)}</p>
          {r.ok && analise && <LucroDoItem analise={analise} desatualizado={analiseDesatualizada} className="w-full" />}
        </div>
      )}
    </Card>
  )
}
