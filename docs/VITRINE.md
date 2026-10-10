# Vitrine online — Etapa 1 (catálogo com lista de orçamento)

Site público de cada gráfica, com a cara dela (logo, cor do tema, textos), mostrando os produtos que ela escolher.
O visitante monta uma **lista de orçamento** (vários produtos, com quantidade, medidas e acabamentos) e envia;
a lista vira uma **Solicitação de orçamento** (origem `site`) com os itens, já com pré-cadastro do cliente.

Etapas seguintes (fora deste escopo): **2** — preço calculado no site e a solicitação vira orçamento em rascunho;
**3** — loja: carrinho, pagamento online, envio de arte e acompanhamento.

Contrato: `packages/shared/src/schemas/vitrine.ts` (tipos e validações). Módulo de permissão: `vitrine`
(rótulo "Vitrine online"), vendido à parte: o painel da plataforma liga o módulo por plano (`Plano.modulos`) ou por
assinatura (`modulosExtras`).

## 1. Endereço: subdomínio por gráfica

- Site em `https://{slug}.{DOMINIO_VITRINE}` (ex.: `vitrine-cupom.grafygo.com.br`). `slug` = `plataforma.Assinante.slug`.
- Subdomínios reservados (nunca são vitrine): `www`, `app`, `api`, `admin`, `plataforma`, `painel`, `mail`, `smtp`,
  `ftp`, `status`, `blog`, `ajuda`, `suporte`, `docs`, `cdn`, `static`, `assets`. A criação de slug passa a recusá-los.
- **Desenvolvimento:** `http://{slug}.localhost:5173` (o Chrome resolve `*.localhost` para 127.0.0.1). O Vite aceita
  esses hosts (`server.allowedHosts: ['.localhost']`) e repassa `/api` para a API como hoje.
- **Web:** em `main.tsx`, se o host for `{slug}.{base}` (base = `VITE_DOMINIO_VITRINE`, em dev `localhost`) e o slug
  não for reservado, renderiza o **app da vitrine** (`features/vitrine-site`) em vez do sistema. O mesmo build serve
  os dois.
- **Produção (Caddy, HTTPS sob demanda):** DNS curinga `*.grafygo.com.br → IP da VPS`. Bloco do Caddy para
  `*.{$DOMINIO_VITRINE}` com `tls { on_demand }` e `on_demand_tls { ask http://api:3333/api/v1/publico/vitrine-permitida }`
  (a API responde 200 só para slug existente, com o módulo liberado e a vitrine ativa; senão 404). Mesmo `/api` e
  `/socket.io` repassados para a API e o restante servido pelo build web. Variáveis: `DOMINIO_VITRINE` (API e Caddy) e
  `VITE_DOMINIO_VITRINE` (build web). Atualizar `docs/DEPLOY_VPS.md` (registro DNS `*` e as variáveis).
- **API:** `APP_URL` continua o sistema; `urlPublica` da vitrine = `https://{slug}.{DOMINIO_VITRINE}` (dev:
  `http://{slug}.localhost:5173` quando `DOMINIO_VITRINE` não estiver definido e não for produção).

### 1.1 Domínio próprio (opcional)

- A gráfica cadastra em **Vitrine → Configurar → Domínio próprio** (ex.: `www.suagrafica.com.br`) e cria no DNS dela
  um `CNAME www → {slug}.{DOMINIO_VITRINE}` (sem "www": registro `A @ →` IP do servidor, mostrado na tela).
- Banco da plataforma: `assinantes.dominio_vitrine` (único) e `dominio_vitrine_verificado_em`. `www.x` e `x` são a
  mesma vitrine (`variantesDominio`). Não pode ser a base das vitrines, um subdomínio dela nem o endereço do sistema.
- **Caddy:** bloco `https://` com `tls { on_demand }` para qualquer outro nome; o `ask` (`vitrine-permitida`) aceita o
  domínio cadastrado de vitrine no ar e, como o HTTPS só chega se o DNS aponta para o servidor, marca como verificado.
  `http://` redireciona para https.
- **Web:** host que não é localhost, IP, a base nem subdomínio dela (`pareceDominioProprio`) pergunta
  `GET /publico/vitrine-dominio?host=` → `{ slug }` (404 = abre o sistema).
