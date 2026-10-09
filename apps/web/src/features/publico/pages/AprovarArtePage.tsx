import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, History, Loader2, Palette, PencilLine } from 'lucide-react'
import { formatarDataHora, type ArtePublica } from '@onprint/shared'
import type { LinkPublico } from '@/api/comercial'
import { artePublicaApi } from '@/api/producao'
import { Logo } from '@/components/layout/Logo'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const metros = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '')

function Visualizacao({ arte }: { arte: ArtePublica }) {
  const a = arte.arquivo
  if (a?.visualizavel && a.mime === 'application/pdf') {
    return <iframe src={a.url} title="Arte" className="h-[70vh] w-full rounded-xl border border-border bg-white" />
  }
  const imagem = a?.visualizavel ? a.url : arte.miniaturaUrl
  return (
    <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-white">
      {imagem ? <img src={imagem} alt="Arte para aprovação" className="max-h-[70vh] w-auto object-contain" /> : <Palette className="h-12 w-12 text-texto-secundario" />}
    </div>
  )
}

function Resposta({ link, arte }: { link: LinkPublico; arte: ArtePublica }) {
  const queryClient = useQueryClient()
  const [modo, setModo] = useState<'aprovar' | 'ajuste'>('aprovar')
  const [nome, setNome] = useState('')
  const [aceite, setAceite] = useState(false)
  const [comentario, setComentario] = useState('')
  const [erro, setErro] = useState<string>()
  const enviar = useMutation({
    mutationFn: () => (modo === 'aprovar' ? artePublicaApi.aprovar(link, nome) : artePublicaApi.pedirAjuste(link, nome, comentario)),
    onSuccess: (r) => queryClient.setQueryData(['publico', 'arte', link.empresa, link.token], r),
    onError: (e) => setErro(e.message),
  })

  if (!arte.podeResponder) return null
  const valido = nome.trim().length >= 3 && (modo === 'aprovar' ? aceite : comentario.trim().length >= 5)
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap gap-2">
          <Button variant={modo === 'aprovar' ? 'default' : 'outline'} onClick={() => setModo('aprovar')}>
            <CheckCircle2 /> Aprovar arte
          </Button>
          <Button variant={modo === 'ajuste' ? 'secondary' : 'outline'} onClick={() => setModo('ajuste')}>
            <PencilLine /> Pedir ajuste
          </Button>
        </div>
        <CampoFormulario id="arte-nome" rotulo="Seu nome">
          <Input id="arte-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
        </CampoFormulario>
        {modo === 'aprovar' ? (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5" />
            Conferi textos, cores, medidas e dados de contato. Autorizo a impressão desta arte.
          </label>
        ) : (
          <CampoFormulario id="arte-ajuste" rotulo="O que precisa mudar?">
            <Textarea id="arte-ajuste" rows={4} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ex.: trocar o telefone para (11) 99999-0000 e aumentar o logo" />
          </CampoFormulario>
        )}
        {erro && <p className="text-sm text-coral-escuro">{erro}</p>}
        <Button
          className="w-full"
          variant={modo === 'aprovar' ? 'default' : 'secondary'}
          disabled={enviar.isPending || !valido}
          onClick={() => {
            setErro(undefined)
            enviar.mutate()
          }}
        >
          {enviar.isPending && <Loader2 className="animate-spin" />}
          {modo === 'aprovar' ? 'Confirmar aprovação' : 'Enviar pedido de ajuste'}
        </Button>
      </CardContent>
    </Card>
  )
}

function Situacao({ arte }: { arte: ArtePublica }) {
  if (!arte.ultimaVersao) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-ambar/10 p-4 text-amber-800">
        <History className="h-6 w-6 shrink-0" /> <p>Existe uma versão mais nova desta arte. Use o link mais recente enviado pelo seu atendente.</p>
      </div>
    )
  }
  if (arte.status === 'aprovada') {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-verde/10 p-4 text-green-800">
        <CheckCircle2 className="h-6 w-6 shrink-0" />
        <p>
          <strong>Arte aprovada</strong>
          {arte.aprovadaEm && ` em ${formatarDataHora(arte.aprovadaEm)}`}. Obrigado! Ela já pode seguir para a impressão.
        </p>
      </div>
    )
  }
  if (arte.status === 'ajuste_solicitado') {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-sky-50 p-4 text-sky-800">
        <PencilLine className="h-6 w-6 shrink-0" /> <p>Recebemos seu pedido de ajuste. Você receberá uma nova versão para aprovar.</p>
      </div>
    )
  }
  return null
}

/** Página pública /arte/:empresa/:token: o cliente vê a arte e aprova ou pede ajuste, sem login. */
export function AprovarArtePage() {
  const { empresa = '', token = '' } = useParams()
  const link = { empresa, token }
  const consulta = useQuery({ queryKey: ['publico', 'arte', empresa, token], queryFn: () => artePublicaApi.obter(link), retry: false })
  const a = consulta.data

  return (
    <div className="min-h-screen bg-fundo">
      <header className="flex h-16 items-center bg-grafite px-4">
        {a?.empresa.logoUrl ? <img src={a.empresa.logoUrl} alt={a.empresa.nome} className="h-10 max-w-[180px] rounded bg-white/90 object-contain p-1" /> : <Logo claro />}
        {a && <span className="ml-3 font-semibold text-white">{a.empresa.nome}</span>}
      </header>
      <main className="mx-auto max-w-4xl space-y-4 p-4 pt-8">
        {consulta.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : !a ? (
          <Card>
            <EmptyState icone={Palette} titulo="Arte não encontrada" descricao="O link pode estar incompleto. Confira a mensagem recebida ou fale com seu atendente." />
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm text-texto-secundario">
                  Pedido {a.pedido.numero} · {a.pedido.cliente}
                </p>
                <h1 className="text-2xl font-semibold text-tinta">{a.item.descricao}</h1>
                <p className="text-sm text-texto-secundario">
                  Versão {a.versao} · Qtd. {Number(a.item.quantidade).toLocaleString('pt-BR')}
                  {a.item.largura && ` · ${metros(a.item.largura)} × ${metros(a.item.altura)} m`}
                </p>
              </div>
              {a.arquivo && (
                <Button variant="outline" asChild>
                  <a href={a.arquivo.url} target="_blank" rel="noreferrer">
                    <Download /> Baixar arquivo
                  </a>
                </Button>
              )}
            </div>
            <Situacao arte={a} />
            <Visualizacao arte={a} />
            <Resposta link={link} arte={a} />
            {a.comentarios.length > 0 && (
              <Card>
                <CardContent className="space-y-2 pt-6">
                  <p className="text-sm font-semibold text-tinta">Conversa sobre esta arte</p>
                  {a.comentarios.map((c, i) => (
                    <div key={i} className={cn('rounded-lg p-2.5 text-sm', c.origem === 'cliente' ? 'bg-ambar/10' : 'bg-fundo')}>
                      <p className="text-xs text-texto-secundario">
                        <strong className="text-texto">{c.autorNome}</strong> · {formatarDataHora(c.createdAt)}
                      </p>
                      <p className="whitespace-pre-line">{c.texto}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  )
}
