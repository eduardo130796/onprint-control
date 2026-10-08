import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Palette, RotateCcw, Save, Sparkles, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { CODIGOS_TEMA, TEMAS, temaMaisProximo, temaOuPadrao, type CodigoTema } from '@onprint/shared'
import { empresaApi } from '@/api/configuracoes'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'
import { CHAVE_EMPRESA, useEmpresa, useUrlArquivo } from '../configuracoes/hooks'
import { LogoCard } from '../configuracoes/pages/EmpresaPage'
import { aplicarTema, corMediaDaImagem } from './tema'

/** Prévia com a cor escolhida: o topo, o menu, um botão e um selo, como vão ficar no sistema. */
function Previa({ nome, logo }: { nome: string; logo: string | null | undefined }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-fundo ring-1 ring-border" aria-hidden="true">
      <div className="relative flex h-12 items-center gap-2.5 bg-grafite px-4">
        {logo ? (
          <span className="flex h-8 max-w-[6rem] items-center rounded-md bg-white px-1">
            <img src={logo} alt="" className="h-full w-auto max-w-full object-contain" />
          </span>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-marca font-titulo font-extrabold text-marca-contraste">{nome.charAt(0).toUpperCase()}</span>
        )}
        <span className="truncate font-titulo text-sm font-extrabold text-white">{nome}</span>
        <span className="absolute inset-x-0 bottom-0 flex h-[3px]">
          <span className="flex-[9] bg-marca" />
          <span className="flex-1 bg-laranja" />
        </span>
      </div>
      <div className="grid grid-cols-[9rem_1fr] gap-4 p-4">
        <div className="space-y-1.5">
          <span className="flex items-center gap-2 rounded-lg bg-marca px-2.5 py-1.5 text-xs font-semibold text-marca-contraste">
            <Palette className="h-3.5 w-3.5" /> Pedidos
          </span>
          <span className="flex items-center gap-2 rounded-lg bg-marca-suave px-2.5 py-1.5 text-xs font-semibold text-marca-escuro">Orçamentos</span>
          <span className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-grafite">Clientes</span>
        </div>
        <div className="space-y-3 rounded-xl bg-card p-4 shadow-suave">
          <div className="flex items-center justify-between gap-2">
            <p className="font-titulo text-sm font-extrabold text-grafite">Pedido #1042</p>
            <span className="rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-semibold text-marca-escuro">Em produção</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-fundo">
            <div className="h-full w-2/3 rounded-full bg-marca" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center rounded-lg bg-marca px-3 text-xs font-semibold text-marca-contraste">Salvar pedido</span>
            <span className="text-xs font-semibold text-marca-escuro underline">Ver orçamento</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Configurações → Aparência: cor do tema da empresa (paleta fechada, com contraste testado) e a logo.
 * Escolher uma cor já muda o sistema todo na hora (prévia ao vivo); sair sem salvar volta à cor salva.
 */
export function AparenciaPage() {
  const { usuario, atualizarMarca } = useAuth()
  const queryClient = useQueryClient()
  const consulta = useEmpresa()
  const podeEditar = usePermission('configuracoes', 'editar')
  const salvo = temaOuPadrao(usuario?.empresa.corTema)
  const [escolhido, setEscolhido] = useState<CodigoTema>(salvo)
  const [salvando, setSalvando] = useState(false)
  const logo = useUrlArquivo(usuario?.empresa.logoArquivoId)
  // Sugestão pela cor média da logo
  const sugestao = useQuery({
    queryKey: ['tema-sugerido', usuario?.empresa.logoArquivoId],
    queryFn: async () => {
      const cor = await corMediaDaImagem(logo.data as string)
      return cor ? temaMaisProximo(cor) : null
    },
    enabled: Boolean(logo.data),
    staleTime: Infinity,
  })

  // Prévia ao vivo no sistema todo; ao sair da página, vale de novo a cor salva
  useEffect(() => {
    aplicarTema(escolhido)
  }, [escolhido])
  useEffect(() => () => aplicarTema(temaOuPadrao(usuario?.empresa.corTema)), [usuario?.empresa.corTema])

  const mudou = escolhido !== salvo

  async function salvar() {
    setSalvando(true)
    try {
      const empresa = await empresaApi.salvarTema(escolhido)
      queryClient.setQueryData(CHAVE_EMPRESA, empresa)
      atualizarMarca({ corTema: escolhido })
      toast.success(`Tema ${TEMAS[escolhido].nome} aplicado para todos os usuários da empresa.`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const nome = usuario?.empresa.exibicao ?? 'Sua empresa'

  return (
    <>
      <PageHeader titulo="Aparência" subtitulo="A cor do sistema e a logo da sua empresa. Vale para todos os usuários." />
      {consulta.isPending ? (
        <Skeleton className="h-96 w-full rounded-3xl" />
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="space-y-6 rounded-3xl bg-card p-6 shadow-suave sm:p-8" aria-label="Cor do tema">
            <div>
              <h2 className="font-titulo text-xl font-extrabold text-grafite">Cor do sistema</h2>
              <p className="text-sm text-texto-secundario">Botões, menu, barras e destaques. Os documentos enviados aos clientes usam a sua logo e não mudam de cor.</p>
            </div>

            <Previa nome={nome} logo={usuario?.empresa.logoArquivoId ? logo.data : null} />

            <div role="radiogroup" aria-label="Cores" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CODIGOS_TEMA.map((codigo) => {
                const t = TEMAS[codigo]
                const marcado = escolhido === codigo
                return (
                  <button
                    key={codigo}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    disabled={!podeEditar}
                    onClick={() => setEscolhido(codigo)}
                    className={cn(
                      'relative flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition',
                      marcado ? 'bg-fundo ring-2 ring-grafite' : 'bg-card ring-border hover:bg-fundo',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grafite disabled:cursor-default',
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm" style={{ background: t.cor, color: t.contraste }}>
                      {marcado && <Check className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-grafite">{t.nome}</span>
                      {codigo === 'verde' && <span className="block text-[11px] text-texto-secundario">Padrão</span>}
                      {sugestao.data === codigo && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-texto-secundario">
                          <Wand2 className="h-3 w-3" /> Combina com a logo
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            {podeEditar ? (
              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
                <Button onClick={() => void salvar()} disabled={!mudou || salvando}>
                  {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar cor
                </Button>
                {mudou && (
                  <Button variant="ghost" onClick={() => setEscolhido(salvo)}>
                    <RotateCcw /> Voltar para {TEMAS[salvo].nome}
                  </Button>
                )}
                {sugestao.data && sugestao.data !== escolhido && (
                  <Button variant="outline" onClick={() => setEscolhido(sugestao.data as CodigoTema)}>
                    <Sparkles /> Usar a cor da logo ({TEMAS[sugestao.data].nome})
                  </Button>
                )}
                {mudou && <span className="text-sm text-texto-secundario">Você está vendo uma prévia; salve para valer para todos.</span>}
              </div>
            ) : (
              <p className="border-t border-border pt-5 text-sm text-texto-secundario">Só o administrador da empresa muda a aparência.</p>
            )}
          </section>

          <div className="space-y-4">
            <LogoCard empresa={consulta.data} podeEditar={podeEditar} />
            <p className="px-1 text-xs text-texto-secundario">
              A logo aparece no topo do sistema, como ícone da aba do navegador e nos documentos. Use PNG ou SVG com fundo transparente para o melhor resultado.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
