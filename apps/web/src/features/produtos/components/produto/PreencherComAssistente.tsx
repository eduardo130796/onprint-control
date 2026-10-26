import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Layers, ListPlus, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { TIPO_COBRANCA_ROTULOS, formatarMoeda, type EstadoDoAssistente, type ProdutoSugerido } from '@onprint/shared'
import { assistenteApi } from '@/api/assistente'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { useAtualizarUsoAssistente } from '@/features/assistente/useAssistente'
import { NovaCategoriaRapida, NovoAcabamentoRapido, NovoInsumoRapido } from '../CadastroRapido'
import { preencherFormulario, type FormProduto } from './formProduto'

interface Props {
  form: FormProduto
  /** Produto já salvo: materiais e acabamentos vão para as abas; novo: são cadastrados junto com ele */
  salvo: boolean
  /** A sugestão mudou (campos = os preenchidos agora; sem eles, só mudou o que vai junto) */
  onSugestao: (s: ProdutoSugerido, campos?: string[]) => void
  /** Vindo do "Peça ao Assistente": já abre e preenche com este texto */
  textoInicial?: string
}

/** Exemplos do campo (um toque preenche o texto) */
const EXEMPLOS = [
  'Banner em lona 440 g, R$ 65 o m², faço até 3,20 de largura, com bastão e cordão ou ilhós. Usa lona 440 g e tinta eco-solvente.',
  'Caneca de porcelana personalizada, R$ 32 a unidade, prazo 3 dias. Usa caneca branca e papel sublimático.',
  'Cartão de visita 4×4 couché 300 g, 9×5 cm, R$ 120 o milheiro, laminação fosca opcional.',
]

/**
 * "Descreva o produto ou cole de onde quiser": o primeiro passo do cadastro novo (os campos continuam abaixo para quem
 * prefere). O Assistente GrafyGo preenche nome, categoria, cobrança, unidade, preço (só o escrito), medidas, prazo e
 * descrição, e mostra o que vai junto: acabamentos e materiais do cadastro (com um toque para tirar) e os que faltam,
 * com "Cadastrar agora" já preenchido. Texto com vários produtos: oferece a revisão em lote. Nada é salvo aqui.
 */
