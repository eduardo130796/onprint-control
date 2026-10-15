-- Mensagens do pedido com tudo no corpo (itens, total, pagamento, próxima parcela, retirada/entrega e Pix): o cliente
-- não precisa abrir o link. O "pedido confirmado" deixa de falar da arte (a arte só vai ao cliente quando a gráfica escolhe).

-- Templates ainda com o texto padrão anterior (não editados) passam para o novo; os editados ficam como estão
-- (continuam funcionando: {{proximo_passo}}, {{forma_entrega}} e {{valor_em_aberto}} seguem preenchidos).
-- Antigo = TEXTOS_PADRAO_MENSAGEM antes desta versão; novo = TEXTOS_PADRAO_MENSAGEM (@onprint/shared/whatsapp).
-- Os literais foram gerados a partir dos próprios textos (mesmos bytes: quebras de linha, travessão e emojis).
UPDATE "mensagem_templates" t
SET "conteudo" = v.novo, "updated_at" = now()
FROM (VALUES
  ('pedido_confirmado',
   E'Olá, {{cliente_nome}}!\n\nRecebemos a aprovação do orçamento *{{numero_orcamento}}*.\nSeu pedido *{{numero_pedido}}* está confirmado ✅\n\n{{proximo_passo}}\nPrevisão de entrega: *{{data_entrega}}*\n\n— {{empresa_nome}}\n\nAcompanhe o pedido aqui:\n{{link_acompanhamento}}',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* está confirmado ✅\n{{itens_pedido}}\n\nTotal: *{{valor_total}}*\n{{resumo_pagamento}}\n{{proximo_vencimento}}\nPrevisão de entrega: *{{data_entrega}}*\n{{local_entrega}}\n\nAvisamos por aqui quando estiver pronto.\n\n— {{empresa_nome}}\n\nAcompanhe o pedido aqui:\n{{link_acompanhamento}}'),
  ('pedido_pronto',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* está *pronto* 📦\n{{forma_entrega}}\nValor em aberto: *{{valor_em_aberto}}*\n\n— {{empresa_nome}}\n\nDetalhes do pedido:\n{{link_acompanhamento}}',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* está *pronto* 📦\n{{itens_pedido}}\n\n{{local_entrega}}\n{{resumo_pagamento}}\n{{pix_pagamento}}\n\n— {{empresa_nome}}\n\nDetalhes do pedido:\n{{link_acompanhamento}}'),
  ('pedido_acompanhamento',
   E'Olá, {{cliente_nome}}!\n\nVocê pode acompanhar o andamento do pedido *{{numero_pedido}}* pelo link abaixo.\nPrevisão de entrega: *{{data_entrega}}*\n\n— {{empresa_nome}}\n\nAcompanhe aqui:\n{{link_acompanhamento}}',
   E'Olá, {{cliente_nome}}!\n\nVocê pode acompanhar o andamento do pedido *{{numero_pedido}}* pelo link abaixo.\n{{itens_pedido}}\n\nPrevisão de entrega: *{{data_entrega}}*\n{{resumo_pagamento}}\n\n— {{empresa_nome}}\n\nAcompanhe aqui:\n{{link_acompanhamento}}'),
  ('pedido_em_entrega',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* *saiu para entrega* 🚚\nLogo chega até você.\n\n— {{empresa_nome}}\n\nAcompanhe a entrega aqui:\n{{link_acompanhamento}}',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* *saiu para entrega* 🚚\n{{local_entrega}}\n{{resumo_pagamento}}\n{{pix_pagamento}}\n\n— {{empresa_nome}}\n\nAcompanhe a entrega aqui:\n{{link_acompanhamento}}'),
  ('pagamento_recebido',
   E'Olá, {{cliente_nome}}!\n\nRecebemos o seu pagamento de *{{valor_pago}}* do pedido *{{numero_pedido}}* ✅\nValor em aberto: *{{valor_em_aberto}}*\nObrigado!\n\n— {{empresa_nome}}',
   E'Olá, {{cliente_nome}}!\n\nRecebemos o seu pagamento de *{{valor_pago}}* do pedido *{{numero_pedido}}* ✅\n{{resumo_pagamento}}\n{{proximo_vencimento}}\n\nObrigado!\n— {{empresa_nome}}'),
  -- Textos ainda mais antigos (antes da migration 20261020100000_mensagens_whatsapp_formatadas, que já os troca;
  -- ficam aqui para um banco que chegue com eles por outro caminho, ex.: backup restaurado)
  ('pedido_confirmado',
   E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} foi confirmado. Previsão de entrega: {{data_entrega}}.\nAcompanhe o andamento por aqui: {{link_acompanhamento}}\n{{empresa_nome}}',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* está confirmado ✅\n{{itens_pedido}}\n\nTotal: *{{valor_total}}*\n{{resumo_pagamento}}\n{{proximo_vencimento}}\nPrevisão de entrega: *{{data_entrega}}*\n{{local_entrega}}\n\nAvisamos por aqui quando estiver pronto.\n\n— {{empresa_nome}}\n\nAcompanhe o pedido aqui:\n{{link_acompanhamento}}'),
  ('pedido_pronto',
   E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} está pronto. Previsão de entrega/retirada: {{data_entrega}}.\nDetalhes e andamento: {{link_acompanhamento}}',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* está *pronto* 📦\n{{itens_pedido}}\n\n{{local_entrega}}\n{{resumo_pagamento}}\n{{pix_pagamento}}\n\n— {{empresa_nome}}\n\nDetalhes do pedido:\n{{link_acompanhamento}}'),
  ('pedido_pronto',
   E'Olá, {{cliente_nome}}! Seu pedido está pronto. Previsão de entrega/retirada: {{data_entrega}}.',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* está *pronto* 📦\n{{itens_pedido}}\n\n{{local_entrega}}\n{{resumo_pagamento}}\n{{pix_pagamento}}\n\n— {{empresa_nome}}\n\nDetalhes do pedido:\n{{link_acompanhamento}}'),
  ('pedido_acompanhamento',
   E'Olá, {{cliente_nome}}! Acompanhe o andamento do seu pedido {{numero_pedido}} por este link: {{link_acompanhamento}}\nPrevisão de entrega: {{data_entrega}}.',
   E'Olá, {{cliente_nome}}!\n\nVocê pode acompanhar o andamento do pedido *{{numero_pedido}}* pelo link abaixo.\n{{itens_pedido}}\n\nPrevisão de entrega: *{{data_entrega}}*\n{{resumo_pagamento}}\n\n— {{empresa_nome}}\n\nAcompanhe aqui:\n{{link_acompanhamento}}'),
  ('pedido_em_entrega',
   E'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} saiu para entrega.\nAcompanhe: {{link_acompanhamento}}\n{{empresa_nome}}',
   E'Olá, {{cliente_nome}}!\n\nSeu pedido *{{numero_pedido}}* *saiu para entrega* 🚚\n{{local_entrega}}\n{{resumo_pagamento}}\n{{pix_pagamento}}\n\n— {{empresa_nome}}\n\nAcompanhe a entrega aqui:\n{{link_acompanhamento}}'),
  ('pagamento_recebido',
   E'Olá, {{cliente_nome}}! Recebemos o seu pagamento de {{valor_pago}} do pedido {{numero_pedido}}. Obrigado!\n{{empresa_nome}}',
   E'Olá, {{cliente_nome}}!\n\nRecebemos o seu pagamento de *{{valor_pago}}* do pedido *{{numero_pedido}}* ✅\n{{resumo_pagamento}}\n{{proximo_vencimento}}\n\nObrigado!\n— {{empresa_nome}}')
) AS v(categoria, antigo, novo)
WHERE t."categoria" = v.categoria
  AND t."conteudo" = v.antigo;
