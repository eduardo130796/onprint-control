-- Fila de etiquetas de entrega (uma pendente por OP)
CREATE TABLE "etiquetas_fila" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ordem_producao_id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "automatica" BOOLEAN NOT NULL DEFAULT false,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impressa_em" TIMESTAMPTZ(3),
    "criada_por" UUID,

    CONSTRAINT "etiquetas_fila_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "etiquetas_fila_ordem_producao_id_idx" ON "etiquetas_fila"("ordem_producao_id");
CREATE INDEX "etiquetas_fila_impressa_em_idx" ON "etiquetas_fila"("impressa_em");
-- Só uma etiqueta pendente por OP (as já impressas ficam no histórico)
CREATE UNIQUE INDEX "etiquetas_fila_pendente_op_key" ON "etiquetas_fila"("ordem_producao_id") WHERE "impressa_em" IS NULL;

ALTER TABLE "etiquetas_fila" ADD CONSTRAINT "etiquetas_fila_ordem_producao_id_fkey" FOREIGN KEY ("ordem_producao_id") REFERENCES "ordens_producao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "etiquetas_fila" ADD CONSTRAINT "etiquetas_fila_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
