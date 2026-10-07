-- CreateTable
CREATE TABLE "planos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "valor_mensal" DECIMAL(10,2) NOT NULL,
    "modulos" TEXT[],
    "limite_usuarios" INTEGER,
    "dias_teste" INTEGER NOT NULL DEFAULT 14,
    "dias_ate_somente_leitura" INTEGER NOT NULL DEFAULT 5,
    "dias_ate_bloqueio" INTEGER NOT NULL DEFAULT 15,
    "publico" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assinante_id" UUID NOT NULL,
    "plano_id" UUID NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'teste',
    "teste_ate" DATE,
    "atraso_desde" DATE,
    "proximo_vencimento" DATE,
    "liberado_ate" DATE,
    "bloqueio_manual" BOOLEAN NOT NULL DEFAULT false,
    "motivo_bloqueio" TEXT,
    "modulos_extras" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cancelada_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_assinatura" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assinante_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "dados" JSONB,
    "autor" TEXT NOT NULL DEFAULT 'sistema',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planos_codigo_key" ON "planos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_assinante_id_key" ON "assinaturas"("assinante_id");

-- CreateIndex
CREATE INDEX "assinaturas_plano_id_idx" ON "assinaturas"("plano_id");

-- CreateIndex
CREATE INDEX "eventos_assinatura_assinante_id_created_at_idx" ON "eventos_assinatura"("assinante_id", "created_at");

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_assinante_id_fkey" FOREIGN KEY ("assinante_id") REFERENCES "assinantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_assinatura" ADD CONSTRAINT "eventos_assinatura_assinante_id_fkey" FOREIGN KEY ("assinante_id") REFERENCES "assinantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
