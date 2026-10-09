-- Fase 3 da precificação: tudo interligado (docs/PRECIFICACAO.md)

-- Acabamentos que consomem insumos (quantidade por unidade da cobrança do acabamento)
CREATE TABLE "acabamento_insumos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "acabamento_id" UUID NOT NULL,
    "insumo_id" UUID NOT NULL,
    "quantidade" DECIMAL(12,4) NOT NULL,
    "perda_percentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "acabamento_insumos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "acabamento_insumos_acabamento_id_insumo_id_key" ON "acabamento_insumos"("acabamento_id", "insumo_id");
CREATE INDEX "acabamento_insumos_insumo_id_idx" ON "acabamento_insumos"("insumo_id");
ALTER TABLE "acabamento_insumos" ADD CONSTRAINT "acabamento_insumos_acabamento_id_fkey" FOREIGN KEY ("acabamento_id") REFERENCES "acabamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acabamento_insumos" ADD CONSTRAINT "acabamento_insumos_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custo detalhado do item vendido (linhas do custo direto, com as medidas reais)
ALTER TABLE "orcamento_itens" ADD COLUMN "custo_detalhe" JSONB;
ALTER TABLE "pedido_itens" ADD COLUMN "custo_detalhe" JSONB;

-- Custo do acabamento no momento da venda
ALTER TABLE "orcamento_item_acabamentos" ADD COLUMN "custo" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "pedido_item_acabamentos" ADD COLUMN "custo" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Custo direto da venda no PDV (relatórios)
ALTER TABLE "vendas_pdv_itens" ADD COLUMN "custo" DECIMAL(12,2);
