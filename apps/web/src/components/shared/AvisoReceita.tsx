import { Landmark, X } from 'lucide-react'
import { formatarDataSimples, type DadosCnpj } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { listarRotulos } from '@/lib/consultas'
import { cn } from '@/lib/utils'

export interface ConsultaReceita {
  dados: DadosCnpj
  preenchidos: string[]
}

/**
 * Aviso fixo depois da busca do CNPJ: o que veio da Receita Federal (para conferir antes de salvar)
 * e os dados informativos que não vão para o cadastro (atividade, porte, abertura, situação).
 */
export function AvisoReceita({ consulta, onFechar, className }: { consulta: ConsultaReceita; onFechar: () => void; className?: string }) {
  const { dados, preenchidos } = consulta
  const info = [
    dados.atividade && `Atividade: ${dados.atividade}`,
    dados.porte && `Porte: ${dados.porte}`,
    dados.abertura && `Aberta em ${formatarDataSimples(dados.abertura)}`,
    `Situação: ${dados.situacao ? dados.situacao.charAt(0) + dados.situacao.slice(1).toLowerCase() : 'não informada'}`,
  ].filter(Boolean)
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-4 text-sm',
        dados.ativa ? 'border-marca/40 bg-marca-suave/40' : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100',
        className,
      )}
    >
      <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-marca-escuro" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-tinta">
          {preenchidos.length ? `Preenchido com dados da Receita Federal: ${listarRotulos(preenchidos)}.` : 'Dados conferidos na Receita Federal: os campos já estavam preenchidos.'}
        </p>
        <p className="text-texto-secundario">Confira antes de salvar: telefone e e-mail da Receita podem estar desatualizados.</p>
        <p className="break-words text-xs text-texto-secundario">{info.join(' · ')}</p>
        {!dados.ativa && <p className="font-medium">Este CNPJ não está ativo na Receita. Confira antes de fechar negócio.</p>}
      </div>
      <Button type="button" variant="ghost" size="icon" className="-m-1 shrink-0" onClick={onFechar} aria-label="Fechar aviso da Receita">
        <X />
      </Button>
    </div>
  )
}
