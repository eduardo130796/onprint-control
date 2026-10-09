# Insumos, composição de custo e preço (fases 1 e 2)

Pedido do usuário: "a parte de insumos estar junto de produtos e serviços fica confuso; dentro do produto seria
interessante ter a composição dos custos, buscando os insumos; algo inteligente e intuitivo, tudo interligado
para refletir em tudo que precisar; pensar em níveis diferentes de conhecimento".

Decisões do usuário: preço **não muda sozinho** (o sistema avisa e sugere o reajuste em lote); custo inclui
materiais, tempo de máquina/mão de obra, impostos %, comissão % e custos fixos rateados; fases 1 e 2 juntas.

## Conceitos

| Termo | O que é |
|---|---|
| **Insumo** | O que se compra para produzir (lona, tinta, ilhós, chapa). Continua sendo `Produto` com `tipo = insumo` (estoque, fichas e movimentações já apontam para produto), mas tem **tela própria** e some de "Produtos e Serviços". |
| **Unidade de uso** | Em que o insumo é consumido (m², m, folha, un, l, kg) — é a `unidadeMedida` do insumo e a unidade do estoque. |
| **Embalagem** | Como é comprado: rolo/chapa (largura × comprimento), pacote/caixa/galão (conteúdo), unidade avulsa. `fatorEmbalagem` dá quantas unidades de uso vêm; `custoPorUnidadeDeUso = precoEmbalagem ÷ fator`. |
| **Custo do insumo** | `Produto.custo` (agora 4 casas) = custo por unidade de uso. Nasce da embalagem e depois vira o **custo médio consolidado** das compras (todos os locais). |
| **Composição** | Do produto vendido: materiais (insumo × consumo × (1+perda)) + produção (tempo × custo/hora + preparo) + rateio por hora + extras. Motor puro em `packages/shared/src/custos.ts` (`calcularCustoItem`, `custoDeReferencia`). |
| **Custo de referência** | Custo direto por unidade de cálculo do produto (R$/m², R$/un, R$/m, R$/milheiro, R$/h), calculado numa medida de referência (1 m² ou a medida padrão; 1 un; lote do milheiro). Gravado em `Produto.custo` (o orçamento já usa) + detalhamento em `Produto.custoDetalhe`. |
| **Percentuais sobre o preço** | Impostos, comissão e custo fixo em % (empresa). Preço sugerido = custo direto ÷ (1 − (impostos + comissão + fixo% + lucro desejado)/100). |
| **Lucro** | % sobre o preço, depois de custo direto, impostos, comissão e fixo%. Substitui a antiga "margem" (markup sobre o custo; migrada com `markupParaLucro`). Semáforo: ok (≥ mínimo), baixo (< mínimo), prejuízo (< 0), sem custo. |

## Níveis de conhecimento

- **Sei meu custo** (`modoCusto = simples`): digita o custo por unidade de cálculo; o sistema mostra lucro, preço sugerido e semáforo com os percentuais da empresa. Padrão de todo produto existente (nada muda sozinho na migração).
- **Montar a composição** (`modoCusto = composicao`): escolhe os materiais (busca de insumos), a produção (processo/máquina; tempo automático pela velocidade da máquina ou digitado; preparo) e outros custos. O custo é calculado e acompanha as compras.
- **Avançado**: rateio de custos fixos por hora de produção (custo fixo mensal ÷ horas produtivas) — configuração da empresa.
- Linguagem do dia a dia em cada campo ("quanto de lona vai em 1 m²?", "minutos por m²", "perda: sobra/erro de corte"). Produto com ficha técnica antiga mostra um convite: "Você já tem os materiais: ativar a composição" com a prévia da diferença de custo.

## Modelo de dados (migração `..._composicao_custos`)

