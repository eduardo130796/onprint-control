import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Contact, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { contatoSchema, formatarTelefone, type ClienteDetalhe, type Contato, type ContatoInput } from '@onprint/shared'
import type { z } from 'zod'
import { clientesApi } from '@/api/cadastros'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { FormDialog } from '@/components/shared/FormDialog'
import { PhoneInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { usePermission } from '@/hooks/usePermission'
import { mascaraTelefone } from '@/lib/mascaras'
import { useMutacaoClientes } from '../hooks'

type Saida = z.output<typeof contatoSchema>

function ContatoDialog({ clienteId, contato, onFechar }: { clienteId: string; contato?: Contato; onFechar: () => void }) {
  const form = useForm<ContatoInput, unknown, Saida>({
    resolver: zodResolver(contatoSchema),
    defaultValues: {
      nome: contato?.nome ?? '',
      cargo: contato?.cargo ?? '',
      email: contato?.email ?? '',
      telefone: mascaraTelefone(contato?.telefone),
      whatsapp: mascaraTelefone(contato?.whatsapp),
      principal: contato?.principal ?? false,
    },
  })
  const { errors } = form.formState
  const salvar = useMutacaoClientes((dados: Saida) => clientesApi.salvarContato(clienteId, dados, contato?.id))

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success('Contato salvo.')
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={contato ? 'Editar contato' : 'Novo contato'} salvando={salvar.isPending} onSubmit={onSubmit}>
      <CampoFormulario id="ct-nome" rotulo="Nome *" erro={errors.nome?.message}>
        <Input id="ct-nome" autoFocus aria-invalid={Boolean(errors.nome)} {...form.register('nome')} />
      </CampoFormulario>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="ct-cargo" rotulo="Cargo / setor">
          <Input id="ct-cargo" {...form.register('cargo')} />
        </CampoFormulario>
        <CampoFormulario id="ct-email" rotulo="E-mail" erro={errors.email?.message}>
          <Input id="ct-email" type="email" {...form.register('email')} />
        </CampoFormulario>
        <CampoFormulario id="ct-whatsapp" rotulo="WhatsApp" erro={errors.whatsapp?.message}>
          <PhoneInput id="ct-whatsapp" {...form.register('whatsapp')} />
        </CampoFormulario>
        <CampoFormulario id="ct-telefone" rotulo="Telefone" erro={errors.telefone?.message}>
          <PhoneInput id="ct-telefone" {...form.register('telefone')} />
        </CampoFormulario>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...form.register('principal')} /> Contato principal
      </label>
    </FormDialog>
  )
}

export function ContatosTab({ cliente }: { cliente: ClienteDetalhe }) {
  const podeEditar = usePermission('clientes', 'editar')
  const [editando, setEditando] = useState<Contato | 'novo' | null>(null)
  const [removendo, setRemovendo] = useState<Contato | null>(null)
  const remover = useMutacaoClientes((id: string) => clientesApi.removerContato(cliente.id, id))

  return (
    <div className="space-y-4">
      {podeEditar && (
        <div className="flex justify-end">
          <Button onClick={() => setEditando('novo')}>
            <Plus /> Adicionar contato
          </Button>
        </div>
      )}
      {cliente.contatos.length === 0 ? (
        <EmptyState icone={Contact} titulo="Nenhum contato" descricao="Pessoas da empresa do cliente: compras, financeiro, marketing…" />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {cliente.contatos.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  {c.nome}
                  {c.principal && <Star className="h-3.5 w-3.5 fill-ambar text-ambar" aria-label="Principal" />}
                  {c.cargo && <span className="font-normal text-texto-secundario">· {c.cargo}</span>}
                </p>
                <p className="text-texto-secundario">
                  {[formatarTelefone(c.whatsapp), formatarTelefone(c.telefone), c.email].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {podeEditar && (
                <>
                  <AcaoIcone icone={Pencil} rotulo="Editar contato" onClick={() => setEditando(c)} />
                  <AcaoIcone icone={Trash2} rotulo="Remover contato" perigo onClick={() => setRemovendo(c)} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {editando && <ContatoDialog clienteId={cliente.id} contato={editando === 'novo' ? undefined : editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={Boolean(removendo)}
        onAbertoChange={(v) => !v && setRemovendo(null)}
        titulo="Remover contato"
        descricao={<>O contato <strong>{removendo?.nome}</strong> será removido.</>}
        textoConfirmar="Remover"
        perigoso
        onConfirmar={() => remover.mutateAsync(removendo!.id)}
      />
    </div>
  )
}
