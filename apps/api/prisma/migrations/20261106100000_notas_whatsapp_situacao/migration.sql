-- Nota de compra lida pelo WhatsApp (conversa "Você") esperando conferência na tela de Entradas de estoque.
-- situacao: pendente (aparece na faixa "Notas lidas pelo WhatsApp") | registrada (virou entrada: entrada_id) | descartada.
-- Como todas as migrations, roda em todos os schemas. Só colunas novas com padrão: nenhuma linha existente é alterada
-- (as notas já guardadas ficam como pendentes pelo padrão da coluna).
ALTER TABLE "notas_whatsapp" ADD COLUMN "situacao" TEXT NOT NULL DEFAULT 'pendente';
ALTER TABLE "notas_whatsapp" ADD COLUMN "resolvida_em" TIMESTAMPTZ(3);
ALTER TABLE "notas_whatsapp" ADD COLUMN "entrada_id" UUID;

CREATE INDEX "notas_whatsapp_situacao_created_at_idx" ON "notas_whatsapp"("situacao", "created_at");
