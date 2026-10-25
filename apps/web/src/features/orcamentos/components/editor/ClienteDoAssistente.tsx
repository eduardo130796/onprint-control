import { useEffect, useState } from 'react'
import { Pencil, UserPlus, UserRound, X } from 'lucide-react'
import type { ClienteNovoSugerido } from '@onprint/shared'
import { consultasApi } from '@/api/consultas'
import type { OpcaoBusca } from '@/components/shared/SearchSelect'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mascaraCpfCnpj, mascaraTelefone } from '@/lib/mascaras'
import { clienteNovoCompleto, type ClientePendente } from './clienteNovo'

/**
 * Linha compacta no campo Cliente do orçamento: "Cliente novo: Padaria Pão Quente · (11) 97777-6666 · será cadastrado
 * ao salvar" (com "editar"), ou a escolha de um toque entre os parecidos do cadastro ("É a Ana Silva (Centro)?").
 * Com CNPJ e sem nome, busca razão social, nome fantasia, contato e endereço na Receita.
 */
export function ClienteDoAssistente({ pendente, onEscolher, onMudar }: { pendente: ClientePendente; onEscolher: (c: OpcaoBusca) => void; onMudar: (p: ClientePendente | null) => void }) {
  const novo = pendente.novo
  const [editando, setEditando] = useState(() => Boolean(novo && !clienteNovoCompleto(novo) && !novo.documento))

  // CNPJ sem nome: a Receita completa (uma vez)
  const cnpj = novo?.documento?.length === 14 && !novo.nome ? novo.documento : null
  useEffect(() => {
    if (!cnpj) return
    let ativo = true
    void consultasApi
      .cnpj(cnpj)
      .then((d) => {
        if (!ativo) return
        onMudar({
          ...pendente,
          novo: { ...pendente.novo!, nome: d.nomeFantasia || d.razaoSocial, email: pendente.novo!.email ?? (d.email || null), telefone: pendente.novo!.telefone ?? (d.telefone || null), endereco: d.endereco },
        })
      })
      .catch(() => ativo && setEditando(true))
    return () => {
      ativo = false
    }
    // Só quando o CNPJ muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj])

  if (!novo && pendente.candidatos.length) {
    return (
      <div className="mt-2 space-y-1.5" role="group" aria-label="Clientes parecidos">
        <p className="text-xs text-texto-secundario">O pedido cita um cliente com mais de um parecido no cadastro. É algum destes?</p>
        <div className="flex flex-wrap gap-2">
          {pendente.candidatos.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onEscolher({ id: c.id, rotulo: c.rotulo })}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-tinta transition-colors hover:border-marca hover:bg-marca-suave"
            >
              <UserRound className="h-3.5 w-3.5" /> É {c.rotulo}
              {c.detalhe ? ` (${c.detalhe})` : ''}?
            </button>
          ))}
        </div>
      </div>
    )
  }
  if (!novo) return null

  const mudar = (dados: Partial<ClienteNovoSugerido>) => onMudar({ ...pendente, novo: { ...novo, ...dados } })
  const contato = novo.whatsapp ?? novo.telefone
  const completo = clienteNovoCompleto(novo)
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-marca-suave/60 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 shrink-0 text-marca-escuro" aria-hidden="true" />
        <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <strong>Cliente novo:</strong> {novo.nome || (cnpj ? 'buscando na Receita…' : 'sem nome')}
          {contato ? ` · ${mascaraTelefone(contato)}` : novo.email ? ` · ${novo.email}` : ''}
          {novo.documento ? ` · ${mascaraCpfCnpj(novo.documento)}` : ''}
          <span className={completo ? 'text-texto-secundario' : 'font-medium text-amber-800'}> · {completo ? 'será cadastrado ao salvar' : 'falta o nome ou um contato'}</span>
        </p>
        <AcaoIcone icone={Pencil} rotulo="Editar o cliente novo" onClick={() => setEditando((v) => !v)} />
        <AcaoIcone icone={X} rotulo="Não cadastrar (escolher outro cliente)" onClick={() => onMudar(null)} />
      </div>
      {editando && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Input aria-label="Nome do cliente novo" placeholder="Nome ou empresa" value={novo.nome ?? ''} onChange={(e) => mudar({ nome: e.target.value })} />
          <Input aria-label="WhatsApp do cliente novo" placeholder="WhatsApp" inputMode="tel" value={mascaraTelefone(novo.whatsapp ?? '')} onChange={(e) => mudar({ whatsapp: e.target.value.replace(/\D/g, '') || null })} />
          <Input aria-label="CPF ou CNPJ do cliente novo" placeholder="CPF ou CNPJ (opcional)" inputMode="numeric" value={mascaraCpfCnpj(novo.documento ?? '')} onChange={(e) => mudar({ documento: e.target.value.replace(/\D/g, '') || null })} />
          <Button type="button" size="sm" variant="outline" className="sm:col-span-3 sm:justify-self-end" onClick={() => setEditando(false)}>
            Pronto
          </Button>
        </div>
      )}
    </div>
  )
}
