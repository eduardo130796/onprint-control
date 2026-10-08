-- AlterTable
ALTER TABLE "assinaturas" ADD COLUMN     "gateway_autorizacao_id" TEXT,
ADD COLUMN     "pix_qr_expira_em" TIMESTAMPTZ(3),
ADD COLUMN     "pix_qr_imagem" TEXT,
ADD COLUMN     "pix_qr_payload" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_gateway_autorizacao_id_key" ON "assinaturas"("gateway_autorizacao_id");

