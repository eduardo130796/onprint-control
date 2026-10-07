-- AlterTable
ALTER TABLE "assinaturas" ADD COLUMN     "cancelar_em" DATE,
ADD COLUMN     "documento_cobranca" TEXT,
ADD COLUMN     "forma_pagamento" TEXT,
ADD COLUMN     "gateway" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "gateway_assinatura_id" TEXT,
ADD COLUMN     "gateway_cliente_id" TEXT;

-- CreateTable
CREATE TABLE "cobrancas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assinante_id" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "gateway_id" TEXT,
    "valor" DECIMAL(10,2) NOT NULL,
    "vencimento" DATE NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'pendente',
    "forma" TEXT,
    "pago_em" TIMESTAMPTZ(3),
    "link_pagamento" TEXT,
    "falha" TEXT,
    "nf_situacao" TEXT,
    "nf_numero" TEXT,
    "nf_link_pdf" TEXT,
    "nf_erro" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cobrancas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_gateway" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gateway" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processado_em" TIMESTAMPTZ(3),
    "erro" TEXT,

    CONSTRAINT "eventos_gateway_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_gateway_id_key" ON "cobrancas"("gateway_id");

-- CreateIndex
CREATE INDEX "cobrancas_assinante_id_vencimento_idx" ON "cobrancas"("assinante_id", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_gateway_evento_id_key" ON "eventos_gateway"("evento_id");

-- CreateIndex
CREATE INDEX "eventos_gateway_recebido_em_idx" ON "eventos_gateway"("recebido_em");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_gateway_assinatura_id_key" ON "assinaturas"("gateway_assinatura_id");

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_assinante_id_fkey" FOREIGN KEY ("assinante_id") REFERENCES "assinantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

