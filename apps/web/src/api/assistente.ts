import type { AssistenteEmpresa, ControlesAssistente, DescricaoAssistenteInput, DescricaoSugerida, OrcamentoDeTexto, ProdutoSugerido, RegrasDeTexto } from '@onprint/shared'
import { http } from './http'

/** Assistente GrafyGo na empresa: controles (Configurações → Assistente) e as ajudas internas (nada é salvo por elas). */
export const assistenteApi = {
  obter: () => http<AssistenteEmpresa>('/assistente'),
  salvar: (dados: ControlesAssistente) => http<AssistenteEmpresa>('/assistente', { method: 'PUT', body: dados }),
  orcamentoDeTexto: (texto: string) => http<OrcamentoDeTexto>('/assistente/orcamento-texto', { method: 'POST', body: { texto } }),
  produtoDeTexto: (texto: string) => http<ProdutoSugerido>('/assistente/produto-texto', { method: 'POST', body: { texto } }),
  descricao: (dados: DescricaoAssistenteInput) => http<DescricaoSugerida>('/assistente/descricao', { method: 'POST', body: dados }),
  regrasDeTexto: (texto: string) => http<RegrasDeTexto>('/assistente/regras-texto', { method: 'POST', body: { texto } }),
}

/** Chave do React Query (o uso do mês muda a cada ajuda: invalide depois de usar) */
export const CHAVE_ASSISTENTE = ['assistente']
