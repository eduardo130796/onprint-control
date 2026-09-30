import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { baixarArquivo, gerarCsv, type ColunaCsv } from '@/lib/csv'

interface BotaoExportarCsvProps<T> {
  nomeArquivo: string
  colunas: ColunaCsv<T>[]
  buscarTodos: () => Promise<T[]>
}

/** Exporta todos os registros do filtro atual (não só a página visível). */
export function BotaoExportarCsv<T>({ nomeArquivo, colunas, buscarTodos }: BotaoExportarCsvProps<T>) {
  const [exportando, setExportando] = useState(false)

  async function exportar() {
    setExportando(true)
    try {
      const linhas = await buscarTodos()
      const data = new Date().toISOString().slice(0, 10)
      baixarArquivo(gerarCsv(colunas, linhas), `${nomeArquivo}_${data}.csv`)
      toast.success(`${linhas.length} registro(s) exportado(s).`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setExportando(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void exportar()} disabled={exportando}>
      {exportando ? <Loader2 className="animate-spin" /> : <Download />}
      CSV
    </Button>
  )
}
