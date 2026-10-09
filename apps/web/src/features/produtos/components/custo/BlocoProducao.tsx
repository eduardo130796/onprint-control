import { Cog, Plus, Receipt, Trash2 } from 'lucide-react'
import { BASES_EXTRA, BASES_TEMPO, formatarMoeda, type BaseExtra, type BaseTempo, type Maquina, type Processo } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { NumberInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { minutosAutomaticos, type DadosProducao } from '../../custos'
import { Secao } from './Secao'
import { novaProducao, novoExtra, type ExtraLinha, type ProducaoLinha } from './estadoComposicao'

const BASE_TEMPO_ROTULOS: Record<BaseTempo, string> = {
  por_m2: 'm² do produto',
  por_unidade: 'peça',
  por_metro_linear: 'metro do produto',
  por_item: 'pedido (uma vez só)',
}

const BASE_EXTRA_ROTULOS: Record<BaseExtra, string> = {
  por_item: 'por pedido',
  por_unidade: 'por peça',
  por_m2: 'por m²',
  por_metro_linear: 'por metro',
}

function Vazio({ texto, botao, onAdicionar, editavel }: { texto: string; botao: string; onAdicionar: () => void; editavel: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
      <p className="max-w-sm text-sm text-texto-secundario">{texto}</p>
      {editavel && (
        <Button type="button" variant="outline" onClick={onAdicionar}>
          <Plus /> {botao}
        </Button>
      )}
    </div>
  )
}

function CustoLinha({ valor, unidade, onRemover }: { valor: number; unidade: string; onRemover?: () => void }) {
  return (
    <div className="flex items-end justify-between gap-2 md:justify-end">
      <div className="text-left md:text-right">
        <p className="text-xs text-texto-secundario">Custo / {unidade}</p>
        <p className="flex h-10 items-center font-semibold text-tinta md:justify-end">{formatarMoeda(valor)}</p>
      </div>
      {onRemover && (
        <Button type="button" variant="ghost" size="icon" className="text-coral-escuro hover:text-coral-escuro" aria-label="Remover" onClick={onRemover}>
          <Trash2 />
        </Button>
      )}
    </div>
  )
}

interface ProducaoProps {
  linhas: ProducaoLinha[]
  dados: (DadosProducao & { maquinaNome: string | null })[]
  custos: number[]
  processos: Processo[]
  maquinas: Maquina[]
  unidadeProduto: string
  baseNova: BaseTempo
  editavel: boolean
  onChange: (linhas: ProducaoLinha[]) => void
}

/** Produção: tempo de máquina ou mão de obra (minutos × custo/hora) + preparo. */
export function BlocoProducao({ linhas, dados, custos, processos, maquinas, unidadeProduto, baseNova, editavel, onChange }: ProducaoProps) {
  const alterar = (chave: number, d: Partial<ProducaoLinha>) => onChange(linhas.map((l) => (l.chave === chave ? { ...l, ...d } : l)))
  const adicionar = () => onChange([...linhas, novaProducao(baseNova)])

  return (
    <Secao
      icone={Cog}
      titulo="Produção"
      descricao="O tempo de máquina e de mão de obra. Deixe os minutos em branco para usar a velocidade da máquina."
      acao={
        editavel && linhas.length > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={adicionar}>
            <Plus /> Etapa
          </Button>
        ) : undefined
      }
    >
      {linhas.length === 0 ? (
        <Vazio texto="Adicione as etapas: impressão, corte, acabamento… O custo da hora vem do cadastro da máquina ou do processo." botao="Adicionar etapa" onAdicionar={adicionar} editavel={editavel} />
      ) : (
        <ul className="space-y-3">
          {linhas.map((l, i) => {
            const d = dados[i]
            const custoHora = Number(d?.custoHora ?? 0)
            return (
              <li key={l.chave} className="space-y-3 rounded-2xl bg-fundo p-3 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <CampoFormulario id={`pr-${l.chave}`} rotulo="Etapa (processo)">
                  <Select id={`pr-${l.chave}`} value={l.processoId} disabled={!editavel} aria-invalid={!l.processoId} onChange={(e) => alterar(l.chave, { processoId: e.target.value })}>
                    <option value="">Escolha…</option>
                    {processos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                    {l.processoId && !processos.some((p) => p.id === l.processoId) && <option value={l.processoId}>{d?.nome || 'Processo'}</option>}
                  </Select>
                </CampoFormulario>
                <CampoFormulario id={`pr-${l.chave}-maq`} rotulo="Máquina">
                  <Select id={`pr-${l.chave}-maq`} value={l.maquinaId} disabled={!editavel} onChange={(e) => alterar(l.chave, { maquinaId: e.target.value })}>
                    <option value="">{d?.maquinaNome && !l.maquinaId ? `Padrão: ${d.maquinaNome}` : 'Sem máquina / padrão'}</option>
                    {maquinas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </Select>
                </CampoFormulario>
                <CustoLinha valor={custos[i] ?? 0} unidade={unidadeProduto} onRemover={editavel ? () => onChange(linhas.filter((x) => x.chave !== l.chave)) : undefined} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
                  <CampoFormulario id={`pr-${l.chave}-min`} rotulo="Minutos">
                    <NumberInput id={`pr-${l.chave}-min`} casas={2} sufixo="min" className="pr-12" value={l.minutos} disabled={!editavel} placeholder={minutosAutomaticos(l.base, d)} onChange={(e) => alterar(l.chave, { minutos: e.target.value })} />
                  </CampoFormulario>
                  <CampoFormulario id={`pr-${l.chave}-base`} rotulo="Em cada">
                    <Select id={`pr-${l.chave}-base`} value={l.base} disabled={!editavel} onChange={(e) => alterar(l.chave, { base: e.target.value as BaseTempo })}>
                      {BASES_TEMPO.map((b) => (
                        <option key={b} value={b}>
                          {BASE_TEMPO_ROTULOS[b]}
                        </option>
                      ))}
                    </Select>
                  </CampoFormulario>
                  <CampoFormulario id={`pr-${l.chave}-prep`} rotulo="Preparo">
                    <NumberInput id={`pr-${l.chave}-prep`} casas={2} sufixo="min" placeholder="0" value={l.setupMinutos} disabled={!editavel} title="Acerto da máquina, uma vez por pedido" onChange={(e) => alterar(l.chave, { setupMinutos: e.target.value })} />
                  </CampoFormulario>
                </div>
                {l.processoId && (
                  <p className="text-xs text-texto-secundario">
                    {custoHora > 0 ? `Hora a ${formatarMoeda(custoHora)}` : 'Sem custo por hora: informe no cadastro da máquina ou do processo'}
                    {' · Preparo: acerto da máquina, uma vez por pedido'}
                    {d?.maquinaNome && ` · ${d.maquinaNome}`}
                    {Number(d?.velocidadeM2Hora ?? 0) > 0 && ` · ${Number(d?.velocidadeM2Hora).toLocaleString('pt-BR')} m²/h`}
                    {!l.minutos.trim() && (l.base === 'por_m2' && Number(d?.velocidadeM2Hora ?? 0) > 0 ? ' · Minutos em branco: automático pela velocidade da máquina' : d?.tempoPadraoMinutos ? ' · Minutos em branco: tempo padrão do processo, uma vez por pedido' : '')}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Secao>
  )
}

interface ExtrasProps {
  linhas: ExtraLinha[]
  custos: number[]
  unidadeProduto: string
  editavel: boolean
  onChange: (linhas: ExtraLinha[]) => void
}

/** Outros custos diretos: embalagem, frete, terceirizado… */
export function BlocoExtras({ linhas, custos, unidadeProduto, editavel, onChange }: ExtrasProps) {
  const alterar = (chave: number, d: Partial<ExtraLinha>) => onChange(linhas.map((l) => (l.chave === chave ? { ...l, ...d } : l)))
  const adicionar = () => onChange([...linhas, novoExtra()])
  return (
    <Secao
      icone={Receipt}
      titulo="Outros custos"
      descricao="Embalagem, frete, serviço terceirizado… o que mais você paga para entregar este produto."
      acao={
        editavel && linhas.length > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={adicionar}>
            <Plus /> Custo
          </Button>
        ) : undefined
      }
    >
      {linhas.length === 0 ? (
        <Vazio texto="Nada além de materiais e produção? Pode deixar vazio." botao="Adicionar custo" onAdicionar={adicionar} editavel={editavel} />
      ) : (
        <ul className="space-y-3">
          {linhas.map((l, i) => (
            <li key={l.chave} className="grid gap-3 rounded-2xl bg-fundo p-3 sm:p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <CampoFormulario id={`ex-${l.chave}`} rotulo="O que é">
                <Input id={`ex-${l.chave}`} value={l.nome} disabled={!editavel} placeholder="Ex.: Embalagem, frete" aria-invalid={l.nome.trim().length < 2} onChange={(e) => alterar(l.chave, { nome: e.target.value })} />
              </CampoFormulario>
              <CampoFormulario id={`ex-${l.chave}-valor`} rotulo="Valor (R$)">
                <NumberInput id={`ex-${l.chave}-valor`} casas={4} value={l.valor} disabled={!editavel} placeholder="0,00" onChange={(e) => alterar(l.chave, { valor: e.target.value })} />
              </CampoFormulario>
              <CampoFormulario id={`ex-${l.chave}-base`} rotulo="Cobrado">
                <Select id={`ex-${l.chave}-base`} value={l.base} disabled={!editavel} onChange={(e) => alterar(l.chave, { base: e.target.value as BaseExtra })}>
                  {BASES_EXTRA.map((b) => (
                    <option key={b} value={b}>
                      {BASE_EXTRA_ROTULOS[b]}
                    </option>
                  ))}
                </Select>
              </CampoFormulario>
              <CustoLinha valor={custos[i] ?? 0} unidade={unidadeProduto} onRemover={editavel ? () => onChange(linhas.filter((x) => x.chave !== l.chave)) : undefined} />
            </li>
          ))}
        </ul>
      )}
    </Secao>
  )
}
