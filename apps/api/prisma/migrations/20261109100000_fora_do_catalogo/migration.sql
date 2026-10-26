-- Item que o cliente pediu e não está no catálogo (📝 no WhatsApp): nunca some calado. Fica no rascunho para o aviso
-- mostrar no topo ("⚠️ Ficou de fora…"), o "ok" pedir confirmação e o dono incluir pelo preço ou dizer "não tem".
-- Como todas as migrations, roda em todos os schemas. Só coluna nova (nula) e tabela nova: nenhuma linha existente é
-- alterada.

-- 1) Os itens de fora do rascunho: [{ chave, descricao, quantidade, situacao: pendente | incluido | recusado, produtoId }]
ALTER TABLE "orcamentos_whatsapp" ADD COLUMN "fora_do_catalogo" JSONB;

-- 2) 📝 em que nada estava no catálogo: a pendência espera o preço ("chaveiro R$ 4 a unidade") para cadastrar o produto
--    e montar o rascunho de uma vez, ou o "não tem". situacao: pendente | criada (orcamento_id) | descartada.
CREATE TABLE "pendencias_catalogo_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gatilho_id" TEXT NOT NULL,
    "mensagem_id" TEXT,
    "conversa_id" UUID,
    "cliente_id" UUID NOT NULL,
    "cliente_novo" BOOLEAN NOT NULL DEFAULT false,
    "contato" TEXT,
    "numero" TEXT,
    "texto" TEXT NOT NULL,
    "leitura" JSONB NOT NULL,
    "mensagens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "situacao" TEXT NOT NULL DEFAULT 'pendente',
    "orcamento_id" UUID,
    "resolvida_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pendencias_catalogo_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pendencias_catalogo_whatsapp_gatilho_id_key" ON "pendencias_catalogo_whatsapp"("gatilho_id");
CREATE INDEX "pendencias_catalogo_whatsapp_mensagem_id_idx" ON "pendencias_catalogo_whatsapp"("mensagem_id");

-- 3) O aviso do "Você" sobre a pendência (a resposta citando acha a pendência por aqui)
ALTER TABLE "mensagens_voce_whatsapp" ADD COLUMN "pendencia_id" UUID;
