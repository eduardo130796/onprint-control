-- Saída por inatividade: tempo da empresa e usuários de painel (TV) sem limite
ALTER TABLE "empresa_config" ADD COLUMN "inatividade_minutos" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "usuarios" ADD COLUMN "sem_inatividade" BOOLEAN NOT NULL DEFAULT false;
