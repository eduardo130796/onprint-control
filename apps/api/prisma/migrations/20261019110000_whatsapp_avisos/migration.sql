-- Avisos automáticos do pedido pelo WhatsApp da gráfica (Evolution API, conexão por QR code).

-- CreateEnum
CREATE TYPE "status_mensagem_whatsapp" AS ENUM ('pendente', 'enviada', 'falhou', 'ignorada');

-- Cliente pode pedir para não receber os avisos
ALTER TABLE "clientes" ADD COLUMN "receber_avisos_whatsapp" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "whatsapp_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conectado" BOOLEAN NOT NULL DEFAULT false,
    "numero" TEXT,
    "nome_perfil" TEXT,
    "conectado_em" TIMESTAMPTZ(3),
    "desconectado_em" TIMESTAMPTZ(3),
    "eventos" TEXT[] DEFAULT ARRAY['pedido_confirmado', 'arte_aprovacao', 'pedido_pronto', 'pedido_em_entrega']::TEXT[],
    "horario_inicio" TEXT NOT NULL DEFAULT '08:00',
    "horario_fim" TEXT NOT NULL DEFAULT '20:00',
    "pausado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "whatsapp_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "pedido_id" UUID,
    "referencia_id" TEXT,
    "evento" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "status" "status_mensagem_whatsapp" NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "proxima_tentativa_em" TIMESTAMPTZ(3),
    "enviada_em" TIMESTAMPTZ(3),
    "id_externo" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mensagens_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_status_created_at_idx" ON "mensagens_whatsapp"("status", "created_at");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_pedido_id_idx" ON "mensagens_whatsapp"("pedido_id");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_evento_pedido_id_created_at_idx" ON "mensagens_whatsapp"("evento", "pedido_id", "created_at");

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Templates dos avisos novos para as empresas que já existem (as novas recebem pelo seed, com os demais).
-- Mesmos textos de TEXTOS_PADRAO_WHATSAPP (@onprint/shared/whatsapp).
INSERT INTO "mensagem_templates" ("id", "nome", "categoria", "conteudo", "ativo", "created_at", "updated_at")
SELECT gen_random_uuid(), v.nome, v.categoria, v.conteudo, true, now(), now()
FROM (VALUES
  ('Pedido confirmado', 'pedido_confirmado',
   E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} foi confirmado. Previsão de entrega: {{data_entrega}}.\nAcompanhe o andamento por aqui: {{link_acompanhamento}}\n{{empresa_nome}}'),
  ('Pedido saiu para entrega', 'pedido_em_entrega',
   E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} saiu para entrega.\nAcompanhe: {{link_acompanhamento}}\n{{empresa_nome}}'),
  ('Pedido entregue', 'pedido_entregue',
   E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} foi entregue. Obrigado pela preferência!\n{{empresa_nome}}'),
  ('Pagamento recebido', 'pagamento_recebido',
   E'Olá, {{cliente_nome}}! Recebemos o seu pagamento de {{valor_pago}} do pedido {{numero_pedido}}. Obrigado!\n{{empresa_nome}}')
) AS v(nome, categoria, conteudo)
WHERE EXISTS (SELECT 1 FROM "mensagem_templates")
  AND NOT EXISTS (SELECT 1 FROM "mensagem_templates" t WHERE t."categoria" = v.categoria);

-- "Pedido pronto" ainda com o texto padrão antigo (não editado) ganha o número e o link de acompanhamento
UPDATE "mensagem_templates"
SET "conteudo" = E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} está pronto. Previsão de entrega/retirada: {{data_entrega}}.\nDetalhes e andamento: {{link_acompanhamento}}',
    "updated_at" = now()
WHERE "categoria" = 'pedido_pronto'
  AND "conteudo" = 'Olá, {{cliente_nome}}! Seu pedido está pronto. Previsão de entrega/retirada: {{data_entrega}}.';
