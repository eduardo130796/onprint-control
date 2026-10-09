import { useCallback, useEffect, useRef, useState } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { cnpjValido, somenteDigitos, type DadosCnpj } from '@onprint/shared'
import { consultasApi } from '@/api/consultas'
import { ErroApi } from '@/api/http'
import { camposVazios, candidatosCnpj, candidatosEndereco, listarRotulos, type MapaCamposCnpj } from '@/lib/consultas'

interface OpcoesConsultaCnpj {
  // Formulários diferentes (empresa, cliente, fornecedor) com nomes de campo próprios
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any, any, any>
  campoDocumento: string
  campos: MapaCamposCnpj
  /** O formulário tem os campos de endereço (cep, logradouro…): preenche se o bloco estiver vazio */
  enderecoNoFormulario?: boolean
  /** Endereço tratado fora do formulário (cliente novo); devolve true se foi aproveitado */
  aoReceberEndereco?: (endereco: DadosCnpj['endereco']) => boolean
  /** Ajustes extras antes de preencher (ex.: cliente PF vira PJ) */
  aoEncontrar?: (dados: DadosCnpj) => void
}

/**
 * Busca os dados públicos do CNPJ e preenche só os campos vazios. Automática uma vez quando o CNPJ
 * digitado fica completo e o nome ainda está vazio; senão pelo botão "Buscar dados".
 */
export function useConsultaCnpj({ form, campoDocumento, campos, enderecoNoFormulario, aoReceberEndereco, aoEncontrar }: OpcoesConsultaCnpj) {
  const [buscando, setBuscando] = useState(false)
  const documento = somenteDigitos(String(useWatch({ control: form.control, name: campoDocumento }) ?? ''))
  const disponivel = documento.length === 14 && cnpjValido(documento)
  // O CNPJ que já veio carregado não dispara a busca automática
  const ultimoAutomatico = useRef(documento)
  const opcoes = useRef({ form, campoDocumento, campos, enderecoNoFormulario, aoReceberEndereco, aoEncontrar })
  useEffect(() => {
    opcoes.current = { form, campoDocumento, campos, enderecoNoFormulario, aoReceberEndereco, aoEncontrar }
  })

  const buscar = useCallback(async () => {
    const o = opcoes.current
    const cnpj = somenteDigitos(String(o.form.getValues(o.campoDocumento) ?? ''))
    if (!cnpjValido(cnpj)) {
      toast.error('Digite um CNPJ válido para buscar os dados.')
      return
    }
    setBuscando(true)
    try {
      const dados = await consultasApi.cnpj(cnpj)
      // O usuário trocou o CNPJ enquanto a consulta andava: descarta
      if (somenteDigitos(String(o.form.getValues(o.campoDocumento) ?? '')) !== cnpj) return
      o.aoEncontrar?.(dados)
      const atuais = o.form.getValues() as Record<string, unknown>
      const preencher = [...camposVazios(atuais, candidatosCnpj(dados, o.campos)), ...(o.enderecoNoFormulario ? candidatosEndereco(dados, atuais) : [])]
      for (const c of preencher) o.form.setValue(c.campo, c.valor, { shouldDirty: true, shouldValidate: Boolean(o.form.formState.errors[c.campo]) })
      const rotulos = preencher.map((c) => c.rotulo)
      if (o.aoReceberEndereco?.(dados.endereco)) rotulos.push('endereço')
      if (rotulos.length) toast.success('Dados preenchidos pela Receita Federal', { description: `Preenchido: ${listarRotulos(rotulos)}.` })
      else toast.info('Dados da Receita Federal conferidos', { description: 'Os campos já estavam preenchidos; nada foi alterado.' })
      if (!dados.ativa) toast.warning(`Situação na Receita: ${dados.situacao || 'não informada'}`, { description: 'Confira antes de fechar negócio com este CNPJ.' })
    } catch (e) {
      toast.error(e instanceof ErroApi && e.status === 404 ? 'CNPJ não encontrado na Receita Federal.' : (e as Error).message)
    } finally {
      setBuscando(false)
    }
  }, [])

  useEffect(() => {
    if (!disponivel || documento === ultimoAutomatico.current) return
    ultimoAutomatico.current = documento
    const nome = String(opcoes.current.form.getValues(opcoes.current.campos.razaoSocial) ?? '').trim()
    if (!nome) void buscar()
  }, [documento, disponivel, buscar])

  return { buscar, buscando, disponivel }
}
