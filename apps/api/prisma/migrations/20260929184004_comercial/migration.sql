-- CreateEnum
CREATE TYPE "status_solicitacao" AS ENUM ('nova', 'em_atendimento', 'orcada', 'descartada');

-- CreateEnum
CREATE TYPE "status_orcamento" AS ENUM ('rascunho', 'enviado', 'em_negociacao', 'aprovado', 'recusado', 'expirado', 'convertido');

-- CreateEnum
CREATE TYPE "status_pedido" AS ENUM ('aguardando_arte', 'arte_em_aprovacao', 'em_producao', 'pronto', 'em_entrega', 'entregue', 'cancelado');

-- CreateEnum
CREATE TYPE "status_financeiro_pedido" AS ENUM ('pendente', 'parcial', 'pago');

-- CreateEnum
CREATE TYPE "tipo_entrega" AS ENUM ('retirada', 'entrega', 'instalacao');

-- CreateEnum
CREATE TYPE "prioridade" AS ENUM ('baixa', 'normal', 'alta', 'urgente');

-- CreateEnum
CREATE TYPE "status_arte" AS ENUM ('aguardando_arquivo', 'em_criacao', 'enviada_cliente', 'ajuste_solicitado', 'aprovada');

-- CreateEnum
CREATE TYPE "status_entrega" AS ENUM ('pendente', 'agendada', 'realizada', 'cancelada');

-- CreateEnum
CREATE TYPE "status_conta" AS ENUM ('aberto', 'parcial', 'pago', 'vencido', 'cancelado');

-- CreateEnum
CREATE TYPE "status_comissao" AS ENUM ('prevista', 'liberada', 'paga');

-- CreateTable
CREATE TABLE "solicitacoes_orcamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "cliente_id" UUID,
    "origem" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "prazo_desejado" DATE,
    "status" "status_solicitacao" NOT NULL DEFAULT 'nova',
    "responsavel_id" UUID,
    "referencia_externa" TEXT,
    "motivo_descarte" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "solicitacoes_orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "cliente_id" UUID NOT NULL,
    "vendedor_id" UUID,
    "solicitacao_id" UUID,
    "validade" DATE NOT NULL,
    "status" "status_orcamento" NOT NULL DEFAULT 'rascunho',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "acrescimo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "frete" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "custo_estimado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prazo_dias" INTEGER NOT NULL DEFAULT 0,
    "condicoes" TEXT,
    "observacoes" TEXT,
    "observacoes_internas" TEXT,
    "token_publico" TEXT NOT NULL,
    "enviado_em" TIMESTAMPTZ(3),
    "aprovado_em" TIMESTAMPTZ(3),
    "aprovado_por_nome" TEXT,
    "aprovado_ip" TEXT,
    "recusado_em" TIMESTAMPTZ(3),
    "motivo_recusa" TEXT,
    "pedido_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orcamento_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "largura" DECIMAL(10,3),
    "altura" DECIMAL(10,3),
    "area_m2" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "preco_unitario" DECIMAL(12,2) NOT NULL,
    "valor_produto" DECIMAL(12,2) NOT NULL,
    "valor_acabamentos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "custo_estimado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prazo_dias" INTEGER NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL,
    "observacao" TEXT,
    "preco_liberado_por" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orcamento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_item_acabamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "acabamento_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo_cobranca" "tipo_cobranca" NOT NULL,
    "valor_unitario" DECIMAL(12,2) NOT NULL,
    "base" DECIMAL(12,3) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "orcamento_item_acabamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "cliente_id" UUID NOT NULL,
    "vendedor_id" UUID,
    "data_prevista_entrega" DATE NOT NULL,
    "status" "status_pedido" NOT NULL DEFAULT 'aguardando_arte',
    "status_financeiro" "status_financeiro_pedido" NOT NULL DEFAULT 'pendente',
    "tipo_entrega" "tipo_entrega" NOT NULL DEFAULT 'retirada',
    "endereco_entrega" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "acrescimo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "frete" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "valor_pago" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prioridade" "prioridade" NOT NULL DEFAULT 'normal',
    "observacoes" TEXT,
    "observacoes_internas" TEXT,
    "motivo_cancelamento" TEXT,
    "cancelado_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_id" UUID NOT NULL,
    "orcamento_item_id" UUID,
    "produto_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "largura" DECIMAL(10,3),
    "altura" DECIMAL(10,3),
    "area_m2" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "preco_unitario" DECIMAL(12,2) NOT NULL,
    "valor_produto" DECIMAL(12,2) NOT NULL,
    "valor_acabamentos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "custo_estimado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prazo_dias" INTEGER NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL,
    "observacao" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pedido_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_item_acabamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "acabamento_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo_cobranca" "tipo_cobranca" NOT NULL,
    "valor_unitario" DECIMAL(12,2) NOT NULL,
    "base" DECIMAL(12,3) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "pedido_item_acabamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_item_id" UUID NOT NULL,
    "versao" INTEGER NOT NULL,
    "arquivo_id" UUID,
    "miniatura_id" UUID,
    "status" "status_arte" NOT NULL DEFAULT 'aguardando_arquivo',
    "comentario_cliente" TEXT,
    "designer_id" UUID,
    "token_publico" TEXT NOT NULL,
    "aprovada_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "artes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_id" UUID NOT NULL,
    "tipo" "tipo_entrega" NOT NULL,
    "data_agendada" TIMESTAMPTZ(3),
    "data_realizada" TIMESTAMPTZ(3),
    "responsavel_id" UUID,
    "recebido_por" TEXT,
    "comprovante_id" UUID,
    "endereco" TEXT,
    "status" "status_entrega" NOT NULL DEFAULT 'pendente',
    "observacao" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entregas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_receber" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_id" UUID,
    "cliente_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
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
    "observacao" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "contas_receber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comissoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendedor_id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "base" DECIMAL(12,2) NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "status" "status_comissao" NOT NULL DEFAULT 'prevista',
    "liberada_em" TIMESTAMPTZ(3),
    "paga_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "comissoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_orcamento_numero_key" ON "solicitacoes_orcamento"("numero");

