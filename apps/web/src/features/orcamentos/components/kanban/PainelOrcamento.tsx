import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileDown, Link2, MessageSquareText, Pencil, Printer, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { formatarDataSimples, formatarMoeda, formatarTelefone, type Orcamento } from '@onprint/shared'
import { orcamentosApi, templatesLeituraApi } from '@/api/comercial'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { AcaoPainel, DadoPainel, PainelCartao } from '@/components/shared/kanban/PainelCartao'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { useImpressao } from '@/features/impressao/useImpressao'
import { usePermissoes } from '@/hooks/usePermission'
import { messagingProvider } from '@/integrations/messaging'
import { linkAprovacao, mensagemDoOrcamento } from '../../mensagem'
import { ConverterDialog } from '../editor/ConverterDialog'

const metros = (v: string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/** Painel do orçamento aberto pelo kanban: cliente, itens, totais e ações rápidas (imprimir, mensagem, link, converter). */
export function PainelOrcamento({ orcamento: resumo, onFechar }: { orcamento: Orcamento; onFechar: () => void }) {
  const navigate = useNavigate()
  const pode = usePermissoes()
  const impressao = useImpressao()
  const consulta = useQuery({ queryKey: ['orcamentos', 'detalhe', resumo.id], queryFn: () => orcamentosApi.obter(resumo.id) })
  const templates = useQuery({ queryKey: ['templates', 'ativos'], queryFn: templatesLeituraApi.listar, staleTime: 5 * 60 * 1000 })
  const [convertendo, setConvertendo] = useState(false)
  const o = consulta.data
  const ir = (caminho: string) => {
    onFechar()
    navigate(caminho)
  }

  async function copiarMensagem() {
    if (!o) return
    await messagingProvider.enviar({ texto: mensagemDoOrcamento(o, templates.data), destinatario: o.cliente.whatsapp ?? undefined })
    toast.success('Mensagem copiada. Cole no WhatsApp do cliente.')
  }

  return (
    <>
      <PainelCartao
        aberto={!convertendo}
        onFechar={onFechar}
        titulo={`${resumo.numero} · ${resumo.cliente.nome}`}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge entidade="orcamento" codigo={resumo.status} />
            <span>{formatarMoeda(resumo.total)}</span>
          </span>
        }
        acoes={
          <>
            <AcaoPainel icone={Pencil} rotulo="Abrir / editar" onClick={() => ir(`/orcamentos/${resumo.id}`)} destaque />
            <AcaoPainel icone={Printer} rotulo="Imprimir" onClick={() => void impressao.orcamento(resumo.id, 'imprimir')} carregando={impressao.ocupado === `orcamento:${resumo.id}:imprimir`} />
            <AcaoPainel icone={FileDown} rotulo="Baixar PDF" onClick={() => void impressao.orcamento(resumo.id, 'baixar')} carregando={impressao.ocupado === `orcamento:${resumo.id}:baixar`} />
            <AcaoPainel icone={MessageSquareText} rotulo="Copiar mensagem" onClick={() => void copiarMensagem()} />
            <AcaoPainel
              icone={Link2}
              rotulo="Link de aprovação"
              onClick={() => {
                void navigator.clipboard.writeText(linkAprovacao(resumo.tokenPublico))
                toast.success('Link de aprovação copiado.')
              }}
            />
            {resumo.status === 'aprovado' && pode('pedidos', 'criar') && pode('orcamentos', 'editar') && o && (
              <AcaoPainel icone={ShoppingCart} rotulo="Converter em pedido" onClick={() => setConvertendo(true)} />
            )}
            {resumo.pedidoId && <AcaoPainel icone={ShoppingCart} rotulo="Abrir pedido" onClick={() => ir(`/pedidos/${resumo.pedidoId}`)} />}
          </>
        }
      >
        <dl className="grid grid-cols-2 gap-3">
          <DadoPainel rotulo="Contato">{formatarTelefone(resumo.cliente.whatsapp ?? resumo.cliente.telefone) || resumo.cliente.email || '—'}</DadoPainel>
          <DadoPainel rotulo="Validade">{formatarDataSimples(resumo.validade)}</DadoPainel>
          <DadoPainel rotulo="Prazo de produção">{resumo.prazoDias} dia(s) úteis</DadoPainel>
          <DadoPainel rotulo="Vendedor">{resumo.vendedor?.nome ?? '—'}</DadoPainel>
          {resumo.aprovadoPorNome && <DadoPainel rotulo="Aprovado por">{resumo.aprovadoPorNome}</DadoPainel>}
          {resumo.motivoRecusa && <DadoPainel rotulo="Motivo da recusa">{resumo.motivoRecusa}</DadoPainel>}
        </dl>
        {consulta.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : consulta.isError || !o ? (
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        ) : (
          <>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-secundario">Itens</h3>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {o.itens.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{i.descricao}</p>
                      <p className="text-xs text-texto-secundario">
                        {Number(i.quantidade).toLocaleString('pt-BR')} un{i.largura ? ` · ${metros(i.largura)} × ${metros(i.altura ?? '0')} m` : ''}
                        {i.acabamentos.length > 0 ? ` · ${i.acabamentos.map((a) => a.nome).join(', ')}` : ''}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums">{formatarMoeda(i.total)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-2 space-y-1 text-right">
                {Number(o.desconto) > 0 && <div className="text-texto-secundario">Desconto: − {formatarMoeda(o.desconto)}</div>}
                {Number(o.frete) > 0 && <div className="text-texto-secundario">Frete / instalação: {formatarMoeda(o.frete)}</div>}
                <div className="text-base font-semibold text-tinta">Total: {formatarMoeda(o.total)}</div>
              </dl>
            </section>
            {o.condicoes && <DadoPainel rotulo="Condições de pagamento">{o.condicoes}</DadoPainel>}
            {o.observacoes && <DadoPainel rotulo="Observações">{o.observacoes}</DadoPainel>}
          </>
        )}
      </PainelCartao>
      {convertendo && o && (
        <ConverterDialog
          orcamento={o}
          onFechar={() => {
            setConvertendo(false)
            onFechar()
          }}
        />
      )}
    </>
  )
}
