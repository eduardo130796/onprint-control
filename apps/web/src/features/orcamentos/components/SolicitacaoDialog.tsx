import { useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { ORIGENS_CLIENTE, ORIGEM_ROTULOS, solicitacaoSchema, type OrigemCliente } from '@onprint/shared'
import { solicitacoesApi } from '@/api/comercial'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { PhoneInput } from '@/components/shared/inputs'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useMutacao } from '@/hooks/useMutacao'
import { usePermission } from '@/hooks/usePermission'
import { buscarClientes } from '../buscas'

/** Cadastro rápido do pedido do cliente, com pré-cadastro na mesma tela quando o cliente é novo. */
export function SolicitacaoDialog({ onFechar }: { onFechar: () => void }) {
  const podeCadastrarCliente = usePermission('clientes', 'criar')
  const [novo, setNovo] = useState(false)
  const [cliente, setCliente] = useState<OpcaoBusca | null>(null)
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [origem, setOrigem] = useState<OrigemCliente>('whatsapp')
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const salvar = useMutacao(['solicitacoes', 'clientes'], (d: unknown) => solicitacoesApi.criar(d))

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const dados = {
      clienteId: novo ? null : (cliente?.id ?? null),
      novoCliente: novo ? { nome, whatsapp } : null,
      origem,
      descricao,
      prazoDesejado: prazo,
    }
    const validacao = solicitacaoSchema.safeParse(dados)
    if (!validacao.success) {
      setErros(Object.fromEntries(validacao.error.issues.map((i) => [i.path.join('.'), i.message])))
      return
    }
    try {
      const s = await salvar.mutateAsync(dados)
      toast.success(`Solicitação ${s.numero} registrada.`)
      onFechar()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo="Nova solicitação de orçamento" descricao="Registre o que o cliente pediu. Se ele for novo, o pré-cadastro é feito aqui mesmo." salvando={salvar.isPending} onSubmit={enviar} largo>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={novo ? 'outline' : 'secondary'} onClick={() => setNovo(false)}>
          <Users /> Cliente cadastrado
        </Button>
        {podeCadastrarCliente && (
          <Button type="button" size="sm" variant={novo ? 'secondary' : 'outline'} onClick={() => setNovo(true)}>
            <UserPlus /> Cliente novo (pré-cadastro)
          </Button>
        )}
      </div>

      {novo ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoFormulario id="sol-nome" rotulo="Nome do cliente *" erro={erros['novoCliente.nome']}>
            <Input id="sol-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
          </CampoFormulario>
          <CampoFormulario id="sol-whats" rotulo="WhatsApp *" erro={erros['novoCliente.whatsapp']}>
            <PhoneInput id="sol-whats" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </CampoFormulario>
        </div>
      ) : (
        <CampoFormulario id="sol-cliente" rotulo="Cliente *" erro={erros.clienteId}>
          <SearchSelect id="sol-cliente" chave="clientes-busca" buscar={buscarClientes} valor={cliente} onChange={setCliente} placeholder="Nome, WhatsApp ou CPF/CNPJ…" invalido={Boolean(erros.clienteId)} />
        </CampoFormulario>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="sol-origem" rotulo="Origem do contato">
          <Select id="sol-origem" value={origem} onChange={(e) => setOrigem(e.target.value as OrigemCliente)}>
            {ORIGENS_CLIENTE.map((o) => (
              <option key={o} value={o}>
                {ORIGEM_ROTULOS[o]}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="sol-prazo" rotulo="Prazo desejado">
          <Input id="sol-prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </CampoFormulario>
      </div>
      <CampoFormulario id="sol-desc" rotulo="O que o cliente pediu *" erro={erros.descricao}>
        <Textarea id="sol-desc" rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: banner 2×1 m para fachada, com ilhós; entrega até sexta." />
      </CampoFormulario>
    </FormDialog>
  )
}
