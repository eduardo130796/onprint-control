import type { ReactNode } from 'react'
import { anosDireitos, MARCA } from '@/app/marca'
import { Logo } from '@/components/layout/Logo'

interface AuthLayoutProps {
  titulo: string
  descricao?: string
  children: ReactNode
}

/** Moldura das telas públicas de autenticação (login, recuperar e redefinir senha). */
export function AuthLayout({ titulo, descricao, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex items-center justify-center bg-grafite px-6 py-8 lg:w-5/12 lg:flex-col lg:items-start lg:justify-between lg:p-12">
        <Logo claro className="h-11 lg:h-16" />
        <div className="hidden lg:block">
          <span className="mb-4 block h-1 w-10 rounded-full bg-laranja" aria-hidden="true" />
          <p className="font-titulo text-3xl font-extrabold leading-tight text-white">
            Gestão inteligente
            <br />
            <span className="text-[#02BAF8]">para quem transforma ideias.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Orçamentos, pedidos, arte, produção, estoque e financeiro da sua comunicação visual em um só lugar.
          </p>
        </div>
        <p className="hidden text-xs text-white/50 lg:block">
          © {anosDireitos()} {MARCA.empresa} · Todos os direitos reservados
        </p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <h1 className="font-titulo text-2xl font-extrabold tracking-tight text-tinta">{titulo}</h1>
          {descricao && <p className="mt-1 text-sm text-texto-secundario">{descricao}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
