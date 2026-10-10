import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2, Clock, Copy, Globe, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { dominioVitrineSchema, type VitrineConfig } from '@onprint/shared'
import { CHAVE_VITRINE_CONFIG, vitrineApi } from '@/api/vitrine'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Valor do DNS com botão de copiar (o dono da gráfica cola no painel do Registro.br, Hostinger…) */
function ValorDns({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 1800)
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }
  return (
    <span className="flex min-w-0 items-center gap-1">
      <code className="min-w-0 break-all rounded bg-card px-1.5 py-0.5 text-xs font-semibold text-tinta ring-1 ring-border">{valor}</code>
      <button
        type="button"
        onClick={() => void copiar()}
        aria-label={`Copiar ${valor}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-texto-secundario hover:bg-fundo hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
      >
        {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  )
}

/** Linha "Tipo · Nome · Valor" do registro que a gráfica cria no DNS */
function RegistroDns({ tipo, nome, valor }: { tipo: string; nome: string; valor: string | null }) {
  return (
    <div className="grid grid-cols-[3.25rem_3.5rem_minmax(0,1fr)] items-center gap-2 py-2 text-xs first:pt-0 last:pb-0">
      <span className="font-semibold text-tinta">{tipo}</span>
      <code className="text-xs font-semibold text-tinta">{nome}</code>
      {valor ? <ValorDns valor={valor} /> : <span className="text-texto-secundario">IP do servidor (peça ao suporte da GrafyGo)</span>}
    </div>
  )
}

/**
 * Domínio próprio da vitrine (www.suagrafica.com.br): cadastrar, o que apontar no DNS e verificar.
 * Verificado, os links que o sistema gera (compartilhar, catálogo, QR code) passam a usar ele.
 */
export function DominioProprio({ config, podeEditar }: { config: VitrineConfig; podeEditar: boolean }) {
  const queryClient = useQueryClient()
  const d = config.dominio
  const [editando, setEditando] = useState(!d.endereco)
  const [texto, setTexto] = useState(d.endereco ?? '')
  const [erro, setErro] = useState<string | null>(null)

  const salvar = useMutation({
    mutationFn: (dominio: string | null) => vitrineApi.salvarDominio(dominio),
    onSuccess: (c) => queryClient.setQueryData(CHAVE_VITRINE_CONFIG, c),
  })
  const verificar = useMutation({
    mutationFn: vitrineApi.verificarDominio,
    onSuccess: (r) => {
      queryClient.setQueryData(CHAVE_VITRINE_CONFIG, r.config)
      if (r.verificado) toast.success(r.mensagem)
      else toast.warning(r.mensagem, { duration: 8000 })
    },
    onError: (e) => toast.error((e as Error).message),
  })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const r = dominioVitrineSchema.safeParse({ dominio: texto })
    if (!r.success) return setErro(r.error.issues[0]?.message ?? 'Domínio inválido.')
    setErro(null)
    try {
      const c = await salvar.mutateAsync(r.data.dominio)
      setEditando(!c.dominio.endereco)
      setTexto(c.dominio.endereco ?? '')
      toast.success(c.dominio.endereco ? 'Domínio cadastrado. Agora faça o apontamento no DNS.' : 'Domínio removido.')
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  async function remover() {
    try {
      await salvar.mutateAsync(null)
      setTexto('')
      setEditando(true)
      toast.success('Domínio removido. O site continua no endereço da GrafyGo.')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const comWww = Boolean(d.endereco?.startsWith('www.'))
  const raiz = d.endereco ? (comWww ? d.endereco.slice(4) : d.endereco) : ''
  const verificado = Boolean(d.endereco && d.verificadoEm)

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4 text-texto-secundario" /> Domínio próprio
        </CardTitle>
        <CardDescription>
          Opcional. Com o seu domínio (ex.: www.suagrafica.com.br), o site abre por ele. Sem domínio, continua em <span className="break-all">{d.subdominio}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {d.endereco && !editando ? (
          <div className={cn('rounded-xl border p-3', verificado ? 'border-verde/30 bg-verde/5' : 'border-amber-200 bg-amber-50')}>
            <div className="flex items-start gap-2">
              {verificado ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verde" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-semibold text-tinta">{d.endereco}</p>
                <p className={cn('text-xs', verificado ? 'text-texto-secundario' : 'text-amber-900')}>
                  {verificado ? 'Funcionando: os links e o QR code já usam este endereço.' : 'Aguardando o apontamento no DNS.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          podeEditar && (
            <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-2">
              <label htmlFor="vit-dominio" className="text-sm font-medium text-tinta">
                Seu domínio
              </label>
              <div className="flex gap-2">
                <Input
                  id="vit-dominio"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="www.suagrafica.com.br"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="url"
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? 'vit-dominio-erro' : undefined}
                />
                <Button type="submit" disabled={salvar.isPending || !texto.trim()}>
                  {salvar.isPending && <Loader2 className="animate-spin" />}
                  Usar
                </Button>
              </div>
              {erro && (
                <p id="vit-dominio-erro" className="text-xs font-medium text-coral-escuro">
                  {erro}
                </p>
              )}
              <p className="text-xs text-texto-secundario">Ainda não tem? Registre em registro.br (cerca de R$ 40 por ano).</p>
              {d.endereco && (
                <Button type="button" variant="ghost" size="sm" onClick={() => {
                    setEditando(false)
                    setTexto(d.endereco ?? '')
                    setErro(null)
                  }}>
                  Cancelar
                </Button>
              )}
            </form>
          )
        )}

        {d.endereco && !editando && !verificado && (
          <div className="space-y-3 rounded-xl bg-fundo p-3">
            <p className="text-xs text-texto-secundario">
              No painel onde você registrou o domínio (Registro.br, Hostinger, GoDaddy…), em <strong className="text-tinta">DNS</strong>, crie:
            </p>
            <div className="divide-y divide-border">
              {comWww ? <RegistroDns tipo="CNAME" nome="www" valor={d.subdominio} /> : <RegistroDns tipo="A" nome="@" valor={d.ip} />}
            </div>
            {comWww && (
              <p className="text-xs text-texto-secundario">
                Para quem digitar só <strong className="text-tinta">{raiz}</strong> também cair no site, crie um registro <strong className="text-tinta">A</strong> com nome{' '}
                <strong className="text-tinta">@</strong> e valor {d.ip ? <ValorDns valor={d.ip} /> : 'o IP do servidor (peça ao suporte)'}
              </p>
            )}
            <p className="text-xs text-texto-secundario">Depois, toque em "Verificar". A mudança costuma valer em minutos, mas pode levar algumas horas.</p>
          </div>
        )}

        {d.endereco && !editando && podeEditar && (
          <div className="flex flex-wrap gap-2">
            {!verificado && (
              <Button type="button" size="sm" onClick={() => verificar.mutate()} disabled={verificar.isPending}>
                {verificar.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Verificar
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setEditando(true)}>
              Trocar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void remover()} disabled={salvar.isPending} className="text-coral-escuro hover:text-coral-escuro">
              Remover
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
