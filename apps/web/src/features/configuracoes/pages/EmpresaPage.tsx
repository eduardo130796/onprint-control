import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImageIcon, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  EXTENSOES_IMAGEM,
  PRIORIDADES,
  PRIORIDADE_ROTULOS,
  TEMPOS_INATIVIDADE,
  TIPOS_ENTREGA,
  TIPO_ENTREGA_ROTULOS,
  empresaSchema,
  formatarMoeda,
  type EmpresaConfig,
  type EmpresaInput,
} from '@onprint/shared'
import type { z } from 'zod'
import { empresaApi } from '@/api/configuracoes'
import { PageHeader } from '@/components/layout/PageHeader'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { BotaoBuscarCnpj } from '@/components/shared/BotaoBuscarCnpj'
import { CamposEndereco } from '@/components/shared/CamposEndereco'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { FileUploader } from '@/components/shared/FileUploader'
import { CpfCnpjInput, NumberInput, PhoneInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { resumoPagamentoDoForm } from '@/features/orcamentos/components/editor/formOrcamento'
import { EnderecoVitrine } from '@/features/vitrine/components/EnderecoVitrine'
import { useAuth } from '@/hooks/useAuth'
import { useConsultaCnpj } from '@/hooks/useConsultaCnpj'
import { usePermission } from '@/hooks/usePermission'
import { decimalParaInput, mascaraCep, mascaraCpfCnpj, mascaraTelefone } from '@/lib/mascaras'
import { CHAVE_EMPRESA, useEmpresa, useUrlArquivo } from '../hooks'
import { nomeExibicao } from '../marca'

type Saida = z.output<typeof empresaSchema>

/** Resumo ao vivo do pagamento padrão, num orçamento de exemplo de R$ 1.000,00 (o mesmo texto que o cliente vê) */
function ExemploPagamento({ sinal, parcelas, intervalo }: { sinal: unknown; parcelas: unknown; intervalo: unknown }) {
  const resumo = resumoPagamentoDoForm({ sinalPercentual: String(sinal ?? ''), parcelas: String(parcelas ?? ''), intervaloDias: String(intervalo ?? '') }, '1000')
  if (!resumo) return null
  return (
    <p className="rounded-xl bg-marca-suave px-3 py-2 text-sm text-marca-escuro">
      Num orçamento de {formatarMoeda(1000)}: <strong>{resumo}</strong>
    </p>
  )
}

function valores(e: EmpresaConfig): EmpresaInput {
  return {
    razaoSocial: e.razaoSocial,
    nomeFantasia: e.nomeFantasia ?? '',
    cnpj: mascaraCpfCnpj(e.cnpj),
    ie: e.ie ?? '',
    email: e.email ?? '',
    telefone: mascaraTelefone(e.telefone),
    whatsapp: mascaraTelefone(e.whatsapp),
    site: e.site ?? '',
    cep: mascaraCep(e.cep),
    logradouro: e.logradouro ?? '',
    numero: e.numero ?? '',
    complemento: e.complemento ?? '',
    bairro: e.bairro ?? '',
    cidade: e.cidade ?? '',
    uf: e.uf ?? '',
    validadeOrcamentoDias: String(e.validadeOrcamentoDias),
    condicoesPadrao: e.condicoesPadrao ?? '',
    sinalPercentual: decimalParaInput(e.sinalPercentual),
    chavePix: e.chavePix ?? '',
    areaMinimaM2: decimalParaInput(e.areaMinimaM2, 3),
    inatividadeMinutos: e.inatividadeMinutos,
    converterAoAprovar: e.converterAoAprovar,
    parcelasPadrao: String(e.parcelasPadrao),
    intervaloDiasPadrao: String(e.intervaloDiasPadrao),
    tipoEntregaPadrao: e.tipoEntregaPadrao,
    prioridadePadrao: e.prioridadePadrao,
  }
}

export function LogoCard({ empresa, podeEditar }: { empresa: EmpresaConfig; podeEditar: boolean }) {
  const queryClient = useQueryClient()
  const { atualizarMarca } = useAuth()
  const url = useUrlArquivo(empresa.logoArquivoId)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fundo sempre claro: logos escuras não somem no modo escuro */}
        <div className="flex h-32 items-center justify-center rounded-2xl bg-white p-4 ring-1 ring-border">
          {url.data ? (
            <img src={url.data} alt="Logo da empresa" className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageIcon className="h-10 w-10 text-texto-secundario" aria-label="Sem logo" />
          )}
        </div>
        {podeEditar && (
          <FileUploader
            extensoes={EXTENSOES_IMAGEM}
            tamanhoMaxMb={5}
            texto="Arraste a logo (topo do sistema, aba do navegador e documentos) ou"
            onEnviar={async (arquivo, progresso) => {
              const atualizada = await empresaApi.enviarLogo(arquivo, progresso)
              queryClient.setQueryData(CHAVE_EMPRESA, atualizada)
              atualizarMarca({ logoArquivoId: atualizada.logoArquivoId })
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}

function EmpresaForm({ empresa, podeEditar }: { empresa: EmpresaConfig; podeEditar: boolean }) {
  const queryClient = useQueryClient()
  const { usuario, atualizarMarca } = useAuth()
  const form = useForm<EmpresaInput, unknown, Saida>({ resolver: zodResolver(empresaSchema), defaultValues: valores(empresa) })
  const { errors, isDirty } = form.formState
  const salvar = useMutation({ mutationFn: (d: Saida) => empresaApi.salvar(d) })
  const r = form.register
  const consultaCnpj = useConsultaCnpj({
    form,
    campoDocumento: 'cnpj',
    campos: { razaoSocial: 'razaoSocial', nomeFantasia: 'nomeFantasia', email: 'email', telefone: 'telefone', ie: 'ie' },
    enderecoNoFormulario: true,
  })

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      const salva = await salvar.mutateAsync(dados)
      queryClient.setQueryData(CHAVE_EMPRESA, salva)
      atualizarMarca({ exibicao: nomeExibicao(salva, usuario?.empresa.nome ?? '') })
      form.reset(valores(salva))
      toast.success('Dados da empresa salvos.')
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!podeEditar || salvar.isPending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados cadastrais</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <CampoFormulario id="emp-razao" rotulo="Razão social *" erro={errors.razaoSocial?.message}>
              <Input id="emp-razao" {...r('razaoSocial')} />
            </CampoFormulario>
            <CampoFormulario id="emp-fantasia" rotulo="Nome fantasia">
              <Input id="emp-fantasia" {...r('nomeFantasia')} />
            </CampoFormulario>
            <CampoFormulario id="emp-cnpj" rotulo="CNPJ" erro={errors.cnpj?.message} acao={<BotaoBuscarCnpj consulta={consultaCnpj} />}>
              <CpfCnpjInput id="emp-cnpj" {...r('cnpj')} />
            </CampoFormulario>
            <CampoFormulario id="emp-ie" rotulo="Inscrição estadual">
              <Input id="emp-ie" {...r('ie')} />
            </CampoFormulario>
            <CampoFormulario id="emp-whatsapp" rotulo="WhatsApp" erro={errors.whatsapp?.message}>
              <PhoneInput id="emp-whatsapp" {...r('whatsapp')} />
            </CampoFormulario>
            <CampoFormulario id="emp-telefone" rotulo="Telefone" erro={errors.telefone?.message}>
              <PhoneInput id="emp-telefone" {...r('telefone')} />
            </CampoFormulario>
            <CampoFormulario id="emp-email" rotulo="E-mail" erro={errors.email?.message}>
              <Input id="emp-email" type="email" {...r('email')} />
            </CampoFormulario>
            <CampoFormulario id="emp-site" rotulo="Site / Instagram">
              <Input id="emp-site" {...r('site')} />
            </CampoFormulario>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endereço</CardTitle>
          </CardHeader>
          <CardContent>
            <CamposEndereco prefixo="emp" register={form.register} errors={errors} setValue={form.setValue} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Padrões comerciais</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <CampoFormulario id="emp-validade" rotulo="Validade do orçamento" erro={errors.validadeOrcamentoDias?.message}>
              <NumberInput id="emp-validade" casas={0} sufixo="dias" {...r('validadeOrcamentoDias')} />
            </CampoFormulario>
            <CampoFormulario id="emp-area" rotulo="Área mínima por peça" erro={errors.areaMinimaM2?.message}>
              <NumberInput id="emp-area" casas={3} sufixo="m²" {...r('areaMinimaM2')} />
            </CampoFormulario>
            <div className="md:col-span-2">
              <CampoFormulario id="emp-pix" rotulo="Chave PIX">
                <Input id="emp-pix" {...r('chavePix')} />
              </CampoFormulario>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagamento padrão do orçamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-texto-secundario">
              Todo orçamento novo começa com este pagamento (o vendedor ajusta em cada um). Ele vai na mensagem, no PDF e na página de aprovação, e o pedido gera
              exatamente essas contas a receber.
            </p>
            <div className="grid grid-cols-3 items-end gap-3 md:max-w-xl">
              <CampoFormulario id="emp-sinal" rotulo="Entrada" erro={errors.sinalPercentual?.message}>
                <NumberInput id="emp-sinal" sufixo="%" {...r('sinalPercentual')} />
              </CampoFormulario>
              <CampoFormulario id="emp-parcelas" rotulo="Parcelas do saldo" erro={errors.parcelasPadrao?.message}>
                <NumberInput id="emp-parcelas" casas={0} {...r('parcelasPadrao')} />
              </CampoFormulario>
              <CampoFormulario id="emp-intervalo" rotulo="A cada" erro={errors.intervaloDiasPadrao?.message}>
                <NumberInput id="emp-intervalo" casas={0} sufixo="dias" {...r('intervaloDiasPadrao')} />
              </CampoFormulario>
            </div>
            <ExemploPagamento sinal={form.watch('sinalPercentual')} parcelas={form.watch('parcelasPadrao')} intervalo={form.watch('intervaloDiasPadrao')} />
            <CampoFormulario id="emp-condicoes" rotulo="Observações de pagamento (opcional)">
              <Textarea id="emp-condicoes" rows={2} placeholder="Ex.: Pix, cartão ou boleto." {...r('condicoesPadrao')} />
            </CampoFormulario>
            <p className="-mt-2 text-xs text-texto-secundario">
              Uma linha extra abaixo do resumo do pagamento (forma de pagamento, por exemplo). Não repita entrada e parcelas aqui: elas já saem dos campos acima.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pedidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" {...r('converterAoAprovar')} />
              <span>
                Quando o cliente aprovar o orçamento, criar o pedido automaticamente
                <span className="block text-xs text-texto-secundario">
                  Vale para a aprovação pelo link, “Registrar aprovação” e “Cliente aprovou pelo WhatsApp”. O pedido nasce com o pagamento combinado no orçamento
                  (contas a receber), as artes dos itens marcados e a produção, e o cliente recebe a confirmação pelo WhatsApp, se os avisos estiverem ligados.
                  Desmarcado, o orçamento fica “Aprovado” e alguém converte em pedido.
                </span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2 md:max-w-xl">
              <CampoFormulario id="emp-entrega" rotulo="Entrega">
                <Select id="emp-entrega" {...r('tipoEntregaPadrao')}>
                  {TIPOS_ENTREGA.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_ENTREGA_ROTULOS[t]}
                    </option>
                  ))}
                </Select>
              </CampoFormulario>
              <CampoFormulario id="emp-prioridade" rotulo="Prioridade">
                <Select id="emp-prioridade" {...r('prioridadePadrao')}>
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORIDADE_ROTULOS[p]}
                    </option>
                  ))}
                </Select>
              </CampoFormulario>
            </div>
            <p className="text-xs text-texto-secundario">
              Também são os valores iniciais de “Converter em pedido” (o pagamento lá vem do orçamento). Na criação automática, entrega ou instalação usam o endereço
              principal do cliente; sem endereço cadastrado, o pedido sai como retirada.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Segurança</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <CampoFormulario id="emp-inatividade" rotulo="Sair sozinho depois de" erro={errors.inatividadeMinutos?.message}>
              <Select id="emp-inatividade" {...r('inatividadeMinutos')}>
                {TEMPOS_INATIVIDADE.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minutos` : m === 60 ? '1 hora' : `${m / 60} horas`} sem uso
                  </option>
                ))}
              </Select>
            </CampoFormulario>
            <p className="self-end pb-2 text-sm text-texto-secundario">
              Vale para todos os usuários. Um minuto antes aparece um aviso para continuar conectado. Para a TV da produção, marque o usuário como "usuário de painel".
            </p>
          </CardContent>
        </Card>
        {podeEditar && (
          <div className="flex justify-end">
            <Button type="submit" disabled={salvar.isPending || !isDirty}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  )
}

export function EmpresaPage() {
  const consulta = useEmpresa()
  const podeEditar = usePermission('configuracoes', 'editar')

  return (
    <>
      <PageHeader titulo="Dados da empresa" subtitulo="Aparecem nos documentos e no topo do sistema, e definem os padrões comerciais." />
      {consulta.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <EmpresaForm key={consulta.data.updatedAt} empresa={consulta.data} podeEditar={podeEditar} />
          <div className="order-first space-y-6 lg:order-none">
            <LogoCard empresa={consulta.data} podeEditar={podeEditar} />
            <EnderecoVitrine podeEditar={podeEditar} />
          </div>
        </div>
      )}
    </>
  )
}
