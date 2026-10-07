import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, Copy, FileDown, Link2, Loader2, MessageSquareText, Printer, RotateCcw, Save, Send, ShoppingCart, ThumbsDown, Handshake } from 'lucide-react'
import { toast } from 'sonner'
import type { OrcamentoDetalhe } from '@onprint/shared'
import { orcamentosApi, templatesLeituraApi } from '@/api/comercial'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/form-controls'
import { useImpressao } from '@/features/impressao/useImpressao'
import { useMutacao } from '@/hooks/useMutacao'
import { usePermissoes } from '@/hooks/usePermission'
import { messagingProvider } from '@/integrations/messaging'
import { linkAprovacao, mensagemDoOrcamento } from '../../mensagem'
import { ConverterDialog } from './ConverterDialog'

interface AcoesProps {
  orcamento?: OrcamentoDetalhe
  editavel: boolean
  alterado: boolean
  salvando: boolean
  onSalvar: () => void
}

type Dialogo = 'aprovar' | 'recusar' | 'converter' | null

/** Barra de ações do orçamento conforme o status e as permissões. */
export function AcoesOrcamento({ orcamento: o, editavel, alterado, salvando, onSalvar }: AcoesProps) {
  const navigate = useNavigate()
  const pode = usePermissoes()
  const impressao = useImpressao()
  const templates = useQuery({ queryKey: ['templates', 'ativos'], queryFn: templatesLeituraApi.listar, staleTime: 5 * 60 * 1000 })
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [texto, setTexto] = useState('')
  const acao = useMutacao(['orcamentos', 'solicitacoes'], (f: () => Promise<OrcamentoDetalhe>) => f())

  function executar(f: () => Promise<OrcamentoDetalhe>, sucesso: string, depois?: (r: OrcamentoDetalhe) => void) {
    acao.mutate(f, {
      onSuccess: (r) => {
        toast.success(sucesso)
        depois?.(r)
      },
      onError: (e) => toast.error(e.message),
    })
  }

  async function copiarMensagem() {
    if (!o) return
    await messagingProvider.enviar({ texto: mensagemDoOrcamento(o, templates.data), destinatario: o.cliente.whatsapp ?? undefined })
    toast.success('Mensagem copiada. Cole no WhatsApp do cliente.', {
      action: o.status === 'rascunho' ? { label: 'Marcar como enviado', onClick: () => executar(() => orcamentosApi.enviar(o.id), 'Orçamento marcado como enviado.') } : undefined,
    })
  }

  const status = o?.status
  const podeEditar = pode('orcamentos', 'editar')
  const ocupado = acao.isPending

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editavel && (
        <Button onClick={onSalvar} disabled={salvando || (Boolean(o) && !alterado)}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />} {o ? 'Salvar' : 'Criar orçamento'}
        </Button>
      )}
      {o && (
        <>
          <Button variant="outline" onClick={() => void copiarMensagem()} disabled={alterado}>
            <MessageSquareText /> Copiar mensagem
          </Button>
          <Button variant="outline" onClick={() => void impressao.orcamento(o, 'imprimir')} disabled={Boolean(impressao.ocupado) || alterado} title={alterado ? 'Salve antes de imprimir' : undefined}>
            {impressao.ocupado === `orcamento:${o.id}:imprimir` ? <Loader2 className="animate-spin" /> : <Printer />} Imprimir
          </Button>
          <Button variant="outline" onClick={() => void impressao.orcamento(o, 'baixar')} disabled={Boolean(impressao.ocupado) || alterado}>
            {impressao.ocupado === `orcamento:${o.id}:baixar` ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
          </Button>
          {status === 'aprovado' && pode('pedidos', 'criar') && podeEditar && (
            <Button variant="secondary" onClick={() => setDialogo('converter')}>
              <ShoppingCart /> Converter em pedido
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={ocupado}>
                {ocupado ? <Loader2 className="animate-spin" /> : null} Mais <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard.writeText(linkAprovacao(o.tokenPublico))
                  toast.success('Link de aprovação copiado.')
                }}
              >
                <Link2 /> Copiar link de aprovação
              </DropdownMenuItem>
              {podeEditar && status === 'rascunho' && (
                <DropdownMenuItem onSelect={() => executar(() => orcamentosApi.enviar(o.id), 'Marcado como enviado.')}>
                  <Send /> Marcar como enviado
                </DropdownMenuItem>
              )}
              {podeEditar && status === 'enviado' && (
                <DropdownMenuItem onSelect={() => executar(() => orcamentosApi.negociacao(o.id), 'Em negociação.')}>
                  <Handshake /> Em negociação
                </DropdownMenuItem>
              )}
              {podeEditar && ['rascunho', 'enviado', 'em_negociacao'].includes(status ?? '') && (
                <>
                  <DropdownMenuItem onSelect={() => setDialogo('aprovar')}>
                    <CheckCircle2 /> Registrar aprovação
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialogo('recusar')} className="text-coral-escuro focus:text-coral-escuro">
                    <ThumbsDown /> Registrar recusa
                  </DropdownMenuItem>
                </>
              )}
              {podeEditar && ['aprovado', 'recusado', 'expirado'].includes(status ?? '') && (
                <DropdownMenuItem onSelect={() => executar(() => orcamentosApi.reabrir(o.id), 'Orçamento reaberto para negociação.')}>
                  <RotateCcw /> Reabrir negociação
                </DropdownMenuItem>
              )}
              {pode('orcamentos', 'criar') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => executar(() => orcamentosApi.duplicar(o.id), 'Orçamento duplicado.', (r) => navigate(`/orcamentos/${r.id}`))}>
                    <Copy /> Duplicar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {o && (dialogo === 'aprovar' || dialogo === 'recusar') && (
        <FormDialog
          aberto
          onAbertoChange={(v) => !v && setDialogo(null)}
          titulo={dialogo === 'aprovar' ? 'Registrar aprovação do cliente' : 'Registrar recusa'}
          descricao={dialogo === 'aprovar' ? 'Use quando o cliente aprovou por outro canal (WhatsApp, telefone, balcão).' : undefined}
          textoSalvar={dialogo === 'aprovar' ? 'Aprovar' : 'Recusar'}
          salvando={acao.isPending}
          onSubmit={(e) => {
            e.preventDefault()
            const f = dialogo === 'aprovar' ? () => orcamentosApi.aprovar(o.id, texto) : () => orcamentosApi.recusar(o.id, texto)
            executar(f, dialogo === 'aprovar' ? 'Aprovação registrada.' : 'Recusa registrada.', () => {
              setDialogo(null)
              setTexto('')
            })
          }}
        >
          {dialogo === 'aprovar' ? (
            <Input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Quem aprovou (ex.: João, pelo WhatsApp)" aria-label="Quem aprovou" />
          ) : (
            <Textarea autoFocus rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Motivo da recusa (ex.: preço, prazo, fechou com concorrente)" aria-label="Motivo" />
          )}
        </FormDialog>
      )}
      {o && dialogo === 'converter' && <ConverterDialog orcamento={o} onFechar={() => setDialogo(null)} />}
    </div>
  )
}
