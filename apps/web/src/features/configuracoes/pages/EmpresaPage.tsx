import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImageIcon, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { EXTENSOES_IMAGEM, TEMPOS_INATIVIDADE, empresaSchema, type EmpresaConfig, type EmpresaInput } from '@onprint/shared'
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
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useConsultaCnpj } from '@/hooks/useConsultaCnpj'
import { usePermission } from '@/hooks/usePermission'
import { decimalParaInput, mascaraCep, mascaraCpfCnpj, mascaraTelefone } from '@/lib/mascaras'
import { CHAVE_EMPRESA, useEmpresa, useUrlArquivo } from '../hooks'
import { nomeExibicao } from '../marca'

type Saida = z.output<typeof empresaSchema>

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
            <CampoFormulario id="emp-sinal" rotulo="Sinal padrão" erro={errors.sinalPercentual?.message}>
              <NumberInput id="emp-sinal" sufixo="%" {...r('sinalPercentual')} />
            </CampoFormulario>
            <CampoFormulario id="emp-area" rotulo="Área mínima por peça" erro={errors.areaMinimaM2?.message}>
              <NumberInput id="emp-area" casas={3} sufixo="m²" {...r('areaMinimaM2')} />
            </CampoFormulario>
            <CampoFormulario id="emp-pix" rotulo="Chave PIX">
              <Input id="emp-pix" {...r('chavePix')} />
            </CampoFormulario>
            <div className="md:col-span-4">
              <CampoFormulario id="emp-condicoes" rotulo="Condições padrão do orçamento">
                <Textarea id="emp-condicoes" {...r('condicoesPadrao')} />
              </CampoFormulario>
            </div>
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
          <div className="order-first lg:order-none">
            <LogoCard empresa={consulta.data} podeEditar={podeEditar} />
          </div>
        </div>
      )}
    </>
  )
}
