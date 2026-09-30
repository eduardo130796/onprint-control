-- CreateEnum
CREATE TYPE "etapa_producao" AS ENUM ('fila', 'pre_impressao', 'impressao', 'acabamento', 'conferencia', 'concluido');

-- CreateTable
CREATE TABLE "ordens_producao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "pedido_id" UUID NOT NULL,
    "pedido_item_id" UUID NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "largura" DECIMAL(10,3),
    "altura" DECIMAL(10,3),
    "area_m2" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "etapa_atual" "etapa_producao" NOT NULL DEFAULT 'fila',
    "maquina_id" UUID,
    "responsavel_id" UUID,
    "prioridade" "prioridade" NOT NULL DEFAULT 'normal',
    "horas_estimadas" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "data_inicio_prevista" DATE,
    "data_fim_prevista" DATE,
    "data_inicio_real" TIMESTAMPTZ(3),
    "data_fim_real" TIMESTAMPTZ(3),
    "entrou_etapa_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ordem_kanban" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "ordens_producao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "op_etapas_historico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "op_id" UUID NOT NULL,
    "etapa_de" "etapa_producao",
    "etapa_para" "etapa_producao" NOT NULL,
    "usuario_id" UUID,
    "segundos_na_etapa" INTEGER NOT NULL DEFAULT 0,
    "override" BOOLEAN NOT NULL DEFAULT false,
    "motivo" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "op_etapas_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "op_apontamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "op_id" UUID NOT NULL,
    "processo_id" UUID,
    "maquina_id" UUID,
    "operador_id" UUID,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3),
    "quantidade_produzida" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "perda" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "op_apontamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arte_comentarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "arte_id" UUID NOT NULL,
    "autor_nome" TEXT NOT NULL,
    "usuario_id" UUID,
    "origem" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arte_comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordens_producao_numero_key" ON "ordens_producao"("numero");

-- CreateIndex
CREATE INDEX "ordens_producao_pedido_id_idx" ON "ordens_producao"("pedido_id");

-- CreateIndex
CREATE INDEX "ordens_producao_pedido_item_id_idx" ON "ordens_producao"("pedido_item_id");

-- CreateIndex
CREATE INDEX "ordens_producao_etapa_atual_idx" ON "ordens_producao"("etapa_atual");

-- CreateIndex
CREATE INDEX "ordens_producao_maquina_id_idx" ON "ordens_producao"("maquina_id");

-- CreateIndex
CREATE INDEX "ordens_producao_responsavel_id_idx" ON "ordens_producao"("responsavel_id");

-- CreateIndex
CREATE INDEX "op_etapas_historico_op_id_idx" ON "op_etapas_historico"("op_id");

-- CreateIndex
CREATE INDEX "op_etapas_historico_created_at_idx" ON "op_etapas_historico"("created_at");

-- CreateIndex
CREATE INDEX "op_apontamentos_op_id_idx" ON "op_apontamentos"("op_id");

-- CreateIndex
CREATE INDEX "op_apontamentos_maquina_id_idx" ON "op_apontamentos"("maquina_id");

-- CreateIndex
CREATE INDEX "arte_comentarios_arte_id_idx" ON "arte_comentarios"("arte_id");

-- AddForeignKey
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_pedido_item_id_fkey" FOREIGN KEY ("pedido_item_id") REFERENCES "pedido_itens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquinas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_etapas_historico" ADD CONSTRAINT "op_etapas_historico_op_id_fkey" FOREIGN KEY ("op_id") REFERENCES "ordens_producao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_etapas_historico" ADD CONSTRAINT "op_etapas_historico_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_apontamentos" ADD CONSTRAINT "op_apontamentos_op_id_fkey" FOREIGN KEY ("op_id") REFERENCES "ordens_producao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_apontamentos" ADD CONSTRAINT "op_apontamentos_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_apontamentos" ADD CONSTRAINT "op_apontamentos_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquinas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_apontamentos" ADD CONSTRAINT "op_apontamentos_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arte_comentarios" ADD CONSTRAINT "arte_comentarios_arte_id_fkey" FOREIGN KEY ("arte_id") REFERENCES "artes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arte_comentarios" ADD CONSTRAINT "arte_comentarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
