import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { contaPagarSchema, contaReceberSchema, hojeISO, tituloAtualizacaoSchema, type TituloDetalhe } from '@onprint/shared'
import { fornecedoresApi } from '@/api/cadastros'
import { titulosApi, type TipoTitulo } from '@/api/financeiro'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { MoneyInput } from '@/components/shared/inputs'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { buscarClientes } from '@/features/orcamentos/buscas'
import { decimalParaInput } from '@/lib/mascaras'
import { useCategoriasFinanceiras, useContasFinanceiras, useFormasPagamento } from '../hooks'

async function buscarFornecedores(termo: string): Promise<OpcaoBusca[]> {
  const r = await fornecedoresApi.listar({ busca: termo || undefined, pageSize: 10, ativo: 'true' })
  return r.data.map((f) => ({ id: f.id, rotulo: f.nome }))
}

/** Lançamento (com parcelas) ou edição de uma conta a receber/pagar. */
export function TituloDialog({ tipo, titulo, onFechar }: { tipo: TipoTitulo; titulo?: TituloDetalhe; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const categorias = useCategoriasFinanceiras(tipo === 'receber' ? 'receita' : 'despesa')
  const formas = useFormasPagamento()
  const contas = useContasFinanceiras()
  const pessoaInicial = titulo?.cliente ?? titulo?.fornecedor
  const [pessoa, setPessoa] = useState<OpcaoBusca | null>(pessoaInicial ? { id: pessoaInicial.id, rotulo: pessoaInicial.nome } : null)
  const [v, setV] = useState({
    descricao: titulo?.descricao ?? '',
    documento: titulo?.documento ?? '',
    valor: titulo ? decimalParaInput(titulo.valor) : '',
    vencimento: titulo?.vencimento.slice(0, 10) ?? hojeISO(),
    parcelas: '1',
    intervaloDias: '30',
    categoriaId: titulo?.categoria?.id ?? '',
    formaPagamentoId: titulo?.formaPagamento?.id ?? '',
    contaFinanceiraId: titulo?.contaFinanceira?.id ?? '',
    observacao: titulo?.observacao ?? '',
  })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const campo = (k: keyof typeof v) => ({ value: v[k], onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value })) })
  const pago = Boolean(titulo && Number(titulo.valorPago) > 0)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const pessoaCampo = tipo === 'receber' ? { clienteId: pessoa?.id ?? '' } : { fornecedorId: pessoa?.id ?? '' }
    const schema = titulo ? tituloAtualizacaoSchema : tipo === 'receber' ? contaReceberSchema : contaPagarSchema
    const r = schema.safeParse({ ...v, ...pessoaCampo })
    if (!r.success) return setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])))
    setErros({})
    setSalvando(true)
    try {
      const api = titulosApi(tipo)
      if (titulo) await api.atualizar(titulo.id, r.data)
      else await api.criar(r.data)
      toast.success(titulo ? 'Conta atualizada.' : 'Conta lançada.')
      await queryClient.invalidateQueries({ queryKey: ['financeiro'] })
      onFechar()
    } catch (erro) {
      toast.error((erro as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const receber = tipo === 'receber'
  return (
    <FormDialog
      aberto
      onAbertoChange={(x) => !x && onFechar()}
      titulo={titulo ? 'Editar conta' : receber ? 'Nova conta a receber' : 'Nova conta a pagar'}
      salvando={salvando}
      onSubmit={(e) => void salvar(e)}
      largo
    >
      {!titulo && (
        <CampoFormulario id="ti-pessoa" rotulo={receber ? 'Cliente *' : 'Fornecedor'} erro={erros.clienteId ? 'Escolha o cliente.' : undefined}>
          <SearchSelect
            id="ti-pessoa"
            chave={receber ? 'clientes-busca' : 'fornecedores-busca'}
            buscar={receber ? buscarClientes : buscarFornecedores}
            valor={pessoa}
            onChange={setPessoa}
            placeholder={receber ? 'Buscar cliente…' : 'Buscar fornecedor…'}
            invalido={Boolean(erros.clienteId)}
          />
        </CampoFormulario>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <CampoFormulario id="ti-desc" rotulo="Descrição *" erro={erros.descricao}>
            <Input id="ti-desc" autoFocus {...campo('descricao')} placeholder={receber ? 'Ex.: Serviço de instalação' : 'Ex.: Aluguel de outubro'} />
          </CampoFormulario>
        </div>
        {!receber && (
          <CampoFormulario id="ti-doc" rotulo="Documento">
            <Input id="ti-doc" {...campo('documento')} placeholder="NF, boleto…" />
          </CampoFormulario>
        )}
        <CampoFormulario id="ti-valor" rotulo={titulo ? 'Valor *' : 'Valor total *'} erro={erros.valor}>
          <MoneyInput id="ti-valor" disabled={pago} {...campo('valor')} />
        </CampoFormulario>
        <CampoFormulario id="ti-venc" rotulo={titulo ? 'Vencimento *' : '1º vencimento *'} erro={erros.vencimento}>
          <Input id="ti-venc" type="date" {...campo('vencimento')} />
        </CampoFormulario>
        {!titulo && (
          <>
            <CampoFormulario id="ti-parc" rotulo="Parcelas" erro={erros.parcelas}>
              <Input id="ti-parc" type="number" min={1} max={60} {...campo('parcelas')} />
            </CampoFormulario>
            <CampoFormulario id="ti-int" rotulo="A cada (dias)" erro={erros.intervaloDias}>
              <Input id="ti-int" type="number" min={1} {...campo('intervaloDias')} disabled={v.parcelas === '1'} />
            </CampoFormulario>
          </>
        )}
        <CampoFormulario id="ti-cat" rotulo="Categoria">
          <Select id="ti-cat" {...campo('categoriaId')}>
            <option value="">{receber ? 'Outras receitas' : 'Outras despesas'}</option>
            {categorias.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="ti-forma" rotulo="Forma prevista">
          <Select id="ti-forma" {...campo('formaPagamentoId')}>
            <option value="">—</option>
            {formas.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        {!receber && (
          <CampoFormulario id="ti-conta" rotulo="Conta de pagamento">
            <Select id="ti-conta" {...campo('contaFinanceiraId')}>
              <option value="">—</option>
              {contas.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </CampoFormulario>
        )}
      </div>
      {pago && <p className="text-xs text-texto-secundario">Já há pagamento: o valor não pode mudar.</p>}
      <CampoFormulario id="ti-obs" rotulo="Observação">
        <Textarea id="ti-obs" rows={2} {...campo('observacao')} />
      </CampoFormulario>
    </FormDialog>
  )
}
