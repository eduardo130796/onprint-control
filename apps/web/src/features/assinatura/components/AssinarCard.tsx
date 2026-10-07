import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Loader2, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { FORMA_ASSINATURA_ROTULOS, assinarSchema, formatarDataSimples, formatarMoeda, type FormaAssinatura, type MinhaAssinatura } from '@onprint/shared'
import { assinaturaApi } from '@/api/assinatura'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { mascaraCpfCnpj } from '@/lib/mascaras'
import { cn } from '@/lib/utils'

const FORMAS: { valor: FormaAssinatura; Icone: typeof QrCode; detalhe: string }[] = [
  { valor: 'pix_boleto', Icone: QrCode, detalhe: 'Todo mês chega a cobrança; você paga por PIX, boleto ou cartão na hora.' },
  { valor: 'cartao', Icone: CreditCard, detalhe: 'Informa o cartão no 1º pagamento e as próximas mensalidades são cobradas sozinhas.' },
]

/** Assinatura pelo pagamento online: escolhe plano, forma e documento; abre a 1ª cobrança do Asaas. */
export function AssinarCard({ a }: { a: MinhaAssinatura }) {
  const queryClient = useQueryClient()
  const [plano, setPlano] = useState(a.plano.codigo)
  const [forma, setForma] = useState<FormaAssinatura>(a.formaPagamento ?? 'pix_boleto')
  const [documento, setDocumento] = useState(mascaraCpfCnpj(a.documentoSugerido))
  const [erro, setErro] = useState<string>()
  const assinar = useMutation({ mutationFn: assinaturaApi.assinar, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assinatura'] }) })
  const escolhido = a.planos.find((p) => p.codigo === plano)
  const noTeste = a.situacao === 'teste' && a.testeAte && a.acesso.diasRestantesTeste !== null

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const dados = assinarSchema.safeParse({ plano, forma, cpfCnpj: documento })
    if (!dados.success) return setErro(dados.error.issues[0]?.message)
    try {
      const r = await assinar.mutateAsync({ plano, forma, cpfCnpj: documento })
      // O navegador pode barrar a nova aba (veio depois de uma espera): o botão "Pagar agora" fica na tela
      if (r.linkPagamento) window.open(r.linkPagamento, '_blank', 'noopener')
      toast.success('Assinatura criada. Se a página de pagamento não abriu, use o botão "Pagar agora".', { duration: 8000 })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{a.situacao === 'teste' ? 'Assinar agora' : 'Assinar de novo'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-5" noValidate>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Plano</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {a.planos.map((p) => (
                <label key={p.codigo} className={cn('cursor-pointer rounded-xl border p-3 text-sm', plano === p.codigo ? 'border-marca ring-2 ring-marca' : 'border-border hover:bg-fundo')}>
                  <input type="radio" name="plano" value={p.codigo} checked={plano === p.codigo} onChange={() => setPlano(p.codigo)} className="sr-only" />
                  <span className="block font-semibold text-grafite">{p.nome}</span>
                  <span className="block font-bold">{formatarMoeda(p.valorMensal)}/mês</span>
                  <span className="block text-xs text-texto-secundario">{p.limiteUsuarios ? `Até ${p.limiteUsuarios} usuários` : 'Usuários ilimitados'}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Forma de pagamento</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {FORMAS.map(({ valor, Icone, detalhe }) => (
                <label key={valor} className={cn('flex cursor-pointer gap-3 rounded-xl border p-3 text-sm', forma === valor ? 'border-marca ring-2 ring-marca' : 'border-border hover:bg-fundo')}>
                  <input type="radio" name="forma" value={valor} checked={forma === valor} onChange={() => setForma(valor)} className="sr-only" />
                  <Icone className="mt-0.5 h-5 w-5 shrink-0 text-marca-escuro" aria-hidden="true" />
                  <span>
                    <span className="block font-semibold text-grafite">{FORMA_ASSINATURA_ROTULOS[valor]}</span>
                    <span className="block text-xs text-texto-secundario">{detalhe}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <CampoFormulario id="as-doc" rotulo="CNPJ (ou CPF) para a cobrança e a nota fiscal *" erro={erro}>
            <Input
              id="as-doc"
              inputMode="numeric"
              value={documento}
              onChange={(e) => {
                setDocumento(mascaraCpfCnpj(e.target.value))
                setErro(undefined)
              }}
            />
          </CampoFormulario>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={assinar.isPending}>
              {assinar.isPending && <Loader2 className="animate-spin" />}
              Assinar {escolhido ? `${escolhido.nome} por ${formatarMoeda(escolhido.valorMensal)}/mês` : ''}
            </Button>
            <p className="text-xs text-texto-secundario">
              {noTeste
                ? `A 1ª mensalidade vence no fim do teste (${formatarDataSimples(a.testeAte)}): você não perde nenhum dia grátis.`
                : 'A 1ª mensalidade vence hoje. O acesso volta ao normal assim que o pagamento for confirmado.'}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
