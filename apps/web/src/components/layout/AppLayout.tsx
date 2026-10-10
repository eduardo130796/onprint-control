import { Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { paginaAtual } from '@/app/navigation'
import { TEMAS, temaOuPadrao } from '@onprint/shared'
import { TITULO_PADRAO, aplicarModo, aplicarTema, definirFavicon, gerarFavicon } from '@/features/aparencia/tema'
import { aplicarEscala, aplicarTipografia } from '@/features/aparencia/tipografia'
import { useUrlArquivo } from '@/features/configuracoes/hooks'
import { AvisoInatividade } from '@/features/auth/AvisoInatividade'
import { registrarSaidaPorInatividade, useInatividade } from '@/features/auth/useInatividade'
import { useAuth } from '@/hooks/useAuth'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useTempoReal } from '@/hooks/useTempoReal'
import { cn } from '@/lib/utils'
import { BannerAssinatura } from './BannerAssinatura'
import { FloatingActionButton } from './FloatingActionButton'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const CHAVE_RECOLHIDA = 'onprint:sidebar-recolhida'

/** Telas que usam a largura toda (quadros kanban); as demais ficam centralizadas em até 1280 px. */
const TELAS_LARGAS = ['/producao', '/pedidos/kanban', '/orcamentos/kanban']

/** Preferência salva; sem preferência, começa recolhido em telas menores que 1280 px (notebook) */
function lerRecolhida() {
  let salvo: string | null = null
  try {
    salvo = localStorage.getItem(CHAVE_RECOLHIDA)
  } catch {
    // sem armazenamento: decide pela largura
  }
  return salvo === null ? window.innerWidth < 1280 : salvo === '1'
}

export function AppLayout() {
  const [recolhida, setRecolhida] = useState(lerRecolhida)
  const [mobileAberta, setMobileAberta] = useState(false)
  // Recolher/expandir vale a partir de 1024 px (abaixo, o menu é a gaveta do botão ☰)
  const comMenuLateral = useMediaQuery('(min-width: 1024px)')
  const menuRecolhido = recolhida
  const { usuario, sair } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const larga = TELAS_LARGAS.includes(pathname)
  useTempoReal(Boolean(usuario) && !usuario?.deveTrocarSenha && usuario?.assinatura?.nivel !== 'bloqueado')
  const empresa = usuario?.empresa

  // Saída por inatividade (tempo da empresa); usuário de painel (TV da produção) não sai
  const sairPorInatividade = () => {
    registrarSaidaPorInatividade()
    void sair()
      .catch(() => undefined)
      .finally(() => navigate('/login', { replace: true }))
  }
  const inatividade = useInatividade({
    limiteMin: empresa?.inatividadeMinutos ?? 30,
    ativo: Boolean(usuario) && !usuario?.semInatividade,
    aoExpirar: sairPorInatividade,
  })
  const logo = useUrlArquivo(empresa?.logoArquivoId)

  // Modo claro/escuro do usuário (antes de pintar a tela, sem piscar); fora do sistema, sempre claro
  useLayoutEffect(() => {
    aplicarModo(usuario?.modoTela ?? 'claro')
  }, [usuario?.modoTela])
  useLayoutEffect(() => () => aplicarModo(null), [])

  // Fonte e peso do texto do usuário; fora do sistema, o padrão
  useLayoutEffect(() => {
    aplicarTipografia(usuario?.fonte ?? null, usuario?.pesoTexto ?? null)
  }, [usuario?.fonte, usuario?.pesoTexto])
  useLayoutEffect(() => () => aplicarTipografia(null, null), [])
  useLayoutEffect(() => {
    aplicarEscala(usuario?.escala ?? null)
    return () => aplicarEscala(null)
  }, [usuario?.escala])

  // Cor do tema da empresa; ao sair (login, páginas públicas) volta ao verde ONPrint
  useEffect(() => {
    aplicarTema(empresa?.corTema)
    return () => aplicarTema(null)
  }, [empresa?.corTema])

  // Aba do navegador: "Página · Empresa" e a logo da empresa como ícone
  useEffect(() => {
    if (!empresa) return
    const pagina = paginaAtual(pathname)?.titulo
    document.title = pagina && pathname !== '/' ? `${pagina} · ${empresa.exibicao}` : empresa.exibicao
  }, [pathname, empresa])
  useEffect(() => {
    if (!empresa || (empresa.logoArquivoId && !logo.data)) return
    let atual = true
    const t = TEMAS[temaOuPadrao(empresa.corTema)]
    void gerarFavicon({ logoUrl: empresa.logoArquivoId ? logo.data : null, nome: empresa.exibicao, cor: t.cor, contraste: t.contraste }).then((icone) => {
      if (atual) definirFavicon(icone)
    })
    return () => {
      atual = false
    }
  }, [empresa, logo.data])
  useEffect(
    () => () => {
      document.title = TITULO_PADRAO
      definirFavicon(null)
    },
    [],
  )

  function alternar() {
    setRecolhida((r) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDA, r ? '0' : '1')
      } catch {
        // preferência apenas visual; ignora falha de armazenamento
      }
      return !r
    })
  }

  // Ctrl+B (Cmd+B no Mac) recolhe/expande o menu, como em outros sistemas
  useEffect(() => {
    if (!comMenuLateral) return
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        alternar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [comMenuLateral])

  return (
    <div className="min-h-screen bg-fundo">
      <Topbar onAbrirMenuMobile={() => setMobileAberta(true)} menuRecolhido={menuRecolhido} />
      <Sidebar
        recolhida={menuRecolhido}
        podeAlternar={comMenuLateral}
        onAlternar={alternar}
        mobileAberta={mobileAberta}
        onMobileAbertaChange={setMobileAberta}
      />
      <main
        className={cn(
          'min-w-0 px-4 pb-24 pt-20 transition-[padding] duration-200 sm:px-6 lg:pr-8 lg:pt-24',
          menuRecolhido ? 'lg:pl-[6.75rem]' : 'lg:pl-[20.75rem]',
        )}
      >
        <div className={larga ? 'w-full' : 'mx-auto max-w-7xl'}>
          <BannerAssinatura />
          {/* As telas são carregadas sob demanda (app/paginas.ts) */}
          <Suspense
            fallback={
              <div className="flex justify-center py-24" role="status" aria-label="Carregando">
                <Loader2 className="h-6 w-6 animate-spin text-marca-escuro" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>
      <FloatingActionButton />
      <AvisoInatividade restanteMs={inatividade.restanteMs} onContinuar={inatividade.continuar} onSair={sairPorInatividade} />
    </div>
  )
}
