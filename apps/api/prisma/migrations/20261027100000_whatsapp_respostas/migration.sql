-- Aprovação do orçamento pela própria conversa do WhatsApp: enquete "✅ Aprovado / ✏️ Quero modificações" logo depois
-- do orçamento e a resposta do cliente (voto ou texto) lida pelo webhook da Evolution API.

-- 1) Enquete enviada com o orçamento (id da mensagem no WhatsApp, chave para abrir o voto e o jid do cliente) e a
-- resposta do cliente (a mais recente): tipo (aprovado | modificacoes | outra), por onde (enquete | texto), o que ele
-- escreveu e o id da mensagem recebida (o mesmo aviso do webhook duas vezes não é aplicado de novo).
ALTER TABLE "mensagens_whatsapp"
  ADD COLUMN "enquete_id" TEXT,
  ADD COLUMN "enquete_segredo" TEXT,
  ADD COLUMN "enquete_jid" TEXT,
  ADD COLUMN "resposta" TEXT,
  ADD COLUMN "resposta_via" TEXT,
  ADD COLUMN "resposta_texto" TEXT,
  ADD COLUMN "resposta_em" TIMESTAMPTZ(3),
  ADD COLUMN "resposta_id_externo" TEXT;

CREATE INDEX "mensagens_whatsapp_enquete_id_idx" ON "mensagens_whatsapp"("enquete_id");
CREATE INDEX "mensagens_whatsapp_id_externo_idx" ON "mensagens_whatsapp"("id_externo");
CREATE INDEX "mensagens_whatsapp_evento_telefone_idx" ON "mensagens_whatsapp"("evento", "telefone");

-- 2) "Aprovar sozinho quando o cliente responder Aprovado" (tela WhatsApp): ligado por padrão.
ALTER TABLE "whatsapp_config" ADD COLUMN "aprovar_pela_resposta" BOOLEAN NOT NULL DEFAULT true;

-- 3) Mensagem do orçamento falando da enquete ("Toque em uma opção logo abaixo ou responda *APROVADO*...").
-- Só troca o template ainda com o texto padrão anterior (não editado); os editados ficam como estão.
-- Antigo = TEXTOS_PADRAO_MENSAGEM antes desta versão; novo = TEXTOS_PADRAO_MENSAGEM (@onprint/shared/whatsapp).
-- Os literais foram gerados a partir dos próprios textos (mesmos bytes: quebras de linha, travessão e acentos).
UPDATE "mensagem_templates" t
SET "conteudo" = v.novo, "updated_at" = now()
FROM (VALUES
  ('orcamento_enviado',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\nPagamento: {{condicoes_pagamento}}\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\nResponda *APROVADO* aqui mesmo ou peça o ajuste que precisar.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\nPagamento: {{condicoes_pagamento}}\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\nToque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}'),
  -- Textos mais antigos (as migrations 20261020100000 e 20261025100000 já os trocam; ficam por segurança)
  ('orcamento_enviado',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\n— {{empresa_nome}}\n\nVeja os detalhes e aprove aqui:\n{{link_aprovacao}}',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\nPagamento: {{condicoes_pagamento}}\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\nToque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}'),
  ('orcamento_enviado',
   E'Olá, {{cliente_nome}}! Segue o orçamento {{numero_orcamento}} no valor de {{valor_total}}.\nPara ver os detalhes e aprovar, acesse: {{link_aprovacao}}\nQualquer dúvida, estamos à disposição!',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\nPagamento: {{condicoes_pagamento}}\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\nToque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}')
) AS v(categoria, antigo, novo)
WHERE t."categoria" = v.categoria
  AND t."conteudo" = v.antigo;
