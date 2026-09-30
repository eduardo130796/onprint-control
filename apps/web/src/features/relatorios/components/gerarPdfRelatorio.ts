import { createElement } from 'react'
import { pdf } from '@react-pdf/renderer'
import type { Relatorio } from '@onprint/shared'
import { baixarArquivo } from '@/lib/csv'
import { DocumentoRelatorio } from './DocumentoRelatorio'

/** Gera e baixa o PDF do relatório (a biblioteca de PDF é carregada sob demanda). */
export async function baixarPdfRelatorio(r: Relatorio, empresa: string, nomeArquivo: string) {
  const blob = await pdf(createElement(DocumentoRelatorio, { r, empresa }) as Parameters<typeof pdf>[0]).toBlob()
  baixarArquivo(blob, `${nomeArquivo}.pdf`, 'application/pdf')
}
