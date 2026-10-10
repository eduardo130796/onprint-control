import { useUrlArquivo } from '@/features/configuracoes/hooks'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

/**
 * Marca da gráfica no topo do sistema: a logo (sobre um fundo claro, para logos escuras ou com fundo
 * transparente) e o nome; sem logo, a inicial na cor do tema. O nome nunca é cortado no meio: quebra em até
 * duas linhas (e diminui um pouco se for comprido). A GrafyGo aparece discreta no rodapé do menu.
 */
export function MarcaEmpresa({ compacta, className }: { compacta?: boolean; className?: string }) {
  const { usuario } = useAuth()
  const empresa = usuario?.empresa
  const logo = useUrlArquivo(empresa?.logoArquivoId)
  if (!empresa) return null
  const inicial = empresa.exibicao.trim().charAt(0).toUpperCase() || 'O'
  const longo = empresa.exibicao.length > 18
  const temLogo = Boolean(empresa.logoArquivoId && logo.data)

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)} title={empresa.exibicao}>
      {temLogo ? (
        <span className={cn('flex h-9 shrink-0 items-center rounded-lg bg-white px-1.5 py-1', compacta ? 'max-w-[3.25rem]' : 'max-w-[8rem] sm:max-w-[9rem]')}>
          <img src={logo.data} alt="" className="h-full w-auto max-w-full object-contain" />
        </span>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca font-titulo text-lg font-extrabold text-marca-contraste" aria-hidden="true">
          {inicial}
        </span>
      )}
      {!compacta && (
        <span
          className={cn(
            // No celular, com logo, fica só a logo (ela já traz o nome; o nome completo aparece ao tocar e segurar)
            'min-w-0 max-w-[10.5rem] break-words font-titulo font-extrabold leading-[1.15] tracking-tight text-white sm:line-clamp-2 sm:max-w-[13rem] xl:max-w-[16rem]',
            temLogo ? 'hidden' : 'line-clamp-3',
            longo ? 'text-[0.8125rem] sm:text-sm' : 'text-sm sm:text-base',
          )}
        >
          {empresa.exibicao}
        </span>
      )}
    </div>
  )
}
