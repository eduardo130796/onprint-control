import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { MODULOS, MODULOS_ESSENCIAIS, MODULO_ROTULOS, formatarMoeda, planoSchema, type Modulo, type PlanoInput, type PlanoPlataforma } from '@onprint/shared'
import { PageHeader } from '@/components/layout/PageHeader'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'

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
      <PageHeader
        titulo="Planos"
        subtitulo="O que cada plano libera e quanto custa."
        acoes={
          <Button onClick={() => setEditando('novo')}>
            <Plus /> Novo plano
          </Button>
        }
      />
      {consulta.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {consulta.data.map((p) => (
            <Card key={p.id} className={cn('space-y-2 p-5 text-sm', !p.ativo && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-titulo text-lg font-extrabold text-grafite">{p.nome}</h2>
                  <p className="text-xs text-texto-secundario">
                    {p.codigo} · {p.assinaturas} empresa(s){!p.publico && ' · fora da venda'}
                    {!p.ativo && ' · inativo'}
                  </p>
                </div>
                <Button size="icon" variant="ghost" aria-label={`Editar ${p.nome}`} onClick={() => setEditando(p)}>
                  <Pencil />
                </Button>
              </div>
              <p className="text-2xl font-extrabold text-grafite">{formatarMoeda(p.valorMensal)}<span className="text-sm font-medium text-texto-secundario">/mês</span></p>
              <p className="text-texto-secundario">{p.descricao}</p>
              <p>{p.limiteUsuarios ? `Até ${p.limiteUsuarios} usuários` : 'Usuários ilimitados'} · teste de {p.diasTeste} dias</p>
              <p className="text-xs text-texto-secundario">Atraso: só leitura com {p.diasAteSomenteLeitura} dias, bloqueio com {p.diasAteBloqueio}.</p>
              <p className="text-xs">{p.modulos.map((m) => MODULO_ROTULOS[m as keyof typeof MODULO_ROTULOS] ?? m).join(', ')}</p>
            </Card>
          ))}
        </div>
      )}
      {editando && <PlanoDialog plano={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} />}
    </>
  )
}
