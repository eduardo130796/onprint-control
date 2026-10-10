-- Tamanho da interface de cada usuário (compacto | padrao | grande)
ALTER TABLE "usuarios" ADD COLUMN "escala" TEXT NOT NULL DEFAULT 'padrao';
