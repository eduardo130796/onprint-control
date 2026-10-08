-- AlterTable
ALTER TABLE "assinaturas" ADD COLUMN     "plano_agendado_em" DATE,
ADD COLUMN     "plano_agendado_id" UUID;

-- AlterTable
ALTER TABLE "cobrancas" ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'mensalidade';

