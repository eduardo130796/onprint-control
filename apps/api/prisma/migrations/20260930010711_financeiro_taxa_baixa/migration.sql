-- AlterTable
ALTER TABLE "movimentos_financeiros" ADD COLUMN     "baixa_de_id" UUID;

-- AddForeignKey
ALTER TABLE "movimentos_financeiros" ADD CONSTRAINT "movimentos_financeiros_baixa_de_id_fkey" FOREIGN KEY ("baixa_de_id") REFERENCES "movimentos_financeiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
