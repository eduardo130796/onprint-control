import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, FileSearch, Loader2, MessageCircle, ThumbsDown, XCircle } from 'lucide-react'
import { formatarDataHora, formatarDataSimples, formatarMoeda, formatarTelefone, type OrcamentoPublico } from '@onprint/shared'
import { publicoApi, type LinkPublico } from '@/api/comercial'
import { Logo } from '@/components/layout/Logo'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const metros = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '')

function Resposta({ link, orcamento }: { link: LinkPublico; orcamento: OrcamentoPublico }) {
  const queryClient = useQueryClient()
  const [modo, setModo] = useState<'aprovar' | 'recusar'>('aprovar')
  const [nome, setNome] = useState('')
  const [aceite, setAceite] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string>()
  const enviar = useMutation({
    mutationFn: () => (modo === 'aprovar' ? publicoApi.aprovar(link, nome) : publicoApi.recusar(link, motivo)),
    onSuccess: (r) => queryClient.setQueryData(['publico', link.empresa, link.token], r),
    onError: (e) => setErro(e.message),
  })

  if (!orcamento.podeResponder) return null
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex gap-2">
          <Button variant={modo === 'aprovar' ? 'default' : 'outline'} onClick={() => setModo('aprovar')}>
            <CheckCircle2 /> Aprovar
          </Button>
          <Button variant={modo === 'recusar' ? 'destructive' : 'outline'} onClick={() => setModo('recusar')}>
            <ThumbsDown /> Recusar
          </Button>
        </div>
        {modo === 'aprovar' ? (
          <>
            <CampoFormulario id="ap-nome" rotulo="Seu nome completo">
              <Input id="ap-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
            </CampoFormulario>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5" />
              Li o orçamento {orcamento.numero} e aprovo os itens, valores e condições.
            </label>
          </>
        ) : (
          <CampoFormulario id="ap-motivo" rotulo="Conte o motivo (nos ajuda a melhorar)">
            <Textarea id="ap-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </CampoFormulario>
        )}
        {erro && <p className="text-sm text-coral-escuro">{erro}</p>}
        <Button
          className="w-full"
          variant={modo === 'aprovar' ? 'default' : 'destructive'}
          disabled={enviar.isPending || (modo === 'aprovar' ? nome.trim().length < 3 || !aceite : motivo.trim().length < 3)}
          onClick={() => {
            setErro(undefined)
            enviar.mutate()
          }}
        >
          {enviar.isPending && <Loader2 className="animate-spin" />}
          {modo === 'aprovar' ? 'Confirmar aprovação' : 'Enviar recusa'}
        </Button>
      </CardContent>
    </Card>
  )
}

function Situacao({ o }: { o: OrcamentoPublico }) {
  if (o.status === 'aprovado' || o.status === 'convertido') {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-verde/10 p-4 text-green-800">
        <CheckCircle2 className="h-6 w-6 shrink-0" />
        <p>
          <strong>Orçamento aprovado{o.aprovadoPorNome ? ` por ${o.aprovadoPorNome}` : ''}</strong>
          {o.aprovadoEm && ` em ${formatarDataHora(o.aprovadoEm)}`}. Obrigado! Em breve entraremos em contato.
        </p>
      </div>
    )
  }
  if (o.status === 'recusado') {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-coral/10 p-4 text-coral-escuro">
        <XCircle className="h-6 w-6 shrink-0" /> <p>Orçamento recusado. Se mudar de ideia, fale com a gente.</p>
      </div>
    )
  }
  if (o.expirado) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-ambar/10 p-4 text-amber-800">
        <Clock className="h-6 w-6 shrink-0" /> <p>Este orçamento venceu em {formatarDataSimples(o.validade)}. Peça ao atendente uma versão atualizada.</p>
      </div>
    )
  }
  return null
}

