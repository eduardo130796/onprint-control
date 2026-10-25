import type { EfeitoNoItem, RegraComercialInput, RegraComercialMotor, RespostasRegras, ResultadoRegras, SimulacaoRegrasInput } from '@onprint/shared'
import { http } from './http'

/** Regra como a lista devolve: com a frase "Quando… → …" e quem criou */
export type RegraComercialLista = RegraComercialMotor & { descricao: string; criadoPor: string | null; updatedAt: string | null }

/** Nomes dos cadastros citados nas regras (id → nome) */
export interface NomesRegras {
  produtos: Record<string, string>
  categorias: Record<string, string>
  clientes: Record<string, string>
}

export interface ListaRegras {
  regras: RegraComercialLista[]
  nomes: NomesRegras
}

export interface Simulacao {
  itens: { descricao: string; quantidade: string; bruto: string; ajuste: string; total: string; regras: EfeitoNoItem[] }[]
  subtotalBruto: string
  resultado: ResultadoRegras
}

/** Regras comerciais (Configurações → Regras comerciais) */
export const regrasApi = {
  listar: () => http<ListaRegras>('/regras-comerciais'),
  criar: (dados: RegraComercialInput) => http<RegraComercialMotor>('/regras-comerciais', { method: 'POST', body: dados }),
  atualizar: (id: string, dados: RegraComercialInput) => http<RegraComercialMotor>(`/regras-comerciais/${id}`, { method: 'PUT', body: dados }),
  ativar: (id: string, ativa: boolean) => http<RegraComercialMotor>(`/regras-comerciais/${id}/ativa`, { method: 'PATCH', body: { ativa } }),
  ordenar: (ids: string[]) => http<ListaRegras>('/regras-comerciais/ordem', { method: 'PUT', body: { ids } }),
  /** As perguntas da tela (cria, atualiza ou desliga as regras de cada uma) */
  salvarRespostas: (respostas: RespostasRegras) => http<ListaRegras>('/regras-comerciais/perguntas', { method: 'PUT', body: respostas }),
  remover: (id: string) => http<void>(`/regras-comerciais/${id}`, { method: 'DELETE' }),
  /** Com `regra`, a regra em edição (ainda não salva) entra no lugar da gravada */
  simular: (dados: SimulacaoRegrasInput & { regra?: (RegraComercialInput & { id?: string | null }) | null }) =>
    http<Simulacao>('/regras-comerciais/simular', { method: 'POST', body: dados }),
  manual: () => http<{ manualAtendente: string | null }>('/regras-comerciais/manual'),
  salvarManual: (manualAtendente: string) => http<{ manualAtendente: string | null }>('/regras-comerciais/manual', { method: 'PUT', body: { manualAtendente } }),
}
