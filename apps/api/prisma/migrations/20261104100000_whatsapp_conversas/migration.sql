-- WhatsApp mais natural: aprovação pela conversa (sem enquete) e as "Conversas do WhatsApp" (copiloto nível 1).
-- Como todas as migrations, roda em todos os schemas. Nenhuma linha existente é alterada.

-- 1) Empresa nova aprova o orçamento pela conversa natural (sem enquete nem "responda 1/2"). Só o padrão da coluna
-- muda: quem já tem a configuração continua com o formato que está nela (a tela WhatsApp troca).
ALTER TABLE "whatsapp_config" ALTER COLUMN "formato_aprovacao" SET DEFAULT 'conversa';

-- 2) Respostas anteriores do cliente ao orçamento (a mais recente continua em resposta/resposta_texto): antes de uma
-- resposta nova ocupar o lugar, a anterior vai para esta lista — nada se perde. Se o Assistente entender que a
-- mensagem nova não era resposta (pedido novo, pergunta de outro pedido), a anterior volta para o lugar.
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "respostas_anteriores" JSONB;

-- 3) Conversas do WhatsApp: mensagens de clientes (conversas individuais; nunca grupos, status ou as nossas) que não
-- foram tratadas como resposta de orçamento. Mensagens seguidas do mesmo contato em poucos minutos ficam numa conversa.
-- assunto: orcamento | pedido | duvida | outro (assunto_via: regras | assistente); situacao: aberta | resolvida.
CREATE TABLE "conversas_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT,
    "jid" TEXT,
    "nome_whatsapp" TEXT,
    "cliente_id" UUID,
    "assunto" TEXT NOT NULL DEFAULT 'outro',
    "assunto_via" TEXT NOT NULL DEFAULT 'regras',
    "resumo" TEXT,
    "confianca" DOUBLE PRECISION,
    "classificar" BOOLEAN NOT NULL DEFAULT false,
    "orcamento_id" UUID,
    "situacao" TEXT NOT NULL DEFAULT 'aberta',
    "resolvida_em" TIMESTAMPTZ(3),
    "resolvida_por" UUID,
    "notificada_em" TIMESTAMPTZ(3),
    "primeira_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversas_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversas_whatsapp_situacao_ultima_em_idx" ON "conversas_whatsapp"("situacao", "ultima_em");
CREATE INDEX "conversas_whatsapp_numero_idx" ON "conversas_whatsapp"("numero");
CREATE INDEX "conversas_whatsapp_jid_idx" ON "conversas_whatsapp"("jid");
CREATE INDEX "conversas_whatsapp_cliente_id_idx" ON "conversas_whatsapp"("cliente_id");
ALTER TABLE "conversas_whatsapp" ADD CONSTRAINT "conversas_whatsapp_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversas_whatsapp" ADD CONSTRAINT "conversas_whatsapp_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cada mensagem recebida (id do WhatsApp único: o mesmo aviso do webhook duas vezes não entra de novo). Mídia: só o
-- tipo (foto, áudio...). tratada: virou resposta do orçamento (aprovou, pediu modificação) e não pede ação na lista.
CREATE TABLE "conversa_mensagens_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversa_id" UUID NOT NULL,
    "id_externo" TEXT NOT NULL,
    "texto" TEXT,
    "midia" TEXT,
    "orcamento_id" UUID,
    "tratada" BOOLEAN NOT NULL DEFAULT false,
    "recebida_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversa_mensagens_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversa_mensagens_whatsapp_id_externo_key" ON "conversa_mensagens_whatsapp"("id_externo");
CREATE INDEX "conversa_mensagens_whatsapp_conversa_id_idx" ON "conversa_mensagens_whatsapp"("conversa_id");
ALTER TABLE "conversa_mensagens_whatsapp" ADD CONSTRAINT "conversa_mensagens_whatsapp_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas_whatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