- Verificar na tela: a API abre `https://{dominio}/api/v1/publico/vitrine-dominio` e confere o slug. Verificado, a
  `urlPublica` (compartilhar, catálogo, QR code, e-mail ao cliente) passa a ser `https://{dominio}`.
- E-mail **não** usa o domínio da gráfica: sai de `EMAIL_REMETENTE` (domínio da GrafyGo, com SPF/DKIM) com o **nome
  da gráfica** como remetente e `Reply-To` = e-mail de Dados da empresa (a resposta do cliente vai para ela).

## 2. Banco (schema de cada empresa)

- `vitrine_config` (uma linha): campos de `vitrineConfigSchema` + `banners` (ids de arquivo, em ordem, até 3).
- `produtos` ganha: `vitrine_publicado` (bool, falso), `vitrine_destaque` (bool), `vitrine_nome` (texto), `vitrine_descricao`
  (texto), `vitrine_modo_preco` (`fixo` | `a_partir_de` | `sob_consulta`, padrão `sob_consulta`), `vitrine_slug`
  (único quando preenchido), `vitrine_ordem` (int).
- `produto_imagens` (galeria): `produto_id`, `arquivo_id`, `ordem`. A imagem atual do produto (`imagem_arquivo_id`)
  entra como primeira imagem da galeria na migração; daí em diante a capa é a primeira da galeria (e
  `imagem_arquivo_id` acompanha a primeira, para o resto do sistema).
- `solicitacoes_orcamento` ganha `email` (texto) e `solicitacao_itens`: `produto_id` (nulo se o produto sumir),
  `descricao`, `quantidade` (int), `largura`/`altura` (decimal), `acabamentos` (jsonb `[{id, nome}]`), `observacao`, `ordem`.
- Permissões: migração insere `vitrine:*` em `permissoes` e dá tudo ao papel `admin` (as demais empresas recebem pelo
  seed). Matriz padrão: admin e gerente com tudo; vendedor só `visualizar`.

## 3. API

Área logada (`exigirPermissao('vitrine', …)`):
- `GET /vitrine/config` → `VitrineConfig`; `PUT /vitrine/config` (`vitrineConfigSchema`, editar).
- `POST /vitrine/banners` (multipart, imagem, até 3) e `DELETE /vitrine/banners/:arquivoId`; `PUT /vitrine/banners/ordem`.
- `GET /vitrine/produtos` (`produtosVitrineQuerySchema`) → `ProdutoVitrineResumo[]` (produtos e serviços ativos, tipos
  produto/servico/revenda; nunca custo).
- `PATCH /produtos/:id/vitrine` (`produtoVitrineSchema`, `vitrine:editar`). Slug: vazio → gerado do nome (sem acento,
  minúsculo, hífen), único (sufixo -2, -3…); colisão manual → 409 com mensagem clara. Publicar exige produto ativo.
- Galeria: `POST /produtos/:id/imagens` (multipart, até `MAX_IMAGENS_PRODUTO`), `DELETE /produtos/:id/imagens/:imagemId`,
  `PUT /produtos/:id/imagens/ordem` (`ordemImagensSchema`). Permissão `produtos:editar` **ou** `vitrine:editar`.
  Conferir o conteúdo pelos bytes (como os demais uploads).
- Solicitações passam a trazer `itens: SolicitacaoItem[]` e `email` no detalhe e na listagem; filtro `origem` na listagem.

Público (sem login, prefixo `/publico/:empresa/vitrine`, empresa pelo slug como as rotas públicas atuais; **404** se o
módulo não estiver liberado no plano, a vitrine não estiver ativa ou a empresa estiver bloqueada):
- `GET /` → `VitrinePublica` (destaques: publicados com destaque, até 12, pela ordem).
- `GET /produtos` (`produtosPublicosQuerySchema`) → `Paginado<ProdutoCardVitrine>` (publicados e ativos; busca por nome
  público/nome/descrição; ordem: `vitrine_ordem`, nome).
