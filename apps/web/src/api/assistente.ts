import type { AssistenteEmpresa, ControlesAssistente, DescricaoAssistenteInput, DescricaoSugerida, NotaCompraLida, OrcamentoDeTexto, ProdutoSugerido, RegrasDeTexto, RespostaPedir } from '@onprint/shared'
import { http, upload } from './http'

/** Assistente GrafyGo na empresa: controles (Configurações → Assistente) e as ajudas internas (nada é salvo por elas). */
export const assistenteApi = {
  obter: () => http<AssistenteEmpresa>('/assistente'),
  salvar: (dados: ControlesAssistente) => http<AssistenteEmpresa>('/assistente', { method: 'PUT', body: dados }),
  orcamentoDeTexto: (texto: string) => http<OrcamentoDeTexto>('/assistente/orcamento-texto', { method: 'POST', body: { texto } }),
  produtoDeTexto: (texto: string) => http<ProdutoSugerido>('/assistente/produto-texto', { method: 'POST', body: { texto } }),
  descricao: (dados: DescricaoAssistenteInput) => http<DescricaoSugerida>('/assistente/descricao', { method: 'POST', body: dados }),
  regrasDeTexto: (texto: string) => http<RegrasDeTexto>('/assistente/regras-texto', { method: 'POST', body: { texto } }),
  /** "Peça ao Assistente": entende o pedido e devolve o que abrir (ou a resposta da pergunta) */
  pedir: (texto: string) => http<RespostaPedir>('/assistente/pedir', { method: 'POST', body: { texto } }),
  /** Nota de compra anexada (XML, foto ou PDF) → entrada preenchida para conferir */
  nota: (arquivo: File) => upload<NotaCompraLida>('/assistente/pedir/nota', arquivo),
  /** Nota mandada na conversa "Você" do WhatsApp (já lida e guardada): abre a Nova entrada preenchida */
  notaWhatsapp: (id: string) => http<NotaCompraLida>(`/assistente/notas-whatsapp/${id}`),
}

/** Chave do React Query (o uso do mês muda a cada ajuda: invalide depois de usar) */
export const CHAVE_ASSISTENTE = ['assistente']
