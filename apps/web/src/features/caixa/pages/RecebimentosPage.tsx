import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { aplicarBaixa, formatarDataSimples, formatarMoeda, hojeISO, normalizarDecimal, type CaixaSessaoDetalhe } from '@onprint/shared'
import { caixaApi, type TituloAberto } from '@/api/financeiro'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { MoneyInput } from '@/components/shared/inputs'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/useDebounce'
import { decimalParaInput } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { TelaDeCaixa } from '../components/CabecalhoCaixa'
import { ListaMovimentosCaixa } from '../components/ListaMovimentosCaixa'
import { useFormasCaixa } from '../hooks'

const n = (v: string) => normalizarDecimal(v || '0')

function Recebimento({ sessao }: { sessao: CaixaSessaoDetalhe }) {
  const queryClient = useQueryClient()
  const formas = useFormasCaixa()
  const [busca, setBusca] = useState('')
  const termo = useDebounce(busca.trim())
  const titulos = useQuery({ queryKey: ['caixa', 'titulos', termo], queryFn: () => caixaApi.titulos(termo) })
  const [titulo, setTitulo] = useState<TituloAberto | null>(null)
  const [valor, setValor] = useState('')
  const [juros, setJuros] = useState('')
  const [desconto, setDesconto] = useState('')
  const [forma, setForma] = useState('')
  const [salvando, setSalvando] = useState(false)
  const hoje = hojeISO()
  const previa = titulo ? aplicarBaixa(titulo, { valorRecebido: n(valor), juros: n(juros), desconto: n(desconto) }) : null

  function escolher(t: TituloAberto) {
    setTitulo(t)
    setValor(decimalParaInput(t.saldo))
    setJuros('')
    setDesconto('')
  }

  async function receber() {
    if (!titulo || !forma) return toast.error('Escolha a forma de pagamento.')
    setSalvando(true)
    try {
      await caixaApi.receber({ contaReceberId: titulo.id, valorRecebido: n(valor), juros: n(juros), desconto: n(desconto), formaPagamentoId: forma })
      toast.success(`Recebido ${formatarMoeda(n(valor))} de ${titulo.cliente.nome}.`)
      setTitulo(null)
      await Promise.all(['caixa', 'financeiro', 'pedidos'].map((c) => queryClient.invalidateQueries({ queryKey: [c] })))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Títulos em aberto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-secundario" />
            <Input className="pl-9" autoFocus placeholder="Cliente, pedido ou descrição…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar título" />
          </div>
          <ul className="divide-y divide-border text-sm">
            {titulos.data?.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => escolher(t)} className={cn('flex w-full items-center gap-3 px-2 py-2 text-left hover:bg-fundo', titulo?.id === t.id && 'bg-turquesa/10')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.cliente.nome}</span>
                    <span className="block truncate text-xs text-texto-secundario">{t.descricao}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{formatarMoeda(t.saldo)}</span>
                    <span className={cn('text-xs', t.vencimento.slice(0, 10) < hoje ? 'text-coral-escuro' : 'text-texto-secundario')}>vence {formatarDataSimples(t.vencimento)}</span>
                  </span>
                </button>
              </li>
            ))}
            {titulos.data?.length === 0 && <li className="py-6 text-center text-texto-secundario">Nenhum título em aberto.</li>}
          </ul>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{titulo ? `Receber de ${titulo.cliente.nome}` : 'Escolha um título'}</CardTitle>
          </CardHeader>
          {titulo && (
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center gap-2 text-texto-secundario">
                {titulo.descricao} <StatusBadge entidade="conta" codigo={titulo.status} />
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <CampoFormulario id="rc-valor" rotulo="Valor recebido">
                  <MoneyInput id="rc-valor" value={valor} onChange={(e) => setValor(e.target.value)} />
                </CampoFormulario>
                <CampoFormulario id="rc-juros" rotulo="Juros/multa">
                  <MoneyInput id="rc-juros" value={juros} onChange={(e) => setJuros(e.target.value)} />
                </CampoFormulario>
                <CampoFormulario id="rc-desc" rotulo="Desconto">
                  <MoneyInput id="rc-desc" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
                </CampoFormulario>
              </div>
              <CampoFormulario id="rc-forma" rotulo="Forma de pagamento *">
                <Select id="rc-forma" value={forma} onChange={(e) => setForma(e.target.value)}>
                  <option value="">Escolha…</option>
                  {formas.data?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </Select>
              </CampoFormulario>
              {previa && (
                <p className={cn('rounded-lg p-2', previa.ok ? 'bg-fundo' : 'bg-coral/10 text-coral-escuro')}>
                  {previa.ok ? (previa.quitado ? 'Quita o título.' : `Pagamento parcial; restam ${formatarMoeda(previa.saldo)}.`) : previa.erro}
                </p>
              )}
              <Button className="w-full" disabled={!previa?.ok || !forma || salvando} onClick={() => void receber()}>
                {salvando && <Loader2 className="animate-spin" />} Confirmar recebimento
              </Button>
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recebidos neste caixa</CardTitle>
          </CardHeader>
          <CardContent>
            <ListaMovimentosCaixa movimentos={sessao.movimentos.filter((m) => m.tipo === 'recebimento')} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Recebimento de títulos no caixa (/caixa/recebimentos). */
export function RecebimentosPage() {
  return (
    <TelaDeCaixa titulo="Recebimentos" subtitulo="Abra o caixa para receber títulos no balcão.">
      {(s) => <Recebimento sessao={s} />}
    </TelaDeCaixa>
  )
}