-- CreateIndex
CREATE INDEX "solicitacoes_orcamento_status_idx" ON "solicitacoes_orcamento"("status");

-- CreateIndex
CREATE INDEX "solicitacoes_orcamento_cliente_id_idx" ON "solicitacoes_orcamento"("cliente_id");

-- CreateIndex
CREATE INDEX "solicitacoes_orcamento_responsavel_id_idx" ON "solicitacoes_orcamento"("responsavel_id");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_numero_key" ON "orcamentos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_token_publico_key" ON "orcamentos"("token_publico");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_pedido_id_key" ON "orcamentos"("pedido_id");

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "orcamentos_cliente_id_idx" ON "orcamentos"("cliente_id");

-- CreateIndex
CREATE INDEX "orcamentos_vendedor_id_idx" ON "orcamentos"("vendedor_id");

-- CreateIndex
CREATE INDEX "orcamentos_validade_idx" ON "orcamentos"("validade");

-- CreateIndex
CREATE INDEX "orcamento_itens_orcamento_id_idx" ON "orcamento_itens"("orcamento_id");

-- CreateIndex
CREATE INDEX "orcamento_itens_produto_id_idx" ON "orcamento_itens"("produto_id");

-- CreateIndex
CREATE INDEX "orcamento_item_acabamentos_item_id_idx" ON "orcamento_item_acabamentos"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_numero_key" ON "pedidos"("numero");

-- CreateIndex
CREATE INDEX "pedidos_status_idx" ON "pedidos"("status");

-- CreateIndex
CREATE INDEX "pedidos_cliente_id_idx" ON "pedidos"("cliente_id");

-- CreateIndex
CREATE INDEX "pedidos_vendedor_id_idx" ON "pedidos"("vendedor_id");

-- CreateIndex
CREATE INDEX "pedidos_data_prevista_entrega_idx" ON "pedidos"("data_prevista_entrega");

-- CreateIndex
CREATE INDEX "pedido_itens_pedido_id_idx" ON "pedido_itens"("pedido_id");

-- CreateIndex
CREATE INDEX "pedido_itens_produto_id_idx" ON "pedido_itens"("produto_id");

-- CreateIndex
CREATE INDEX "pedido_item_acabamentos_item_id_idx" ON "pedido_item_acabamentos"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "artes_token_publico_key" ON "artes"("token_publico");

-- CreateIndex
CREATE INDEX "artes_status_idx" ON "artes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "artes_pedido_item_id_versao_key" ON "artes"("pedido_item_id", "versao");

-- CreateIndex
CREATE INDEX "entregas_pedido_id_idx" ON "entregas"("pedido_id");

-- CreateIndex
CREATE INDEX "entregas_status_idx" ON "entregas"("status");

-- CreateIndex
CREATE INDEX "contas_receber_pedido_id_idx" ON "contas_receber"("pedido_id");

-- CreateIndex
CREATE INDEX "contas_receber_cliente_id_idx" ON "contas_receber"("cliente_id");

-- CreateIndex
CREATE INDEX "contas_receber_status_idx" ON "contas_receber"("status");

-- CreateIndex
CREATE INDEX "contas_receber_vencimento_idx" ON "contas_receber"("vencimento");

-- CreateIndex
CREATE INDEX "comissoes_vendedor_id_idx" ON "comissoes"("vendedor_id");

-- CreateIndex
CREATE INDEX "comissoes_pedido_id_idx" ON "comissoes"("pedido_id");

-- CreateIndex
CREATE INDEX "comissoes_status_idx" ON "comissoes"("status");

-- AddForeignKey
ALTER TABLE "solicitacoes_orcamento" ADD CONSTRAINT "solicitacoes_orcamento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_orcamento" ADD CONSTRAINT "solicitacoes_orcamento_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_orcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_preco_liberado_por_fkey" FOREIGN KEY ("preco_liberado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_item_acabamentos" ADD CONSTRAINT "orcamento_item_acabamentos_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "orcamento_itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_item_acabamentos" ADD CONSTRAINT "orcamento_item_acabamentos_acabamento_id_fkey" FOREIGN KEY ("acabamento_id") REFERENCES "acabamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_item_acabamentos" ADD CONSTRAINT "pedido_item_acabamentos_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "pedido_itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_item_acabamentos" ADD CONSTRAINT "pedido_item_acabamentos_acabamento_id_fkey" FOREIGN KEY ("acabamento_id") REFERENCES "acabamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artes" ADD CONSTRAINT "artes_pedido_item_id_fkey" FOREIGN KEY ("pedido_item_id") REFERENCES "pedido_itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artes" ADD CONSTRAINT "artes_arquivo_id_fkey" FOREIGN KEY ("arquivo_id") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artes" ADD CONSTRAINT "artes_miniatura_id_fkey" FOREIGN KEY ("miniatura_id") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artes" ADD CONSTRAINT "artes_designer_id_fkey" FOREIGN KEY ("designer_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_comprovante_id_fkey" FOREIGN KEY ("comprovante_id") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
