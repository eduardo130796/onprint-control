-- Link "Acompanhe seu pedido" (/pedido/:empresa/:token): token público do pedido, como o do orçamento e o da arte.
-- Os pedidos existentes ganham um token aleatório (64 caracteres hex); os novos recebem o token gerado pela API.
ALTER TABLE "pedidos" ADD COLUMN "token_publico" TEXT;

UPDATE "pedidos" SET "token_publico" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') WHERE "token_publico" IS NULL;

ALTER TABLE "pedidos" ALTER COLUMN "token_publico" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_token_publico_key" ON "pedidos"("token_publico");

-- Template "Acompanhamento do pedido" para as empresas que já existem (as novas recebem pelo seed, com os demais)
INSERT INTO "mensagem_templates" ("id", "nome", "categoria", "conteudo", "ativo", "created_at", "updated_at")
SELECT gen_random_uuid(), 'Acompanhamento do pedido', 'pedido_acompanhamento',
       E'Olá, {{cliente_nome}}! Acompanhe o andamento do seu pedido {{numero_pedido}} por este link: {{link_acompanhamento}}\nPrevisão de entrega: {{data_entrega}}.',
       true, now(), now()
WHERE EXISTS (SELECT 1 FROM "mensagem_templates")
  AND NOT EXISTS (SELECT 1 FROM "mensagem_templates" WHERE "categoria" = 'pedido_acompanhamento');