- `produtos`: `custo` → DECIMAL(12,4); novos `modo_custo` (text, default `simples`), `lucro_desejado` DECIMAL(5,2) null, `lucro_minimo` DECIMAL(5,2) null, `custo_detalhe` JSONB null, `custo_calculado_em` timestamptz null, `embalagem` text null, `embalagem_largura` / `embalagem_comprimento` / `embalagem_conteudo` DECIMAL(12,3) null, `preco_embalagem` DECIMAL(12,2) null, `fornecedor_preferido_id` uuid null (FK fornecedores, SET NULL). `margem` fica (legado) e é migrada: `lucro_desejado = margem / (100 + margem) × 100` quando margem > 0.
- `produto_processos`: `minutos` DECIMAL(10,2) null, `base` text default `por_unidade`, `setup_minutos` DECIMAL(10,2) default 0. Linhas existentes: `base = por_item` (o tempo padrão do processo é por item).
- `processos`: `custo_hora` DECIMAL(12,2) default 0 (mão de obra sem máquina).
- Nova `produto_custos_extras` (id, produto_id FK cascade, nome, valor DECIMAL(12,4), base text, ordem).
- `empresa_config`: `impostos_percentual`, `comissao_percentual`, `custo_fixo_percentual` DECIMAL(5,2) default 0; `rateio_modo` text default `nenhum`; `custo_fixo_mensal` DECIMAL(12,2) default 0; `horas_produtivas_mes` int default 0; `lucro_desejado_padrao` DECIMAL(5,2) default 30; `lucro_minimo_padrao` DECIMAL(5,2) default 15.

## Regras de cálculo

- Produção, custo/hora: o da máquina da linha (ou a máquina padrão do processo) se > 0, senão o `custo_hora` do processo.
- Produção, minutos: os da linha; vazio + base por m² + máquina com velocidade → 60 ÷ velocidade; vazio nos demais → `tempoPadraoMinutos` do processo com base `por_item`.
- Rateio por hora entra por minuto de produção; rateio em % entra nos percentuais do preço.
- Comissão do preço sugerido: a padrão da empresa (a comissão real de cada vendedor continua no pedido).
- **Recalcular custos** (`recalcularCustos(produtoIds?)` no serviço de produtos): grava `custo`, `custo_detalhe`, `custo_calculado_em` dos produtos em modo composição. Gatilhos: salvar composição; mudar o custo de um insumo (cadastro da embalagem ou entrada de estoque); mudar custo/hora de máquina ou processo; mudar a precificação da empresa. Em lote e idempotente.
- **Aviso de reajuste**: depois de recalcular por causa de um insumo/máquina/processo/config, os produtos que **passaram** a ficar abaixo do lucro mínimo (ou em prejuízo) geram uma notificação para quem edita produtos: "O custo de Lona 440g subiu (R$ 8,90 → R$ 9,52/m²): 3 produtos ficaram abaixo do lucro mínimo" → link `/produtos/reajuste`. O preço nunca muda sozinho.
- Entrada de estoque: o custo do insumo passa a ser o **custo médio consolidado** (todos os locais), 4 casas (antes: o do local, 2 casas).
- Orçamento (fase 2): continua usando `Produto.custo × quantidade cobrada`; com a composição, esse custo passa a ser o real. O custo por medida real e detalhado no orçamento é a fase 3.

## API

| Rota | Permissão | O que faz |
|---|---|---|
| `GET /insumos` (`insumosQuerySchema`) | produtos:visualizar | Lista `InsumoResumo` (custo só para quem vê custos) |
| `GET /insumos/:id` | produtos:visualizar | `InsumoDetalhe` (onde é usado, custo médio) |
| `POST /insumos`, `PUT /insumos/:id` (`insumoSchema`) | produtos:criar / produtos:editar | Cria/edita; `custo` = preço da embalagem ÷ fator quando a embalagem/preço muda; recalcula os produtos que usam |
| `GET /produtos/:id/composicao` | produtos:editar | `ComposicaoProdutoDetalhe` |
| `PUT /produtos/:id/composicao` (`composicaoProdutoSchema`) | produtos:editar | Salva tudo (modo, materiais, produção, extras, lucro, preço) numa transação, recalcula e devolve o detalhe |
| `GET /produtos/reajuste?situacao=abaixo|todos` | produtos:editar | `ProdutoReajuste[]` |
| `POST /produtos/reajuste` (`aplicarReajusteSchema`) | produtos:editar | Aplica os preços escolhidos (auditoria) |
| `GET /empresa/precificacao` | produtos:visualizar | `Precificacao` |
| `PUT /empresa/precificacao` (`precificacaoSchema`) | configuracoes:editar | Salva e recalcula todos os produtos em composição |

