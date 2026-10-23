-- O que o olho do topo ("Ocultar valores") esconde, escolhido por cada usuário em Aparência (vazio = padrão)
ALTER TABLE "usuarios" ADD COLUMN "ocultar_valores" JSONB;
