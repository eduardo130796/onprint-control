/** Busca todas as páginas de uma listagem (100 por vez) — usado na exportação CSV. */
export async function buscarTodasPaginas<T>(
  buscar: (page: number, pageSize: number) => Promise<{ data: T[]; meta: { total: number } }>,
): Promise<T[]> {
  const todos: T[] = []
  for (let page = 1; ; page++) {
    const r = await buscar(page, 100)
    todos.push(...r.data)
    if (todos.length >= r.meta.total || r.data.length === 0) return todos
  }
}