Os insumos ficam no módulo **produtos** (o plano Essencial não tem estoque, e custo é básico). `GET /produtos` deixa de listar insumos por padrão (`tipo=insumo` explícito ainda funciona). As rotas antigas `PUT /produtos/:id/insumos|processos` continuam (compatibilidade; também recalculam).

Detalhes da implementação (API):
- `PUT /produtos/:id` usa `produtoAtualizacaoSchema`: `precoVenda`, `custo`, `margem`, `precoMinimo`, `modoCusto`, `lucroDesejado`, `lucroMinimo` só mudam quando enviados (ausente = mantém); em composição o `custo` enviado é ignorado. `custo` aceita 4 casas (criação e edição).
- `processoSchema` ganhou `custoHora` (mão de obra sem máquina; padrão 0).
- Custo do insumo (`/insumos`): visível com `produtos:editar` **ou** `estoque:visualizar` (D92). `custo`, `margem`, `lucroDesejado`, `lucroMinimo`, `custoDetalhe` e `precoEmbalagem` somem de `/produtos` para quem não edita produtos.
- `GET /produtos/:id/composicao`: `analise` e `precoSugerido` usam o custo que vale para o preço — o calculado (`referencia.porUnidade`) em composição, o digitado (`custoManual`) no modo simples; `referencia` é sempre a prévia da composição gravada.
- `POST /produtos/reajuste` devolve `{ atualizados }` e recusa (422) preço abaixo do preço mínimo gravado do produto.
- O aviso de reajuste considera os produtos **recalculados** (em composição); `GET /produtos/reajuste` mostra todos (simples e composição), com o custo gravado.
- Unidade `ml` adicionada às unidades padrão (tinta em galão → ml).

## Telas

- **Menu**: Produtos → Categorias, Produtos e Serviços, **Insumos e materiais** (`/produtos/insumos`), Acabamentos, Máquinas e Processos, **Reajuste de preços** (`/produtos/reajuste`, com contador dos abaixo do mínimo). Estoque também mostra o atalho "Insumos" quando a empresa tem estoque. Configurações → **Precificação**.
- **Insumo** (página única, sem abas): Identificação; **Como você compra** (cartões de embalagem; medidas ou conteúdo; unidade de uso; preço da embalagem → "R$ 9,06 por m²" ao vivo); Fornecedor preferido; Estoque (controla, mínimo, saldo/custo médio, atalhos para entrada e movimentações quando houver o módulo); **Onde é usado** (produtos e semáforo).
- **Produto**: abas Geral (identificação + como é vendido: modo de cálculo, medidas), **Custo e preço** (substitui Preço, Ficha técnica e Processos), Acabamentos, Simulador, Estoque. Insumo aberto em `/produtos/:id` vai para a tela de insumo.
- **Custo e preço**: escolha do nível (Sei meu custo / Montar a composição) → blocos Materiais (busca de insumos com custo e unidade, consumo, base, perda, custo da linha), Produção (processo, máquina, minutos ou "automático pela velocidade", base, preparo), Outros custos; à direita (fixo no desktop) o **resumo ao vivo**: custo por unidade com barras (materiais/produção/rateio/extras), percentuais da empresa (link para Precificação), lucro desejado → **preço sugerido** ("Usar este preço"), preço de venda, preço mínimo, semáforo do lucro. Um botão Salvar para a aba toda.
- **Reajuste de preços**: tabela dos abaixo do lucro mínimo (ou todos): custo, preço atual, lucro atual, preço sugerido editável, seleção e "Aplicar preços". 
- **Precificação** (Configurações): impostos %, comissão padrão %, custos fixos (nenhum / % do preço / por hora: custo fixo mensal ÷ horas produtivas = R$ X por hora), lucro desejado padrão, lucro mínimo padrão — com exemplo calculado ao vivo.
- Custos só aparecem para quem pode editar produtos (D41); o vendedor continua sem ver custo.

