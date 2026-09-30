-- CreateEnum
CREATE TYPE "tipo_movimentacao" AS ENUM ('entrada', 'saida', 'ajuste', 'consumo_producao', 'perda', 'transferencia', 'venda_pdv');

-- CreateTable
CREATE TABLE "estoque_locais" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "estoque_locais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoque_entradas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "fornecedor_id" UUID,
    "local_id" UUID NOT NULL,
    "nota_fiscal" TEXT,
    "data_entrada" DATE NOT NULL,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "estoque_entradas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoque_entrada_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entrada_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "custo_unitario" DECIMAL(12,4) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "estoque_entrada_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoque_movimentacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "tipo_movimentacao" NOT NULL,
    "produto_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "custo_unitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "saldo_apos" DECIMAL(12,3) NOT NULL,
    "motivo" TEXT,
    "op_id" UUID,
    "pedido_id" UUID,
    "fornecedor_id" UUID,
    "entrada_id" UUID,
    "transferencia_id" UUID,
    "usuario_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estoque_movimentacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoque_saldos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "produto_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "custo_medio" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "estoque_saldos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estoque_locais_nome_key" ON "estoque_locais"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "estoque_entradas_numero_key" ON "estoque_entradas"("numero");

-- CreateIndex
CREATE INDEX "estoque_entradas_fornecedor_id_idx" ON "estoque_entradas"("fornecedor_id");

-- CreateIndex
CREATE INDEX "estoque_entradas_data_entrada_idx" ON "estoque_entradas"("data_entrada");

-- CreateIndex
CREATE INDEX "estoque_entrada_itens_entrada_id_idx" ON "estoque_entrada_itens"("entrada_id");

-- CreateIndex
CREATE INDEX "estoque_entrada_itens_produto_id_idx" ON "estoque_entrada_itens"("produto_id");

-- CreateIndex
CREATE INDEX "estoque_movimentacoes_produto_id_created_at_idx" ON "estoque_movimentacoes"("produto_id", "created_at");

-- CreateIndex
CREATE INDEX "estoque_movimentacoes_local_id_idx" ON "estoque_movimentacoes"("local_id");

-- CreateIndex
CREATE INDEX "estoque_movimentacoes_op_id_idx" ON "estoque_movimentacoes"("op_id");

-- CreateIndex
CREATE INDEX "estoque_movimentacoes_pedido_id_idx" ON "estoque_movimentacoes"("pedido_id");

-- CreateIndex
CREATE INDEX "estoque_movimentacoes_tipo_created_at_idx" ON "estoque_movimentacoes"("tipo", "created_at");

-- CreateIndex
CREATE INDEX "estoque_saldos_local_id_idx" ON "estoque_saldos"("local_id");

-- CreateIndex
CREATE UNIQUE INDEX "estoque_saldos_produto_id_local_id_key" ON "estoque_saldos"("produto_id", "local_id");

-- AddForeignKey
ALTER TABLE "estoque_entradas" ADD CONSTRAINT "estoque_entradas_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_entradas" ADD CONSTRAINT "estoque_entradas_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "estoque_locais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_entradas" ADD CONSTRAINT "estoque_entradas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_entrada_itens" ADD CONSTRAINT "estoque_entrada_itens_entrada_id_fkey" FOREIGN KEY ("entrada_id") REFERENCES "estoque_entradas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_entrada_itens" ADD CONSTRAINT "estoque_entrada_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_movimentacoes" ADD CONSTRAINT "estoque_movimentacoes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_movimentacoes" ADD CONSTRAINT "estoque_movimentacoes_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "estoque_locais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_movimentacoes" ADD CONSTRAINT "estoque_movimentacoes_op_id_fkey" FOREIGN KEY ("op_id") REFERENCES "ordens_producao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_movimentacoes" ADD CONSTRAINT "estoque_movimentacoes_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_movimentacoes" ADD CONSTRAINT "estoque_movimentacoes_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_movimentacoes" ADD CONSTRAINT "estoque_movimentacoes_entrada_id_fkey" FOREIGN KEY ("entrada_id") REFERENCES "estoque_entradas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_movimentacoes" ADD CONSTRAINT "estoque_movimentacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_saldos" ADD CONSTRAINT "estoque_saldos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_saldos" ADD CONSTRAINT "estoque_saldos_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "estoque_locais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
