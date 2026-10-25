-- Regras comerciais: o dono ensina o sistema ("Quando… → Faça…") e o sistema aplica em todo orçamento — no balcão,
-- montado pelo Assistente GrafyGo e, no futuro, pelo atendimento do WhatsApp. Motor em @onprint/shared
-- (regras-comerciais.ts). Como todas as migrations, roda em todos os schemas.
-- Orçamentos existentes não são recalculados: as regras valem a partir do próximo salvamento.

-- 1) As regras de cada empresa. condicoes e acao são JSON validados pelos schemas compartilhados
-- (condicoesRegraSchema e acaoRegraSchema); prioridade = ordem de aplicação (menor primeiro).
CREATE TABLE "regras_comerciais" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    -- Modelo pronto de origem (desconto_quantidade, desconto_a_vista…) ou 'personalizada'
    "tipo" TEXT NOT NULL DEFAULT 'personalizada',
    "condicoes" JSONB NOT NULL DEFAULT '{}',
    "acao" JSONB NOT NULL,
    -- Descontos: 'soma' (acumula) | 'maior' (não acumula; vale o maior)
    "combinacao" TEXT NOT NULL DEFAULT 'soma',
    "criado_por" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "regras_comerciais_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "regras_comerciais_ativa_prioridade_idx" ON "regras_comerciais"("ativa", "prioridade");
ALTER TABLE "regras_comerciais" ADD CONSTRAINT "regras_comerciais_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) No orçamento: origem (balcao | vitrine | assistente | whatsapp), a data que o cliente quer, o ajuste das regras
-- no orçamento (com sinal; total = subtotal − desconto + acréscimo + frete + ajuste_regras), o que as regras fizeram
-- no último salvamento (histórico: qual regra mudou o quê) e a liberação do gerente (não envia nem aprova enquanto
-- estiver pendente; a chave guarda o que foi liberado). Orçamentos antigos: origem pela solicitação (site = vitrine,
-- whatsapp = whatsapp), o resto balcão; sem regras, sem ajuste, nada pendente.
ALTER TABLE "orcamentos"
  ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'balcao',
  ADD COLUMN "data_desejada" DATE,
  ADD COLUMN "ajuste_regras" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "regras" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "liberacao_pendente" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "liberado_por" UUID,
  ADD COLUMN "liberado_em" TIMESTAMPTZ(3),
  ADD COLUMN "liberacao_chave" TEXT;

ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_liberado_por_fkey" FOREIGN KEY ("liberado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "orcamentos" o
SET "origem" = CASE s."origem" WHEN 'site' THEN 'vitrine' ELSE 'whatsapp' END
FROM "solicitacoes_orcamento" s
WHERE s."id" = o."solicitacao_id" AND s."origem" IN ('site', 'whatsapp');

-- 3) No item: o ajuste das regras (com sinal); o desconto do item continua sendo só o manual.
-- total = produto + acabamentos + ajuste_regras − desconto
ALTER TABLE "orcamento_itens" ADD COLUMN "ajuste_regras" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 4) Manual do atendente: orientações livres do dono para o Assistente (nunca mudam preço).
ALTER TABLE "empresa_config" ADD COLUMN "manual_atendente" TEXT;

-- 5) Mensagem do orçamento com a linha {{descontos}} (as frases das regras para o cliente, ex.: "Desconto de 5% por
-- quantidade") logo abaixo do total; sem regra aplicada, a linha some. Só troca o template ainda com o texto padrão
-- anterior (não editado); nos editados, as frases entram no fim da lista de itens (mensagem.ts).
-- Antigo = TEXTOS_PADRAO_MENSAGEM antes desta versão; novo = TEXTOS_PADRAO_MENSAGEM (@onprint/shared/whatsapp).
-- Os literais foram gerados a partir dos próprios textos (mesmos bytes: quebras de linha, travessão e acentos).
UPDATE "mensagem_templates" t
SET "conteudo" = v.novo, "updated_at" = now()
FROM (VALUES
  ('orcamento_enviado',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\nPagamento: {{condicoes_pagamento}}\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\nToque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\n{{descontos}}\nPagamento: {{condicoes_pagamento}}\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\nToque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}')
) AS v(categoria, antigo, novo)
WHERE t."categoria" = v.categoria
  AND t."conteudo" = v.antigo;
