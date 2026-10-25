import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Ban, Calculator, Info, Lightbulb, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { ORIGENS_ORCAMENTO, ORIGEM_ORCAMENTO_ROTULOS, formatarMoeda, normalizarDecimal, textosParaCliente, type OrigemOrcamento } from '@onprint/shared'
import { regrasApi, type Simulacao } from '@/api/regras'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { buscarClientes, buscarProdutos } from '@/features/orcamentos/buscas'
import { cn } from '@/lib/utils'

interface LinhaSimulacao {
  chave: number
  produto: OpcaoBusca | null
  quantidade: string
}

let seq = 0
const novaLinha = (): LinhaSimulacao => ({ chave: ++seq, produto: null, quantidade: '1' })

const comSinal = (v: string) => `${Number(v) < 0 ? '−' : '+'} ${formatarMoeda(Math.abs(Number(v)).toFixed(2))}`

/**
 * Simulador: escolha produtos, quantidades, cliente, pagamento e datas e veja quais regras valem e o preço final —
 * pelo mesmo cálculo do orçamento (nada é gravado).
 */
export function SimuladorRegras() {
  const [linhas, setLinhas] = useState<LinhaSimulacao[]>([novaLinha()])
  const [cliente, setCliente] = useState<OpcaoBusca | null>(null)
  const [pagamento, setPagamento] = useState<'a_vista' | 'padrao' | 'parcelado'>('padrao')
  const [dataDesejada, setDataDesejada] = useState('')
  const [data, setData] = useState('')
  const [origem, setOrigem] = useState<OrigemOrcamento>('balcao')
  const [descontoManual, setDescontoManual] = useState('0,00')
  const simular = useMutation({
    mutationFn: () =>
      regrasApi.simular({
        clienteId: cliente?.id ?? null,
        itens: linhas.filter((l) => l.produto).map((l) => ({ produtoId: l.produto!.id, quantidade: normalizarDecimal(l.quantidade || '0') })),
        // À vista = entrada de 100%; parcelado = sem entrada em 3×; padrão = 50% + 1
        sinalPercentual: pagamento === 'a_vista' ? '100' : pagamento === 'parcelado' ? '0' : '50',
        parcelas: pagamento === 'a_vista' ? 0 : pagamento === 'parcelado' ? 3 : 1,
        dataDesejada: dataDesejada || null,
        data: data || null,
        origem,
        descontoManual,
      }),
  })
  const r: Simulacao | undefined = simular.data
  const prontos = linhas.some((l) => l.produto)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-texto-secundario" /> Simulador
        </CardTitle>
        <p className="text-sm text-texto-secundario">Monte um orçamento de teste e veja quais regras valem e o preço final. Nada é gravado.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={l.chave} className="grid grid-cols-[1fr_6.5rem_auto] items-end gap-2">
              <CampoFormulario id={`sim-prod-${l.chave}`} rotulo={i === 0 ? 'Produto' : ''}>
                <SearchSelect
                  id={`sim-prod-${l.chave}`}
                  chave="regra-produto"
                  buscar={buscarProdutos}
                  valor={l.produto}
                  onChange={(o) => setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, produto: o } : x)))}
                  placeholder="Buscar produto…"
                />
              </CampoFormulario>
              <CampoFormulario id={`sim-qtd-${l.chave}`} rotulo={i === 0 ? 'Quantidade' : ''}>
                <NumberInput id={`sim-qtd-${l.chave}`} casas={3} value={l.quantidade} onChange={(e) => setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, quantidade: e.target.value } : x)))} />
              </CampoFormulario>
              <Button type="button" variant="ghost" size="icon" aria-label="Tirar produto" disabled={linhas.length === 1} onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {linhas.length < 20 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setLinhas((ls) => [...ls, novaLinha()])}>
              <Plus /> Produto
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <CampoFormulario id="sim-cliente" rotulo="Cliente (etiquetas)">
            <SearchSelect id="sim-cliente" chave="clientes-busca" buscar={buscarClientes} valor={cliente} onChange={setCliente} placeholder="Qualquer cliente" />
          </CampoFormulario>
          <CampoFormulario id="sim-pag" rotulo="Pagamento">
            <Select id="sim-pag" value={pagamento} onChange={(e) => setPagamento(e.target.value as typeof pagamento)}>
              <option value="padrao">50% de entrada + 1 parcela</option>
              <option value="a_vista">À vista / Pix (entrada de 100%)</option>
              <option value="parcelado">Parcelado em 3×, sem entrada</option>
            </Select>
          </CampoFormulario>
          <CampoFormulario id="sim-origem" rotulo="De onde veio">
            <Select id="sim-origem" value={origem} onChange={(e) => setOrigem(e.target.value as OrigemOrcamento)}>
              {ORIGENS_ORCAMENTO.map((o) => (
                <option key={o} value={o}>
                  {ORIGEM_ORCAMENTO_ROTULOS[o]}
                </option>
              ))}
            </Select>
          </CampoFormulario>
          <CampoFormulario id="sim-desejada" rotulo="Cliente precisa até">
            <Input id="sim-desejada" type="date" value={dataDesejada} onChange={(e) => setDataDesejada(e.target.value)} />
          </CampoFormulario>
          <CampoFormulario id="sim-data" rotulo="Data do orçamento (vazio = hoje)">
            <Input id="sim-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </CampoFormulario>
          <CampoFormulario id="sim-desc" rotulo="Desconto manual (R$)">
            <MoneyInput id="sim-desc" value={descontoManual} onChange={(e) => setDescontoManual(e.target.value)} />
          </CampoFormulario>
        </div>

        <Button onClick={() => simular.mutate()} disabled={!prontos || simular.isPending}>
          {simular.isPending ? <Loader2 className="animate-spin" /> : <Calculator />} Simular
        </Button>
        {simular.isError && <p className="text-sm text-coral-escuro">{simular.error.message}</p>}

        {r && (
          <div className="space-y-3 border-t border-border pt-4 text-sm" aria-live="polite">
            <ul className="divide-y divide-border rounded-xl border border-border">
              {r.itens.map((i, k) => (
                <li key={k} className="space-y-1 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                      {Number(i.quantidade).toLocaleString('pt-BR')} × {i.descricao}
                    </span>
                    <span className="shrink-0 font-semibold text-tinta">{formatarMoeda(i.total)}</span>
                  </div>
                  {i.regras.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-texto-secundario line-through">{formatarMoeda(i.bruto)}</span>
                      {i.regras.map((e) => (
                        <span key={e.regraId} className={cn('rounded-full px-2 py-0.5 text-xs font-medium', Number(e.valor) < 0 ? 'bg-verde/10 text-green-800' : 'bg-ambar/15 text-amber-800')}>
                          {e.efeito} {e.nome}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {r.resultado.aplicadas.filter((a) => a.nivel === 'orcamento' && Number(a.valor) !== 0).map((a) => (
              <p key={a.regraId} className="flex justify-between gap-3">
                <span>
                  {a.nome} ({a.efeito})
                </span>
                <span className="shrink-0">{comSinal(a.valor)}</span>
              </p>
            ))}
            <p className="flex items-baseline justify-between border-t border-border pt-2">
              <span className="font-semibold text-tinta">Total</span>
              <span className="text-xl font-bold text-tinta">
                {Number(r.subtotalBruto) !== Number(r.resultado.total) && <span className="mr-2 text-sm font-normal text-texto-secundario line-through">{formatarMoeda(r.subtotalBruto)}</span>}
                {formatarMoeda(r.resultado.total)}
              </span>
            </p>
            {r.resultado.aplicadas.length === 0 && <p className="text-texto-secundario">Nenhuma regra vale para este orçamento.</p>}
            {r.resultado.bloqueios.map((b, i) => (
              <p key={`b${i}`} className="flex items-start gap-2 rounded-xl bg-coral/10 p-2 text-coral-escuro">
                <Ban className="mt-0.5 h-4 w-4 shrink-0" /> {b.motivo}
              </p>
            ))}
            {r.resultado.aprovacoes.map((a, i) => (
              <p key={`a${i}`} className="flex items-start gap-2 rounded-xl bg-ambar/10 p-2 text-amber-900 dark:text-amber-200">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {a.motivo}
              </p>
            ))}
            {r.resultado.avisos.map((a, i) => (
              <p key={`v${i}`} className="flex items-start gap-2 rounded-xl bg-marca-suave p-2 text-marca-escuro">
                <Info className="mt-0.5 h-4 w-4 shrink-0" /> {a.texto}
              </p>
            ))}
            {r.resultado.sugestoes.map((s, i) => (
              <p key={`s${i}`} className="flex items-start gap-2">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-ambar" /> {s.obrigatorio ? 'Obrigatório' : 'Sugestão'}: {s.texto}
              </p>
            ))}
            {r.resultado.ignoradas.map((g, i) => (
              <p key={`g${i}`} className="text-xs text-texto-secundario">
                <span className="line-through">{g.nome}</span> — {g.motivo}
              </p>
            ))}
            {textosParaCliente(r.resultado).length > 0 && (
              <p className="text-texto-secundario">
                O cliente vê: <span className="text-texto">{textosParaCliente(r.resultado).join(' · ')}</span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
