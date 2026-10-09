-- Insumos, composição de custo e preço (docs/PRECIFICACAO.md)

-- Produtos: custo com 4 casas, modo de custo, lucro sobre o preço e embalagem do insumo
ALTER TABLE "produtos" ALTER COLUMN "custo" TYPE DECIMAL(12,4);
ALTER TABLE "produtos" ADD COLUMN "modo_custo" TEXT NOT NULL DEFAULT 'simples';
ALTER TABLE "produtos" ADD COLUMN "lucro_desejado" DECIMAL(5,2);
ALTER TABLE "produtos" ADD COLUMN "lucro_minimo" DECIMAL(5,2);
ALTER TABLE "produtos" ADD COLUMN "custo_detalhe" JSONB;
ALTER TABLE "produtos" ADD COLUMN "custo_calculado_em" TIMESTAMPTZ(3);
ALTER TABLE "produtos" ADD COLUMN "embalagem" TEXT;
ALTER TABLE "produtos" ADD COLUMN "embalagem_largura" DECIMAL(12,3);
ALTER TABLE "produtos" ADD COLUMN "embalagem_comprimento" DECIMAL(12,3);
ALTER TABLE "produtos" ADD COLUMN "embalagem_conteudo" DECIMAL(12,3);
ALTER TABLE "produtos" ADD COLUMN "preco_embalagem" DECIMAL(12,2);
ALTER TABLE "produtos" ADD COLUMN "fornecedor_preferido_id" UUID;

CREATE INDEX "produtos_fornecedor_preferido_id_idx" ON "produtos"("fornecedor_preferido_id");
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_fornecedor_preferido_id_fkey" FOREIGN KEY ("fornecedor_preferido_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Margem antiga (markup sobre o custo) vira lucro sobre o preço: m ÷ (100 + m) × 100
UPDATE "produtos" SET "lucro_desejado" = ROUND("margem" / (100 + "margem") * 100, 2) WHERE "margem" > 0;

-- Roteiro de processos com tempo e preparo; o tempo padrão antigo é por item
ALTER TABLE "produto_processos" ADD COLUMN "minutos" DECIMAL(10,2);
ALTER TABLE "produto_processos" ADD COLUMN "base" TEXT NOT NULL DEFAULT 'por_unidade';
ALTER TABLE "produto_processos" ADD COLUMN "setup_minutos" DECIMAL(10,2) NOT NULL DEFAULT 0;
UPDATE "produto_processos" SET "base" = 'por_item';

-- Mão de obra sem máquina
ALTER TABLE "processos" ADD COLUMN "custo_hora" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Outros custos da composição
CREATE TABLE "produto_custos_extras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "produto_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "valor" DECIMAL(12,4) NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'por_item',
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "produto_custos_extras_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "produto_custos_extras_produto_id_idx" ON "produto_custos_extras"("produto_id");
ALTER TABLE "produto_custos_extras" ADD CONSTRAINT "produto_custos_extras_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Precificação da empresa
ALTER TABLE "empresa_config" ADD COLUMN "impostos_percentual" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "empresa_config" ADD COLUMN "comissao_percentual" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "empresa_config" ADD COLUMN "custo_fixo_percentual" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "empresa_config" ADD COLUMN "rateio_modo" TEXT NOT NULL DEFAULT 'nenhum';
ALTER TABLE "empresa_config" ADD COLUMN "custo_fixo_mensal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "empresa_config" ADD COLUMN "horas_produtivas_mes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "empresa_config" ADD COLUMN "lucro_desejado_padrao" DECIMAL(5,2) NOT NULL DEFAULT 30;
ALTER TABLE "empresa_config" ADD COLUMN "lucro_minimo_padrao" DECIMAL(5,2) NOT NULL DEFAULT 15;