## Fase 3 — tudo interligado (orçamento → produção → venda → compra → lucro)

Motor: `custoDaVenda` (custos.ts) = composição do produto com as **medidas reais** (ou, no modo simples, custo por
unidade × quantidade real — a área mínima é só cobrança) + acabamentos (`custoDoAcabamento`: custo manual por
unidade da cobrança + insumos consumidos via `consumoDoAcabamento`). Contrato em `schemas/custos.ts`
(`AnaliseLucro`, `AnaliseOrcamento`, `lucratividadeQuerySchema`, `LinhaLucratividade`, `RelatorioLucratividade`),
`acabamentoSchema.materiais` (opcional: não enviado = não mexe) e `entradaEstoqueSchema.contaPagar`.

### 1. Custo e lucro no orçamento e no pedido
- O cálculo do item (`apps/api/src/modules/orcamentos/calculo.ts`) passa a usar `custoDaVenda` com a composição
  do produto (insumos ao custo atual, produção pela regra da fase 2, rateio por hora) e os acabamentos com seus
  insumos. `custoEstimado` = custo direto; novo `custo_detalhe` (JSONB) no item do orçamento e do pedido (copiado
  na conversão) com as linhas; `*_item_acabamentos.custo` guarda o custo do acabamento no momento.
- Lucro do item = `analisarPreco(total do item depois do desconto, custo direto, percentuais da empresa, lucro
  mínimo do produto ou da empresa)`; do orçamento = soma (custo e total).
- **Semáforo para todos, números só para quem vê custos**: a resposta do orçamento/pedido traz `analise:
  AnaliseLucro` por item e no total; sem permissão de custos, só `situacao`. O vendedor nunca recebe custo.
- `POST /orcamentos/analisar` (permissão de criar/editar orçamento): mesmos itens do orçamento →
  `AnaliseOrcamento`, para o editor mostrar o semáforo ao vivo (com debounce) sem expor custos.
- Prejuízo não bloqueia (só avisa); o bloqueio continua sendo o preço mínimo (com liberação do gerente).

### 2. Acabamentos que consomem insumos
- Nova tabela `acabamento_insumos` (acabamento_id, insumo_id, quantidade DECIMAL(12,4), perda_percentual
  DECIMAL(5,2), ordem). Na tela do acabamento: "O que este acabamento gasta" (busca de insumos, quantidade por
  unidade da cobrança — "por peça", "por metro de perímetro"… —, perda) e o custo de referência.
- Mudou o custo de um insumo usado em acabamento → os produtos/orçamentos novos já usam; o aviso de reajuste
  considera também acabamentos obrigatórios dos produtos.
- **Baixa de estoque**: ao concluir a OP, além dos materiais do produto, baixa os insumos dos acabamentos do item
  do pedido (`consumoDoAcabamento` com as medidas do item), mesmo tipo `consumo_producao`, ligados ao pedido/OP.

### 3. Produção, PDV e perdas
- **Perda apontada**: a baixa na conclusão da OP usa quantidade + soma das perdas apontadas (peças refeitas).
- **PDV**: produto com materiais (composição ou ficha) baixa os materiais (base por peça); senão, se controla
  estoque, baixa ele mesmo (como hoje). Novo `venda_pdv_itens.custo` (custo direto da venda) para o relatório.
- **Tempo da OP** (`producao/geracao.ts`): produto em composição estima as horas pelos minutos da produção
  (`calcularCustoItem(...).minutosProducao`); senão, a regra atual.

### 4. Compra gera conta a pagar
- `POST /estoque/entradas` com `contaPagar` (exige fornecedor): cria as contas a pagar das parcelas (soma =
  total da entrada, senão 422), documento = NF, categoria "Compras de insumos" (`compras_insumos`) ou a escolhida,
  descrição "Compra NF 123 — Fornecedor". Na tela da entrada: "Pagamento: à vista (sem conta) / a prazo" com
  parcelas (1×, 2×, 3×… dividindo o total e datas a cada 30 dias, editáveis).

