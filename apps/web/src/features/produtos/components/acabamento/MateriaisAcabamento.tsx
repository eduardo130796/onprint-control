import { useRef } from 'react'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { TIPOS_COBRANCA, custoDoAcabamento, consumoDoAcabamento, formatarMoeda, type MedidasItem, type TipoCobranca } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { NumberInput } from '@/components/shared/inputs'
import { SearchSelect } from '@/components/shared/SearchSelect'
import { Button } from '@/components/ui/button'
import { criarBuscaInsumos, type InfoInsumo } from '../../buscaInsumos'
import { UNIDADE_COBRANCA_ACABAMENTO, formatarCusto, numero, paraApi } from '../../custos'
import { novaLinhaMaterial, type MaterialAcabamentoLinha } from './linhasMaterial'

/** Peça de referência para o custo ao vivo: 1 × 1 m, 1 peça (um banner pequeno). */
const REFERENCIA: MedidasItem = { quantidade: 1, largura: 1, altura: 1 }
const REFERENCIA_TEXTO: Record<TipoCobranca, string> = {
  fixo: 'Em cada item do pedido',
  por_unidade: 'Em cada peça',
  por_m2: 'Num banner de 1 × 1 m (1 m²)',
  por_metro_linear: 'Num banner de 1 × 1 m (1 metro)',
  por_perimetro: 'Num banner de 1 × 1 m (4 m de perímetro)',
}

const n = (v: string | number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

interface Props {
  linhas: MaterialAcabamentoLinha[]
  tipoCobranca: TipoCobranca
  /** Custo manual por unidade da cobrança (mão de obra, terceiro) — para o custo de referência */
  custoManual: string
  veCustos: boolean
  onChange: (linhas: MaterialAcabamentoLinha[]) => void
}

/** "O que este acabamento gasta": insumos por unidade da cobrança + perda, com o custo de referência ao vivo. */
export function MateriaisAcabamento({ linhas, tipoCobranca, custoManual, veCustos, onChange }: Props) {
  const cache = useRef(new Map<string, InfoInsumo>())
  const buscar = criarBuscaInsumos(cache.current, { revendaExceto: '' })
  const tipo = (TIPOS_COBRANCA as readonly string[]).includes(tipoCobranca) ? tipoCobranca : 'por_unidade'
  const porUnidade = UNIDADE_COBRANCA_ACABAMENTO[tipo]
  const alterar = (chave: number, dados: Partial<MaterialAcabamentoLinha>) => onChange(linhas.map((l) => (l.chave === chave ? { ...l, ...dados } : l)))
  const adicionar = () => onChange([...linhas, novaLinhaMaterial()])

  const validas = linhas.filter((l) => l.insumoId)
  const referencia = custoDoAcabamento(
    {
      nome: '',
      tipoCobranca: tipo,
      custo: paraApi(custoManual) || '0',
      materiais: validas.map((l) => ({ nome: l.nome, custoUnitario: l.custoUnitario, unidade: l.unidade, quantidade: paraApi(l.quantidade) || '0', perdaPercentual: paraApi(l.perdaPercentual) || '0' })),
    },
    REFERENCIA,
  )

  return (
    <section className="space-y-3 rounded-2xl bg-fundo p-3 sm:p-4" aria-labelledby="ac-materiais-titulo">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="ac-materiais-titulo" className="text-sm font-semibold text-tinta">
            O que este acabamento gasta
          </h3>
          <p className="text-xs text-texto-secundario">Os materiais que ele consome (ilhós, bastão, fita…). Entram no custo e saem do estoque quando a produção termina.</p>
        </div>
        {linhas.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={adicionar}>
            <Plus /> Material
          </Button>
        )}
      </div>

      {linhas.length === 0 ? (
        <Button type="button" variant="outline" className="w-full border-dashed bg-card" onClick={adicionar}>
          <Plus /> Adicionar material
        </Button>
      ) : (
        <ul className="space-y-3">
          {linhas.map((l) => {
            const consumo = l.insumoId ? consumoDoAcabamento({ tipoCobranca: tipo }, { quantidade: paraApi(l.quantidade) || '0', perdaPercentual: paraApi(l.perdaPercentual) || '0' }, REFERENCIA) : null
            return (
              <li key={l.chave} className="space-y-2 rounded-xl bg-card p-3 shadow-sm">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <CampoFormulario id={`acm-${l.chave}`} rotulo="Material">
                      <SearchSelect
                        id={`acm-${l.chave}`}
                        chave="acabamento-insumos"
                        buscar={buscar}
                        invalido={!l.insumoId}
                        valor={l.insumoId ? { id: l.insumoId, rotulo: l.nome, detalhe: veCustos && Number(l.custoUnitario) > 0 ? `${formatarCusto(l.custoUnitario)} / ${l.unidade}` : l.unidade } : null}
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
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-coral-escuro hover:text-coral-escuro" aria-label="Remover material" onClick={() => onChange(linhas.filter((x) => x.chave !== l.chave))}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2">
                  <CampoFormulario id={`acm-${l.chave}-qtd`} rotulo={`Quanto vai ${porUnidade}`}>
                    <NumberInput id={`acm-${l.chave}-qtd`} casas={4} sufixo={l.unidade || undefined} className="pr-12" value={l.quantidade} onChange={(e) => alterar(l.chave, { quantidade: e.target.value })} />
                  </CampoFormulario>
                  <CampoFormulario id={`acm-${l.chave}-perda`} rotulo="Perda">
                    <NumberInput id={`acm-${l.chave}-perda`} sufixo="%" placeholder="0" value={l.perdaPercentual} onChange={(e) => alterar(l.chave, { perdaPercentual: e.target.value })} />
                  </CampoFormulario>
                </div>
                {l.insumoId && numero(l.quantidade) <= 0 && <p className="text-xs text-coral-escuro">Informe quanto vai.</p>}
                {consumo !== null && numero(l.quantidade) > 0 && (
                  <p className="text-xs text-texto-secundario">
                    {REFERENCIA_TEXTO[tipo]}: {n(consumo)} {l.unidade} de {l.nome}
                    {numero(l.perdaPercentual) > 0 && ` (com ${n(numero(l.perdaPercentual))}% de perda)`}
                    {veCustos && Number(l.custoUnitario) > 0 && ` = ${formatarMoeda(Number(consumo) * Number(l.custoUnitario))}`}.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {veCustos && (validas.length > 0 || numero(custoManual) > 0) && (
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-marca-suave px-3 py-2 text-sm text-marca-escuro">
          <span>{REFERENCIA_TEXTO[tipo]}, o acabamento custa</span>
          <strong className="text-base font-extrabold">{formatarMoeda(referencia.valor)}</strong>
        </p>
      )}
    </section>
  )
}
