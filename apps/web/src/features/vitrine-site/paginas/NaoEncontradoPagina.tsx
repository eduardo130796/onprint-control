import { Link } from 'react-router-dom'
import { ArrowLeft, SearchX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Container } from '../componentes/comum'
import { useTituloPagina } from '../contexto'
import { botao } from '../estilos'

export function NaoEncontradoPagina({ titulo = 'Página não encontrada', texto = 'O endereço pode ter mudado ou o produto saiu do catálogo.' }: { titulo?: string; texto?: string }) {
  useTituloPagina(titulo)
  return (
    <Container className="flex flex-col items-center py-24 text-center lg:py-32">
      <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-marca-suave text-marca-escuro">
        <SearchX className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1 className="vt-titulo text-2xl font-extrabold text-slate-900 sm:text-3xl">{titulo}</h1>
      <p className="mt-3 max-w-md text-slate-600">{texto}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/produtos" className={cn(botao.base, botao.primario, botao.md)}>
          Ver todos os produtos
        </Link>
        <Link to="/" className={cn(botao.base, botao.contorno, botao.md)}>
          <ArrowLeft /> Voltar ao início
        </Link>
      </div>
    </Container>
  )
}
