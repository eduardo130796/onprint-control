-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "status_personalizado_id" UUID;

-- AlterTable
ALTER TABLE "ordens_producao" ADD COLUMN     "etapa_personalizada_id" UUID;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "status_personalizado_id" UUID;

-- AlterTable
ALTER TABLE "status_config" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "base" TEXT,
ADD COLUMN     "sistema" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_status_personalizado_id_fkey" FOREIGN KEY ("status_personalizado_id") REFERENCES "status_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_status_personalizado_id_fkey" FOREIGN KEY ("status_personalizado_id") REFERENCES "status_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_etapa_personalizada_id_fkey" FOREIGN KEY ("etapa_personalizada_id") REFERENCES "status_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
