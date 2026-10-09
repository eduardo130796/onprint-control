import { useState } from 'react'
import { Loader2, MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { TIPO_ENDERECO_ROTULOS, cnpjValido, formatarCep, type ClienteDetalhe, type Endereco } from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { consultasApi } from '@/api/consultas'
import { ErroApi } from '@/api/http'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { usePermission } from '@/hooks/usePermission'
import { enderecoPrincipalDaReceita, type EnderecoReceita } from '@/lib/consultas'
import { useMutacaoClientes } from '../hooks'
import { EnderecoDialog } from './EnderecoDialog'

function linhaEndereco(e: Endereco) {
  const rua = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ')
  const cidade = [e.bairro, `${e.cidade}/${e.uf}`].filter(Boolean).join(' · ')
  return { rua, cidade, cep: e.cep ? `CEP ${formatarCep(e.cep)}` : '' }
}

export function EnderecosTab({ cliente }: { cliente: ClienteDetalhe }) {
  const podeEditar = usePermission('clientes', 'editar')
  const [editando, setEditando] = useState<Endereco | 'novo' | { receita: EnderecoReceita } | null>(null)
  const [buscandoReceita, setBuscandoReceita] = useState(false)
  // Cliente PJ sem endereço: oferece o endereço da Receita (abre o formulário para conferir antes de salvar)
  const ofereceReceita = podeEditar && cliente.enderecos.length === 0 && Boolean(cliente.cpfCnpj && cnpjValido(cliente.cpfCnpj))

  async function buscarNaReceita() {
    setBuscandoReceita(true)
    try {
      const dados = await consultasApi.cnpj(cliente.cpfCnpj!)
      const endereco = enderecoPrincipalDaReceita(dados.endereco)
      if (endereco) setEditando({ receita: endereco })
      else toast.info('A Receita não tem um endereço completo para este CNPJ.', { description: 'Cadastre o endereço manualmente.' })
    } catch (e) {
      toast.error(e instanceof ErroApi && e.status === 404 ? 'CNPJ não encontrado na Receita Federal.' : (e as Error).message)
    } finally {
      setBuscandoReceita(false)
    }
  }
  const [removendo, setRemovendo] = useState<Endereco | null>(null)
  const remover = useMutacaoClientes((id: string) => clientesApi.removerEndereco(cliente.id, id))

  return (
    <div className="space-y-4">
      {podeEditar && (
        <div className="flex flex-wrap justify-end gap-2">
          {ofereceReceita && (
            <Button variant="outline" disabled={buscandoReceita} onClick={() => void buscarNaReceita()}>
              {buscandoReceita ? <Loader2 className="animate-spin" /> : <Search />} Adicionar endereço da Receita
            </Button>
          )}
          <Button onClick={() => setEditando('novo')}>
            <Plus /> Adicionar endereço
          </Button>
        </div>
      )}
      {cliente.enderecos.length === 0 ? (
        <EmptyState icone={MapPin} titulo="Nenhum endereço" descricao="Cadastre o endereço principal, de entrega ou de cobrança." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cliente.enderecos.map((e) => {
            const l = linhaEndereco(e)
            return (
              <div key={e.id} className="flex gap-3 rounded-2xl border border-border p-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-marca-escuro" />
                <div className="min-w-0 flex-1 text-sm">
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-tinta">
                    {TIPO_ENDERECO_ROTULOS[e.tipo]}
                  </span>
                  <p className="mt-2 font-medium">{l.rua}</p>
                  <p className="text-texto-secundario">{l.cidade}</p>
                  {l.cep && <p className="text-texto-secundario">{l.cep}</p>}
                  {e.referencia && <p className="mt-1 text-xs text-texto-secundario">Ref.: {e.referencia}</p>}
                </div>
                {podeEditar && (
                  <div className="flex flex-col gap-1">
                    <AcaoIcone icone={Pencil} rotulo="Editar endereço" onClick={() => setEditando(e)} />
                    <AcaoIcone icone={Trash2} rotulo="Remover endereço" perigo onClick={() => setRemovendo(e)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editando && (
        <EnderecoDialog
          clienteId={cliente.id}
          endereco={editando === 'novo' || 'receita' in editando ? undefined : editando}
          inicial={editando !== 'novo' && 'receita' in editando ? editando.receita : undefined}
          onFechar={() => setEditando(null)}
        />
      )}
      <ConfirmDialog
        aberto={Boolean(removendo)}
        onAbertoChange={(v) => !v && setRemovendo(null)}
        titulo="Remover endereço"
        descricao="O endereço será removido da ficha do cliente."
        textoConfirmar="Remover"
        perigoso
        onConfirmar={() => remover.mutateAsync(removendo!.id)}
      />
    </div>
  )
}
