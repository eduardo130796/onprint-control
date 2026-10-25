-- Assistente GrafyGo (IA): configuração da central, registro de uso por empresa e a primeira aplicação — entender
-- respostas do cliente ao orçamento no WhatsApp que as regras não entendem. Ver modules/assistente/.
-- Como todas as migrations, roda em todos os schemas: assistente_config e uso_ia só têm linhas no schema
-- "plataforma" (o dono vê todas as empresas); as colunas novas do WhatsApp valem no schema de cada empresa.

-- 1) Configuração única da central (painel da plataforma). A chave da API fica cifrada (AES-256-GCM; a chave de
-- cifra é derivada do IA_SEGREDO ou do JWT_ACCESS_SECRET) e nunca volta para o navegador: só os 4 últimos caracteres.
CREATE TABLE "assistente_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "provedor" TEXT NOT NULL DEFAULT 'anthropic',
    "modelo" TEXT NOT NULL DEFAULT 'claude-haiku-5-5',
    "chave_cifrada" TEXT,
    "chave_final" TEXT,
    -- Limite por empresa no mês (null = sem limite): chamadas e custo estimado em dólar
    "limite_chamadas_mes" INTEGER DEFAULT 300,
    "limite_usd_mes" DECIMAL(10,4) DEFAULT 1.00,
    -- Preço por milhão de tokens (USD) de cada modelo: [{ "modelo", "entrada", "saida" }]
    "precos" JSONB NOT NULL DEFAULT '[{"modelo":"claude-haiku-5-5","entrada":0.10,"saida":0.50}]',
    -- Dólar em reais para o painel de uso
    "cotacao_dolar" DECIMAL(10,4) NOT NULL DEFAULT 5.5,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assistente_config_pkey" PRIMARY KEY ("id")
);

-- 2) Cada chamada (ou chamada evitada pelo limite) ao provedor de IA: tokens, custo estimado e resultado.
-- assinante_id null = teste da central. situacao: ok | erro | limite (limite = não chamou, a empresa passou do mês).
CREATE TABLE "uso_ia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assinante_id" UUID,
    "recurso" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_saida" INTEGER NOT NULL DEFAULT 0,
    "custo_estimado_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "situacao" TEXT NOT NULL DEFAULT 'ok',
    "erro" TEXT,
    "latencia_ms" INTEGER,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uso_ia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "uso_ia_assinante_id_criado_em_idx" ON "uso_ia"("assinante_id", "criado_em");
CREATE INDEX "uso_ia_criado_em_idx" ON "uso_ia"("criado_em");

-- 3) WhatsApp da empresa: usar o Assistente para entender respostas fora do padrão (vale quando a central está ligada).
ALTER TABLE "whatsapp_config" ADD COLUMN "assistente_respostas" BOOLEAN NOT NULL DEFAULT true;

-- 4) Na linha do orçamento enviado: o que o Assistente entendeu da resposta (resposta_via = 'assistente', ou
-- 'assistente_pendente' enquanto lê): aprova | quer_modificacoes | pergunta | outro, a confiança (0 a 1) e o resumo.
ALTER TABLE "mensagens_whatsapp"
  ADD COLUMN "resposta_intencao" TEXT,
  ADD COLUMN "resposta_confianca" DOUBLE PRECISION,
  ADD COLUMN "resposta_resumo" TEXT;
