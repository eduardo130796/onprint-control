import { useUrlArquivo } from '@/features/configuracoes/hooks'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

/**
 * Marca da gráfica no topo do sistema: a logo (sobre um fundo claro, para logos escuras ou com fundo
 * transparente) e o nome; sem logo, a inicial na cor do tema. A ONPrint aparece discreta no rodapé do menu.
 */
export function MarcaEmpresa({ compacta, className }: { compacta?: boolean; className?: string }) {
  const { usuario } = useAuth()
  const empresa = usuario?.empresa
  const logo = useUrlArquivo(empresa?.logoArquivoId)
  if (!empresa) return null
  const inicial = empresa.exibicao.trim().charAt(0).toUpperCase() || 'O'

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {empresa.logoArquivoId && logo.data ? (
        <span className={cn('flex h-9 shrink-0 items-center rounded-lg bg-white px-1.5 py-1', compacta ? 'max-w-[3.25rem]' : 'max-w-[7.5rem]')}>
          <img src={logo.data} alt="" className="h-full w-auto max-w-full object-contain" />
        </span>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca font-titulo text-lg font-extrabold text-marca-contraste" aria-hidden="true">
          {inicial}
        </span>
      )}
      {!compacta && <span className="truncate font-titulo text-base font-extrabold tracking-tight text-white">{empresa.exibicao}</span>}
    </div>
  )
}
