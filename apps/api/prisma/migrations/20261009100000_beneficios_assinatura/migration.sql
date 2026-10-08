-- AlterTable
ALTER TABLE "assinaturas" ADD COLUMN     "cortesia_ate" DATE,
ADD COLUMN     "cortesia_motivo" TEXT;

-- AlterTable
ALTER TABLE "cobrancas" ADD COLUMN     "desconto" DECIMAL(10,2),
ADD COLUMN     "motivo_abono" TEXT;

-- CreateTable
CREATE TABLE "cupons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "duracao_meses" INTEGER,
    "valido_ate" DATE,
    "limite_usos" INTEGER,
    "planos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupons_usos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cupom_id" UUID NOT NULL,
    "assinante_id" UUID NOT NULL,
    "desde" DATE,
    "ate" DATE,
    "autor" TEXT NOT NULL DEFAULT 'sistema',
    "encerrado_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cupons_usos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cupons_codigo_key" ON "cupons"("codigo");

-- CreateIndex
CREATE INDEX "cupons_usos_assinante_id_idx" ON "cupons_usos"("assinante_id");

-- CreateIndex
CREATE INDEX "cupons_usos_cupom_id_idx" ON "cupons_usos"("cupom_id");

-- AddForeignKey
ALTER TABLE "cupons_usos" ADD CONSTRAINT "cupons_usos_cupom_id_fkey" FOREIGN KEY ("cupom_id") REFERENCES "cupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupons_usos" ADD CONSTRAINT "cupons_usos_assinante_id_fkey" FOREIGN KEY ("assinante_id") REFERENCES "assinantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A empresa dona da plataforma (schema legado) não paga mensalidade: cortesia sem prazo.
-- Só se nunca teve cobrança nem assinatura no gateway (nos schemas das empresas, a tabela está vazia).
UPDATE "assinaturas" a SET "situacao" = 'cortesia', "cortesia_motivo" = 'Empresa da plataforma'
FROM "assinantes" s
WHERE s."id" = a."assinante_id" AND s."schema" = 'public' AND a."situacao" = 'ativa'
  AND a."gateway_assinatura_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "cobrancas" c WHERE c."assinante_id" = a."assinante_id");