/** Página pública: o cliente vê o orçamento e aprova ou recusa, sem login. */
export function AprovarOrcamentoPage() {
  const { empresa = '', token = '' } = useParams()
  const link = { empresa, token }
  const consulta = useQuery({ queryKey: ['publico', empresa, token], queryFn: () => publicoApi.obter(link), retry: false })
  const o = consulta.data

  return (
    <div className="min-h-screen bg-fundo">
      <header className="flex h-16 items-center bg-grafite px-4">
        {o?.empresa.logoUrl ? <img src={o.empresa.logoUrl} alt={o.empresa.nome} className="h-10 max-w-[180px] rounded bg-white/90 object-contain p-1" /> : <Logo claro />}
        {o && <span className="ml-3 font-semibold text-white">{o.empresa.nome}</span>}
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4 pt-8">
        {consulta.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : !o ? (
          <Card>
            <EmptyState icone={FileSearch} titulo="Orçamento não encontrado" descricao="O link pode estar incompleto. Confira a mensagem recebida ou fale com seu atendente." />
          </Card>
        ) : (
          <>
            <div>
              <p className="text-sm text-texto-secundario">Orçamento para {o.cliente.nome}</p>
              <h1 className="text-2xl font-semibold text-grafite">{o.numero}</h1>
              <p className="text-sm text-texto-secundario">Válido até {formatarDataSimples(o.validade)} · produção em {o.prazoDias} dia(s) úteis após a aprovação</p>
            </div>
            <Situacao o={o} />
            <Card>
              <ul className="divide-y divide-border">
                {o.itens.map((i, n) => (
                  <li key={n} className="flex justify-between gap-4 p-4 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{i.descricao}</p>
                      <p className="text-texto-secundario">
                        Qtd. {Number(i.quantidade).toLocaleString('pt-BR')}
                        {i.largura && ` · ${metros(i.largura)}${i.altura ? ` × ${metros(i.altura)}` : ''} m`}
                      </p>
                      {i.acabamentos.length > 0 && <p className="text-xs text-texto-secundario">{i.acabamentos.join(', ')}</p>}
                    </div>
                    <p className="shrink-0 font-medium">{formatarMoeda(i.total)}</p>
                  </li>
                ))}
              </ul>
              <div className="space-y-1 border-t border-border p-4 text-sm">
                {Number(o.desconto) > 0 && <p className="flex justify-between"><span>Desconto</span><span>- {formatarMoeda(o.desconto)}</span></p>}
                {Number(o.acrescimo) > 0 && <p className="flex justify-between"><span>Acréscimo</span><span>{formatarMoeda(o.acrescimo)}</span></p>}
                {Number(o.frete) > 0 && <p className="flex justify-between"><span>Frete / instalação</span><span>{formatarMoeda(o.frete)}</span></p>}
                <p className="flex items-baseline justify-between pt-1">
                  <span className="font-semibold text-grafite">Total</span>
                  <span className="text-2xl font-bold text-grafite">{formatarMoeda(o.total)}</span>
                </p>
              </div>
            </Card>
            {(o.condicoes || o.observacoes) && (
              <Card>
                <CardContent className="space-y-3 pt-6 text-sm">
                  {o.condicoes && <p><strong>Condições:</strong> {o.condicoes}</p>}
                  {o.observacoes && <p><strong>Observações:</strong> {o.observacoes}</p>}
                </CardContent>
              </Card>
            )}
            <Resposta link={link} orcamento={o} />
            {(o.empresa.whatsapp || o.empresa.telefone || o.vendedor) && (
              <p className="flex items-center justify-center gap-2 pb-8 text-sm text-texto-secundario">
                <MessageCircle className="h-4 w-4" /> Dúvidas? {o.vendedor ? `Fale com ${o.vendedor.nome}` : 'Fale com a gente'}
                {(o.empresa.whatsapp || o.empresa.telefone) && `: ${formatarTelefone(o.empresa.whatsapp ?? o.empresa.telefone)}`}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
