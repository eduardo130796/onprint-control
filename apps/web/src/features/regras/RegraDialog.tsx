import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  DIAS_SEMANA_CURTOS,
  MODOS_USO_REGRA,
  MODO_USO_ROTULOS,
  ORIGENS_ORCAMENTO,
  ORIGEM_ORCAMENTO_ROTULOS,
  TIPOS_ACAO_REGRA,
  TIPO_ACAO_ROTULOS,
  descreverRegra,
  type ModoUsoRegra,
  type OrigemOrcamento,
  type TipoAcaoRegra,
} from '@onprint/shared'
import { categoriasApi } from '@/api/produtos'
import { regrasApi, type NomesRegras } from '@/api/regras'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { SearchSelect } from '@/components/shared/SearchSelect'
import { TagsInput } from '@/components/shared/TagsInput'
import { Button } from '@/components/ui/button'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buscarClientes, buscarProdutos } from '@/features/orcamentos/buscas'
import { useMutacao } from '@/hooks/useMutacao'
import { cn } from '@/lib/utils'
import { CONDICAO_ROTULOS, CONDICOES_UI, trocarAcao, validarRascunho, regraDoRascunho, type CondicaoUI, type RascunhoRegra } from './rascunho'

interface RegraDialogProps {
  inicial: RascunhoRegra
  nomes: NomesRegras
  onFechar: () => void
}

