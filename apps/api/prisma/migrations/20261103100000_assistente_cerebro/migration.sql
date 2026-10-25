-- Assistente GrafyGo, "cérebro da gráfica" e "Peça ao Assistente". Como todas as migrations, roda em todos os schemas.

-- Memória das notas de compra: o código do produto no fornecedor (cProd da NF-e) → o insumo que a pessoa confirmou
-- na entrada. Gravada só quando a entrada é registrada (nada é salvo pela leitura da nota); na próxima nota do mesmo
-- fornecedor o item já vem com o insumo certo. em_embalagem: a quantidade da nota é de embalagens (rolos, caixas).
CREATE TABLE "fornecedor_produtos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fornecedor_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "produto_id" UUID NOT NULL,
    "descricao" TEXT,
    "unidade" TEXT,
    "em_embalagem" BOOLEAN NOT NULL DEFAULT false,
    "usos" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fornecedor_produtos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fornecedor_produtos_fornecedor_id_codigo_key" ON "fornecedor_produtos"("fornecedor_id", "codigo");
CREATE INDEX "fornecedor_produtos_produto_id_idx" ON "fornecedor_produtos"("produto_id");
ALTER TABLE "fornecedor_produtos" ADD CONSTRAINT "fornecedor_produtos_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fornecedor_produtos" ADD CONSTRAINT "fornecedor_produtos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
