import type { ReactNode } from 'react'
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
      <aside className="flex items-center justify-center bg-petroleo px-6 py-8 lg:w-5/12 lg:flex-col lg:items-start lg:justify-between lg:p-12">
        <Logo claro />
        <div className="hidden lg:block">
          <p className="text-3xl font-semibold leading-tight text-white">
            Do orçamento à entrega,
            <br />
            <span className="text-turquesa-escuro">tudo sob controle.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Orçamentos, pedidos, arte, produção, estoque e financeiro da sua comunicação visual em um só lugar.
          </p>
        </div>
        <p className="hidden text-xs text-white/50 lg:block">ONPrint Control</p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-petroleo">{titulo}</h1>
          {descricao && <p className="mt-1 text-sm text-texto-secundario">{descricao}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
