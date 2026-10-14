import { Fragment } from 'react'
import { ImageIcon, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { linkDaPrevia, trechosWhatsapp } from '../formatacao'

const dominio = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * Prévia da mensagem como o cliente vê no WhatsApp: bolha verde, quebras de linha, *negrito*, _itálico_,
 * links em azul e, no topo, o cartão da prévia do link (o WhatsApp mostra a do primeiro link).
 */
export interface ArquivoNaBolha {
  nome: string
  /** Imagem aparece na conversa (com a legenda); o resto vai como documento */
  imagem: boolean
  miniaturaUrl?: string | null
  legenda?: string
}

export function BolhaWhatsapp({
  texto,
  anexo,
  arquivos = [],
  className,
  vazio = 'A mensagem aparece aqui.',
}: {
  texto: string
  anexo?: string | null
  /** Arquivos que vão logo depois do texto (artes) */
  arquivos?: ArquivoNaBolha[]
  className?: string
  vazio?: string
}) {
  const link = linkDaPrevia(texto)
  return (
    <div className={cn('rounded-xl bg-[#efeae2] p-3 dark:bg-[#0b141a]', className)}>
      <div className="ml-auto w-fit max-w-full rounded-xl rounded-tr-sm bg-[#d9fdd3] p-1.5 text-sm leading-snug text-[#111b21] shadow-sm sm:max-w-[92%] dark:bg-[#005c4b] dark:text-[#e9edef]">
        {link && (
          <div className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 dark:bg-black/20">
            <Link2 className="h-4 w-4 shrink-0 text-[#54656f] dark:text-[#8696a0]" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold">{dominio(link)}</span>
              <span className="block text-[0.6875rem] text-[#54656f] dark:text-[#8696a0]">Prévia do link</span>
            </span>
          </div>
        )}
        <p className="whitespace-pre-wrap px-1.5 py-0.5 [overflow-wrap:anywhere]">
          {texto.trim() ? (
            texto.split('\n').map((linha, i) => (
              <Fragment key={i}>
                {i > 0 && '\n'}
                {trechosWhatsapp(linha).map((t, j) =>
                  t.link ? (
                    <span key={j} className="text-[#027eb5] underline-offset-2 hover:underline dark:text-[#53bdeb]">
                      {t.texto}
                    </span>
                  ) : (
                    <span key={j} className={cn(t.negrito && 'font-semibold', t.italico && 'italic', t.riscado && 'line-through')}>
                      {t.texto}
                    </span>
                  ),
                )}
              </Fragment>
            ))
          ) : (
            <span className="text-[#54656f]">{vazio}</span>
          )}
        </p>
      </div>
      {anexo && (
        <div className="ml-auto mt-1.5 flex w-fit max-w-full items-center gap-2 rounded-xl rounded-tr-sm bg-[#d9fdd3] p-2 pr-3 text-sm text-[#111b21] shadow-sm sm:max-w-[92%] dark:bg-[#005c4b] dark:text-[#e9edef]">
          <span className="flex h-9 w-7 shrink-0 items-center justify-center rounded bg-[#e2462f] text-[0.5625rem] font-bold text-white">PDF</span>
          <span className="min-w-0 truncate">{anexo}</span>
        </div>
      )}
      {arquivos.map((a, i) =>
        a.imagem ? (
          <div key={i} className="ml-auto mt-1.5 w-44 max-w-full rounded-xl rounded-tr-sm bg-[#d9fdd3] p-1 text-xs text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
            <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg bg-white/70">
              {a.miniaturaUrl ? <img src={a.miniaturaUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-8 w-8 text-[#54656f]" />}
            </div>
            {a.legenda && <p className="truncate px-1 pt-1">{a.legenda}</p>}
          </div>
        ) : (
          <div key={i} className="ml-auto mt-1.5 flex w-fit max-w-full items-center gap-2 rounded-xl rounded-tr-sm bg-[#d9fdd3] p-2 pr-3 text-sm text-[#111b21] shadow-sm sm:max-w-[92%] dark:bg-[#005c4b] dark:text-[#e9edef]">
            <span className="flex h-9 w-7 shrink-0 items-center justify-center rounded bg-[#e2462f] text-[0.5625rem] font-bold text-white">PDF</span>
            <span className="min-w-0 truncate">{a.nome}</span>
          </div>
        ),
      )}
    </div>
  )
}