### 5. Relatórios
- `GET /relatorios/lucratividade?inicio&fim&agrupar=pedido|produto` (relatorios:visualizar + ver custos):
  pedidos não cancelados com data no período; receita = total dos itens; custo estimado = soma de
  `custoEstimado`; custo real de materiais = baixas `consumo_producao` ligadas ao pedido × custo da movimentação
  (null se não houve baixa); despesas = receita × (impostos + comissão + custo fixo %); lucro e %; situação.
  Tela em Relatórios → "Lucratividade" com totais, filtros e exportar CSV.
- **DRE**: nova linha informativa "Custo dos materiais consumidos" (baixas de produção, PDV e perdas no período,
  pelo custo da movimentação) logo depois das receitas — a DRE continua por caixa nas demais linhas.

### Detalhes da implementação (API, fase 3)
- Migração `20261012100000_custos_interligados` (a tabela do PDV é `vendas_pdv_itens`).
- `GET/POST/PUT /acabamentos` devolvem `materiais` (`custoUnitario` só com `produtos:editar`); `materiais` só aceita
  insumos/revenda ativos, sem repetir.
- `custoDetalhe` do item = o `CustoVenda` inteiro (materiais, produção, rateio, extras, produto, acabamentos,
  custoDireto, minutosProducao, linhas). Some (com `custoEstimado` e o `custo` dos acabamentos) para quem não vê custos.
- **Total da análise** = soma dos totais dos itens − desconto + acréscimo do cabeçalho (o frete fica de fora); lucro
  mínimo do total = o da empresa. `POST /orcamentos/analisar` recebe `{ itens, desconto?, acrescimo? }`, exige
  `orcamentos:visualizar` + (`criar` ou `editar`), não grava e não recusa preço abaixo do mínimo (só analisa).
- **Aviso de reajuste pelos acabamentos**: quando muda o custo de um insumo usado em acabamento, os produtos com esse
  acabamento **obrigatório** são comparados antes/depois na medida de referência (preço + valor dos acabamentos
  obrigatórios × custo + custo dos acabamentos obrigatórios). Isso vale só para o aviso; `GET /produtos/reajuste`
  continua pelo custo gravado do produto (o custo do acabamento não é gravado no produto).
- **OP**: baixa por insumo e origem (ficha/composição; acabamentos), motivo "Baixa dos acabamentos (medidas reais +
  perda)"; quantidade = a da OP + soma das perdas apontadas (a área usada sem medidas cresce na mesma proporção).
  Horas da OP pela composição só quando o produto está em composição e tem produção.
- **PDV**: materiais por peça com as medidas padrão do produto (materiais por m²/metro); a baixa de material pode
  deixar o saldo negativo (como a produção); o produto sem materiais continua como antes. `custo` não aparece nas
  respostas do caixa (só relatórios).
- **Compra a prazo**: descrição "Compra NF 123 — Fornecedor" (sem NF: o número da entrada), "(1/2)" quando há mais
  de uma parcela; observação com o número da entrada; status pelo vencimento. Categoria escolhida precisa ser de despesa
  e ativa. Sem `compras_insumos` (empresa antiga): cria "Compra de insumos" dentro de "Custos de produção" (se existir).
- **Lucratividade**: data do pedido = `created_at` (fuso de São Paulo); lucro, % e situação pelo custo estimado (o
  real de materiais é comparativo); por produto, o real vem das baixas das OPs dos itens daquele produto e o lucro
  mínimo é o do produto. `inicio > fim` → 422.
- **DRE**: linha `{ grupo: 'Informativo', categoria: 'Custo dos materiais consumidos' }` logo após as receitas e um
  cartão de resumo com o mesmo rótulo — só para quem vê custos; não entra em Despesas/Resultado.

## Fases seguintes

3. Orçamento com custo pela medida real e detalhado (material/produção/acabamento), semáforo para o vendedor; acabamentos que consomem insumos; PDV e perda apontada baixando a composição; entrada de compra gerando conta a pagar; lucro por pedido/produto (estimado × real) e custo das mercadorias na DRE.
4. Modelos prontos (banner, adesivo, placa ACM, cartão) e aproveitamento de chapa/folha.
