import type { ProvedorWhatsapp } from './index'

/*
 * O que o próprio sistema mandou (avisos, orçamento, PDF, enquete, respostas automáticas, avisos do Assistente e as
 * reações de confirmação no "Você"): tudo volta pelo webhook como mensagem "fromMe", igual ao que o dono digita no
 * celular. Este registro (em memória, por
 * processo) guarda os ids devolvidos e, para o eco que chega antes de o envio devolver o id, o texto mandado a cada
 * número há pouco. Quem lê as mensagens do dono (aprovação segura) pergunta aqui antes de contar "o dono conversou".
 * O banco (mensagens_whatsapp.id_externo) cobre o que saiu antes de a API reiniciar.
 */

/** Por quanto tempo um envio ainda pode voltar como eco */
export const ECO_ENVIO_MS = 10 * 60_000

/** Os últimos 8 dígitos: o mesmo número com e sem o 55 e o 9º dígito */
const chaveDoNumero = (numero: string) => numero.replace(/\D/g, '').slice(-8)
const chaveDoTexto = (t: string) => t.replace(/\s+/g, ' ').trim()

export class RegistroEnviosWhatsapp {
  private readonly ids = new Map<string, number>()
  private readonly textos = new Map<string, { texto: string; em: number }[]>()
  /** Envios em andamento por número (o eco pode chegar antes da resposta da Evolution) */
  private readonly andamento = new Map<string, number>()

  constructor(private readonly agora: () => number = Date.now) {}

  private limpar() {
    const limite = this.agora() - ECO_ENVIO_MS
    for (const [id, em] of this.ids) if (em < limite) this.ids.delete(id)
    for (const [n, lista] of this.textos) {
      const ficam = lista.filter((t) => t.em >= limite)
      if (ficam.length) this.textos.set(n, ficam)
      else this.textos.delete(n)
    }
  }

  /** Antes de mandar: o texto (ou null, arquivo/enquete) a este número */
  inicio(numero: string, texto: string | null) {
    const n = chaveDoNumero(numero)
    this.andamento.set(n, (this.andamento.get(n) ?? 0) + 1)
    if (texto) this.textos.set(n, [...(this.textos.get(n) ?? []), { texto: chaveDoTexto(texto), em: this.agora() }].slice(-20))
  }

  /** Depois de mandar (ou falhar): o id devolvido */
  fim(numero: string, id: string | null) {
    const n = chaveDoNumero(numero)
    const restam = (this.andamento.get(n) ?? 1) - 1
    if (restam > 0) this.andamento.set(n, restam)
    else this.andamento.delete(n)
    if (id) this.ids.set(id, this.agora())
    this.limpar()
  }

  /**
   * A mensagem "fromMe" foi o sistema que mandou? Pelo id; ou pelo texto igual a um mandado a esse número há pouco; ou
   * sem texto (arquivo) enquanto um envio a esse número está em andamento.
   */
  ehDoSistema(e: { idMensagem: string; numero: string | null; texto: string | null }): boolean {
    this.limpar()
    if (this.ids.has(e.idMensagem)) return true
    if (!e.numero) return false
    const n = chaveDoNumero(e.numero)
    if (e.texto && (this.textos.get(n) ?? []).some((t) => t.texto === chaveDoTexto(e.texto!))) return true
    return !e.texto && (this.andamento.get(n) ?? 0) > 0
  }
}

/** O provedor que anota cada envio no registro (texto, arquivo e enquete) */
export function comRegistro(provedor: ProvedorWhatsapp, registro: RegistroEnviosWhatsapp): ProvedorWhatsapp {
  const anotar = async <T extends { id: string | null }>(numero: string, texto: string | null, enviar: () => Promise<T>): Promise<T> => {
    registro.inicio(numero, texto)
    let id: string | null = null
    try {
      const r = await enviar()
      id = r.id
      return r
    } finally {
      registro.fim(numero, id)
    }
  }
  return Object.assign(Object.create(provedor) as ProvedorWhatsapp, {
    enviarTexto: (instancia: string, numero: string, texto: string) => anotar(numero, texto, () => provedor.enviarTexto(instancia, numero, texto)),
    enviarDocumento: (instancia: string, numero: string, d: Parameters<ProvedorWhatsapp['enviarDocumento']>[2]) =>
      anotar(numero, d.legenda ?? null, () => provedor.enviarDocumento(instancia, numero, d)),
    enviarEnquete: (instancia: string, numero: string, pergunta: string, opcoes: string[]) => anotar(numero, null, () => provedor.enviarEnquete(instancia, numero, pergunta, opcoes)),
    reagir: (instancia: string, chave: { remoteJid: string; fromMe: boolean; id: string }, emoji: string) =>
      anotar(chave.remoteJid.split('@')[0]!, null, () => provedor.reagir(instancia, chave, emoji)),
  })
}
