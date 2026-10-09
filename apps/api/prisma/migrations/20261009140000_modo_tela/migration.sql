-- Modo da tela de cada usuário (claro | escuro | sistema)
ALTER TABLE "usuarios" ADD COLUMN "modo_tela" TEXT NOT NULL DEFAULT 'claro';
