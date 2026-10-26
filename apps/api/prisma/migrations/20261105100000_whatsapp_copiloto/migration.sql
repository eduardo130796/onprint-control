-- Copiloto pelo WhatsApp: a conversa fica no WhatsApp e o sistema trabalha nos bastidores. O dono reage com 📝 numa
-- mensagem do cliente e o Assistente salva um orçamento rascunho; a conversa "Você" (mensagem para mim mesmo) vira o
-- canal do Assistente (avisos, "ok" para enviar, perguntas rápidas, foto da nota).
-- Como todas as migrations, roda em todos os schemas. Só colunas novas (com padrão) e tabelas novas: nenhuma linha
-- existente é alterada.

-- 1) Interruptor "Assistente no WhatsApp (📝 e conversa Você)": desligado em todas as empresas até a gráfica ligar
ALTER TABLE "whatsapp_config" ADD COLUMN "assistente_whatsapp" BOOLEAN NOT NULL DEFAULT false;

-- 2) Mensagem do cliente que já virou orçamento pelo 📝: nunca entra de novo em outro orçamento
ALTER TABLE "conversa_mensagens_whatsapp" ADD COLUMN "usada_em" TIMESTAMPTZ(3);

-- 3) Orçamentos criados pelo WhatsApp (selo "do WhatsApp", faixa no editor, "ok" no canal Você). origem: reacao | voce.
-- gatilho_id: key.id da reação ou da mensagem do dono (o mesmo aviso do webhook duas vezes não cria outro orçamento).
-- descartado_em: "cancela" no Você (sai da lista do canal; o orçamento continua no sistema).
CREATE TABLE "orcamentos_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orcamento_id" UUID NOT NULL,
    "origem" TEXT NOT NULL,
    "gatilho_id" TEXT NOT NULL,
    "mensagem_id" TEXT,
    "numero" TEXT,
    "contato" TEXT,
    "conferir" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avisado_em" TIMESTAMPTZ(3),
    "descartado_em" TIMESTAMPTZ(3),
    "enviado_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orcamentos_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orcamentos_whatsapp_orcamento_id_key" ON "orcamentos_whatsapp"("orcamento_id");
CREATE UNIQUE INDEX "orcamentos_whatsapp_gatilho_id_key" ON "orcamentos_whatsapp"("gatilho_id");
CREATE INDEX "orcamentos_whatsapp_mensagem_id_idx" ON "orcamentos_whatsapp"("mensagem_id");
CREATE INDEX "orcamentos_whatsapp_created_at_idx" ON "orcamentos_whatsapp"("created_at");
ALTER TABLE "orcamentos_whatsapp" ADD CONSTRAINT "orcamentos_whatsapp_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Mensagens do canal "Você". enviada: aviso do Assistente (o eco que volta pelo webhook é ignorado; o "ok" citando
-- o aviso acha o orçamento por aqui). recebida: mensagem do dono (o mesmo aviso do webhook não é tratado duas vezes).
-- tipo (enviadas): aviso | confirmar | pergunta | resposta. opcoes: a pergunta "Qual envio?" (orçamentos na ordem).
CREATE TABLE "mensagens_voce_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_externo" TEXT NOT NULL,
    "direcao" TEXT NOT NULL,
    "tipo" TEXT,
    "texto" TEXT,
    "orcamento_id" UUID,
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolvida_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_voce_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mensagens_voce_whatsapp_id_externo_key" ON "mensagens_voce_whatsapp"("id_externo");
CREATE INDEX "mensagens_voce_whatsapp_direcao_created_at_idx" ON "mensagens_voce_whatsapp"("direcao", "created_at");

-- 5) Nota de compra mandada no "Você" (foto, PDF ou XML): a leitura fica guardada para a "Nova entrada" abrir
-- preenchida. Nada entra no estoque sem a pessoa tocar em "Registrar entrada".
CREATE TABLE "notas_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leitura" JSONB NOT NULL,
    "arquivo" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_whatsapp_pkey" PRIMARY KEY ("id")
);
