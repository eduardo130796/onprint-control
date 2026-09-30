-- CreateEnum
CREATE TYPE "tipo_forma_pagamento" AS ENUM ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'boleto', 'transferencia', 'outro');

-- CreateEnum
CREATE TYPE "tipo_conta_financeira" AS ENUM ('caixa', 'banco', 'outro');

-- CreateEnum
CREATE TYPE "tipo_categoria_financeira" AS ENUM ('receita', 'despesa');

-- CreateEnum
CREATE TYPE "tipo_movimento_financeiro" AS ENUM ('entrada', 'saida');

-- CreateEnum
CREATE TYPE "status_caixa_sessao" AS ENUM ('aberta', 'fechada');

-- CreateEnum
CREATE TYPE "tipo_caixa_movimento" AS ENUM ('abertura', 'venda', 'recebimento', 'sangria', 'suprimento', 'estorno');

-- CreateEnum
CREATE TYPE "status_venda_pdv" AS ENUM ('concluida', 'cancelada');

-- AlterTable
ALTER TABLE "contas_receber" ADD COLUMN     "anexo_id" UUID,
ADD COLUMN     "categoria_id" UUID,
ADD COLUMN     "conta_financeira_id" UUID,
ADD COLUMN     "forma_pagamento_id" UUID,
ADD COLUMN     "motivo_cancelamento" TEXT;

-- AlterTable
ALTER TABLE "estoque_movimentacoes" ADD COLUMN     "venda_pdv_id" UUID;

-- CreateTable
CREATE TABLE "formas_pagamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "tipo" "tipo_forma_pagamento" NOT NULL,
    "taxa_percentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "dias_recebimento" INTEGER NOT NULL DEFAULT 0,
    "permite_parcelamento" BOOLEAN NOT NULL DEFAULT false,
    "max_parcelas" INTEGER NOT NULL DEFAULT 1,
    "conta_financeira_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "formas_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_financeiras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "tipo" "tipo_conta_financeira" NOT NULL,
    "banco" TEXT,
    "agencia" TEXT,
    "numero_conta" TEXT,
    "saldo_inicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "contas_financeiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_financeiras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "tipo" "tipo_categoria_financeira" NOT NULL,
    "pai_id" UUID,
    "codigo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categorias_financeiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_pagar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fornecedor_id" UUID,
    "descricao" TEXT NOT NULL,
    "documento" TEXT,
    "parcela" INTEGER NOT NULL DEFAULT 1,
    "total_parcelas" INTEGER NOT NULL DEFAULT 1,
    "valor" DECIMAL(12,2) NOT NULL,
    "vencimento" DATE NOT NULL,
    "status" "status_conta" NOT NULL DEFAULT 'aberto',
    "valor_pago" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "juros" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "multa" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pago_em" DATE,
    "forma_pagamento_id" UUID,
    "conta_financeira_id" UUID,
    "categoria_id" UUID,
    "anexo_id" UUID,
    "observacao" TEXT,
    "motivo_cancelamento" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "contas_pagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_financeiros" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "tipo_movimento_financeiro" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "data" DATE NOT NULL,
    "descricao" TEXT NOT NULL,
    "conta_financeira_id" UUID NOT NULL,
    "categoria_id" UUID,
    "forma_pagamento_id" UUID,
    "conta_receber_id" UUID,
    "conta_pagar_id" UUID,
    "comissao_id" UUID,
    "caixa_sessao_id" UUID,
    "venda_pdv_id" UUID,
    "transferencia_id" UUID,
    "principal" DECIMAL(12,2),
    "juros" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "multa" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estorno_de_id" UUID,
    "usuario_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_financeiros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caixa_sessoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "usuario_id" UUID NOT NULL,
    "conta_financeira_id" UUID NOT NULL,
    "status" "status_caixa_sessao" NOT NULL DEFAULT 'aberta',
    "aberta_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valor_abertura" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fechada_em" TIMESTAMPTZ(3),
    "fechada_por_id" UUID,
    "total_calculado" DECIMAL(12,2),
    "total_informado" DECIMAL(12,2),
    "diferenca" DECIMAL(12,2),
    "conferencia" JSONB,
    "observacao" TEXT,

    CONSTRAINT "caixa_sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caixa_movimentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessao_id" UUID NOT NULL,
    "tipo" "tipo_caixa_movimento" NOT NULL,
    "forma_pagamento_id" UUID,
    "valor" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT,
    "venda_pdv_id" UUID,
    "conta_receber_id" UUID,
    "movimento_financeiro_id" UUID,
    "usuario_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caixa_movimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas_pdv" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "sessao_id" UUID NOT NULL,
    "cliente_id" UUID,
    "usuario_id" UUID,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "valor_recebido" DECIMAL(12,2) NOT NULL,
    "troco" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "status_venda_pdv" NOT NULL DEFAULT 'concluida',
    "motivo_cancelamento" TEXT,
    "cancelada_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendas_pdv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas_pdv_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venda_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "preco_unitario" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "vendas_pdv_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formas_pagamento_nome_key" ON "formas_pagamento"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "contas_financeiras_nome_key" ON "contas_financeiras"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_financeiras_codigo_key" ON "categorias_financeiras"("codigo");

-- CreateIndex
CREATE INDEX "categorias_financeiras_tipo_idx" ON "categorias_financeiras"("tipo");

