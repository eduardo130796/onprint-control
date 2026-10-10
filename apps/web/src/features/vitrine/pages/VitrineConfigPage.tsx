import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Eye, Globe, Images, Inbox, Loader2, MapPin, MessageCircle, PackageOpen, Phone, Save, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { MAX_BANNERS_VITRINE, vitrineConfigSchema, type VitrineConfig, type VitrineConfigInput } from '@onprint/shared'
import { CHAVE_VITRINE_CONFIG, vitrineApi } from '@/api/vitrine'
import { PageHeader } from '@/components/layout/PageHeader'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { CartaoIndicador } from '@/components/shared/CartaoIndicador'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'
import { BannersVitrine } from '../components/BannersVitrine'
import { EnderecoPublico } from '../components/EnderecoPublico'
import { Interruptor } from '../components/Interruptor'
import { useVitrineConfig } from '../hooks'
import { semProtocolo } from '../utils'

type Saida = z.output<typeof vitrineConfigSchema>

function valores(c: VitrineConfig): VitrineConfigInput {
  return {
    ativa: c.ativa,
    titulo: c.titulo ?? '',
    slogan: c.slogan ?? '',
    sobre: c.sobre ?? '',
    horario: c.horario ?? '',
    instagram: c.instagram ?? '',
    facebook: c.facebook ?? '',
    tiktok: c.tiktok ?? '',
    youtube: c.youtube ?? '',
    mostrarEndereco: c.mostrarEndereco,
    mostrarTelefone: c.mostrarTelefone,
    mostrarWhatsapp: c.mostrarWhatsapp,
    mensagemWhatsapp: c.mensagemWhatsapp ?? '',
    mensagemPedidoEnviado: c.mensagemPedidoEnviado ?? '',
    seoDescricao: c.seoDescricao ?? '',
  }
}

/** Aviso destacado no topo (plano sem o módulo, nenhum produto publicado) */
function Aviso({ tom, icone: Icone, titulo, children, acao }: { tom: 'alerta' | 'info'; icone: LucideIcon; titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center',
        tom === 'alerta' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900',
      )}
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tom === 'alerta' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700')}>
        <Icone className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{titulo}</p>
        <p className="text-sm opacity-90">{children}</p>
      </div>
      {acao}
    </div>
  )
}

function Contador({ valor, maximo }: { valor: unknown; maximo: number }) {
  const n = typeof valor === 'string' ? valor.length : 0
  return <span className={cn('text-xs tabular-nums', n > maximo ? 'text-coral-escuro' : 'text-texto-secundario')}>{n}/{maximo}</span>
}

function LinhaContato({ icone: Icone, titulo, descricao, children }: { icone: LucideIcon; titulo: string; descricao: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fundo text-tinta/70">
        <Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-tinta">{titulo}</p>
        <p className="text-xs text-texto-secundario">{descricao}</p>
      </div>
      {children}
    </div>
  )
}

