# Tutoriais da GrafyGo

A central de ajuda (`/ajuda` no sistema e em grafygo.com.br/ajuda) e o botão **Como usar** das telas mostram,
para cada tarefa, um passo a passo com fotos das telas e um vídeo curto.

| Área | Tutoriais | Conteúdo | Roteiro narrado |
|---|---|---|---|
| Primeiros passos | configurar-empresa, cadastrar-produto, convidar-equipe, assinar-plano | `apps/web/src/features/ajuda/conteudo/comecar.ts` | [comecar.md](comecar.md) |
| Orçamentos | fazer-orcamento | `conteudo/vendas.ts` | [vendas.md](vendas.md) |
| Pedidos, arte e produção | enviar-orcamento, orcamento-em-pedido, aprovacao-arte, acompanhar-producao | `conteudo/pedidos.ts` | [pedidos.md](pedidos.md) |
| Financeiro, WhatsApp e vitrine | receber-pagamento, venda-balcao, conectar-whatsapp, ligar-vitrine, divulgar-whatsapp | `conteudo/financeiro-vitrine.ts` | [financeiro-vitrine.md](financeiro-vitrine.md) |

## Dois tipos de vídeo

- **Gravado automaticamente** (o que existe hoje): sem voz, com legendas na tela. Fica em
  `apps/web/public/ajuda/<slug>/video.mp4`, junto das fotos dos passos (`1.webp`, `2.webp`…) e da capa (`capa.webp`).
- **Narrado** (opcional): grave seguindo o roteiro da área, publique no YouTube (pode ser "não listado") e coloque o
  id do vídeo no campo `youtube` do tutorial. Exemplo: `youtube: 'dQw4w9WgXcQ'`. A versão narrada passa a aparecer
  no lugar da gravada; as fotos e o texto continuam iguais.

## Regravar um tutorial (depois de mudar uma tela)

Pré-requisitos: o sistema rodando (`docker compose up -d`), Python com Playwright
(`pip install playwright pillow && python -m playwright install chromium`) e Docker (o ffmpeg roda na imagem
`linuxserver/ffmpeg`).

```bash
python scripts/tutoriais/<slug>.py
```

O script entra na empresa de demonstração, faz a tarefa com legendas e destaques, tira as fotos e gera o vídeo,
substituindo os arquivos de `apps/web/public/ajuda/<slug>/`. Depois, confira a duração em `segundos` no tutorial.

- `TUTORIAL_URL` (padrão `http://localhost:5173`), `TUTORIAL_EMAIL` e `TUTORIAL_SENHA` mudam onde e com quem gravar.
- Os scripts criam dados novos na empresa de demonstração (orçamentos, pedidos, produtos). Não rode em produção.
- Rode um tutorial por vez: dois ao mesmo tempo disputam o servidor e podem gravar telas de carregamento.
- O motor comum fica em `scripts/tutoriais/gravador.py` (legendas, destaque, cursor, fotos e vídeo).
- Telas com WhatsApp: rode a API no modo de teste (`WHATSAPP_PROVEDOR=log docker compose up -d --no-deps api`). Os scripts
  usam `g.whatsapp_demo()`: a conexão aparece com um número fictício e o envio do diálogo "Enviar pelo WhatsApp" não sai.
- Encadeados: `fazer-orcamento.py` mostra o id do orçamento criado; passe-o para `enviar-orcamento.py` e
  `orcamento-em-pedido.py`, e o id do pedido gerado para `aprovacao-arte.py`.

## Escrever um tutorial novo

1. Copie um script parecido em `scripts/tutoriais/` e ajuste os passos.
2. Acrescente o tutorial ao arquivo da área em `conteudo/`, com `telas` (rotas em que o botão **Como usar** o
   mostra; o prefixo mais específico ganha) e `proximos` (o que fazer depois).
3. Escreva o roteiro narrado no `.md` da área.
