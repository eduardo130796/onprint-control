import { useRef } from 'react'
import { ExternalLink, Layers, Plus, Trash2 } from 'lucide-react'
import { BASES_INSUMO, formatarMoeda, type BaseInsumo } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { NumberInput } from '@/components/shared/inputs'
import { SearchSelect } from '@/components/shared/SearchSelect'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { criarBuscaInsumos, type InfoInsumo } from '../../buscaInsumos'
import { formatarCusto, numero } from '../../custos'
import { Secao } from './Secao'
import { novoMaterial, type MaterialLinha } from './estadoComposicao'

/** "Quanto vai…" em linguagem do dia a dia */
const BASE_MATERIAL_ROTULOS: Record<BaseInsumo, string> = {
  por_m2: 'm² do produto',
  por_unidade: 'peça',
  por_metro_linear: 'metro do produto',
}

/** "Vai 1,1 m² de Lona em cada m² do produto (1 m² + 10% de perda: sobra e erro de corte)." */
function explicar(l: MaterialLinha): string {
  if (!l.insumoId) return 'Escolha o material. Perda: sobra e erro de corte (ex.: 10%).'
  const qtd = numero(l.quantidade)
  const perda = numero(l.perdaPercentual)
  const total = qtd * (1 + perda / 100)
  const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  const base = `Vai ${n(total)} ${l.unidade} de ${l.nome} em cada ${BASE_MATERIAL_ROTULOS[l.base]}`
  return perda > 0 ? `${base} (${n(qtd)} ${l.unidade} + ${n(perda)}% de perda: sobra e erro de corte).` : `${base}.`
}

interface Props {
  linhas: MaterialLinha[]
  custos: number[]
  unidadeProduto: string
  baseNova: BaseInsumo
  produtoId: string
  editavel: boolean
  onChange: (linhas: MaterialLinha[]) => void
}

/** Materiais da composição: insumo × quanto vai × (1 + perda). */
export function BlocoMateriais({ linhas, custos, unidadeProduto, baseNova, produtoId, editavel, onChange }: Props) {
  // Dados do insumo escolhido na busca (nome, unidade e custo) — a busca só devolve id/rótulo
  const cache = useRef(new Map<string, InfoInsumo>())

  const buscar = criarBuscaInsumos(cache.current, { revendaExceto: produtoId })

  const alterar = (chave: number, dados: Partial<MaterialLinha>) => onChange(linhas.map((l) => (l.chave === chave ? { ...l, ...dados } : l)))
  const adicionar = () => onChange([...linhas, novoMaterial(baseNova)])

  return (
    <Secao
      icone={Layers}
      titulo="Materiais"
      descricao="O que vai no produto e quanto de cada um. A perda cobre sobra e erro de corte."
      acao={
        editavel && linhas.length > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={adicionar}>
            <Plus /> Material
          </Button>
        ) : undefined
      }
    >
      {linhas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
          <p className="max-w-sm text-sm text-texto-secundario">Adicione o que vai no produto: lona, tinta, ilhós… O custo de cada material vem do cadastro de insumos.</p>
          {editavel && (
            <Button type="button" variant="outline" onClick={adicionar}>
              <Plus /> Adicionar material
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {linhas.map((l, i) => (
            <li key={l.chave} className="space-y-3 rounded-2xl bg-fundo p-3 sm:p-4">
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
              <CampoFormulario id={`mt-${l.chave}`} rotulo="Material">
                <SearchSelect
                  id={`mt-${l.chave}`}
                  chave="composicao-insumos"
                  buscar={buscar}
                  desabilitado={!editavel}
                  invalido={!l.insumoId}
                  valor={l.insumoId ? { id: l.insumoId, rotulo: l.nome, detalhe: Number(l.custoUnitario) > 0 ? `${formatarCusto(l.custoUnitario)} / ${l.unidade}` : 'sem custo' } : null}
                  onChange={(o) => {
                    const info = o ? cache.current.get(o.id) : undefined
                    alterar(l.chave, o ? { insumoId: o.id, nome: info?.nome ?? o.rotulo, unidade: info?.unidade ?? 'un', custoUnitario: info?.custo ?? '0' } : { insumoId: '', nome: '', unidade: '', custoUnitario: '0' })
                  }}
                  placeholder="Buscar insumo…"
                  rodape={
                    <a href="/produtos/insumos/novo" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-marca-escuro hover:bg-accent">
                      <ExternalLink className="h-4 w-4" /> Cadastrar insumo (abre em outra aba)
                    </a>
                  }
                />
              </CampoFormulario>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-texto-secundario">Custo / {unidadeProduto}</p>
                  <p className="flex h-10 items-center justify-end font-semibold text-tinta">{formatarMoeda(custos[i] ?? 0)}</p>
                </div>
                {editavel && (
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-coral-escuro hover:text-coral-escuro" aria-label="Remover material" onClick={() => onChange(linhas.filter((x) => x.chave !== l.chave))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)]">
                <CampoFormulario id={`mt-${l.chave}-qtd`} rotulo="Quanto vai">
                  <NumberInput id={`mt-${l.chave}-qtd`} casas={4} sufixo={l.unidade || undefined} className="pr-12" value={l.quantidade} disabled={!editavel} onChange={(e) => alterar(l.chave, { quantidade: e.target.value })} />
                </CampoFormulario>
                <CampoFormulario id={`mt-${l.chave}-base`} rotulo="Em cada">
                  <Select id={`mt-${l.chave}-base`} value={l.base} disabled={!editavel} onChange={(e) => alterar(l.chave, { base: e.target.value as BaseInsumo })}>
                    {BASES_INSUMO.map((b) => (
                      <option key={b} value={b}>
                        {BASE_MATERIAL_ROTULOS[b]}
                      </option>
                    ))}
                  </Select>
                </CampoFormulario>
                <CampoFormulario id={`mt-${l.chave}-perda`} rotulo="Perda">
                  <NumberInput id={`mt-${l.chave}-perda`} sufixo="%" placeholder="0" value={l.perdaPercentual} disabled={!editavel} onChange={(e) => alterar(l.chave, { perdaPercentual: e.target.value })} />
                </CampoFormulario>
              </div>
              <p className="text-xs text-texto-secundario">{explicar(l)}</p>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  )
}
