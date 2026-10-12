import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Link2, Loader2, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatarDataHora, normalizarSlugEmpresa, slugEmpresaSchema, type LinkVitrine } from '@onprint/shared'
import { CHAVE_LINK_VITRINE, CHAVE_VITRINE_CONFIG, vitrineApi } from '@/api/vitrine'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

/** Situação do nome digitado: erro de formato (na hora), consultando, livre ou já usado (pela API) */
function useDisponibilidade(texto: string, atual: string) {
  const atrasado = useDebounce(texto, 400)
  const local = slugEmpresaSchema.safeParse(atrasado)
  const consultar = local.success && atrasado !== atual
  const consulta = useQuery({
    queryKey: ['link-vitrine-disponivel', atrasado],
    queryFn: () => vitrineApi.linkDisponivel(atrasado),
    enabled: consultar,
    staleTime: 30_000,
  })
  if (texto !== atrasado) return { estado: 'digitando' as const }
  if (!local.success) return { estado: 'invalido' as const, motivo: local.error.issues[0]?.message ?? 'Nome inválido.' }
  if (atrasado === atual) return { estado: 'atual' as const }
  if (consulta.isPending) return { estado: 'consultando' as const }
  if (consulta.isError) return { estado: 'invalido' as const, motivo: (consulta.error as Error).message }
  return consulta.data.disponivel ? { estado: 'livre' as const } : { estado: 'invalido' as const, motivo: consulta.data.motivo ?? 'Nome indisponível.' }
}

function Editor({ link, aoFechar }: { link: LinkVitrine; aoFechar: () => void }) {
  const queryClient = useQueryClient()
  const { atualizarMarca } = useAuth()
  const [texto, setTexto] = useState(link.slug)
  const situacao = useDisponibilidade(texto, link.slug)

  const salvar = useMutation({
    mutationFn: vitrineApi.salvarLinkVitrine,
    onSuccess: (novo) => {
      queryClient.setQueryData(CHAVE_LINK_VITRINE, novo)
      void queryClient.invalidateQueries({ queryKey: CHAVE_VITRINE_CONFIG })
      // Links de aprovação e de arte gerados daqui em diante já saem com o nome novo
      atualizarMarca({ slug: novo.slug })
      toast.success(`Pronto! A vitrine agora abre em ${novo.slug}${novo.sufixo}.`)
      aoFechar()
    },
    onError: (e) => toast.error((e as Error).message),
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (situacao.estado === 'livre') salvar.mutate(texto)
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-3">
      <label htmlFor="link-vitrine" className="text-sm font-medium text-tinta">
        Novo nome do endereço
      </label>
      <div
        className={cn(
          'flex h-10 items-center overflow-hidden rounded-lg border border-input bg-card text-sm focus-within:ring-2 focus-within:ring-ring',
          situacao.estado === 'invalido' && 'border-coral',
        )}
      >
        <span className="hidden shrink-0 pl-3 text-texto-secundario sm:inline">{link.prefixo}</span>
        <input
          id="link-vitrine"
          value={texto}
          onChange={(e) => setTexto(normalizarSlugEmpresa(e.target.value, { digitando: true }))}
          onBlur={() => setTexto((t) => normalizarSlugEmpresa(t))}
          maxLength={40}
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={situacao.estado === 'invalido' || undefined}
          aria-describedby="link-vitrine-situacao"
          className="h-full min-w-0 flex-1 bg-transparent pl-3 font-semibold text-tinta outline-none sm:pl-0"
        />
        <span className="shrink-0 truncate pr-3 text-texto-secundario">{link.sufixo}</span>
      </div>
      <p id="link-vitrine-situacao" aria-live="polite" className="flex min-h-5 items-center gap-1.5 text-xs">
        {situacao.estado === 'consultando' || situacao.estado === 'digitando' ? (
          <span className="flex items-center gap-1.5 text-texto-secundario">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo…
          </span>
        ) : situacao.estado === 'livre' ? (
          <span className="flex items-center gap-1.5 font-medium text-verde">
            <Check className="h-3.5 w-3.5 shrink-0" /> <span className="break-all">Disponível: {texto}{link.sufixo}</span>
          </span>
        ) : situacao.estado === 'invalido' ? (
          <span className="flex items-center gap-1.5 font-medium text-coral-escuro">
            <X className="h-3.5 w-3.5" /> {situacao.motivo}
          </span>
        ) : (
          <span className="text-texto-secundario">Este é o endereço atual.</span>
        )}
      </p>
      <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p>
            <strong>Os links antigos continuam funcionando:</strong> quem abrir <span className="break-all">{link.slug}{link.sufixo}</span> cai no
            endereço novo, e os links de aprovação já enviados seguem valendo.
          </p>
          <p>Atualize o QR code impresso e o endereço nas redes sociais quando puder. Dá para trocar uma vez por dia.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={situacao.estado !== 'livre' || salvar.isPending}>
          {salvar.isPending && <Loader2 className="animate-spin" />}
          Salvar endereço
        </Button>
        <Button type="button" variant="ghost" onClick={aoFechar} disabled={salvar.isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

/**
 * Endereço da vitrine ({slug}.grafygo.com.br), que também vai nos links de aprovação: ver e trocar.
 * Usado em Vitrine → Configurar vitrine e em Configurações → Empresa.
 */
export function EnderecoVitrine({ podeEditar }: { podeEditar: boolean }) {
  const consulta = useQuery({ queryKey: CHAVE_LINK_VITRINE, queryFn: vitrineApi.linkVitrine })
  const [editando, setEditando] = useState(false)
  const link = consulta.data

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-texto-secundario" /> Endereço da vitrine
        </CardTitle>
        <CardDescription>O nome da sua empresa no endereço do site e nos links de aprovação enviados aos clientes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!link ? (
          consulta.isError ? (
            <p className="text-sm text-coral-escuro">Não foi possível carregar o endereço.</p>
          ) : (
            <Skeleton className="h-10 w-full" />
          )
        ) : editando ? (
          <Editor link={link} aoFechar={() => setEditando(false)} />
        ) : (
          <>
            <div className="rounded-xl bg-fundo px-3 py-2.5 text-sm">
              <span className="break-all text-texto-secundario">
                <span className="font-semibold text-tinta">{link.slug}</span>
                {link.sufixo}
              </span>
            </div>
            {link.anteriores.length > 0 && (
              <p className="text-xs text-texto-secundario">
                Também abre pelo{link.anteriores.length > 1 ? 's' : ''} nome{link.anteriores.length > 1 ? 's' : ''} anterior{link.anteriores.length > 1 ? 'es' : ''}:{' '}
                <span className="break-all">{link.anteriores.join(', ')}</span>
              </p>
            )}
            {podeEditar && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditando(true)}>
                  <Pencil /> Alterar
                </Button>
                {link.trocaLiberadaEm && <span className="text-xs text-texto-secundario">Nova troca a partir de {formatarDataHora(link.trocaLiberadaEm)}</span>}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
