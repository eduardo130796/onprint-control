import { MAX_BANNERS_VITRINE, type VitrineConfig } from '@onprint/shared'
import { vitrineApi } from '@/api/vitrine'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAtualizarVitrine } from '../hooks'
import { GradeImagens } from './GradeImagens'

/** Banners do topo do site (até 3, em carrossel): enviar, arrastar para ordenar e remover. */
export function BannersVitrine({ config, podeEditar }: { config: VitrineConfig; podeEditar: boolean }) {
  const atualizar = useAtualizarVitrine()
  const itens = config.banners.map((b) => ({ id: b.arquivoId, url: b.url }))
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Banners do topo</CardTitle>
        <CardDescription>
          Até {MAX_BANNERS_VITRINE} imagens em carrossel, no formato largo: 1920 × 640 px (proporção 3:1, a mesma do site). Sem banner, o topo usa um degradê na cor da sua marca com o
          título e o slogan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GradeImagens
          itens={itens}
          maximo={MAX_BANNERS_VITRINE}
          formato="banner"
          podeEditar={podeEditar}
          rotuloPrimeira="1º"
          textoAdicionar="Adicionar banner"
          onEnviar={async (arquivo, progresso) => {
            await vitrineApi.enviarBanner(arquivo, progresso)
            await atualizar()
          }}
          onRemover={async (b) => {
            await vitrineApi.removerBanner(b.id)
            await atualizar()
          }}
          onReordenar={async (ids) => {
            await vitrineApi.ordenarBanners(ids)
            await atualizar()
          }}
        />
      </CardContent>
    </Card>
  )
}
