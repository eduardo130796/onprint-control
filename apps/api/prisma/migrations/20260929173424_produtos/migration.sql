-- CreateEnum
CREATE TYPE "tipo_produto" AS ENUM ('produto', 'servico', 'insumo', 'revenda');

-- CreateEnum
CREATE TYPE "modo_calculo" AS ENUM ('unidade', 'm2', 'metro_linear', 'milheiro', 'hora');

-- CreateEnum
CREATE TYPE "tipo_cobranca" AS ENUM ('fixo', 'por_unidade', 'por_m2', 'por_metro_linear', 'por_perimetro');

-- CreateEnum
CREATE TYPE "status_maquina" AS ENUM ('ativa', 'manutencao', 'parada');

-- CreateEnum
CREATE TYPE "base_insumo" AS ENUM ('por_unidade', 'por_m2', 'por_metro_linear');

-- CreateTable
CREATE TABLE "unidades_medida" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sigla" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "unidades_medida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "pai_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria_id" UUID,
    "unidade_medida_id" UUID,
    "tipo" "tipo_produto" NOT NULL DEFAULT 'produto',
    "modo_calculo" "modo_calculo" NOT NULL DEFAULT 'unidade',
    "preco_venda" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "custo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "margem" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "preco_minimo" DECIMAL(12,2),
    "largura_padrao" DECIMAL(10,3),
    "altura_padrao" DECIMAL(10,3),
    "largura_maxima" DECIMAL(10,3),
    "altura_maxima" DECIMAL(10,3),
    "prazo_producao_dias" INTEGER NOT NULL DEFAULT 0,
    "controla_estoque" BOOLEAN NOT NULL DEFAULT false,
    "estoque_minimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "imagem_arquivo_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_insumos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "produto_id" UUID NOT NULL,
    "insumo_id" UUID NOT NULL,
    "quantidade" DECIMAL(12,4) NOT NULL,
    "base" "base_insumo" NOT NULL DEFAULT 'por_unidade',
    "perda_percentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "produto_insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acabamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo_cobranca" "tipo_cobranca" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "custo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prazo_adicional_dias" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "acabamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_acabamentos" (
    "produto_id" UUID NOT NULL,
    "acabamento_id" UUID NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_acabamentos_pkey" PRIMARY KEY ("produto_id","acabamento_id")
);

-- CreateTable
CREATE TABLE "maquinas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "largura_util" DECIMAL(10,3),
    "velocidade_m2_hora" DECIMAL(10,2),
    "custo_hora" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "status_maquina" NOT NULL DEFAULT 'ativa',
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "maquinas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "maquina_padrao_id" UUID,
    "tempo_padrao_minutos" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "processos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_processos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "produto_id" UUID NOT NULL,
    "processo_id" UUID NOT NULL,
    "maquina_id" UUID,
    "ordem" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "produto_processos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unidades_medida_sigla_key" ON "unidades_medida"("sigla");

-- CreateIndex
CREATE INDEX "categorias_pai_id_idx" ON "categorias"("pai_id");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_codigo_key" ON "produtos"("codigo");

-- CreateIndex
CREATE INDEX "produtos_categoria_id_idx" ON "produtos"("categoria_id");

-- CreateIndex
CREATE INDEX "produtos_tipo_idx" ON "produtos"("tipo");

-- CreateIndex
CREATE INDEX "produtos_nome_idx" ON "produtos"("nome");

-- CreateIndex
CREATE INDEX "produto_insumos_insumo_id_idx" ON "produto_insumos"("insumo_id");

-- CreateIndex
CREATE UNIQUE INDEX "produto_insumos_produto_id_insumo_id_key" ON "produto_insumos"("produto_id", "insumo_id");

-- CreateIndex
CREATE INDEX "acabamentos_nome_idx" ON "acabamentos"("nome");

-- CreateIndex
CREATE INDEX "produto_acabamentos_acabamento_id_idx" ON "produto_acabamentos"("acabamento_id");

-- CreateIndex
CREATE INDEX "maquinas_status_idx" ON "maquinas"("status");

-- CreateIndex
CREATE INDEX "processos_maquina_padrao_id_idx" ON "processos"("maquina_padrao_id");

-- CreateIndex
CREATE INDEX "produto_processos_processo_id_idx" ON "produto_processos"("processo_id");

-- CreateIndex
CREATE INDEX "produto_processos_maquina_id_idx" ON "produto_processos"("maquina_id");

-- CreateIndex
CREATE UNIQUE INDEX "produto_processos_produto_id_processo_id_key" ON "produto_processos"("produto_id", "processo_id");

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_pai_id_fkey" FOREIGN KEY ("pai_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_unidade_medida_id_fkey" FOREIGN KEY ("unidade_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_imagem_arquivo_id_fkey" FOREIGN KEY ("imagem_arquivo_id") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_insumos" ADD CONSTRAINT "produto_insumos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_insumos" ADD CONSTRAINT "produto_insumos_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_acabamentos" ADD CONSTRAINT "produto_acabamentos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_acabamentos" ADD CONSTRAINT "produto_acabamentos_acabamento_id_fkey" FOREIGN KEY ("acabamento_id") REFERENCES "acabamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processos" ADD CONSTRAINT "processos_maquina_padrao_id_fkey" FOREIGN KEY ("maquina_padrao_id") REFERENCES "maquinas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_processos" ADD CONSTRAINT "produto_processos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_processos" ADD CONSTRAINT "produto_processos_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_processos" ADD CONSTRAINT "produto_processos_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquinas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