/** Botões lado a lado (escolha única), bons no celular */
export function Escolha<T extends string>({ valor, opcoes, onChange, rotulo }: { valor: T; opcoes: [T, string][]; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="inline-flex flex-wrap gap-1 rounded-xl bg-fundo p-1">
      {opcoes.map(([v, r]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={valor === v}
          onClick={() => onChange(v)}
          className={cn('rounded-lg px-3 py-1.5 text-sm', valor === v ? 'bg-card font-medium text-tinta shadow-sm' : 'text-texto-secundario hover:text-texto')}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

/** Chips de cadastros escolhidos (produtos, clientes) com o "x" para tirar */
function Escolhidos({ itens, onTirar }: { itens: { id: string; rotulo: string }[]; onTirar: (id: string) => void }) {
  if (!itens.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((i) => (
        <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-tinta">
          {i.rotulo}
          <button type="button" onClick={() => onTirar(i.id)} aria-label={`Tirar ${i.rotulo}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  )
}

/**
 * Editor de uma regra comercial em português: "Quando…" (condições em chips, todas opcionais e somadas com E) e
 * "Faça…" (a ação, um aviso para a equipe e uma frase para o cliente), com a frase da regra ao vivo.
 */
export function RegraDialog({ inicial, nomes, onFechar }: RegraDialogProps) {
  const [r, setR] = useState(inicial)
  const set = (d: Partial<RascunhoRegra>) => setR((x) => ({ ...x, ...d }))
  const categorias = useQuery({ queryKey: ['categorias', 'ativas'], queryFn: () => categoriasApi.listar('true'), staleTime: 5 * 60 * 1000, enabled: r.condicoes.includes('categorias') })
  const salvar = useMutacao(['regras-comerciais', 'orcamentos'], () => (r.id ? regrasApi.atualizar(r.id, regraDoRascunho(r)) : regrasApi.criar(regraDoRascunho(r))))

  // Nomes para a frase ao vivo: os gravados + os escolhidos agora
  const nomesAoVivo = useMemo(
    () => ({
      produtos: { ...nomes.produtos, ...Object.fromEntries([...r.produtos, ...(r.produtoSugerido ? [r.produtoSugerido] : [])].map((p) => [p.id, p.rotulo])) },
      clientes: { ...nomes.clientes, ...Object.fromEntries(r.clientes.map((c) => [c.id, c.rotulo])) },
      categorias: { ...nomes.categorias, ...Object.fromEntries((categorias.data ?? []).map((c) => [c.id, c.nome])) },
    }),
    [nomes, r.produtos, r.produtoSugerido, r.clientes, categorias.data],
  )
  const validacao = validarRascunho(r)
  const frase = validacao.ok ? descreverRegra(validacao.regra, nomesAoVivo) : null
  const livres = CONDICOES_UI.filter((c) => !r.condicoes.includes(c))
  const ehDesconto = r.acaoTipo === 'desconto' || r.acaoTipo === 'preco_especial'
  const temExtras = !['aviso', 'frase_cliente', 'limite_negociacao'].includes(r.acaoTipo)

  function tirarCondicao(c: CondicaoUI) {
    set({ condicoes: r.condicoes.filter((x) => x !== c) })
  }

  function condicao(c: CondicaoUI) {
    const linha = (conteudo: React.ReactNode) => (
      <div key={c} className="rounded-xl border border-border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-tinta">{CONDICAO_ROTULOS[c]}</span>
          <button type="button" onClick={() => tirarCondicao(c)} className="rounded p-1 text-texto-secundario hover:text-coral-escuro" aria-label={`Tirar condição ${CONDICAO_ROTULOS[c]}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {conteudo}
      </div>
    )
    switch (c) {
      case 'produtos':
        return linha(
          <div className="space-y-2">
            <SearchSelect chave="regra-produto" buscar={buscarProdutos} valor={null} onChange={(o) => o && !r.produtos.some((p) => p.id === o.id) && set({ produtos: [...r.produtos, o] })} placeholder="Adicionar produto…" />
            <Escolhidos itens={r.produtos} onTirar={(id) => set({ produtos: r.produtos.filter((p) => p.id !== id) })} />
          </div>,
        )
      case 'clientes':
        return linha(
          <div className="space-y-2">
            <SearchSelect chave="regra-cliente" buscar={buscarClientes} valor={null} onChange={(o) => o && !r.clientes.some((p) => p.id === o.id) && set({ clientes: [...r.clientes, o] })} placeholder="Adicionar cliente…" />
            <Escolhidos itens={r.clientes} onTirar={(id) => set({ clientes: r.clientes.filter((p) => p.id !== id) })} />
          </div>,
        )
      case 'categorias':
        return linha(
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(categorias.data ?? []).map((cat) => (
              <label key={cat.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={r.categoriaIds.includes(cat.id)}
                  onChange={(e) => set({ categoriaIds: e.target.checked ? [...r.categoriaIds, cat.id] : r.categoriaIds.filter((x) => x !== cat.id) })}
                />
                {cat.nome}
              </label>
            ))}
            {categorias.isPending && <span className="text-sm text-texto-secundario">Carregando categorias…</span>}
          </div>,
        )
      case 'etiquetas':
        return linha(<TagsInput valor={r.etiquetas} onChange={(etiquetas) => set({ etiquetas })} placeholder="Ex.: Revenda, VIP (Enter)" />)
      case 'quantidade':
        return linha(
          <div className="grid grid-cols-2 gap-3">
            <CampoFormulario id="rg-qmin" rotulo="A partir de">
              <NumberInput id="rg-qmin" casas={3} value={r.quantidadeMin} onChange={(e) => set({ quantidadeMin: e.target.value })} />
            </CampoFormulario>
            <CampoFormulario id="rg-qmax" rotulo="Até (opcional)">
              <NumberInput id="rg-qmax" casas={3} value={r.quantidadeMax} onChange={(e) => set({ quantidadeMax: e.target.value })} />
            </CampoFormulario>
          </div>,
        )
      case 'valorItem':
      case 'valorTotal': {
        const min = c === 'valorItem' ? 'valorItemMin' : 'valorTotalMin'
        const max = c === 'valorItem' ? 'valorItemMax' : 'valorTotalMax'
        return linha(
          <div className="grid grid-cols-2 gap-3">
            <CampoFormulario id={`rg-${min}`} rotulo="A partir de">
              <MoneyInput id={`rg-${min}`} value={r[min]} onChange={(e) => set({ [min]: e.target.value })} />
            </CampoFormulario>
            <CampoFormulario id={`rg-${max}`} rotulo="Até (opcional)">
              <MoneyInput id={`rg-${max}`} value={r[max]} onChange={(e) => set({ [max]: e.target.value })} />
            </CampoFormulario>
          </div>,
        )
      }
      case 'pagamento':
        return linha(
          <Escolha
            rotulo="Forma de pagamento"
            valor={r.pagamento}
            onChange={(pagamento) => set({ pagamento })}
            opcoes={[
              ['a_vista', 'À vista / Pix (entrada de 100%)'],
              ['parcelado', 'Parcelado'],
            ]}
          />,
        )
      case 'prazo':
        return linha(
          <div className="flex flex-wrap items-center gap-2 text-sm">
            O cliente quer em menos de
            <div className="w-20">
              <NumberInput aria-label="Dias úteis" casas={0} value={r.prazoMenorQueDias} onChange={(e) => set({ prazoMenorQueDias: e.target.value })} />
            </div>
            dias úteis (data “Cliente precisa até” do orçamento)
          </div>,
        )
      case 'periodo':
        return linha(
          <div className="grid grid-cols-2 gap-3">
            <CampoFormulario id="rg-ini" rotulo="De">
              <Input id="rg-ini" type="date" value={r.periodoInicio} onChange={(e) => set({ periodoInicio: e.target.value })} />
            </CampoFormulario>
            <CampoFormulario id="rg-fim" rotulo="Até">
              <Input id="rg-fim" type="date" value={r.periodoFim} onChange={(e) => set({ periodoFim: e.target.value })} />
            </CampoFormulario>
          </div>,
        )
      case 'diasSemana':
        return linha(
          <div className="flex flex-wrap gap-1.5">
            {DIAS_SEMANA_CURTOS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={r.diasSemana.includes(i)}
                onClick={() => set({ diasSemana: r.diasSemana.includes(i) ? r.diasSemana.filter((x) => x !== i) : [...r.diasSemana, i] })}
                className={cn('h-9 w-12 rounded-lg border text-sm', r.diasSemana.includes(i) ? 'border-marca bg-marca-suave font-medium text-marca-escuro' : 'border-border text-texto-secundario')}
              >
                {d}
              </button>
            ))}
          </div>,
        )
      case 'origens':
        return linha(
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ORIGENS_ORCAMENTO.map((o: OrigemOrcamento) => (
              <label key={o} className="flex items-center gap-2 text-sm">
                <Checkbox checked={r.origens.includes(o)} onChange={(e) => set({ origens: e.target.checked ? [...r.origens, o] : r.origens.filter((x) => x !== o) })} />
                {ORIGEM_ORCAMENTO_ROTULOS[o]}
              </label>
            ))}
          </div>,
        )
    }
  }

  function camposDaAcao() {
    switch (r.acaoTipo) {
      case 'desconto':
      case 'acrescimo':
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Escolha rotulo="Percentual ou valor" valor={r.modo} onChange={(modo) => set({ modo })} opcoes={[['percentual', '%'], ['valor', 'R$']]} />
              <Escolha
                rotulo="Onde"
                valor={r.nivel}
                onChange={(nivel) => set({ nivel, faixasPor: nivel === 'orcamento' ? 'valor' : r.faixasPor })}
                opcoes={[
                  ['item', 'Em cada item'],
                  ['orcamento', 'No total do orçamento'],
                ]}
              />
            </div>
            {!r.usarFaixas && (
              <CampoFormulario id="rg-valor" rotulo={r.modo === 'percentual' ? 'Percentual' : 'Valor'}>
                {r.modo === 'percentual' ? (
                  <NumberInput id="rg-valor" sufixo="%" value={r.valor} onChange={(e) => set({ valor: e.target.value })} />
                ) : (
                  <MoneyInput id="rg-valor" value={r.valor} onChange={(e) => set({ valor: e.target.value })} />
                )}
              </CampoFormulario>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={r.usarFaixas} onChange={(e) => set({ usarFaixas: e.target.checked, faixas: e.target.checked && !r.faixas.length ? [{ minimo: '', valor: r.valor }] : r.faixas })} />
              Por faixas (quanto mais, maior o {r.acaoTipo === 'desconto' ? 'desconto' : 'acréscimo'})
            </label>
            {r.usarFaixas && (
              <div className="space-y-2 rounded-xl bg-fundo p-3">
                {r.nivel === 'item' && (
                  <Escolha
                    rotulo="Faixas por"
                    valor={r.faixasPor}
                    onChange={(faixasPor) => set({ faixasPor })}
                    opcoes={[
                      ['quantidade', 'Quantidade do item'],
                      ['valor', 'Valor do item'],
                    ]}
                  />
                )}
                {r.faixas.map((f, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <CampoFormulario id={`rg-fx-min-${i}`} rotulo="A partir de">
                      {r.faixasPor === 'quantidade' && r.nivel === 'item' ? (
                        <NumberInput id={`rg-fx-min-${i}`} casas={3} value={f.minimo} onChange={(e) => set({ faixas: r.faixas.map((x, j) => (j === i ? { ...x, minimo: e.target.value } : x)) })} />
                      ) : (
                        <MoneyInput id={`rg-fx-min-${i}`} value={f.minimo} onChange={(e) => set({ faixas: r.faixas.map((x, j) => (j === i ? { ...x, minimo: e.target.value } : x)) })} />
                      )}
                    </CampoFormulario>
                    <CampoFormulario id={`rg-fx-v-${i}`} rotulo={r.modo === 'percentual' ? 'Percentual' : 'Valor'}>
                      {r.modo === 'percentual' ? (
                        <NumberInput id={`rg-fx-v-${i}`} sufixo="%" value={f.valor} onChange={(e) => set({ faixas: r.faixas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)) })} />
                      ) : (
                        <MoneyInput id={`rg-fx-v-${i}`} value={f.valor} onChange={(e) => set({ faixas: r.faixas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)) })} />
                      )}
                    </CampoFormulario>
                    <Button type="button" variant="ghost" size="icon" aria-label="Tirar faixa" onClick={() => set({ faixas: r.faixas.filter((_, j) => j !== i) })}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {r.faixas.length < 10 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => set({ faixas: [...r.faixas, { minimo: '', valor: '' }] })}>
                    <Plus /> Faixa
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      case 'preco_especial':
        return (
          <CampoFormulario id="rg-valor" rotulo="Preço por unidade de cálculo do produto (unidade, m², metro, milheiro ou hora)">
            <MoneyInput id="rg-valor" value={r.valor} onChange={(e) => set({ valor: e.target.value })} />
          </CampoFormulario>
        )
      case 'pedido_minimo':
        return (
          <div className="space-y-3">
            <CampoFormulario id="rg-valor" rotulo="Valor mínimo do pedido (sem o frete)">
              <MoneyInput id="rg-valor" value={r.valor} onChange={(e) => set({ valor: e.target.value })} />
            </CampoFormulario>
            <Escolha
              rotulo="Abaixo do mínimo"
              valor={r.modoMinimo}
              onChange={(modoMinimo) => set({ modoMinimo })}
              opcoes={[
                ['completar', 'Completar até o mínimo'],
                ['taxa', 'Cobrar uma taxa'],
              ]}
            />
            {r.modoMinimo === 'taxa' && (
              <CampoFormulario id="rg-taxa" rotulo="Taxa">
                <MoneyInput id="rg-taxa" value={r.taxa} onChange={(e) => set({ taxa: e.target.value })} />
              </CampoFormulario>
            )}
          </div>
        )
      case 'sugerir_item':
        return (
          <div className="space-y-3">
            <CampoFormulario id="rg-texto" rotulo="O que sugerir">
              <Input id="rg-texto" value={r.texto} onChange={(e) => set({ texto: e.target.value })} placeholder="Ex.: oferecer a criação da arte" />
            </CampoFormulario>
            <CampoFormulario id="rg-prod-sug" rotulo="Produto para o botão “Adicionar” (opcional)">
              <SearchSelect id="rg-prod-sug" chave="regra-produto" buscar={buscarProdutos} valor={r.produtoSugerido} onChange={(o) => set({ produtoSugerido: o })} placeholder="Buscar produto…" />
            </CampoFormulario>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={r.obrigatorio} onChange={(e) => set({ obrigatorio: e.target.checked })} />
              Obrigatório: sem ele, o orçamento pede a aprovação de um gerente
            </label>
            <p className="text-xs text-texto-secundario">A sugestão aparece para quem faz o orçamento (e para o Assistente). Nunca entra sozinha.</p>
          </div>
        )
      case 'exigir_aprovacao':
      case 'bloquear':
        return (
          <CampoFormulario id="rg-texto" rotulo="Motivo (aparece para a equipe)">
            <Input id="rg-texto" value={r.texto} onChange={(e) => set({ texto: e.target.value })} placeholder={r.acaoTipo === 'bloquear' ? 'Ex.: fachada só com visita técnica' : 'Ex.: pedido grande, confira a produção'} />
          </CampoFormulario>
        )
      case 'aviso':
        return (
          <CampoFormulario id="rg-texto" rotulo="Aviso para a equipe (aparece no orçamento)">
            <Textarea id="rg-texto" rows={2} value={r.texto} onChange={(e) => set({ texto: e.target.value })} />
          </CampoFormulario>
        )
      case 'frase_cliente':
        return (
          <CampoFormulario id="rg-texto" rotulo="Frase para o cliente (mensagem, PDF e página de aprovação)">
            <Input id="rg-texto" value={r.texto} onChange={(e) => set({ texto: e.target.value })} />
          </CampoFormulario>
        )
      case 'limite_negociacao':
        return (
          <CampoFormulario id="rg-valor" rotulo="Desconto manual máximo sem gerente (sobre o valor já com as regras)">
            <NumberInput id="rg-valor" sufixo="%" value={r.valor} onChange={(e) => set({ valor: e.target.value })} />
          </CampoFormulario>
        )
    }
  }

  return (
    <FormDialog
      aberto
      largo
      onAbertoChange={(v) => !v && onFechar()}
      titulo={r.id ? 'Editar regra' : 'Nova regra comercial'}
      descricao="O sistema aplica sozinho em todo orçamento: no balcão, montado pelo Assistente e, no futuro, pelo WhatsApp."
      salvando={salvar.isPending}
      onSubmit={(e) => {
        e.preventDefault()
        if (!validacao.ok) return toast.error(validacao.erro)
        salvar.mutate(undefined, {
          onSuccess: () => {
            toast.success(r.id ? 'Regra salva.' : 'Regra criada. Ela já vale nos próximos orçamentos salvos.')
            onFechar()
          },
          onError: (erro) => toast.error(erro.message),
        })
      }}
    >
      <CampoFormulario id="rg-nome" rotulo="Nome da regra">
        <Input id="rg-nome" value={r.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Ex.: Desconto para revenda" autoFocus={!r.id} />
      </CampoFormulario>

      <section aria-labelledby="rg-quando" className="space-y-2">
        <h3 id="rg-quando" className="text-sm font-semibold text-tinta">
          Quando…
        </h3>
        {r.condicoes.length === 0 && <p className="text-sm text-texto-secundario">Sem condição: vale em todo orçamento.</p>}
        {r.condicoes.map(condicao)}
        {livres.length > 0 && (
          <Select aria-label="Adicionar condição" value="" onChange={(e) => e.target.value && set({ condicoes: [...r.condicoes, e.target.value as CondicaoUI] })}>
            <option value="">+ Adicionar condição…</option>
            {livres.map((c) => (
              <option key={c} value={c}>
                {CONDICAO_ROTULOS[c]}
              </option>
            ))}
          </Select>
        )}
      </section>

      <section aria-labelledby="rg-faca" className="space-y-3">
        <h3 id="rg-faca" className="text-sm font-semibold text-tinta">
          Faça…
        </h3>
        <Select aria-label="O que a regra faz" value={r.acaoTipo} onChange={(e) => setR(trocarAcao(r, e.target.value as TipoAcaoRegra))}>
          {TIPOS_ACAO_REGRA.map((t) => (
            <option key={t} value={t}>
              {TIPO_ACAO_ROTULOS[t]}
            </option>
          ))}
        </Select>
        {camposDaAcao()}
        {ehDesconto && (
          <div className="space-y-1">
            <Label className="block text-xs text-texto-secundario">Como usar</Label>
            <Escolha rotulo="Como usar" valor={r.modoUso} onChange={(modoUso) => set({ modoUso })} opcoes={MODOS_USO_REGRA.map((m): [ModoUsoRegra, string] => [m, MODO_USO_ROTULOS[m]])} />
          </div>
        )}
        {ehDesconto && (
          <div className="space-y-1">
            <Label className="block text-xs text-texto-secundario">Com outros descontos</Label>
            <Escolha
              rotulo="Com outros descontos"
              valor={r.combinacao}
              onChange={(combinacao) => set({ combinacao })}
              opcoes={[
                ['maior', 'Não junta: vale o maior'],
                ['soma', 'Junta com os outros'],
              ]}
            />
          </div>
        )}
        {temExtras && (
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoFormulario id="rg-aviso" rotulo="Aviso para a equipe (opcional)">
              <Input id="rg-aviso" value={r.avisoEquipe} onChange={(e) => set({ avisoEquipe: e.target.value })} placeholder="Ex.: confirme a fila da produção" />
            </CampoFormulario>
            <CampoFormulario id="rg-frase" rotulo="Frase para o cliente (opcional)">
              <Input id="rg-frase" value={r.fraseCliente} onChange={(e) => set({ fraseCliente: e.target.value })} placeholder="Ex.: Desconto de {valor} por quantidade" />
            </CampoFormulario>
          </div>
        )}
        {r.acaoTipo === 'aviso' && (
          <CampoFormulario id="rg-frase" rotulo="Frase para o cliente (opcional)">
            <Input id="rg-frase" value={r.fraseCliente} onChange={(e) => set({ fraseCliente: e.target.value })} />
          </CampoFormulario>
        )}
        {temExtras && <p className="text-xs text-texto-secundario">Na frase, {'{valor}'} vira o desconto ou acréscimo aplicado (ex.: 5%).</p>}
      </section>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={r.ativa} onChange={(e) => set({ ativa: e.target.checked })} /> Regra ligada
      </label>

      {/* A regra em uma frase, como o sistema vai entender */}
      <div aria-live="polite" className={cn('flex items-start gap-2 rounded-xl p-3 text-sm', frase ? 'bg-marca-suave text-marca-escuro' : 'bg-ambar/10 text-amber-800')}>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="[overflow-wrap:anywhere]">{frase ?? (validacao.ok ? '' : validacao.erro)}</span>
      </div>
    </FormDialog>
  )
}
