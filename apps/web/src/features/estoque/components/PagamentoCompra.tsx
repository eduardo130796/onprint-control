import { CalendarClock, HandCoins, RotateCcw, Wallet } from 'lucide-react'
import { formatarMoeda } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { MoneyInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useCategoriasFinanceiras, useFormasPagamento } from '@/features/financeiro/hooks'
import { CartaoOpcao } from '@/features/produtos/components/custo/Secao'
import { cn } from '@/lib/utils'
import { diferencaDasParcelas, parcelasAtuais, type EstadoPagamento, type ParcelaCompra } from '../pagamento'

/** Forma e categoria: só carregam quando a compra é a prazo (e somem se o perfil não vê o financeiro). */
function OpcoesFinanceiras({ estado, onChange }: { estado: EstadoPagamento; onChange: (p: Partial<EstadoPagamento>) => void }) {
  const formas = useFormasPagamento()
  const categorias = useCategoriasFinanceiras('despesa')
  if (formas.isError && categorias.isError) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {!formas.isError && (
        <CampoFormulario id="pg-forma" rotulo="Forma de pagamento">
          <Select id="pg-forma" value={estado.formaPagamentoId} onChange={(e) => onChange({ formaPagamentoId: e.target.value })}>
            <option value="">Não informar</option>
            {(formas.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
      )}
      {!categorias.isError && (
        <CampoFormulario id="pg-categoria" rotulo="Categoria da despesa">
          <Select id="pg-categoria" value={estado.categoriaId} onChange={(e) => onChange({ categoriaId: e.target.value })}>
            <option value="">Compras de insumos (padrão)</option>
            {(categorias.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
      )}
    </div>
  )
}

interface Props {
  estado: EstadoPagamento
  onChange: (p: Partial<EstadoPagamento>) => void
  /** Total da entrada (decimal da API) */
  total: string
  dataCompra: string
  temFornecedor: boolean
  erro?: string
}

/** "Pagamento" da entrada: já pago / à vista (sem conta) ou a prazo (gera as contas a pagar das parcelas). */
export function PagamentoCompra({ estado, onChange, total, dataCompra, temFornecedor, erro }: Props) {
  const parcelas = parcelasAtuais(estado, total, dataCompra)
  const diferenca = diferencaDasParcelas(total, parcelas)
  const editar = (i: number, dados: Partial<ParcelaCompra>) => onChange({ editadas: parcelas.map((p, j) => (j === i ? { ...p, ...dados } : p)) })

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label="Como a compra foi paga" className="grid gap-3 sm:grid-cols-2">
          <CartaoOpcao marcado={!estado.aPrazo} onClick={() => onChange({ aPrazo: false })} icone={HandCoins} titulo="Já paguei / à vista" descricao="Não gera conta a pagar." />
          <CartaoOpcao marcado={estado.aPrazo} onClick={() => onChange({ aPrazo: true })} icone={CalendarClock} titulo="A prazo" descricao="Gera as contas a pagar das parcelas no Financeiro." />
        </div>

        {estado.aPrazo && (
          <div className="space-y-4">
            {!temFornecedor && <p className={cn('rounded-xl p-3 text-sm', erro ? 'bg-coral/10 text-coral-escuro' : 'bg-ambar/10 text-amber-800')}>Escolha o fornecedor lá em cima: a conta a pagar fica no nome dele.</p>}
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-36">
                <CampoFormulario id="pg-vezes" rotulo="Em quantas vezes">
                  <Select id="pg-vezes" value={String(estado.vezes)} onChange={(e) => onChange({ vezes: Number(e.target.value), editadas: null })}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}×{n === 1 ? ' (30 dias)' : ''}
                      </option>
                    ))}
                  </Select>
                </CampoFormulario>
              </div>
              <p className="pb-2 text-sm text-texto-secundario">
                {formatarMoeda(total)} {estado.vezes > 1 ? `em ${estado.vezes} parcelas, a cada 30 dias` : 'para 30 dias'}
              </p>
              {estado.editadas && (
                <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => onChange({ editadas: null })}>
                  <RotateCcw /> Dividir de novo
                </Button>
              )}
            </div>

            {parcelas.length === 0 && <p className="rounded-xl bg-fundo p-3 text-sm text-texto-secundario">Inclua os itens da nota: as parcelas aparecem aqui, divididas pelo total.</p>}
            <ul className="space-y-2" aria-label="Parcelas">
              {parcelas.map((p, i) => (
                <li key={i} className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-xl bg-fundo p-2 sm:grid-cols-[3rem_12rem_12rem]">
                  <span className="text-center text-sm font-semibold text-texto-secundario">{i + 1}ª</span>
                  <Input type="date" aria-label={`Vencimento da ${i + 1}ª parcela`} value={p.vencimento} onChange={(e) => editar(i, { vencimento: e.target.value })} />
                  <MoneyInput aria-label={`Valor da ${i + 1}ª parcela`} value={p.valor} onChange={(e) => editar(i, { valor: e.target.value })} />
                </li>
              ))}
            </ul>
            {Number(diferenca) !== 0 && (
              <p className="flex items-center gap-2 rounded-xl bg-coral/10 p-3 text-sm text-coral-escuro" role="alert">
                <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
                {Number(diferenca) > 0 ? `Faltam ${formatarMoeda(diferenca)}` : `Sobram ${formatarMoeda(Math.abs(Number(diferenca)))}`} para as parcelas fecharem com o total da entrada ({formatarMoeda(total)}).
              </p>
            )}
            {erro && temFornecedor && Number(diferenca) === 0 && <p className="text-sm text-coral-escuro">{erro}</p>}
            <OpcoesFinanceiras estado={estado} onChange={onChange} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
