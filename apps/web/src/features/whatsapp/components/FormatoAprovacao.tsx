import { Check } from 'lucide-react'
import { FORMATOS_APROVACAO, FORMATO_APROVACAO_ROTULOS, LINHA_APROVACAO_CONVERSA, OPCOES_ENQUETE_ORCAMENTO, type FormatoAprovacao } from '@onprint/shared'
import { cn } from '@/lib/utils'

const EXPLICACAO: Record<FormatoAprovacao, string> = {
  conversa: 'Sem enquete nem número: o cliente responde do jeito dele (“pode fazer”, “fechado”, 👍) e o sistema entende.',
  enquete: 'Depois do orçamento vai uma enquete. O cliente toca em Aprovado ou em Quero modificações.',
  numeros: 'O cliente responde 1 para aprovar ou 2 para pedir mudança. Bom para quem estranha enquete.',
}

/**
 * "Como o cliente aprova o orçamento" (tela WhatsApp): conversa natural (recomendada), enquete ou responder 1/2, cada
 * um com uma prévia pequena da conversa. O "aprovado" escrito vale em todos.
 */
export function FormatoAprovacaoEscolha({ valor, onMudar, desabilitado }: { valor: FormatoAprovacao; onMudar: (f: FormatoAprovacao) => void; desabilitado?: boolean }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-tinta">Como o cliente aprova o orçamento</legend>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        {FORMATOS_APROVACAO.map((f) => {
          const marcado = valor === f
          return (
            <label
              key={f}
              className={cn(
                'flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors',
                marcado ? 'border-marca bg-marca-suave/60 ring-1 ring-marca' : 'border-tinta/10 hover:border-tinta/25',
                desabilitado && 'cursor-default opacity-70',
              )}
            >
              <span className="flex items-start gap-2">
                <input type="radio" name="formato-aprovacao" value={f} checked={marcado} disabled={desabilitado} onChange={() => onMudar(f)} className="mt-0.5 h-4 w-4 shrink-0 accent-marca" />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-tinta">
                    {FORMATO_APROVACAO_ROTULOS[f]}
                    {f === 'conversa' && <span className="rounded-full bg-verde/15 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-green-800">Recomendado</span>}
                  </span>
                  <span className="block text-xs text-texto-secundario">{EXPLICACAO[f]}</span>
                </span>
              </span>
              {f === 'conversa' ? <PreviaConversa /> : f === 'enquete' ? <PreviaEnquete /> : <PreviaNumeros />}
            </label>
          )
        })}
      </div>
      <p className="text-xs text-texto-secundario">
        Em todos, escrever “aprovado” também aprova; pergunta ou dúvida nunca aprova (vai para o vendedor). O link de aprovação continua no fim da mensagem.
      </p>
    </fieldset>
  )
}

function Conversa({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="flex flex-col gap-1 rounded-lg bg-[#efeae2] p-2 text-[0.6875rem] leading-snug text-[#111b21] dark:bg-[#0b141a] dark:text-[#e9edef]">
      {children}
    </span>
  )
}

const recebida = 'mr-6 w-fit max-w-full rounded-lg rounded-tl-sm bg-white px-2 py-1 shadow-sm dark:bg-[#202c33]'
const enviada = 'ml-auto w-fit rounded-lg rounded-tr-sm bg-[#d9fdd3] px-2 py-1 shadow-sm dark:bg-[#005c4b]'

function PreviaConversa() {
  return (
    <Conversa>
      <span className={recebida}>{LINHA_APROVACAO_CONVERSA}</span>
      <span className={enviada}>Pode fazer 👍</span>
    </Conversa>
  )
}

function PreviaEnquete() {
  return (
    <Conversa>
      <span className={recebida}>
        Toque em uma opção logo abaixo ou responda <b>APROVADO</b> aqui mesmo.
      </span>
      <span className={cn(recebida, 'min-w-[11rem]')}>
        <b className="block">Aprovar o orçamento ORC-0142?</b>
        {[OPCOES_ENQUETE_ORCAMENTO.aprovar, OPCOES_ENQUETE_ORCAMENTO.modificar].map((o, i) => (
          <span key={o} className="mt-1 flex items-center gap-1.5">
            <span className={cn('flex h-3 w-3 shrink-0 items-center justify-center rounded-full border', i === 0 ? 'border-[#00A884] bg-[#00A884]' : 'border-slate-400')}>
              {i === 0 && <Check className="h-2 w-2 text-white" strokeWidth={4} />}
            </span>
            {o}
          </span>
        ))}
      </span>
    </Conversa>
  )
}

function PreviaNumeros() {
  return (
    <Conversa>
      <span className={recebida}>
        Para aprovar, responda <b>1</b>.
        <br />
        Para pedir alguma mudança, responda <b>2</b>.
      </span>
      <span className={enviada}>1</span>
    </Conversa>
  )
}