-- CreateIndex
CREATE INDEX "contas_pagar_fornecedor_id_idx" ON "contas_pagar"("fornecedor_id");

-- CreateIndex
CREATE INDEX "contas_pagar_status_idx" ON "contas_pagar"("status");

-- CreateIndex
CREATE INDEX "contas_pagar_vencimento_idx" ON "contas_pagar"("vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "movimentos_financeiros_estorno_de_id_key" ON "movimentos_financeiros"("estorno_de_id");

-- CreateIndex
CREATE INDEX "movimentos_financeiros_data_idx" ON "movimentos_financeiros"("data");

-- CreateIndex
CREATE INDEX "movimentos_financeiros_conta_financeira_id_data_idx" ON "movimentos_financeiros"("conta_financeira_id", "data");

-- CreateIndex
CREATE INDEX "movimentos_financeiros_conta_receber_id_idx" ON "movimentos_financeiros"("conta_receber_id");

-- CreateIndex
CREATE INDEX "movimentos_financeiros_conta_pagar_id_idx" ON "movimentos_financeiros"("conta_pagar_id");

-- CreateIndex
CREATE INDEX "movimentos_financeiros_categoria_id_idx" ON "movimentos_financeiros"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "caixa_sessoes_numero_key" ON "caixa_sessoes"("numero");

-- CreateIndex
CREATE INDEX "caixa_sessoes_usuario_id_status_idx" ON "caixa_sessoes"("usuario_id", "status");

-- CreateIndex
CREATE INDEX "caixa_sessoes_aberta_em_idx" ON "caixa_sessoes"("aberta_em");

-- CreateIndex
CREATE INDEX "caixa_movimentos_sessao_id_idx" ON "caixa_movimentos"("sessao_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendas_pdv_numero_key" ON "vendas_pdv"("numero");

-- CreateIndex
CREATE INDEX "vendas_pdv_sessao_id_idx" ON "vendas_pdv"("sessao_id");

-- CreateIndex
CREATE INDEX "vendas_pdv_created_at_idx" ON "vendas_pdv"("created_at");

-- CreateIndex
CREATE INDEX "vendas_pdv_itens_venda_id_idx" ON "vendas_pdv_itens"("venda_id");

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_conta_financeira_id_fkey" FOREIGN KEY ("conta_financeira_id") REFERENCES "contas_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_anexo_id_fkey" FOREIGN KEY ("anexo_id") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_movimentacoes" ADD CONSTRAINT "estoque_movimentacoes_venda_pdv_id_fkey" FOREIGN KEY ("venda_pdv_id") REFERENCES "vendas_pdv"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_conta_financeira_id_fkey" FOREIGN KEY ("conta_financeira_id") REFERENCES "contas_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_financeiras" ADD CONSTRAINT "categorias_financeiras_pai_id_fkey" FOREIGN KEY ("pai_id") REFERENCES "categorias_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_conta_financeira_id_fkey" FOREIGN KEY ("conta_financeira_id") REFERENCES "contas_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_anexo_id_fkey" FOREIGN KEY ("anexo_id") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_conta_financeira_id_fkey" FOREIGN KEY ("conta_financeira_id") REFERENCES "contas_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_conta_receber_id_fkey" FOREIGN KEY ("conta_receber_id") REFERENCES "contas_receber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_conta_pagar_id_fkey" FOREIGN KEY ("conta_pagar_id") REFERENCES "contas_pagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_comissao_id_fkey" FOREIGN KEY ("comissao_id") REFERENCES "comissoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_caixa_sessao_id_fkey" FOREIGN KEY ("caixa_sessao_id") REFERENCES "caixa_sessoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_venda_pdv_id_fkey" FOREIGN KEY ("venda_pdv_id") REFERENCES "vendas_pdv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_estorno_de_id_fkey" FOREIGN KEY ("estorno_de_id") REFERENCES "movimentos_financeiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_sessoes" ADD CONSTRAINT "caixa_sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_sessoes" ADD CONSTRAINT "caixa_sessoes_fechada_por_id_fkey" FOREIGN KEY ("fechada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_sessoes" ADD CONSTRAINT "caixa_sessoes_conta_financeira_id_fkey" FOREIGN KEY ("conta_financeira_id") REFERENCES "contas_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_movimentos" ADD CONSTRAINT "caixa_movimentos_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "caixa_sessoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_movimentos" ADD CONSTRAINT "caixa_movimentos_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_movimentos" ADD CONSTRAINT "caixa_movimentos_venda_pdv_id_fkey" FOREIGN KEY ("venda_pdv_id") REFERENCES "vendas_pdv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_movimentos" ADD CONSTRAINT "caixa_movimentos_conta_receber_id_fkey" FOREIGN KEY ("conta_receber_id") REFERENCES "contas_receber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_movimentos" ADD CONSTRAINT "caixa_movimentos_movimento_financeiro_id_fkey" FOREIGN KEY ("movimento_financeiro_id") REFERENCES "movimentos_financeiros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa_movimentos" ADD CONSTRAINT "caixa_movimentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_pdv" ADD CONSTRAINT "vendas_pdv_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "caixa_sessoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_pdv" ADD CONSTRAINT "vendas_pdv_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_pdv" ADD CONSTRAINT "vendas_pdv_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_pdv_itens" ADD CONSTRAINT "vendas_pdv_itens_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "vendas_pdv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_pdv_itens" ADD CONSTRAINT "vendas_pdv_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
