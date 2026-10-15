-- Orçamento: pagamento combinado e arte decidida por item.

-- 1) Pagamento combinado no orçamento (entrada % na aprovação + saldo em N parcelas a cada X dias; 0 = restante na
-- retirada/entrega). Vale para a mensagem, o PDF, a página de aprovação e as contas a receber do pedido.
-- Orçamentos existentes recebem os padrões atuais da empresa (o que a conversão usaria hoje: nada muda para eles).
ALTER TABLE "orcamentos"
  ADD COLUMN "sinal_percentual" DECIMAL(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN "parcelas" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "intervalo_dias" INTEGER NOT NULL DEFAULT 30;

UPDATE "orcamentos"
SET "sinal_percentual" = e."sinal_percentual",
    "parcelas" = LEAST(GREATEST(e."parcelas_padrao", 0), 24),
    "intervalo_dias" = LEAST(GREATEST(e."intervalo_dias_padrao", 1), 120)
FROM (SELECT "sinal_percentual", "parcelas_padrao", "intervalo_dias_padrao" FROM "empresa_config" ORDER BY "created_at" LIMIT 1) e;

-- O texto livre "condições padrão" vira "observações de pagamento" (linha extra opcional). O texto que o sistema
-- gravava ao criar a empresa (nunca editado) dizia "restante na entrega" e contradiria o pagamento combinado: sai.
-- Textos escritos pela gráfica ficam como estão (a tela da empresa avisa para revisar).
UPDATE "empresa_config" SET "condicoes_padrao" = NULL, "updated_at" = now()
WHERE "condicoes_padrao" = '50% de entrada na aprovação e o restante na entrega.';

-- 2) Arte decidida no orçamento, por item (padrão do produto ao escolher; vai para o item do pedido na conversão).
-- Itens existentes: o que o produto diz hoje (o mesmo que a conversão copiaria).
ALTER TABLE "orcamento_itens" ADD COLUMN "precisa_arte" BOOLEAN NOT NULL DEFAULT true;
UPDATE "orcamento_itens" i SET "precisa_arte" = p."precisa_arte" FROM "produtos" p WHERE p."id" = i."produto_id";

-- Produtos novos não pressupõem arte (a gráfica marca os que costumam precisar); os existentes ficam como estão.
ALTER TABLE "produtos" ALTER COLUMN "precisa_arte" SET DEFAULT false;

-- 3) Mensagem do orçamento com o pagamento e a aprovação como na arte ("Responda *APROVADO*..." + link opcional).
-- Só troca o template ainda com o texto padrão anterior (não editado); os editados ficam como estão.
-- Antigo = TEXTOS_PADRAO_MENSAGEM antes desta versão; novo = TEXTOS_PADRAO_MENSAGEM (@onprint/shared/whatsapp).
-- Os literais foram gerados a partir dos próprios textos (mesmos bytes: quebras de linha, travessão e acentos).
UPDATE "mensagem_templates" t
SET "conteudo" = v.novo, "updated_at" = now()
FROM (VALUES
  ('orcamento_enviado',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\n— {{empresa_nome}}\n\nVeja os detalhes e aprove aqui:\n{{link_aprovacao}}',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\nPagamento: {{condicoes_pagamento}}\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\nResponda *APROVADO* aqui mesmo ou peça o ajuste que precisar.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}'),
  -- Texto ainda mais antigo (antes da migration 20261020100000_mensagens_whatsapp_formatadas, que já o troca)
  ('orcamento_enviado',
   E'Olá, {{cliente_nome}}! Segue o orçamento {{numero_orcamento}} no valor de {{valor_total}}.\nPara ver os detalhes e aprovar, acesse: {{link_aprovacao}}\nQualquer dúvida, estamos à disposição!',
   E'Olá, {{cliente_nome}}!\n\nSegue o seu orçamento *{{numero_orcamento}}*:\n{{itens_orcamento}}\n\nTotal: *{{valor_total}}*\nPagamento: {{condicoes_pagamento}}\nPrazo de produção: *{{prazo_producao}}*\nVálido até *{{validade}}*\n\nResponda *APROVADO* aqui mesmo ou peça o ajuste que precisar.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}')
) AS v(categoria, antigo, novo)
WHERE t."categoria" = v.categoria
  AND t."conteudo" = v.antigo;
