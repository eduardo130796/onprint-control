import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatarDataHora, formatarMoeda, type VendaPdv } from '@onprint/shared'
import { caixaApi } from '@/api/financeiro'
import { Can } from '@/components/shared/Can'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { toast } from 'sonner'

/** Vendas da sessão aberta, com cancelamento (estorna financeiro, gaveta e estoque). */
export function UltimasVendas({ sessaoId }: { sessaoId: string }) {
  const queryClient = useQueryClient()
  const vendas = useQuery({ queryKey: ['caixa', 'vendas', sessaoId], queryFn: () => caixaApi.vendas({ sessaoId, pageSize: 10 }) })
  const [cancelando, setCancelando] = useState<VendaPdv | null>(null)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  if (!vendas.data?.data.length) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Vendas deste caixa</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {vendas.data.data.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-mono text-xs">{v.numero}</span>
              <span className="text-xs text-texto-secundario">{formatarDataHora(v.createdAt)}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-texto-secundario">{v.pagamentos.map((p) => p.forma).join(' + ')}</span>
              <span className={v.status === 'cancelada' ? 'text-texto-secundario line-through' : 'font-medium'}>{formatarMoeda(v.total)}</span>
              {v.status === 'concluida' ? (
                <Can modulo="caixa" acao="editar">
                  <Button size="sm" variant="ghost" className="text-coral-escuro hover:text-coral-escuro" onClick={() => setCancelando(v)}>
                    Cancelar
                  </Button>
                </Can>
              ) : (
                <span className="text-xs text-coral-escuro">cancelada</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
      {cancelando && (
        <FormDialog
          aberto
          onAbertoChange={(x) => !x && setCancelando(null)}
          titulo={`Cancelar ${cancelando.numero}?`}
          descricao="O dinheiro sai da gaveta, o financeiro é estornado e os produtos voltam ao estoque."
          salvando={salvando}
          textoSalvar="Cancelar venda"
          onSubmit={async (e) => {
            e.preventDefault()
            if (motivo.trim().length < 3) return toast.error('Informe o motivo.')
            setSalvando(true)
            try {
              await caixaApi.cancelarVenda(cancelando.id, motivo.trim())
              toast.success('Venda cancelada.')
              setCancelando(null)
              setMotivo('')
              await Promise.all(['caixa', 'estoque', 'financeiro'].map((c) => queryClient.invalidateQueries({ queryKey: [c] })))
            } catch (erro) {
              toast.error((erro as Error).message)
            } finally {
              setSalvando(false)
            }
          }}
        >
          <CampoFormulario id="cv-motivo" rotulo="Motivo *">
            <Textarea id="cv-motivo" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </CampoFormulario>
        </FormDialog>
      )}
    </Card>
  )
}
