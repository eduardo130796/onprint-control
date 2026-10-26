import type { TemaAjuda } from '@onprint/shared'
import { TUTORIAIS, tutorialPorSlug } from '@/features/ajuda/conteudo'
import type { Tutorial } from '@/features/ajuda/tipos'

/*
 * Dúvidas de uso no "Peça ao Assistente" ("como conecto o WhatsApp?"): a IA só escolhe o tema (barato, junto com a
 * intenção); a resposta é o resumo do tutorial da central de ajuda, os passos em uma linha e o link. Sem tema, as
 * palavras da pergunta escolhem. Nada da ajuda vai para o prompt.
 */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Palavras que não ajudam a escolher o tutorial */
const VAZIAS = new Set(['como', 'onde', 'para', 'quero', 'fazer', 'sistema', 'grafygo', 'consigo', 'posso', 'faco', 'tenho', 'minha', 'meu', 'isso', 'esse', 'essa'])

/** Tutorial que responde a dúvida: o do tema escolhido ou, sem ele, o que mais tem as palavras da pergunta */
export function tutorialDaDuvida(tema: TemaAjuda | null, pergunta: string): Tutorial | null {
  const peloTema = tema ? tutorialPorSlug(tema) : undefined
  if (peloTema) return peloTema
  const palavras = norm(pergunta)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4 && !VAZIAS.has(p))
    // Raiz curta: "cadastro" acha "cadastrar", "conecto" acha "conectar"
    .map((p) => p.slice(0, 6))
  if (!palavras.length) return null
  let melhor: { t: Tutorial; pontos: number } | null = null
  for (const t of TUTORIAIS) {
    const alvo = norm(`${t.titulo} ${t.resumo}`)
    const pontos = palavras.filter((p) => alvo.includes(p)).length
    if (pontos > (melhor?.pontos ?? 0)) melhor = { t, pontos }
  }
  return melhor?.t ?? null
}

/** Os passos em uma linha ("Abra os produtos → Dê nome… → …"), até 5 */
export const passosCurtos = (t: Tutorial) => t.passos.slice(0, 5).map((p) => p.titulo)

/** Texto colado com cara de tabela de preços (2+ linhas com preço): vai direto para o "Cadastrar vários" */
export function pareceTabela(texto: string): boolean {
  return texto.split(/\n|\s\/\s/).filter((l) => /r\$\s*\d|\d+,\d{2}\b/i.test(l)).length >= 2
}
