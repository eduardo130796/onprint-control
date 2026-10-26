-- Aprovação automática pela resposta do cliente só no caso limpo: o orçamento não mudou desde o envio e o dono não
-- digitou nada na conversa depois do envio. Senão, "aprovação a confirmar" (o dono confirma no "Você" ou no sistema).
-- Como todas as migrations, roda em todos os schemas. Só colunas novas (sem padrão que mude o que existe) e uma tabela
-- nova: nenhuma linha existente é alterada.

-- 1) A versão do orçamento que o cliente viu (resumo dos itens, valores e pagamento) e o total, gravados no envio.
--    Envios de antes desta versão ficam sem: a regra usa a data da última alteração do orçamento.
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "versao_enviada" TEXT;
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "total_enviado" DECIMAL(12,2);
-- 2) Resposta de aprovação que não aprovou sozinha: o motivo (conversa depois do envio, orçamento mudou) para a faixa
--    do orçamento; null = nada a confirmar
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "aprovacao_pendente" TEXT;
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "aprovacao_pendente_em" TIMESTAMPTZ(3);

-- 3) Mensagens que o dono digitou à mão nas conversas com clientes (o que o sistema mandou fica de fora). Só o texto
--    curto, o número e a hora; apagadas depois de 30 dias. Servem para saber se "vocês conversaram depois do envio".
CREATE TABLE "mensagens_dono_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_externo" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "enviada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_dono_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mensagens_dono_whatsapp_id_externo_key" ON "mensagens_dono_whatsapp"("id_externo");
CREATE INDEX "mensagens_dono_whatsapp_numero_enviada_em_idx" ON "mensagens_dono_whatsapp"("numero", "enviada_em");