- `GET /produtos/:slug` → `ProdutoVitrine` (acabamentos ativos ligados ao produto, com `obrigatorio`/`padrao`).
- `POST /pedidos` (`pedidoVitrineSchema`) → `PedidoVitrineEnviado`. Campo-isca `site` preenchido → responde 200 sem
  gravar nada. Limite: 5 envios por IP a cada 10 min (além do limite geral). Cria/acha o cliente pelo WhatsApp (mesmo
  número já cadastrado = mesmo cliente; senão pré-cadastro com origem `site`), cria a solicitação (status `nova`,
  origem `site`, descrição montada com os itens e a mensagem) e os itens (produto pelo slug; acabamentos só os do
  produto). Notifica (sino) quem tem `orcamentos:visualizar`, com link para a solicitação.
- `GET /imagens/:arquivoId?w=480|1200` → imagem WebP redimensionada (sharp), com `Cache-Control: public, max-age=86400`.
  Só serve arquivos que sejam banner da vitrine, logo da empresa ou imagem de produto publicado. Cache em disco ao lado
  do original (`.w480.webp`, `.w1200.webp`).
- `GET /publico/vitrine-permitida?domain=x` (fora do prefixo da empresa; para o Caddy): 200/404 conforme acima.

Preço exibido (`PrecoVitrine`): `fixo` → `precoVenda` do produto; `a_partir_de` → `precoVenda` (valor por unidade de
cobrança; a vitrine mostra "a partir de R$ X / m²"); `sob_consulta` → valor null. Unidade pelo `modoCalculo`
(`m2` → "m²", `metro_linear` → "metro", `milheiro` → "milheiro", `hora` → "hora", `unidade` → "unidade").

## 4. Sistema (área logada)

Nova área no menu, **Vitrine** (ícone de globo, "Seu site de produtos"), módulo `vitrine`:
- **Configurar vitrine** (`/vitrine`): ativar/desativar, endereço público (copiar, abrir, QR code para imprimir), banners
  (enviar, reordenar, remover), textos (título, slogan, sobre, horário), contato exibido (endereço/telefone/WhatsApp),
  redes sociais, mensagem do WhatsApp, mensagem pós-envio, descrição para buscadores. Aviso quando o plano não inclui o
  módulo ("fale com a GrafyGo para liberar") ou quando não há produto publicado.
- **Produtos na vitrine** (`/vitrine/produtos`): lista com foto, nome, categoria, preço exibido, interruptores
  "Publicado" e "Destaque", filtro por categoria/publicado e busca; clique abre o painel lateral de edição (nome público,
  texto de venda, modo do preço, endereço do produto, ordem e galeria com arrastar para ordenar).
- **Pedidos do site**: atalho para Orçamentos → Solicitações filtrado por origem "Site". Na solicitação, os itens
  aparecem em lista (produto, quantidade, medidas, acabamentos, observação) e o e-mail do contato.
- Produto (cadastro): nova aba **Vitrine** com o mesmo editor do painel.

## 5. Site público (`features/vitrine-site`)

Visual premium, responsivo (360 px a 1920 px), com logo e cor do tema da gráfica (`aplicarTema`), favicon gerado da
logo e título da aba = nome da gráfica. Rotas: `/` (início), `/produtos` (todos, com busca e filtro de categoria),
`/categoria/:id`, `/produto/:slug`, `/lista` (lista de orçamento). Rodapé com contato, redes, horário e
**"Feito com GrafyGo"** (link para o site da GrafyGo — divulgação).
- Início: topo com logo, busca, botão da lista (contador) e WhatsApp; banner (imagens em carrossel ou, sem imagem,
  degradê na cor do tema com título e slogan); categorias; destaques; todos os produtos; "Quem somos" e contato.
- Produto: galeria (miniaturas), nome, preço exibido ("R$ 45,00 / m²", "a partir de", "Sob consulta"), prazo, texto de
  venda, formulário para adicionar à lista (quantidade; largura × altura em metros quando m²/metro linear, com as
  máximas; acabamentos: obrigatórios já marcados e travados, opcionais com marcação; observação).
- Lista: itens editáveis/removíveis, dados de contato (nome, WhatsApp, e-mail opcional, mensagem), enviar → tela de
  "Pedido enviado" com o número e botão para falar no WhatsApp. Lista guardada no navegador (por slug).
