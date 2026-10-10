import type { CoresTema } from '@onprint/shared'

/**
 * Cor de destaque dos documentos (PDFs, etiquetas, relatórios): a do tema escolhido pela empresa, para o que ela
 * entrega aos clientes ter a cara dela. Fica num módulo leve (sem o react-pdf) para o layout poder atualizar ao entrar.
 * Os PDFs leem estes valores na hora de gerar (ver COR em ./tema).
 */
export const DESTAQUE = {
  cor: '#0265DC',
  escuro: '#024DCC',
  suave: '#E6F2FE',
  contraste: '#FFFFFF',
}

export function aplicarCorDocumentos(tema: CoresTema) {
  DESTAQUE.cor = tema.cor
  DESTAQUE.escuro = tema.escuro
  DESTAQUE.suave = tema.suave
  DESTAQUE.contraste = tema.contraste
}
