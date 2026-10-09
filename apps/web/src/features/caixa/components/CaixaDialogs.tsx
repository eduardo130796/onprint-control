import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, LockOpen } from 'lucide-react'
import { toast } from 'sonner'
import { formatarMoeda, normalizarDecimal, type CaixaSessaoDetalhe } from '@onprint/shared'
import { caixaApi } from '@/api/financeiro'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { MoneyInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/form-controls'
import { decimalParaInput } from '@/lib/mascaras'
import { cn } from '@/lib/utils'

const numero = (v: string) => Number(normalizarDecimal(v || '0'))
const atualizarCaixa = (qc: ReturnType<typeof useQueryClient>) => Promise.all(['caixa', 'financeiro', 'estoque', 'pedidos'].map((c) => qc.invalidateQueries({ queryKey: [c] })))

/** Tela de caixa fechado: informar o troco inicial e abrir. */
export function AbrirCaixa() {
  const queryClient = useQueryClient()
  const [valor, setValor] = useState('')
  const [abrindo, setAbrindo] = useState(false)
  async function abrir() {
    setAbrindo(true)
    try {
      await caixaApi.abrir({ valorAbertura: valor || '0' })
      toast.success('Caixa aberto.')
      await atualizarCaixa(queryClient)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAbrindo(false)
    }
  }
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-tinta">
            <LockOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold text-tinta">Caixa fechado</p>
            <p className="text-sm text-texto-secundario">Conte o dinheiro da gaveta e abra o caixa para vender e receber.</p>
          </div>
        </div>
        <CampoFormulario id="cx-abertura" rotulo="Troco inicial (dinheiro na gaveta)">
          <MoneyInput id="cx-abertura" value={valor} onChange={(e) => setValor(e.target.value)} />
        </CampoFormulario>
        <Button className="w-full" onClick={() => void abrir()} disabled={abrindo}>
          {abrindo && <Loader2 className="animate-spin" />} Abrir caixa
        </Button>
      </CardContent>
    </Card>
  )
}

/** Sangria (retira dinheiro) ou suprimento (coloca), com motivo e conta de destino/origem. */
export function SangriaDialog({ tipo, onFechar }: { tipo: 'sangria' | 'suprimento'; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const contas = useQuery({ queryKey: ['caixa', 'contas'], queryFn: caixaApi.contas, staleTime: 5 * 60 * 1000 })
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [conta, setConta] = useState('')
  const [salvando, setSalvando] = useState(false)
  return (
    <FormDialog
      aberto
      onAbertoChange={(v) => !v && onFechar()}
      titulo={tipo === 'sangria' ? 'Sangria' : 'Suprimento'}
      descricao={tipo === 'sangria' ? 'Retira dinheiro da gaveta (depósito, cofre…).' : 'Coloca dinheiro na gaveta (troco).'}
      salvando={salvando}
      onSubmit={async (e) => {
        e.preventDefault()
        if (numero(valor) <= 0 || motivo.trim().length < 3) return toast.error('Informe o valor e o motivo.')
        setSalvando(true)
        try {
          await caixaApi.movimento({ tipo, valor, motivo, contaFinanceiraId: conta || null })
          toast.success(tipo === 'sangria' ? 'Sangria registrada.' : 'Suprimento registrado.')
          await atualizarCaixa(queryClient)
          onFechar()
        } catch (erro) {
          toast.error((erro as Error).message)
        } finally {
          setSalvando(false)
        }
      }}
    >
      <CampoFormulario id="sg-valor" rotulo="Valor *">
        <MoneyInput id="sg-valor" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} />
      </CampoFormulario>
      <CampoFormulario id="sg-motivo" rotulo="Motivo *">
        <Textarea id="sg-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </CampoFormulario>
      <CampoFormulario id="sg-conta" rotulo={tipo === 'sangria' ? 'Vai para a conta' : 'Vem da conta'}>
        <Select id="sg-conta" value={conta} onChange={(e) => setConta(e.target.value)}>
          <option value="">Automático (conta bancária)</option>
          {contas.data
            ?.filter((c) => c.tipo !== 'caixa')
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
        </Select>
      </CampoFormulario>
    </FormDialog>
  )
}

/** Fechamento: o operador informa o que contou em cada forma; a diferença fica registrada. */
export function FecharCaixaDialog({ sessao, onFechar }: { sessao: CaixaSessaoDetalhe; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const [informados, setInformados] = useState<Record<string, string>>(() =>
    Object.fromEntries(sessao.porForma.map((p) => [p.formaPagamentoId ?? '', p.tipo === 'dinheiro' ? '' : decimalParaInput(p.calculado)])),
  )
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const totalCalc = sessao.porForma.reduce((s, p) => s + Number(p.calculado), 0)
  const totalInf = sessao.porForma.reduce((s, p) => s + numero(informados[p.formaPagamentoId ?? ''] ?? '0'), 0)
  return (
    <FormDialog
      aberto
      onAbertoChange={(v) => !v && onFechar()}
      titulo={`Fechar caixa ${sessao.numero}`}
      descricao="Conte a gaveta e confira as maquininhas. Informe o valor de cada forma."
      salvando={salvando}
      textoSalvar="Fechar caixa"
      largo
      onSubmit={async (e) => {
        e.preventDefault()
        setSalvando(true)
        try {
          await caixaApi.fechar(sessao.id, {
            informados: sessao.porForma.filter((p) => p.formaPagamentoId).map((p) => ({ formaPagamentoId: p.formaPagamentoId, valor: informados[p.formaPagamentoId!] || '0' })),
            observacao,
          })
          toast.success('Caixa fechado.')
          await atualizarCaixa(queryClient)
          onFechar()
        } catch (erro) {
          toast.error((erro as Error).message)
        } finally {
          setSalvando(false)
        }
      }}
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-texto-secundario">
          <tr>
            <th className="py-2">Forma</th>
            <th className="py-2 text-right">Sistema</th>
            <th className="py-2 text-right">Contado</th>
            <th className="py-2 text-right">Diferença</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sessao.porForma.map((p) => {
            const chave = p.formaPagamentoId ?? ''
            const dif = numero(informados[chave] ?? '0') - Number(p.calculado)
            return (
              <tr key={chave}>
                <td className="py-2 font-medium">{p.nome}</td>
                <td className="py-2 text-right">{formatarMoeda(p.calculado)}</td>
                <td className="w-40 py-2">
                  <MoneyInput aria-label={`Contado em ${p.nome}`} value={informados[chave] ?? ''} onChange={(e) => setInformados((x) => ({ ...x, [chave]: e.target.value }))} />
                </td>
                <td className={cn('py-2 text-right font-medium', Math.abs(dif) >= 0.01 && (dif > 0 ? 'text-green-800' : 'text-coral-escuro'))}>{formatarMoeda(dif)}</td>
              </tr>
            )
          })}
          <tr className="font-semibold">
            <td className="py-2">Total</td>
            <td className="py-2 text-right">{formatarMoeda(totalCalc)}</td>
            <td className="py-2 text-right">{formatarMoeda(totalInf)}</td>
            <td className={cn('py-2 text-right', Math.abs(totalInf - totalCalc) >= 0.01 && 'text-coral-escuro')}>{formatarMoeda(totalInf - totalCalc)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-texto-secundario">Sobra ou falta de dinheiro vira lançamento na conta do caixa.</p>
      <CampoFormulario id="fc-obs" rotulo="Observação">
        <Textarea id="fc-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </CampoFormulario>
    </FormDialog>
  )
}