- Botão "Chamar no WhatsApp" (wa.me com a mensagem configurada) sempre à mão.

## 6. Testes

- Unitários: slug (gerar/normalizar/reservados), preço exibido, montagem da descrição da solicitação.
- e2e `e2e-fase19.mjs`: módulo fora do plano → 404 público; liberar módulo; configurar e ativar; publicar produto com
  galeria; listar/detalhar público; enviar lista (cria cliente pré-cadastro + solicitação com itens + notificação);
  campo-isca não grava; limite de envios; vendedor não edita vitrine; `vitrine-permitida` 200/404.

---

# Etapa 1.5 — Vitrine no WhatsApp (sem integração oficial)

Objetivo: facilitar a vida de quem atende pelo WhatsApp e do cliente, usando a vitrine. A integração oficial
(API da Meta: catálogo nativo, atendente automático, avisos) fica para depois.

## A. Prévia do link (Open Graph)
- Leitores de link (User-Agent com `WhatsApp`, `facebookexternalhit`, `Facebot`, `Twitterbot`, `TelegramBot`,
  `Slackbot`, `LinkedInBot`, `Discordbot`, `Pinterest`, `SkypeUriPreview`) que abrem uma página da vitrine recebem um
  HTML mínimo da API com `og:title`, `og:description`, `og:image` (JPEG), `og:url`, `og:site_name`, `og:type` e
  `twitter:card=summary_large_image`. Buscadores (Googlebot etc.) **não** entram: continuam vendo o site normal.
- API: `GET /api/v1/publico/vitrine-og?host={host}&caminho={path}` (empresa pelo subdomínio do host). Páginas:
  `/` (título + slogan; imagem = 1º banner, senão logo), `/produto/:slug` (nome + preço exibido + prazo; imagem = capa),
  `/categoria/:id` (nome da categoria + quantidade), demais → início. 404 da vitrine → HTML genérico sem dados.
- Imagem JPEG: o endpoint de imagens aceita `f=jpg` (além de WebP), com o mesmo cache em disco.
- Produção: no Caddy (bloco das vitrines), matcher pelo User-Agent → `rewrite` para o endpoint, mantendo o host.
  Desenvolvimento: plugin do Vite (só `serve`) faz o mesmo nos hosts `*.localhost`.

## B. Compartilhar (área logada)
- Vitrine → Produtos (e painel do produto): **Compartilhar** abre um diálogo com: link do produto (copiar), mensagem
  pronta editável ("Olá{, nome}! Veja o {produto}: {preço} — {link}"), enviar no WhatsApp para um cliente (busca de
  clientes; usa o WhatsApp do cadastro) ou para qualquer contato (wa.me sem número), e **imagens** geradas no navegador
  (canvas, fontes do sistema): **Status** 1080×1920 e **Post** 1080×1080 com foto, nome, preço, logo/nome da gráfica,
  cor do tema, "Peça pelo WhatsApp" e o endereço do site. Baixar PNG ou compartilhar (Web Share com arquivo no celular).
- Configurar vitrine: **Divulgar a vitrine** (link, WhatsApp, imagem de Status da loja com QR code do site).
- Cliente (painel e ficha) e Solicitação (painel): **Enviar catálogo** → wa.me para o WhatsApp do cliente com mensagem
  pronta e o link da vitrine (só com o módulo `vitrine` e a vitrine ativa).
- **Catálogo em PDF** (Vitrine → Produtos): capa (logo, título, slogan, contatos, QR do site), produtos publicados por
  categoria (foto, nome, preço exibido, texto curto), QR/link de cada produto e rodapé "Gerado com GrafyGo"; baixar ou
  compartilhar. Usa o gerador de PDF existente (`features/impressao`) e a cor do tema.

## C. Site público
- Página do produto: botão **Compartilhar** (Web Share no celular; senão menu com WhatsApp e copiar link).
- O "Chamar no WhatsApp" na página de um produto leva o produto na mensagem ("Olá! Tenho interesse no {produto}:
  {link}"); na lista enviada, a mensagem leva o número do pedido.
- Título e descrição da aba (`document.title`, `meta description`) por página.
