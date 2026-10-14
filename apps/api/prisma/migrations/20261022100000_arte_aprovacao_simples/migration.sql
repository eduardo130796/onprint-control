-- Aprovação da arte mais simples: uma mensagem por pedido com as artes anexadas (imagem ou PDF) e um link só
-- (página do pedido, seção das artes) para aprovar todas.

-- Arquivos das artes que vão logo depois do texto: [{ arquivoId, nome, mime, tamanho, legenda }]
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "anexos" JSONB;

-- Template "Arte para aprovação" ainda com o texto padrão (não editado) passa para o novo; os editados ficam como estão.
-- Novo texto = TEXTOS_PADRAO_MENSAGEM.arte_aprovacao (@onprint/shared/whatsapp).
UPDATE "mensagem_templates" t
SET "conteudo" = v.novo, "updated_at" = now()
FROM (VALUES
  ('arte_aprovacao',
   E'Olá, {{cliente_nome}}!\n\nA arte do pedido *{{numero_pedido}}* está pronta para a sua aprovação 🎨\nItem: {{descricao_item}}\nSe precisar de algum ajuste, é só pedir pelo mesmo link.\n\n— {{empresa_nome}}\n\nVeja e aprove a arte aqui:\n{{link_aprovacao}}',
   E'Olá, {{cliente_nome}}!\n\nSegue a arte do pedido *{{numero_pedido}}* para a sua aprovação 🎨\n{{itens_arte}}\n\nConfira textos, cores e medidas.\nResponda *APROVADO* aqui mesmo ou peça o ajuste que precisar.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}'),
  -- Texto ainda mais antigo (antes da migration 20261020100000_mensagens_whatsapp_formatadas)
  ('arte_aprovacao',
   E'Olá, {{cliente_nome}}! A arte do seu pedido está pronta para aprovação.\nConfira e aprove pelo link: {{link_aprovacao}}',
   E'Olá, {{cliente_nome}}!\n\nSegue a arte do pedido *{{numero_pedido}}* para a sua aprovação 🎨\n{{itens_arte}}\n\nConfira textos, cores e medidas.\nResponda *APROVADO* aqui mesmo ou peça o ajuste que precisar.\n\n— {{empresa_nome}}\n\nSe preferir, veja e aprove pelo link:\n{{link_aprovacao}}')
) AS v(categoria, antigo, novo)
WHERE t."categoria" = v.categoria
  AND t."conteudo" = v.antigo;
