/** Quantidade de estoque legível: "147,9 m²", "10 un". */
export function formatarQuantidade(valor: string | number | null | undefined, unidade?: string | null): string {
  const n = Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  return unidade ? `${n} ${unidade}` : n
}
