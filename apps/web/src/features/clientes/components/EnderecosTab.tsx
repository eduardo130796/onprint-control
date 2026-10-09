import { useState } from 'react'
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { TIPO_ENDERECO_ROTULOS, formatarCep, type ClienteDetalhe, type Endereco } from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { usePermission } from '@/hooks/usePermission'
import { useMutacaoClientes } from '../hooks'
import { EnderecoDialog } from './EnderecoDialog'

function linhaEndereco(e: Endereco) {
  const rua = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ')
  const cidade = [e.bairro, `${e.cidade}/${e.uf}`].filter(Boolean).join(' · ')
  return { rua, cidade, cep: e.cep ? `CEP ${formatarCep(e.cep)}` : '' }
}

export function EnderecosTab({ cliente }: { cliente: ClienteDetalhe }) {
  const podeEditar = usePermission('clientes', 'editar')
  const [editando, setEditando] = useState<Endereco | 'novo' | null>(null)
  const [removendo, setRemovendo] = useState<Endereco | null>(null)
  const remover = useMutacaoClientes((id: string) => clientesApi.removerEndereco(cliente.id, id))

  return (
    <div className="space-y-4">
      {podeEditar && (
        <div className="flex justify-end">
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
          endereco={editando === 'novo' ? undefined : editando}
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