export function PreencherComAssistente({ form, salvo, onSugestao, textoInicial }: Props) {
  const navigate = useNavigate()
  const atualizarUso = useAtualizarUsoAssistente()
  // No produto novo o campo já vem aberto: é o caminho mais curto
  const [aberto, setAberto] = useState(Boolean(textoInicial) || !salvo)
  const [texto, setTexto] = useState(textoInicial ?? '')
  const [lendo, setLendo] = useState(false)
  const [sugestao, setSugestaoLocal] = useState<ProdutoSugerido | null>(null)
  const [criando, setCriando] = useState<{ tipo: 'insumo' | 'acabamento' | 'categoria'; indice: number } | null>(null)
  // "Peça ao Assistente": preenche uma vez ao abrir (o produto já chega preenchido)
  const automatico = useRef(Boolean(textoInicial))
  useEffect(() => {
    if (!automatico.current || !textoInicial) return
    automatico.current = false
    void preencher(textoInicial)
    // Só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function mudar(s: ProdutoSugerido) {
    setSugestaoLocal(s)
    onSugestao(s)
  }

  async function preencher(pedido = texto) {
    if (pedido.trim().length < 5) return toast.error('Descreva o produto.')
    setLendo(true)
    try {
      const s = await assistenteApi.produtoDeTexto(pedido.trim())
      const campos = preencherFormulario(form, s, { comPreco: !salvo })
      setSugestaoLocal(s)
      onSugestao(s, campos)
      toast.success('Preenchido: confira os campos marcados e o que vai junto.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLendo(false)
      atualizarUso()
    }
  }

  if (!aberto) {
    return (
      <Card className="flex flex-col gap-3 border border-dashed border-marca/40 bg-marca-suave/40 p-4 sm:flex-row sm:items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-marca text-marca-contraste">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-texto-secundario">
          <span className="block font-semibold text-tinta">Descreva o produto e o Assistente preenche</span>
          Nome, categoria, como cobra, materiais e acabamentos do seu cadastro. Você confere tudo antes de salvar.
        </p>
        <Button type="button" variant="outline" onClick={() => setAberto(true)}>
          <Sparkles /> Preencher com o Assistente
        </Button>
      </Card>
    )
  }

  const s = sugestao
  const caixa = 'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs'

  return (
    <Card className="space-y-3 border border-marca/40 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-marca text-marca-contraste">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-tinta">Descreva o produto ou cole de onde quiser</p>
          <p className="text-sm text-texto-secundario">Como você cobra, o preço, as medidas, os materiais e os acabamentos. O Assistente preenche; você confere.</p>
        </div>
        <AcaoIcone icone={X} rotulo={salvo ? 'Fechar o Assistente' : 'Prefiro preencher à mão'} onClick={() => setAberto(false)} />
      </div>
      <Textarea
        aria-label="Descrição do produto para o Assistente"
        rows={4}
        maxLength={2000}
        value={texto}
        placeholder="Ex.: banner em lona 440 g, R$ 65 o m², com ilhós ou bastão, usa lona 440 g e tinta"
        onChange={(e) => setTexto(e.target.value)}
      />
      {!texto && !s && (
        <div className="flex flex-wrap gap-2" aria-label="Exemplos">
          {EXEMPLOS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setTexto(ex)}
              className="max-w-full truncate rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs text-texto-secundario transition-colors hover:border-marca hover:text-tinta"
              title={ex}
            >
              {ex.split(',')[0]}…
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {lendo && <span className="text-xs text-texto-secundario" role="status">Lendo… leva uns 10 segundos.</span>}
        <Button type="button" onClick={() => void preencher()} disabled={lendo || texto.trim().length < 5}>
          {lendo ? <Loader2 className="animate-spin" /> : <Sparkles />} {lendo ? 'Preenchendo…' : s ? 'Preencher de novo' : 'Preencher'}
        </Button>
      </div>

      {s && s.variosProdutos > 1 && (
        <div className="flex flex-col gap-2 rounded-xl bg-marca-suave p-3 text-sm text-marca-escuro sm:flex-row sm:items-center">
          <ListPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">O texto tem {s.variosProdutos} produtos. Preenchi o primeiro; quer cadastrar todos de uma vez?</p>
          <Button type="button" size="sm" onClick={() => navigate('/produtos/cadastrar-varios', { state: { loteAssistente: texto.trim() } satisfies EstadoDoAssistente })}>
            Revisar os {s.variosProdutos}
          </Button>
        </div>
      )}

      {s && (
        <div className="space-y-3 rounded-xl bg-fundo p-3 text-sm">
          <p>Os campos preenchidos estão marcados com “sugerido”.{s.precoVenda && !salvo ? ` Preço: ${formatarMoeda(s.precoVenda)} (o que você escreveu).` : ''}</p>

          {s.categoria && !s.categoria.id && (
            <div className="space-y-2">
              <p className="flex flex-wrap items-center gap-2">
                Categoria sugerida: <strong>{s.categoria.nome}</strong> (nova)
                {criando?.tipo !== 'categoria' && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setCriando({ tipo: 'categoria', indice: 0 })}>
                    <Plus /> Criar categoria
                  </Button>
                )}
              </p>
              {criando?.tipo === 'categoria' && (
                <NovaCategoriaRapida
                  nome={s.categoria.nome}
                  onCancelar={() => setCriando(null)}
                  onCriada={(c) => {
                    setCriando(null)
                    form.setValue('categoriaId', c.id, { shouldDirty: true })
                    mudar({ ...s, categoria: c })
                  }}
                />
              )}
            </div>
          )}

          {(s.insumos.length > 0 || s.insumosFaltando.length > 0) && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 font-semibold text-tinta">
                <Layers className="h-4 w-4" aria-hidden="true" /> Materiais (custo)
              </p>
              <div className="flex flex-wrap gap-2">
                {s.insumos.map((i) => (
                  <span key={i.insumoId} className={`${caixa} border-marca/30 bg-card`}>
                    {i.nome} · {i.quantidade.replace('.', ',')} {i.unidade}
                    <button type="button" aria-label={`Tirar ${i.nome}`} className="rounded p-0.5 text-texto-secundario hover:bg-accent" onClick={() => mudar({ ...s, insumos: s.insumos.filter((x) => x.insumoId !== i.insumoId) })}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              {s.insumosFaltando.map((f, k) =>
                criando?.tipo === 'insumo' && criando.indice === k ? (
                  <NovoInsumoRapido
                    key={f.nome}
                    nome={f.nome}
                    unidade={f.unidadeSigla}
                    custo={f.custo}
                    onCancelar={() => setCriando(null)}
                    onCriado={(novo) => {
                      setCriando(null)
                      mudar({
                        ...s,
                        insumosFaltando: s.insumosFaltando.filter((_, j) => j !== k),
                        insumos: [...s.insumos, { insumoId: novo.id, nome: novo.nome, unidade: novo.unidade, custoUnitario: novo.custo, quantidade: f.quantidade, base: f.base }],
                      })
                    }}
                  />
                ) : (
                  <p key={f.nome} className="flex flex-wrap items-center gap-2 text-amber-900 dark:text-amber-200">
                    <span className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        <strong>{f.nome}</strong>: não está no cadastro
                      </span>
                    </span>
                    <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setCriando({ tipo: 'insumo', indice: k })}>
                      <Plus /> Cadastrar agora
                    </Button>
                    <button type="button" className="text-xs text-texto-secundario hover:underline" onClick={() => mudar({ ...s, insumosFaltando: s.insumosFaltando.filter((_, j) => j !== k) })}>
                      deixar sem
                    </button>
                  </p>
                ),
              )}
            </div>
          )}

          {(s.acabamentos.length > 0 || s.acabamentosNovos.length > 0) && (
            <div className="space-y-2">
              <p className="font-semibold text-tinta">Acabamentos</p>
              <div className="flex flex-wrap gap-2">
                {s.acabamentos.map((a) => (
                  <span key={a.id} className={`${caixa} border-marca/30 bg-card`}>
                    {a.nome}
                    <button type="button" aria-label={`Tirar ${a.nome}`} className="rounded p-0.5 text-texto-secundario hover:bg-accent" onClick={() => mudar({ ...s, acabamentos: s.acabamentos.filter((x) => x.id !== a.id) })}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              {s.acabamentosNovos.map((a, k) =>
                criando?.tipo === 'acabamento' && criando.indice === k ? (
                  <NovoAcabamentoRapido
                    key={a.nome}
                    nome={a.nome}
                    tipoCobranca={a.tipoCobranca}
                    valor={a.valor}
                    onCancelar={() => setCriando(null)}
                    onCriado={(novo) => {
                      setCriando(null)
                      mudar({ ...s, acabamentosNovos: s.acabamentosNovos.filter((_, j) => j !== k), acabamentos: [...s.acabamentos, { id: novo.id, nome: novo.nome }] })
                    }}
                  />
                ) : (
                  <p key={a.nome} className="flex flex-wrap items-center gap-2 text-amber-900 dark:text-amber-200">
                    <span className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        <strong>{a.nome}</strong> ({TIPO_COBRANCA_ROTULOS[a.tipoCobranca].toLowerCase()}
                        {a.valor ? `, ${formatarMoeda(a.valor)}` : ''}): não está no cadastro
                      </span>
                    </span>
                    <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setCriando({ tipo: 'acabamento', indice: k })}>
                      <Plus /> Cadastrar agora
                    </Button>
                  </p>
                ),
              )}
            </div>
          )}

          {(s.insumos.length > 0 || s.acabamentos.length > 0 || s.processos.length > 0) && (
            <p className="text-xs text-texto-secundario">
              {salvo
                ? 'Veja nas abas “Custo e preço” e “Acabamentos” para salvar.'
                : `Materiais e acabamentos são cadastrados junto com o produto.${s.processos.length ? ' As etapas de produção aparecem na aba “Custo e preço” depois de salvar.' : ''}`}
              {s.margem && ` Lucro desejado: ${s.margem.replace('.', ',')}%.`}
            </p>
          )}
          {s.avisos.map((a) => (
            <p key={a} className="flex items-start gap-1.5 text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a}
            </p>
          ))}
        </div>
      )}
    </Card>
  )
}
