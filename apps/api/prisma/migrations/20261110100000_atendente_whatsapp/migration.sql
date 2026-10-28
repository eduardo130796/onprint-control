-- Atendente do WhatsApp: quando ninguém responde o cliente em alguns minutos, o Assistente GrafyGo atende pela gráfica
-- (confirma o pedido, pergunta o que falta, deixa o rascunho pronto e avisa o dono no "Você"). Desligado até a gráfica
-- ligar. Como todas as migrations, roda em todos os schemas. Só colunas novas: nenhuma linha existente é alterada.

-- 1) O interruptor e a espera (minutos sem resposta antes de o atendente entrar)
ALTER TABLE "whatsapp_config" ADD COLUMN "atendente_ativo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_config" ADD COLUMN "atendente_espera_min" INTEGER NOT NULL DEFAULT 5;
-- Envio sozinho do orçamento (desligado): só com tudo certo e até o limite de valor da gráfica (nulo = sem limite)
ALTER TABLE "whatsapp_config" ADD COLUMN "atendente_envia" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_config" ADD COLUMN "atendente_limite" DECIMAL(12,2);

-- 2) Na conversa: quando o atendente respondeu por último (a próxima resposta só depois de mensagem nova do cliente),
--    quantas vezes e se parou de vez (pessoa: o cliente pediu uma pessoa | limite | pessoal: não era cliente)
ALTER TABLE "conversas_whatsapp" ADD COLUMN "atendida_em" TIMESTAMPTZ(3);
ALTER TABLE "conversas_whatsapp" ADD COLUMN "atendimentos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "conversas_whatsapp" ADD COLUMN "atendente_parou" TEXT;
