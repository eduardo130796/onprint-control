-- Fonte e peso do texto de cada usuário (preferência visual, como o modo da tela)
ALTER TABLE "usuarios" ADD COLUMN "fonte" TEXT NOT NULL DEFAULT 'inter';
ALTER TABLE "usuarios" ADD COLUMN "peso_texto" TEXT NOT NULL DEFAULT 'normal';
