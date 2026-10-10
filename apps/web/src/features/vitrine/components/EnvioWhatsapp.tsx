import { useState } from 'react'
import { MessageCircle, UserRound, Users } from 'lucide-react'
import { formatarTelefone } from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/form-controls'
import { cn } from '@/lib/utils'
import { linkWhatsappEnvio, numeroValido, trocarSaudacao } from '../divulgar'

interface OpcaoCliente extends OpcaoBusca {
  numero: string | null
}

/** Clientes ativos com o WhatsApp do cadastro (ou o telefone) */
async function buscarClientes(termo: string): Promise<OpcaoCliente[]> {
  const r = await clientesApi.listar({ busca: termo || undefined, pageSize: 10, ativo: 'true' })
  return r.data.map((c) => {
    const numero = c.whatsapp || c.telefone || null
    return { id: c.id, rotulo: c.nome, numero, detalhe: numero ? formatarTelefone(numero) : 'sem WhatsApp no cadastro' }
  })
}

interface EnvioWhatsappProps {
  /** Texto pronto (com "Olá!"; vira "Olá, Nome!" ao escolher o cliente) */
  mensagemPadrao: string
  /** Prefixo dos ids dos campos (vários na mesma tela) */
  id: string
  dica?: string
  desabilitado?: boolean
}

/**
 * Mensagem editável + "Enviar no WhatsApp" para um cliente do cadastro (usa o WhatsApp da ficha) ou para qualquer
 * contato (o WhatsApp pergunta a conversa). Usado em Compartilhar produto, Divulgar a vitrine e Catálogo em PDF.
 */
export function EnvioWhatsapp({ mensagemPadrao, id, dica = 'No WhatsApp, *texto* fica em negrito. O link mostra a prévia com foto.', desabilitado }: EnvioWhatsappProps) {
  const [cliente, setCliente] = useState<OpcaoCliente | null>(null)
  const [destino, setDestino] = useState<'cliente' | 'contato'>('cliente')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const padraoComNome = trocarSaudacao(mensagemPadrao, cliente?.rotulo)
  const texto = mensagem ?? padraoComNome

  function escolherCliente(o: OpcaoBusca | null) {
    const escolhido = o as OpcaoCliente | null
    setCliente(escolhido)
    if (mensagem !== null) setMensagem(trocarSaudacao(mensagem, escolhido?.rotulo))
  }

  const semNumero = destino === 'cliente' && cliente && !numeroValido(cliente.numero)
  const podeEnviar = !desabilitado && Boolean(texto.trim()) && (destino === 'contato' || (cliente && !semNumero))

  function enviar() {
    const numero = destino === 'cliente' ? cliente?.numero : null
    window.open(linkWhatsappEnvio(numero, texto), '_blank', 'noopener')
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={`${id}-msg`} className="text-sm font-medium text-tinta">
            Mensagem
          </label>
          {mensagem !== null && mensagem !== padraoComNome && (
            <button type="button" className="text-xs font-medium text-marca-escuro hover:underline" onClick={() => setMensagem(null)}>
              Restaurar texto
            </button>
          )}
        </div>
        <Textarea id={`${id}-msg`} rows={5} value={texto} onChange={(e) => setMensagem(e.target.value)} disabled={desabilitado} />
        <p className="mt-1 text-xs text-texto-secundario">{dica}</p>
      </section>

      <section className="rounded-2xl border border-border p-4">
        <p className="mb-3 text-sm font-semibold text-tinta">Enviar no WhatsApp</p>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-fundo p-1" role="radiogroup" aria-label="Para quem enviar">
          {(
            [
              ['cliente', UserRound, 'Um cliente'],
              ['contato', Users, 'Qualquer contato'],
            ] as const
          ).map(([valor, Icone, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={destino === valor}
              onClick={() => setDestino(valor)}
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca',
                destino === valor ? 'bg-card text-tinta shadow-sm' : 'text-texto-secundario hover:text-tinta',
              )}
            >
              <Icone className="h-4 w-4" /> {rotulo}
            </button>
          ))}
        </div>
        {destino === 'cliente' ? (
          <div className="space-y-1.5">
            <SearchSelect id={`${id}-cliente`} chave="clientes-busca-whatsapp" buscar={buscarClientes} valor={cliente} onChange={escolherCliente} placeholder="Nome, WhatsApp ou CPF/CNPJ…" />
            {semNumero && <p className="text-xs text-amber-700">Este cliente não tem WhatsApp no cadastro. Envie para qualquer contato ou complete a ficha.</p>}
          </div>
        ) : (
          <p className="text-xs text-texto-secundario">O WhatsApp abre com a mensagem pronta e você escolhe a conversa (ou um grupo).</p>
        )}
        <Button type="button" className="mt-3 w-full" disabled={!podeEnviar} onClick={enviar}>
          <MessageCircle /> {destino === 'cliente' && cliente ? `Enviar para ${cliente.rotulo.split(' ')[0]}` : 'Abrir o WhatsApp'}
        </Button>
      </section>
    </div>
  )
}
