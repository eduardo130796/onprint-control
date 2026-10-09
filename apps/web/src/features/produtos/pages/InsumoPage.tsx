import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Box,
  Boxes,
  Circle,
  Cylinder,
  Droplets,
  History,
  Layers,
  Loader2,
  Package,
  PackagePlus,
  RectangleHorizontal,
  Save,
  ShoppingBag,
  Tag,
  Truck,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  BASE_INSUMO_ROTULOS,
  TIPOS_EMBALAGEM,
  TIPO_EMBALAGEM_ROTULOS,
  custoPorUnidadeDeUso,
  fatorEmbalagem,
  insumoSchema,
  type InsumoDetalhe,
  type InsumoInput,
  type TipoEmbalagem,
} from '@onprint/shared'
import { fornecedoresApi } from '@/api/cadastros'
import { estoqueApi } from '@/api/estoque'
import { insumosApi } from '@/api/custos'
import { PageHeader } from '@/components/layout/PageHeader'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { KardexDialog } from '@/features/estoque/components/KardexDialog'
import { usePermissoes } from '@/hooks/usePermission'
import { decimalParaInput } from '@/lib/mascaras'
import { formatarQuantidade } from '@/lib/quantidade'
import { cn } from '@/lib/utils'
import { CartaoOpcao, Dica, Secao } from '../components/custo/Secao'
import { SemaforoLucro } from '../components/custo/SemaforoLucro'
import { formatarCusto, paraApi, paraCampo, usoDaUnidade } from '../custos'
import { useCategorias, useInsumo, useUnidades } from '../hooks'

const ICONE_EMBALAGEM: Record<TipoEmbalagem, LucideIcon> = {
  rolo: Cylinder,
  chapa: RectangleHorizontal,
  pacote: Package,
  caixa: Box,
  galao: Droplets,
  unidade: Circle,
}

const EXEMPLO_EMBALAGEM: Record<TipoEmbalagem, string> = {
  rolo: 'Lona, vinil, papel em bobina',
  chapa: 'ACM, PVC, acrílico, MDF',
  pacote: 'Resma de papel, ilhoses',
  caixa: 'Caixa com várias unidades',
  galao: 'Tinta, solvente, cola',
  unidade: 'Compra peça por peça',
}

/** Artigo + nome da embalagem para as frases ("o rolo", "a chapa"). */
const NOME_EMBALAGEM: Record<TipoEmbalagem, string> = {
  rolo: 'o rolo',
  chapa: 'a chapa',
  pacote: 'o pacote',
  caixa: 'a caixa',
  galao: 'o galão/frasco',
  unidade: 'cada unidade',
}

const medida = (v: string | null | undefined) => paraCampo(v, 3)

function valoresInsumo(i?: InsumoDetalhe): InsumoInput {
  return {
    codigo: i?.codigo ?? '',
    nome: i?.nome ?? '',
    descricao: i?.descricao ?? '',
    categoriaId: i?.categoriaId ?? '',
    unidadeMedidaId: i?.unidadeMedidaId ?? '',
    embalagem: i?.embalagem ?? 'rolo',
    embalagemLargura: medida(i?.embalagemLargura),
    embalagemComprimento: medida(i?.embalagemComprimento),
    embalagemConteudo: medida(i?.embalagemConteudo),
    precoEmbalagem: i?.precoEmbalagem ? decimalParaInput(i.precoEmbalagem) : '',
    fornecedorPreferidoId: i?.fornecedorPreferidoId ?? '',
    controlaEstoque: i?.controlaEstoque ?? true,
    estoqueMinimo: decimalParaInput(i?.estoqueMinimo ?? 0, 3),
    ativo: i?.ativo ?? true,
  }
}

const texto = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v))

