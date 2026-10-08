import type { EmpresaConfig } from '@onprint/shared'

/** Nome que aparece no topo do sistema e na aba (o "Minha Empresa" padrão não conta). */
export const nomeExibicao = (e: EmpresaConfig, atual: string) => e.nomeFantasia || (e.razaoSocial !== 'Minha Empresa' ? e.razaoSocial : '') || atual
