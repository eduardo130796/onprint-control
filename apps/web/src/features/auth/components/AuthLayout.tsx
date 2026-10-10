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
      {/* Painel da marca: fundo claro (a logo foi desenhada para ele) com um degradê suave nos azuis da GrafyGo */}
      <aside className="relative flex items-center justify-center overflow-hidden border-b border-[#DCE6F3] bg-[linear-gradient(160deg,#FFFFFF_0%,#F1F7FF_50%,#DFEDFD_100%)] px-6 py-8 lg:w-5/12 lg:flex-col lg:items-start lg:justify-between lg:border-b-0 lg:border-r lg:p-12">
        <span className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[#02BAF8]/15 blur-3xl" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-[#0265DC]/10 blur-3xl" aria-hidden="true" />
        <Logo className="relative h-11 lg:h-16" />
        <div className="relative hidden lg:block">
          <span className="mb-4 block h-1 w-10 rounded-full bg-laranja" aria-hidden="true" />
          <p className="font-titulo text-3xl font-extrabold leading-tight text-[#021A40]">
            Gestão inteligente
            <br />
            <span className="text-[#0265DC]">para quem transforma ideias.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm text-[#4A5B73]">
            Orçamentos, pedidos, arte, produção, estoque e financeiro da sua comunicação visual em um só lugar.
          </p>
        </div>
        <p className="relative hidden text-xs text-[#6B7C93] lg:block">
          © {anosDireitos()} {MARCA.empresa} · Todos os direitos reservados
        </p>
      </aside>
      <main className="flex flex-1 items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-sm">
          <h1 className="font-titulo text-2xl font-extrabold tracking-tight text-tinta">{titulo}</h1>
          {descricao && <p className="mt-1 text-sm text-texto-secundario">{descricao}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
