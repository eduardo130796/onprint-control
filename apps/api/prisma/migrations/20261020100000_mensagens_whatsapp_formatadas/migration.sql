-- Mensagens ao cliente no padrão do WhatsApp (saudação, blocos, *negrito*, um link sozinho na última linha)
-- e envios feitos pela equipe ("Enviar pelo WhatsApp": orçamento, arte, catálogo...) registrados com os avisos.

-- Envio da equipe pode ir para outro contato (sem cliente), ligado a um orçamento, com o PDF junto
ALTER TABLE "mensagens_whatsapp" ALTER COLUMN "cliente_id" DROP NOT NULL;
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "orcamento_id" UUID;
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "usuario_id" UUID;
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "anexo_nome" TEXT;
-- Aviso que saiu dentro da mensagem de outro aviso do mesmo pedido (agrupamento)
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "agrupada_com_id" UUID;

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_orcamento_id_idx" ON "mensagens_whatsapp"("orcamento_id");

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Templates ainda com o texto padrão antigo (não editados) passam para o novo padrão; os editados ficam como estão.
-- Novos textos = TEXTOS_PADRAO_MENSAGEM (@onprint/shared/whatsapp).
UPDATE "mensagem_templates" t
SET "conteudo" = v.novo, "updated_at" = now()
FROM (VALUES
  ('orcamento_enviado',
   E'Olá, {{cliente_nome}}! Segue o orçamento {{numero_orcamento}} no valor de {{valor_total}}.\nPara ver os detalhes e aprovar, acesse: {{link_aprovacao}}\nQualquer dúvida, estamos à disposição!',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\n— {{empresa_nome}}\n\nVeja os detalhes e aprove aqui:\n{{link_aprovacao}}'),
  ('pedido_confirmado',
   E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} foi confirmado. Previsão de entrega: {{data_entrega}}.\nAcompanhe o andamento por aqui: {{link_acompanhamento}}\n{{empresa_nome}}',
   E'Olá, {{cliente_nome}}!\n\nRecebemos a aprovação do orçamento *{{numero_orcamento}}*.\nSeu pedido *{{numero_pedido}}* está confirmado ✅\n\n{{proximo_passo}}\nPrevisão de entrega: *{{data_entrega}}*\n\n— {{empresa_nome}}\n\nAcompanhe o pedido aqui:\n{{link_acompanhamento}}'),
  ('arte_aprovacao',
   E'Olá, {{cliente_nome}}! A arte do seu pedido está pronta para aprovação.\nConfira e aprove pelo link: {{link_aprovacao}}',
   E'Olá, {{cliente_nome}}!\n\nA arte do pedido *{{numero_pedido}}* está pronta para a sua aprovação 🎨\nItem: {{descricao_item}}\nSe precisar de algum ajuste, é só pedir pelo mesmo link.\n\n— {{empresa_nome}}\n\nVeja e aprove a arte aqui:\n{{link_aprovacao}}'),
  ('pedido_pronto',
   E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} está pronto. Previsão de entrega/retirada: {{data_entrega}}.\nDetalhes e andamento: {{link_acompanhamento}}',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* está *pronto* 📦\n{{forma_entrega}}\nValor em aberto: *{{valor_em_aberto}}*\n\n— {{empresa_nome}}\n\nDetalhes do pedido:\n{{link_acompanhamento}}'),
  -- Texto ainda mais antigo (antes da migration 20261019110000_whatsapp_avisos)
  ('pedido_pronto',
   E'Olá, {{cliente_nome}}! Seu pedido está pronto. Previsão de entrega/retirada: {{data_entrega}}.',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* está *pronto* 📦\n{{forma_entrega}}\nValor em aberto: *{{valor_em_aberto}}*\n\n— {{empresa_nome}}\n\nDetalhes do pedido:\n{{link_acompanhamento}}'),
  ('pedido_acompanhamento',
   E'Olá, {{cliente_nome}}! Acompanhe o andamento do seu pedido {{numero_pedido}} por este link: {{link_acompanhamento}}\nPrevisão de entrega: {{data_entrega}}.',
   E'Olá, {{cliente_nome}}!\n\nVocê pode acompanhar o andamento do pedido *{{numero_pedido}}* pelo link abaixo.\nPrevisão de entrega: *{{data_entrega}}*\n\n— {{empresa_nome}}\n\nAcompanhe aqui:\n{{link_acompanhamento}}'),
  ('pedido_em_entrega',
   E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} saiu para entrega.\nAcompanhe: {{link_acompanhamento}}\n{{empresa_nome}}',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* *saiu para entrega* 🚚\nLogo chega até você.\n\n— {{empresa_nome}}\n\nAcompanhe a entrega aqui:\n{{link_acompanhamento}}'),
  ('pedido_entregue',
   E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} foi entregue. Obrigado pela preferência!\n{{empresa_nome}}',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* foi *entregue* ✅\nObrigado pela preferência! Qualquer coisa, é só responder esta mensagem.\n\n— {{empresa_nome}}'),
  ('pagamento_recebido',
   E'Olá, {{cliente_nome}}! Recebemos o seu pagamento de {{valor_pago}} do pedido {{numero_pedido}}. Obrigado!\n{{empresa_nome}}',
   E'Olá, {{cliente_nome}}!\n\nRecebemos o seu pagamento de *{{valor_pago}}* do pedido *{{numero_pedido}}* ✅\nValor em aberto: *{{valor_em_aberto}}*\nObrigado!\n\n— {{empresa_nome}}'),
  ('cobranca',
   E'Olá, {{cliente_nome}}! Lembramos que há um valor em aberto de {{valor_total}}. Se já efetuou o pagamento, por favor desconsidere.',
   E'Olá, {{cliente_nome}}!\n\nLembramos que há um valor em aberto de *{{valor_total}}*.\nSe você já fez o pagamento, por favor desconsidere esta mensagem.\n\n— {{empresa_nome}}'),
  ('boas_vindas',
   E'Olá, {{cliente_nome}}! Obrigado pelo contato. Em que podemos ajudar?',
   E'Olá, {{cliente_nome}}!\n\nObrigado pelo contato. Em que podemos ajudar?\n\n— {{empresa_nome}}')
) AS v(categoria, antigo, novo)
WHERE t."categoria" = v.categoria
  AND t."conteudo" = v.antigo;
