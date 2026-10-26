-- Cadastro de produtos pelo WhatsApp (conversa "Você"): "novo produto: chaveiro acrílico 5x3 cm, R$ 4 a unidade" ou a
-- foto de uma tabela de preços. A leitura do Assistente fica guardada para a revisão do "Cadastrar vários" abrir já
-- preenchida (como as notas em notas_whatsapp). Nada é criado sem a pessoa tocar em "Criar" (ou, num produto só e
-- claro, responder "ok" citando o aviso).
-- situacao: pendente | criada (virou produtos: produtos_ids) | descartada. origem: texto | foto.
-- Como todas as migrations, roda em todos os schemas. Só tabela nova e coluna nova (nula): nenhuma linha existente é
-- alterada.
CREATE TABLE "leituras_produtos_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leitura" JSONB NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'texto',
    "situacao" TEXT NOT NULL DEFAULT 'pendente',
    "produtos_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "resolvida_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leituras_produtos_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leituras_produtos_whatsapp_situacao_created_at_idx" ON "leituras_produtos_whatsapp"("situacao", "created_at");

-- O aviso do "Você" que oferece criar o produto pelo "ok" (o "ok" citando o aviso acha a leitura por aqui)
ALTER TABLE "mensagens_voce_whatsapp" ADD COLUMN "leitura_produto_id" UUID;
