import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Botão discreto ao lado do rótulo do CNPJ (aparece só com um CNPJ válido digitado). */
export function BotaoBuscarCnpj({ consulta }: { consulta: { buscar: () => void; buscando: boolean; disponivel: boolean } }) {
  if (!consulta.disponivel) return null
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="-my-1 h-5 p-0 text-xs"
      disabled={consulta.buscando}
      onClick={() => consulta.buscar()}
      title="Preenche os campos vazios com os dados públicos da Receita Federal"
    >
      {consulta.buscando ? <Loader2 className="animate-spin" /> : <Search />}
      {consulta.buscando ? 'Buscando…' : 'Buscar dados'}
    </Button>
  )
}
