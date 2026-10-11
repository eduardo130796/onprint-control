import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { formatarDataSimples } from '@onprint/shared'
import { MARCA, anosDireitos } from '@/app/marca'
import { Logo } from '@/components/layout/Logo'
import { POLITICA_PRIVACIDADE, TERMOS_DE_USO, type DocumentoLegal } from './textos'

/** Termos de uso ou política de privacidade: página pública e simples de ler (sistema e página de venda). */
function PaginaLegal({ doc, outro, voltar }: { doc: DocumentoLegal; outro: { rotulo: string; para: string }; voltar: { rotulo: string; para: string } }) {
  useEffect(() => {
    document.title = `${doc.titulo} · ${MARCA.produto}`
    window.scrollTo(0, 0)
  }, [doc.titulo])

  return (
    <div className="min-h-screen bg-fundo">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to={voltar.para} aria-label={`${MARCA.produto}: ${voltar.rotulo}`}>
            <Logo className="h-8" />
          </Link>
          <Link to={voltar.para} className="inline-flex items-center gap-1.5 text-sm font-medium text-marca-escuro hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {voltar.rotulo}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-escuro">{MARCA.produto}</p>
        <h1 className="mt-2 font-titulo text-3xl font-extrabold text-tinta sm:text-4xl">{doc.titulo}</h1>
        <p className="mt-3 text-texto-secundario">{doc.resumo}</p>
        <p className="mt-2 text-sm text-texto-secundario">Atualizado em {formatarDataSimples(doc.atualizadoEm)}</p>
        <div className="mt-10 space-y-8 rounded-3xl bg-card p-6 shadow-suave sm:p-10">
          {doc.secoes.map((s) => (
            <section key={s.titulo} aria-labelledby={s.titulo}>
              <h2 id={s.titulo} className="font-titulo text-lg font-extrabold text-tinta">
                {s.titulo}
              </h2>
              {s.paragrafos.filter(Boolean).map((p, i) => (
                <p key={i} className="mt-3 leading-relaxed text-tinta/85">
                  {p}
                </p>
              ))}
              {s.itens && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-tinta/85">
                  {s.itens.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        <p className="mt-8 text-sm">
          Veja também:{' '}
          <Link to={outro.para} className="font-medium text-marca-escuro hover:underline">
            {outro.rotulo}
          </Link>
        </p>
        <p className="mt-10 text-xs text-texto-secundario">
          © {anosDireitos()} {MARCA.empresa} · Todos os direitos reservados
        </p>
      </main>
    </div>
  )
}

/** /termos — no sistema volta para o login; na página de venda, para o início */
export function TermosPage({ voltar = { rotulo: 'Voltar', para: '/login' } }: { voltar?: { rotulo: string; para: string } }) {
  return <PaginaLegal doc={TERMOS_DE_USO} outro={{ rotulo: 'Política de privacidade', para: '/privacidade' }} voltar={voltar} />
}

export function PrivacidadePage({ voltar = { rotulo: 'Voltar', para: '/login' } }: { voltar?: { rotulo: string; para: string } }) {
  return <PaginaLegal doc={POLITICA_PRIVACIDADE} outro={{ rotulo: 'Termos de uso', para: '/termos' }} voltar={voltar} />
}