function FormularioVitrine({ config, podeEditar, nomeEmpresa }: { config: VitrineConfig; podeEditar: boolean; nomeEmpresa: string }) {
  const queryClient = useQueryClient()
  const form = useForm<VitrineConfigInput, unknown, Saida>({ resolver: zodResolver(vitrineConfigSchema), defaultValues: valores(config) })
  const { errors, isDirty } = form.formState
  const r = form.register
  const salvar = useMutation({ mutationFn: (d: Saida) => vitrineApi.salvarConfig(d) })
  const [ativa, titulo, seo] = useWatch({ control: form.control, name: ['ativa', 'titulo', 'seoDescricao'] })

  const onSubmit = form.handleSubmit(
    async (dados) => {
      try {
        const salva = await salvar.mutateAsync(dados)
        queryClient.setQueryData(CHAVE_VITRINE_CONFIG, salva)
        form.reset(valores(salva))
        toast.success(salva.ativa && salva.liberadaNoPlano ? 'Vitrine salva. O site já mostra as mudanças.' : 'Vitrine salva.')
      } catch (e) {
        toast.error((e as Error).message)
      }
    },
    () => toast.error('Verifique os campos destacados.'),
  )

  const interruptor = (nome: 'ativa' | 'mostrarEndereco' | 'mostrarTelefone' | 'mostrarWhatsapp', rotulo: string) => (
    <Controller
      control={form.control}
      name={nome}
      render={({ field }) => <Interruptor rotulo={rotulo} marcado={Boolean(field.value)} onMudar={field.onChange} desabilitado={!podeEditar} />}
    />
  )

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!podeEditar || salvar.isPending} className="space-y-6">
        <Card className={cn('border-2 transition-colors', ativa ? 'border-marca/40' : 'border-transparent')}>
          <CardContent className="flex items-center gap-4 p-5">
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', ativa ? 'bg-marca-suave text-marca-escuro' : 'bg-fundo text-texto-secundario')}>
              <Globe className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-tinta">{ativa ? 'Site ligado' : 'Site desligado'}</p>
              <p className="text-sm text-texto-secundario">
                {!config.liberadaNoPlano
                  ? 'Deixe tudo pronto: o site abre quando o módulo for liberado no seu plano.'
                  : ativa
                    ? 'Qualquer pessoa com o endereço vê seus produtos e pode pedir orçamento.'
                    : 'Desligado, o endereço mostra "página não encontrada". Ligue quando estiver pronto.'}
              </p>
            </div>
            {interruptor('ativa', 'Site no ar')}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Apresentação</CardTitle>
            <CardDescription>O que o visitante lê no topo e em "Quem somos".</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <CampoFormulario id="vit-titulo" rotulo="Título do site" erro={errors.titulo?.message}>
              <Input id="vit-titulo" placeholder={nomeEmpresa} {...r('titulo')} />
            </CampoFormulario>
            <CampoFormulario id="vit-slogan" rotulo="Slogan" erro={errors.slogan?.message}>
              <Input id="vit-slogan" placeholder="Ex.: Impressão rápida com qualidade de gráfica grande" {...r('slogan')} />
            </CampoFormulario>
            <div className="md:col-span-2">
              <CampoFormulario id="vit-sobre" rotulo="Quem somos" erro={errors.sobre?.message}>
                <Textarea id="vit-sobre" rows={5} placeholder="Conte a história da gráfica, o que vocês fazem de melhor, há quanto tempo atendem…" {...r('sobre')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="vit-horario" rotulo="Horário de atendimento" erro={errors.horario?.message}>
                <Input id="vit-horario" placeholder="Seg a sex, 8h às 18h · Sáb, 8h às 12h" {...r('horario')} />
              </CampoFormulario>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Contato exibido</CardTitle>
            <CardDescription>
              Os dados vêm de{' '}
              <Link to="/configuracoes/empresa" className="font-medium text-marca-escuro hover:underline">
                Dados da empresa
              </Link>
              . Escolha o que aparece no site.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <LinhaContato icone={MessageCircle} titulo="WhatsApp" descricao="Botão &quot;Chamar no WhatsApp&quot; sempre à mão e no rodapé.">
              {interruptor('mostrarWhatsapp', 'Mostrar WhatsApp')}
            </LinhaContato>
            <LinhaContato icone={Phone} titulo="Telefone" descricao="No rodapé e em &quot;Contato&quot;.">
              {interruptor('mostrarTelefone', 'Mostrar telefone')}
            </LinhaContato>
            <LinhaContato icone={MapPin} titulo="Endereço" descricao="Para quem quer passar no balcão.">
              {interruptor('mostrarEndereco', 'Mostrar endereço')}
            </LinhaContato>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Redes sociais</CardTitle>
            <CardDescription>Use @usuario ou o endereço completo. Em branco, não aparece.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <CampoFormulario id="vit-instagram" rotulo="Instagram" erro={errors.instagram?.message}>
              <Input id="vit-instagram" placeholder="@suagrafica" autoCapitalize="none" {...r('instagram')} />
            </CampoFormulario>
            <CampoFormulario id="vit-facebook" rotulo="Facebook" erro={errors.facebook?.message}>
              <Input id="vit-facebook" placeholder="facebook.com/suagrafica" autoCapitalize="none" {...r('facebook')} />
            </CampoFormulario>
            <CampoFormulario id="vit-tiktok" rotulo="TikTok" erro={errors.tiktok?.message}>
              <Input id="vit-tiktok" placeholder="@suagrafica" autoCapitalize="none" {...r('tiktok')} />
            </CampoFormulario>
            <CampoFormulario id="vit-youtube" rotulo="YouTube" erro={errors.youtube?.message}>
              <Input id="vit-youtube" placeholder="youtube.com/@suagrafica" autoCapitalize="none" {...r('youtube')} />
            </CampoFormulario>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Mensagens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <CampoFormulario id="vit-msg-whats" rotulo="Mensagem pronta do WhatsApp" erro={errors.mensagemWhatsapp?.message}>
              <Textarea id="vit-msg-whats" rows={2} placeholder="Olá! Vi o site de vocês e gostaria de um orçamento." {...r('mensagemWhatsapp')} />
            </CampoFormulario>
            <CampoFormulario id="vit-msg-enviado" rotulo="Mensagem depois do envio da lista de orçamento" erro={errors.mensagemPedidoEnviado?.message}>
              <Textarea
                id="vit-msg-enviado"
                rows={3}
                placeholder="Recebemos seu pedido! Em breve entraremos em contato pelo WhatsApp com o orçamento."
                {...r('mensagemPedidoEnviado')}
              />
            </CampoFormulario>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Google e compartilhamento</CardTitle>
            <CardDescription>A descrição curta que aparece no Google e quando alguém manda o link no WhatsApp.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <CampoFormulario id="vit-seo" rotulo="Descrição" erro={errors.seoDescricao?.message} acao={<Contador valor={seo} maximo={160} />}>
              <Textarea id="vit-seo" rows={4} placeholder="Banners, adesivos, cartões e muito mais. Peça seu orçamento online." {...r('seoDescricao')} />
            </CampoFormulario>
            {/* Prévia no estilo do resultado de busca */}
            <div className="self-start rounded-2xl border border-border bg-fundo/50 p-4" aria-label="Prévia no Google">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-texto-secundario">Prévia</p>
              <p className="mt-2 truncate text-xs text-texto-secundario">{semProtocolo(config.urlPublica)}</p>
              <p className="truncate text-base font-medium text-sky-700">{(titulo as string) || nomeEmpresa}</p>
              <p className="line-clamp-2 text-sm text-texto-secundario">{(seo as string) || 'Sem descrição: o Google escolhe um trecho da página.'}</p>
            </div>
          </CardContent>
        </Card>

        {podeEditar && (
          // Com alterações pendentes, o botão acompanha a rolagem (fica à mão em qualquer parte do formulário)
          <div className={cn('flex items-center justify-end gap-3', isDirty && 'sticky bottom-4 z-10')}>
            {isDirty && <span className="rounded-full bg-card px-3 py-1.5 text-xs font-medium text-texto-secundario shadow-suave">Alterações não salvas</span>}
            <Button type="submit" disabled={salvar.isPending || !isDirty} className="shadow-suave">
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar vitrine
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  )
}

/** Vitrine → Configurar vitrine: ligar o site, endereço/QR, banners, textos, contato, redes e mensagens. */
export function VitrineConfigPage() {
  const consulta = useVitrineConfig()
  const pode = usePermissoes()
  const podeEditar = pode('vitrine', 'editar')
  const { usuario } = useAuth()
  const nomeEmpresa = usuario?.empresa.exibicao ?? 'Sua gráfica'
  const c = consulta.data

  return (
    <>
      <PageHeader
        titulo="Vitrine online"
        subtitulo="Seu site de produtos: o cliente escolhe, monta a lista e o pedido de orçamento chega aqui."
        acoes={
          <>
            {pode('orcamentos') && (
              <Button asChild variant="outline">
                <Link to="/orcamentos/solicitacoes?origem=site">
                  <Inbox /> Pedidos do site
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/vitrine/produtos">
                <PackageOpen /> Produtos na vitrine
              </Link>
            </Button>
          </>
        }
      />
      {consulta.isPending ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : consulta.isError || !c ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="space-y-6">
          {(!c.liberadaNoPlano || c.produtosPublicados === 0) && (
            <div className="space-y-3">
              {!c.liberadaNoPlano && (
                <Aviso
                  tom="alerta"
                  icone={AlertTriangle}
                  titulo="Seu plano ainda não inclui a Vitrine online"
                  acao={
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                      <Link to="/assinatura">Minha assinatura</Link>
                    </Button>
                  }
                >
                  Fale com a GrafyGo para liberar. Enquanto isso, você pode configurar tudo; o site abre assim que o módulo for liberado.
                </Aviso>
              )}
              {c.produtosPublicados === 0 && (
                <Aviso
                  tom="info"
                  icone={PackageOpen}
                  titulo="Nenhum produto publicado ainda"
                  acao={
                    <Button asChild size="sm" className="shrink-0">
                      <Link to="/vitrine/produtos">
                        Escolher produtos <ArrowRight />
                      </Link>
                    </Button>
                  }
                >
                  Sem produtos, a vitrine abre vazia. Escolha o que vender no site, coloque fotos e um bom texto de venda.
                </Aviso>
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <FormularioVitrine config={c} podeEditar={podeEditar} nomeEmpresa={nomeEmpresa} />
            <div className="order-first space-y-6 lg:order-none">
              <EnderecoPublico url={c.urlPublica} noAr={c.ativa && c.liberadaNoPlano} nomeEmpresa={(c.titulo || nomeEmpresa).trim()} />
              <div className="grid grid-cols-2 gap-3">
                <CartaoIndicador rotulo="Publicados" valor={c.produtosPublicados} icone={Eye} tom={c.produtosPublicados ? 'marca' : 'alerta'} link="/vitrine/produtos" compacto />
                <CartaoIndicador rotulo="Banners" valor={`${c.banners.length}/${MAX_BANNERS_VITRINE}`} icone={Images} tom={c.banners.length ? 'marca' : 'neutro'} compacto />
              </div>
              <BannersVitrine config={c} podeEditar={podeEditar} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
