import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TIPO_MOVIMENTACAO_ROTULOS, TIPOS_MOVIMENTACAO_MANUAL, movimentacaoManualSchema, type TipoMovimentacaoManual } from '@onprint/shared'
import { estoqueApi } from '@/api/estoque'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { NumberInput } from '@/components/shared/inputs'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Select, Textarea } from '@/components/ui/form-controls'
import { usePermission } from '@/hooks/usePermission'
import { buscarProdutosEstoque } from '../buscas'
import { useLocaisEstoque } from '../hooks'

const AJUDA: Record<TipoMovimentacaoManual, string> = {
  saida: 'Retirada de material fora da produção (uso interno, amostra…).',
  perda: 'Material danificado ou descartado.',
  ajuste: 'Inventário: informe o saldo contado; o sistema lança a diferença.',
  transferencia: 'Move o material entre locais. O total não muda.',
}

/** Lançamento manual de estoque (saída, perda, ajuste de inventário ou transferência). */
export function MovimentacaoDialog({ produtoInicial, onFechar }: { produtoInicial?: OpcaoBusca; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const locais = useLocaisEstoque()
  const podeAjustar = usePermission('estoque', 'aprovar')
  const ativos = (locais.data ?? []).filter((l) => l.ativo)
  const padrao = ativos.find((l) => l.padrao) ?? ativos[0]
  const [tipo, setTipo] = useState<TipoMovimentacaoManual>('saida')
  const [produto, setProduto] = useState<OpcaoBusca | null>(produtoInicial ?? null)
  const [localId, setLocalId] = useState('')
  const [localDestinoId, setLocalDestinoId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const origem = localId || padrao?.id || ''

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (tipo === 'ajuste' && !quantidade.trim()) {
      setErros({ saldoContado: 'Informe o saldo contado (pode ser 0).' })
      return
    }
    const corpo = {
      tipo,
      produtoId: produto?.id ?? '',
      localId: origem,
      motivo,
      ...(tipo === 'ajuste' ? { saldoContado: quantidade } : { quantidade }),
      ...(tipo === 'transferencia' ? { localDestinoId } : {}),
    }
    const r = movimentacaoManualSchema.safeParse(corpo)
    if (!r.success) {
      setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.path[0] === 'produtoId' ? 'Escolha o produto.' : i.message])))
      return
    }
    setErros({})
    setSalvando(true)
    try {
      await estoqueApi.lancar(r.data)
      toast.success(`${TIPO_MOVIMENTACAO_ROTULOS[tipo]} registrada.`)
      await queryClient.invalidateQueries({ queryKey: ['estoque'] })
      onFechar()
    } catch (erro) {
      toast.error((erro as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo="Nova movimentação" descricao={AJUDA[tipo]} salvando={salvando} onSubmit={(e) => void salvar(e)}>
      <CampoFormulario id="mv-tipo" rotulo="Tipo">
        <Select id="mv-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimentacaoManual)}>
          {TIPOS_MOVIMENTACAO_MANUAL.filter((t) => t !== 'ajuste' || podeAjustar).map((t) => (
            <option key={t} value={t}>
              {TIPO_MOVIMENTACAO_ROTULOS[t]}
            </option>
          ))}
        </Select>
      </CampoFormulario>
      <CampoFormulario id="mv-produto" rotulo="Produto *" erro={erros.produtoId}>
        <SearchSelect id="mv-produto" chave="estoque-produtos-busca" buscar={buscarProdutosEstoque} valor={produto} onChange={setProduto} placeholder="Buscar insumo ou produto…" invalido={Boolean(erros.produtoId)} />
      </CampoFormulario>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="mv-local" rotulo={tipo === 'transferencia' ? 'De' : 'Local'}>
          <Select id="mv-local" value={origem} onChange={(e) => setLocalId(e.target.value)}>
            {ativos.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        {tipo === 'transferencia' ? (
          <CampoFormulario id="mv-destino" rotulo="Para *" erro={erros.localDestinoId}>
            <Select id="mv-destino" value={localDestinoId} onChange={(e) => setLocalDestinoId(e.target.value)}>
              <option value="">Escolha…</option>
              {ativos
                .filter((l) => l.id !== origem)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
            </Select>
          </CampoFormulario>
        ) : (
          <div />
        )}
        <CampoFormulario id="mv-qtd" rotulo={tipo === 'ajuste' ? 'Saldo contado *' : 'Quantidade *'} erro={erros.quantidade ?? erros.saldoContado}>
          <NumberInput id="mv-qtd" casas={3} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
        </CampoFormulario>
      </div>
      <CampoFormulario id="mv-motivo" rotulo={tipo === 'transferencia' ? 'Observação' : 'Motivo *'} erro={erros.motivo}>
        <Textarea id="mv-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </CampoFormulario>
    </FormDialog>
  )
}
