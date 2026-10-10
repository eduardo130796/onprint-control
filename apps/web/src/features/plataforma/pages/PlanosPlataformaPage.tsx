import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { MODULOS, MODULOS_ESSENCIAIS, MODULO_ROTULOS, formatarMoeda, planoSchema, type Modulo, type PlanoInput, type PlanoPlataforma } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { CabecalhoPlataforma, Secao } from '../components/Secao'

/** Valores do formulário (descrição sempre texto; o schema converte vazio em null). */
type FormPlano = Omit<PlanoInput, 'descricao'> & { descricao: string }

const NOVO: FormPlano = { codigo: '', nome: '', descricao: '', valorMensal: '0', modulos: [], limiteUsuarios: null, diasTeste: 14, diasAteSomenteLeitura: 5, diasAteBloqueio: 15, publico: true, ativo: true, ordem: 10 }

function PlanoDialog({ plano, onFechar }: { plano: PlanoPlataforma | null; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const [v, setV] = useState<FormPlano>(() =>
    plano
      ? {
          codigo: plano.codigo,
          nome: plano.nome,
          descricao: plano.descricao ?? '',
          valorMensal: plano.valorMensal.replace('.', ','),
          modulos: plano.modulos as Modulo[],
          limiteUsuarios: plano.limiteUsuarios,
          diasTeste: plano.diasTeste,
          diasAteSomenteLeitura: plano.diasAteSomenteLeitura,
          diasAteBloqueio: plano.diasAteBloqueio,
          publico: plano.publico,
          ativo: plano.ativo,
          ordem: plano.ordem,
        }
      : NOVO,
  )
  const [erro, setErro] = useState<string>()
  const [salvando, setSalvando] = useState(false)
  const campo = <K extends keyof FormPlano>(k: K, valor: FormPlano[K]) => setV((x) => ({ ...x, [k]: valor }))

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const r = planoSchema.safeParse(v)
    if (!r.success) return setErro(r.error.issues[0]?.message)
    setSalvando(true)
    try {
      await plataformaApi.salvarPlano(plano?.id ?? null, v)
      toast.success('Plano salvo.')
      await queryClient.invalidateQueries({ queryKey: ['plataforma'] })
      onFechar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <FormDialog aberto largo onAbertoChange={(x) => !x && onFechar()} titulo={plano ? `Plano ${plano.nome}` : 'Novo plano'} descricao="Preço novo vale para quem assinar ou trocar de plano; quem já paga mantém o valor combinado." salvando={salvando} onSubmit={salvar}>
      {erro && <p className="rounded-lg bg-coral/10 p-2 text-sm text-coral-escuro">{erro}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <CampoFormulario id="pl-codigo" rotulo="Código *">
          <Input id="pl-codigo" value={v.codigo} disabled={Boolean(plano)} onChange={(e) => campo('codigo', e.target.value)} />
        </CampoFormulario>
        <CampoFormulario id="pl-nome" rotulo="Nome *">
          <Input id="pl-nome" value={v.nome} onChange={(e) => campo('nome', e.target.value)} />
        </CampoFormulario>
        <CampoFormulario id="pl-valor" rotulo="Mensalidade (R$) *">
          <Input id="pl-valor" inputMode="decimal" value={String(v.valorMensal)} onChange={(e) => campo('valorMensal', e.target.value)} />
        </CampoFormulario>
      </div>
      <CampoFormulario id="pl-desc" rotulo="Descrição (aparece na página de planos)">
        <Input id="pl-desc" value={v.descricao} onChange={(e) => campo('descricao', e.target.value)} />
      </CampoFormulario>
      <div className="grid gap-4 sm:grid-cols-5">
        <CampoFormulario id="pl-limite" rotulo="Usuários (vazio = sem limite)">
          <Input id="pl-limite" inputMode="numeric" value={v.limiteUsuarios == null ? '' : String(v.limiteUsuarios)} onChange={(e) => campo('limiteUsuarios', e.target.value === '' ? null : (e.target.value as never))} />
        </CampoFormulario>
        <CampoFormulario id="pl-teste" rotulo="Dias de teste">
          <Input id="pl-teste" inputMode="numeric" value={String(v.diasTeste)} onChange={(e) => campo('diasTeste', e.target.value as never)} />
        </CampoFormulario>
        <CampoFormulario id="pl-leitura" rotulo="Só leitura após (dias)">
          <Input id="pl-leitura" inputMode="numeric" value={String(v.diasAteSomenteLeitura)} onChange={(e) => campo('diasAteSomenteLeitura', e.target.value as never)} />
        </CampoFormulario>
        <CampoFormulario id="pl-bloqueio" rotulo="Bloqueio após (dias)">
          <Input id="pl-bloqueio" inputMode="numeric" value={String(v.diasAteBloqueio)} onChange={(e) => campo('diasAteBloqueio', e.target.value as never)} />
        </CampoFormulario>
        <CampoFormulario id="pl-ordem" rotulo="Ordem">
          <Input id="pl-ordem" inputMode="numeric" value={String(v.ordem)} onChange={(e) => campo('ordem', e.target.value as never)} />
        </CampoFormulario>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Módulos (Dashboard, Configurações, Usuários e Permissões entram sempre)</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODULOS.filter((m) => !MODULOS_ESSENCIAIS.includes(m)).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <Checkbox checked={v.modulos.includes(m)} onChange={(e) => campo('modulos', e.target.checked ? [...v.modulos, m] : v.modulos.filter((x) => x !== m))} />
              {MODULO_ROTULOS[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox checked={v.publico} onChange={(e) => campo('publico', e.target.checked)} /> À venda (aparece no cadastro e na troca de plano)
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={v.ativo} onChange={(e) => campo('ativo', e.target.checked)} /> Ativo
        </label>
      </div>
    </FormDialog>
  )
}

/** Planos vendidos: preço, módulos, limite de usuários, teste grátis e prazos do bloqueio. */
export function PlanosPlataformaPage() {
  const consulta = useQuery({ queryKey: ['plataforma', 'planos'], queryFn: plataformaApi.planos })
  const [editando, setEditando] = useState<PlanoPlataforma | null | 'novo'>(null)

  return (
    <>
      <CabecalhoPlataforma
        sobretitulo="Catálogo"
        titulo="Planos"
        subtitulo="O que cada plano libera e quanto custa. Preço novo vale para quem assinar ou trocar de plano."
        acoes={
          <Button onClick={() => setEditando('novo')}>
            <Plus /> Novo plano
          </Button>
        }
      />
      {consulta.isPending ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-3xl" />
          ))}
        </div>
      ) : consulta.isError ? (
        <Secao>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Secao>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {consulta.data.map((p) => {
            const modulos = p.modulos.filter((m) => !MODULOS_ESSENCIAIS.includes(m as Modulo))
            return (
              <article key={p.id} className={cn('flex min-w-0 flex-col overflow-hidden rounded-3xl bg-card shadow-suave', !p.ativo && 'opacity-60')}>
                <div className="relative bg-grafite p-5 text-white sm:p-6">
                  <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-marca/20 blur-2xl" aria-hidden="true" />
                  <div className="relative flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-titulo text-2xl font-extrabold">{p.nome}</h2>
                      <p className="font-mono text-xs text-white/50">{p.codigo}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label={`Editar ${p.nome}`} onClick={() => setEditando(p)}>
                      <Pencil />
                    </Button>
                  </div>
                  <p className="relative mt-4">
                    <span className="font-titulo text-4xl font-extrabold tabular-nums">{formatarMoeda(p.valorMensal)}</span>
                    <span className="text-sm text-white/60">/mês</span>
                  </p>
                  <div className="relative mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                    <span className="rounded-full bg-marca/15 px-2.5 py-1 text-marca ring-1 ring-marca/30">{p.assinaturas} empresa(s)</span>
                    {!p.publico && <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/80 ring-1 ring-white/15">Fora da venda</span>}
                    {!p.ativo && <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/80 ring-1 ring-white/15">Inativo</span>}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-4 p-5 text-sm sm:p-6">
                  {p.descricao && <p className="text-texto-secundario">{p.descricao}</p>}
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ['Usuários', p.limiteUsuarios ? String(p.limiteUsuarios) : '∞'],
                      ['Teste', `${p.diasTeste} d`],
                      ['Bloqueio', `${p.diasAteBloqueio} d`],
                    ].map(([r, v]) => (
                      <div key={r} className="rounded-xl bg-fundo p-2">
                        <dt className="text-[0.6875rem] text-texto-secundario">{r}</dt>
                        <dd className="font-titulo text-lg font-extrabold text-tinta">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs text-texto-secundario">Com atraso: só leitura a partir de {p.diasAteSomenteLeitura} dias, bloqueio com {p.diasAteBloqueio}.</p>
                  <ul className="mt-auto flex flex-wrap gap-1.5">
                    {modulos.map((m) => (
                      <li key={m} className="rounded-full bg-fundo px-2.5 py-1 text-xs font-medium text-tinta ring-1 ring-border">
                        {MODULO_ROTULOS[m as keyof typeof MODULO_ROTULOS] ?? m}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {editando && <PlanoDialog plano={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} />}
    </>
  )
}
