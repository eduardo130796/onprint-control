-- Assistente GrafyGo, ajudas internas da equipe: montar orçamento a partir do texto do cliente, preencher produto e
-- escrever descrições. Ver modules/assistente/. Como todas as migrations, roda em todos os schemas.

-- 1) Controles da empresa (Configurações → Assistente): chave geral, cada ajuda e "nunca falar com meus clientes"
-- (só ajudas internas; nada do Assistente chega ao cliente). A leitura das respostas do WhatsApp continua em
-- whatsapp_config.assistente_respostas.
ALTER TABLE "empresa_config"
  ADD COLUMN "assistente_ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "assistente_orcamento_texto" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "assistente_produtos" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "assistente_descricoes" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "assistente_sem_clientes" BOOLEAN NOT NULL DEFAULT false;

-- 2) Uso: quanto cada chamada produziu (itens de orçamento montados, produtos preenchidos, descrições escritas),
-- para o contador "Este mês o Assistente montou…". Só tem linhas no schema "plataforma".
ALTER TABLE "uso_ia" ADD COLUMN "itens" INTEGER NOT NULL DEFAULT 0;