function Formulario({ insumo }: { insumo?: InsumoDetalhe }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const pode = usePermissoes()
  const podeSalvar = pode('produtos', insumo ? 'editar' : 'criar')
  const temEstoque = pode('estoque')
  const categorias = useCategorias('true')
  const unidades = useUnidades()
  const [kardex, setKardex] = useState(false)
  const [fornecedor, setFornecedor] = useState<OpcaoBusca | null>(insumo?.fornecedorPreferido ? { id: insumo.fornecedorPreferido.id, rotulo: insumo.fornecedorPreferido.nome } : null)
  const form = useForm<InsumoInput>({ resolver: zodResolver(insumoSchema), defaultValues: valoresInsumo(insumo) })
  const { errors, isDirty, isSubmitting } = form.formState
  const r = form.register

  const embalagem = (form.watch('embalagem') ?? 'unidade') as TipoEmbalagem
  const unidadeId = form.watch('unidadeMedidaId')
  const unidade = unidades.data?.find((u) => u.id === unidadeId)
  const sigla = unidade?.sigla ?? 'un'
  const uso = usoDaUnidade(unidade?.sigla)
  // Rolo/chapa sempre têm medidas; se o uso não for m² nem metro, a conta vai pelo conteúdo
  const porMedidas = embalagem === 'rolo' || embalagem === 'chapa'
  const porConteudo = embalagem !== 'unidade' && (!porMedidas || uso === 'outra')

  // Resultado ao vivo: quantas unidades de uso vêm e quanto sai cada uma
  const fator = fatorEmbalagem(
    {
      embalagem,
      largura: paraApi(texto(form.watch('embalagemLargura'))),
      comprimento: paraApi(texto(form.watch('embalagemComprimento'))),
      conteudo: paraApi(texto(form.watch('embalagemConteudo'))),
    },
    uso,
  )
  const preco = paraApi(texto(form.watch('precoEmbalagem')))
  const custoUso = Number(preco) > 0 ? custoPorUnidadeDeUso(preco, fator) : null

  const buscarFornecedores = async (termo: string): Promise<OpcaoBusca[]> => {
    if (pode('fornecedores')) return (await fornecedoresApi.listar({ busca: termo || undefined, pageSize: 15, page: 1 })).data.map((f) => ({ id: f.id, rotulo: f.nome }))
    return (await estoqueApi.fornecedores(termo)).map((f) => ({ id: f.id, rotulo: f.nome }))
  }
  const podeBuscarFornecedor = pode('fornecedores') || temEstoque

  const onSubmit = form.handleSubmit(
    async (dados) => {
      try {
        const salvo = insumo ? await insumosApi.atualizar(insumo.id, dados) : await insumosApi.criar(dados)
        await Promise.all(['insumos', 'produtos', 'estoque'].map((c) => queryClient.invalidateQueries({ queryKey: [c] })))
        if (insumo) {
          toast.success(salvo.usadoEm ? `Insumo atualizado. O custo dos ${salvo.usadoEm} produto(s) que o usam foi recalculado.` : 'Insumo atualizado.')
          form.reset(valoresInsumo(salvo))
        } else {
          toast.success(`Insumo ${salvo.codigo} cadastrado.`)
          navigate(`/produtos/insumos/${salvo.id}`, { replace: true })
        }
      } catch (e) {
        toast.error((e as Error).message)
      }
    },
    () => toast.error('Verifique os campos destacados.'),
  )

  const escolherEmbalagem = (e: TipoEmbalagem) => form.setValue('embalagem', e, { shouldDirty: true })

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!podeSalvar || isSubmitting} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Secao icone={Tag} titulo="Identificação" descricao="O nome que aparece na composição dos produtos e no estoque.">
            <div className="grid gap-4 md:grid-cols-6">
              <div className="md:col-span-4">
                <CampoFormulario id="in-nome" rotulo="Nome *" erro={errors.nome?.message}>
                  <Input id="in-nome" placeholder="Ex.: Lona 440 g brilho" aria-invalid={Boolean(errors.nome)} {...r('nome')} />
                </CampoFormulario>
              </div>
              <div className="md:col-span-2">
                <CampoFormulario id="in-codigo" rotulo="Código" erro={errors.codigo?.message}>
                  <Input id="in-codigo" placeholder="Automático" className="font-mono uppercase" {...r('codigo')} />
                </CampoFormulario>
              </div>
              <div className="md:col-span-3">
                <CampoFormulario id="in-categoria" rotulo="Categoria">
                  <Select id="in-categoria" {...r('categoriaId')}>
                    <option value="">Sem categoria</option>
                    {categorias.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.caminho}
                      </option>
                    ))}
                  </Select>
                </CampoFormulario>
              </div>
              <div className="md:col-span-3">
                <CampoFormulario id="in-descricao" rotulo="Observação">
                  <Textarea id="in-descricao" rows={1} placeholder="Gramatura, cor, marca…" {...r('descricao')} />
                </CampoFormulario>
              </div>
              {insumo && (
                <label className="flex items-center gap-2 text-sm text-tinta md:col-span-6">
                  <Checkbox {...r('ativo')} /> Ativo (desmarque para esconder das buscas sem perder o histórico)
                </label>
              )}
            </div>
          </Secao>

          <Secao icone={ShoppingBag} titulo="Como você compra" descricao="Diga como o material chega e quanto você paga: o sistema calcula quanto custa cada pedacinho que vai no produto.">
            <div role="radiogroup" aria-label="Embalagem" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TIPOS_EMBALAGEM.map((e) => (
                <CartaoOpcao key={e} marcado={embalagem === e} onClick={() => escolherEmbalagem(e)} icone={ICONE_EMBALAGEM[e]} titulo={TIPO_EMBALAGEM_ROTULOS[e]} descricao={EXEMPLO_EMBALAGEM[e]} desabilitado={!podeSalvar} />
              ))}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <CampoFormulario id="in-unidade" rotulo="Você usa em… (unidade de uso) *" erro={errors.unidadeMedidaId?.message}>
                  <Select id="in-unidade" aria-invalid={Boolean(errors.unidadeMedidaId)} {...r('unidadeMedidaId')}>
                    <option value="">Escolha…</option>
                    {unidades.data?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome} ({u.sigla})
                      </option>
                    ))}
                  </Select>
                </CampoFormulario>
                <Dica>Como o material é gasto na produção: lona em m², fita em metro, ilhós em unidade, tinta em litro. É também a unidade do estoque.</Dica>
              </div>
              <div>
                <CampoFormulario id="in-preco" rotulo={embalagem === 'unidade' ? 'Quanto você paga por unidade?' : `Quanto você paga por ${NOME_EMBALAGEM[embalagem]}?`} erro={errors.precoEmbalagem?.message}>
                  <MoneyInput id="in-preco" placeholder="0,00" {...r('precoEmbalagem')} />
                </CampoFormulario>
                <Dica>O preço da última compra. Depois, as entradas de estoque atualizam o custo pela média.</Dica>
              </div>

              {porMedidas && (
                <>
                  <CampoFormulario id="in-largura" rotulo={embalagem === 'rolo' ? 'Largura do rolo' : 'Largura da chapa'} erro={errors.embalagemLargura?.message}>
                    <NumberInput id="in-largura" casas={3} sufixo="m" placeholder={embalagem === 'rolo' ? '3,20' : '1,22'} {...r('embalagemLargura')} />
                  </CampoFormulario>
                  <CampoFormulario id="in-comprimento" rotulo={embalagem === 'rolo' ? 'Comprimento do rolo' : 'Comprimento da chapa'} erro={errors.embalagemComprimento?.message}>
                    <NumberInput id="in-comprimento" casas={3} sufixo="m" placeholder={embalagem === 'rolo' ? '50' : '2,44'} {...r('embalagemComprimento')} />
                  </CampoFormulario>
                </>
              )}
              {porConteudo && (
                <div className="md:col-span-2">
                  <CampoFormulario id="in-conteudo" rotulo={`Quantos ${sigla} vêm em ${NOME_EMBALAGEM[embalagem]}?`} erro={errors.embalagemConteudo?.message}>
                    <NumberInput id="in-conteudo" casas={3} sufixo={sigla} placeholder={embalagem === 'galao' ? '5' : '500'} className="pr-16" {...r('embalagemConteudo')} />
                  </CampoFormulario>
                  {porMedidas && <Dica>Com a unidade de uso em m² ou metro, a conta é feita pelas medidas.</Dica>}
                </div>
              )}
            </div>

            <ResultadoEmbalagem embalagem={embalagem} fator={fator} custo={custoUso} sigla={sigla} uso={uso} />
          </Secao>

          <Secao icone={Truck} titulo="Fornecedor preferido" descricao="De quem você costuma comprar. Ajuda na hora de repor o estoque.">
            {podeBuscarFornecedor ? (
              <SearchSelect
                id="in-fornecedor"
                chave="insumo-fornecedores"
                buscar={buscarFornecedores}
                valor={fornecedor}
                desabilitado={!podeSalvar}
                onChange={(f) => {
                  setFornecedor(f)
                  form.setValue('fornecedorPreferidoId', f?.id ?? '', { shouldDirty: true })
                }}
                placeholder="Buscar fornecedor…"
              />
            ) : (
              <p className="text-sm text-tinta">{fornecedor?.rotulo ?? 'Nenhum'}</p>
            )}
          </Secao>

          <Secao
            icone={Boxes}
            titulo="Estoque"
            descricao="Controle o saldo e receba um alerta quando estiver acabando."
            acao={
              insumo && temEstoque ? (
                <>
                  {pode('estoque', 'criar') && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/estoque/entradas/novo?produto=${insumo.id}`}>
                        <PackagePlus /> Registrar compra
                      </Link>
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={() => setKardex(true)}>
                    <History /> Movimentações
                  </Button>
                </>
              ) : undefined
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-tinta md:col-span-2">
                <Checkbox {...r('controlaEstoque')} /> Controlar o estoque deste insumo
              </label>
              <CampoFormulario id="in-minimo" rotulo="Estoque mínimo (avisa quando chegar nele)" erro={errors.estoqueMinimo?.message}>
                <NumberInput id="in-minimo" casas={3} sufixo={sigla} className="pr-16" disabled={!form.watch('controlaEstoque')} {...r('estoqueMinimo')} />
              </CampoFormulario>
              {insumo && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-fundo p-3">
                    <p className="text-xs text-texto-secundario">Saldo</p>
                    <p className={cn('font-semibold', insumo.abaixoMinimo ? 'text-amber-700' : 'text-tinta')}>{insumo.saldo === null ? '—' : formatarQuantidade(insumo.saldo, insumo.unidadeMedida?.sigla)}</p>
                  </div>
                  <div className="rounded-2xl bg-fundo p-3">
                    <p className="text-xs text-texto-secundario">Custo médio</p>
                    <p className="font-semibold text-tinta">{insumo.custoMedio ? `${formatarCusto(insumo.custoMedio)} / ${insumo.unidadeMedida?.sigla ?? 'un'}` : '—'}</p>
                  </div>
                </div>
              )}
            </div>
            {temEstoque && <Dica>O saldo muda pelas entradas de compra, pela baixa das ordens de produção e pelos ajustes.</Dica>}
          </Secao>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20">
          {insumo && insumo.custo !== undefined && (
            <div className="rounded-3xl bg-grafite p-5 text-white shadow-suave">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Custo usado nos produtos</p>
              <p className="mt-1 font-titulo text-3xl font-extrabold">
                {Number(insumo.custo) > 0 ? formatarCusto(insumo.custo) : 'Sem custo'}
                {Number(insumo.custo) > 0 && <span className="text-base font-semibold text-white/70"> / {insumo.unidadeMedida?.sigla ?? 'un'}</span>}
              </p>
              <p className="mt-2 text-xs text-white/70">Vem da embalagem e depois acompanha o custo médio das compras.</p>
            </div>
          )}
          {insumo && <OndeEUsado insumo={insumo} />}
        </div>
      </fieldset>

      {podeSalvar && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex justify-end border-t border-border bg-fundo/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="submit" disabled={isSubmitting || (Boolean(insumo) && !isDirty)}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
            {insumo ? 'Salvar alterações' : 'Cadastrar insumo'}
          </Button>
        </div>
      )}
      {insumo && <KardexDialog produto={kardex ? { id: insumo.id, nome: insumo.nome } : null} onFechar={() => setKardex(false)} />}
    </form>
  )
}

/** "Cada m² sai por R$ 9,06 · rolo de 160 m²" */
function ResultadoEmbalagem({ embalagem, fator, custo, sigla, uso }: { embalagem: TipoEmbalagem; fator: number; custo: string | null; sigla: string; uso: 'm2' | 'm' | 'outra' }) {
  const qtd = fator.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  const descricao = embalagem === 'unidade' ? 'compra por unidade' : `${TIPO_EMBALAGEM_ROTULOS[embalagem].toLowerCase()} de ${qtd} ${sigla}`
  const cada = uso === 'm2' ? 'Cada m²' : uso === 'm' ? 'Cada metro' : `Cada ${sigla}`
  return (
    <div className={cn('mt-5 flex items-center gap-4 rounded-2xl p-4', custo ? 'bg-marca-suave' : 'bg-fundo')} aria-live="polite">
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', custo ? 'bg-marca text-marca-contraste' : 'bg-card text-texto-secundario')}>
        <Layers className="h-5 w-5" aria-hidden="true" />
      </span>
      {custo ? (
        <div className="min-w-0">
          <p className="font-titulo text-lg font-extrabold text-tinta">
            {cada} sai por {formatarCusto(custo)}
          </p>
          <p className="text-sm text-texto-secundario">{descricao}</p>
        </div>
      ) : (
        <p className="text-sm text-texto-secundario">
          {fator > 0 ? 'Informe quanto você paga para ver o custo de cada unidade.' : 'Preencha as medidas ou o conteúdo da embalagem para ver o custo de cada unidade.'}
        </p>
      )}
    </div>
  )
}

function OndeEUsado({ insumo }: { insumo: InsumoDetalhe }) {
  const sigla = insumo.unidadeMedida?.sigla ?? 'un'
  return (
    <Secao icone={Workflow} titulo="Onde é usado" descricao={insumo.produtos.length ? 'Se o custo mudar, estes produtos são recalculados.' : undefined}>
      {insumo.produtos.length === 0 ? (
        <p className="rounded-2xl bg-fundo p-4 text-sm text-texto-secundario">Ainda não está na composição de nenhum produto. Abra um produto, aba “Custo e preço”, e adicione este material.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-border">
          {insumo.produtos.map((p) => (
            <li key={p.id}>
              <Link to={`/produtos/${p.id}?aba=custo`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-fundo">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-tinta">{p.nome}</span>
                  <span className="block truncate text-xs text-texto-secundario">
                    {paraCampo(p.quantidade)} {sigla} {BASE_INSUMO_ROTULOS[p.base]}
                  </span>
                </span>
                {p.situacao && <SemaforoLucro situacao={p.situacao} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  )
}

/** Cadastro (/produtos/insumos/novo) e edição (/produtos/insumos/:id) de insumos — página única, sem abas. */
export function InsumoPage() {
  const { id } = useParams()
  const novo = !id || id === 'novo'
  const consulta = useInsumo(novo ? undefined : id)
  // Os selects (unidade, categoria) precisam das opções antes de montar o formulário, senão perdem o valor
  const unidades = useUnidades()
  const categorias = useCategorias('true')
  const listasProntas = !unidades.isPending && !categorias.isPending
  const voltar = (
    <Button asChild variant="outline">
      <Link to="/produtos/insumos">
        <ArrowLeft /> Insumos
      </Link>
    </Button>
  )

  if (novo) {
    return (
      <>
        <PageHeader titulo="Novo insumo" subtitulo="Material que você compra para produzir: lona, tinta, ilhós, chapa…" acoes={voltar} />
        {listasProntas ? <Formulario /> : <Skeleton className="h-96 w-full rounded-3xl" />}
      </>
    )
  }
  if (consulta.isPending || !listasProntas) return <Skeleton className="h-96 w-full rounded-3xl" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>

  const i = consulta.data
  return (
    <>
      <PageHeader
        titulo={i.nome}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{i.codigo}</span>· Insumo
            {i.categoria && <>· {i.categoria.nome}</>}
            {!i.ativo && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">Desativado</span>}
          </span>
        }
        acoes={voltar}
      />
      <Formulario key={i.id} insumo={i} />
    </>
  )
}
