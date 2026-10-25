-- Plano único: GrafyGo, R$ 99/mês ou R$ 990/ano (2 meses grátis), tudo incluído e usuários ilimitados.
-- Só a plataforma tem planos: nos schemas das empresas a tabela fica vazia e nada aqui muda (o INSERT exige planos já existentes;
-- numa plataforma nova, sem planos, o semearPlanos cria só o GrafyGo).

-- 1) O plano novo (prazos de teste e de atraso copiados dos planos atuais, que podem ter sido ajustados no painel)
INSERT INTO "planos" ("codigo", "nome", "descricao", "valor_mensal", "valor_anual", "modulos", "limite_usuarios", "dias_teste", "dias_ate_somente_leitura", "dias_ate_bloqueio", "publico", "ativo", "ordem", "updated_at")
SELECT 'grafygo', 'GrafyGo', 'Tudo incluído: orçamentos, pedidos, arte, produção, estoque, financeiro, WhatsApp automático e vitrine online.',
  99.00, 990.00,
  ARRAY['orcamentos','pedidos','artes','producao','pcp','clientes','fornecedores','produtos','estoque','financeiro','caixa','relatorios','whatsapp','vitrine'],
  NULL, p."dias_teste", p."dias_ate_somente_leitura", p."dias_ate_bloqueio", true, true, 0, CURRENT_TIMESTAMP
FROM (SELECT * FROM "planos" ORDER BY "ordem", "created_at" LIMIT 1) p
ON CONFLICT ("codigo") DO UPDATE SET
  "nome" = EXCLUDED."nome", "descricao" = EXCLUDED."descricao", "valor_mensal" = EXCLUDED."valor_mensal", "valor_anual" = EXCLUDED."valor_anual",
  "modulos" = EXCLUDED."modulos", "limite_usuarios" = NULL, "publico" = true, "ativo" = true, "ordem" = 0, "updated_at" = CURRENT_TIMESTAMP;

-- 2) Os planos antigos saem da venda, mas continuam valendo para quem já paga por eles (o preço de cada um não muda).
--    Quem está neles ganha tudo o que o plano único tem: todos os módulos (inclusive WhatsApp e vitrine) e usuários ilimitados.
UPDATE "planos" SET "publico" = false, "limite_usuarios" = NULL, "updated_at" = CURRENT_TIMESTAMP,
  "modulos" = ARRAY['orcamentos','pedidos','artes','producao','pcp','clientes','fornecedores','produtos','estoque','financeiro','caixa','relatorios','whatsapp','vitrine']
  WHERE "codigo" <> 'grafygo';

-- 3) Quem não tem cobrança combinada (teste grátis ou cortesia, sem assinatura no Asaas) passa para o GrafyGo:
--    ao assinar, já vê o plano único. Assinaturas pagas ficam no plano e no preço atuais.
INSERT INTO "eventos_assinatura" ("assinante_id", "tipo", "descricao", "autor")
SELECT a."assinante_id", 'plano', 'Plano único: a assinatura passou do ' || p."nome" || ' para o GrafyGo (tudo incluído)', 'sistema'
FROM "assinaturas" a JOIN "planos" p ON p."id" = a."plano_id"
WHERE p."codigo" <> 'grafygo' AND a."situacao" IN ('teste', 'cortesia') AND a."gateway_assinatura_id" IS NULL AND a."gateway_autorizacao_id" IS NULL;

UPDATE "assinaturas" SET "plano_id" = (SELECT "id" FROM "planos" WHERE "codigo" = 'grafygo'), "plano_agendado_id" = NULL, "plano_agendado_em" = NULL, "updated_at" = CURRENT_TIMESTAMP
WHERE "situacao" IN ('teste', 'cortesia') AND "gateway_assinatura_id" IS NULL AND "gateway_autorizacao_id" IS NULL
  AND "plano_id" IN (SELECT "id" FROM "planos" WHERE "codigo" <> 'grafygo');

-- 4) Cupons limitados a planos antigos passam a valer também no GrafyGo (senão um cupom de divulgação deixaria de funcionar)
UPDATE "cupons" SET "planos" = array_append("planos", 'grafygo'), "updated_at" = CURRENT_TIMESTAMP
WHERE cardinality("planos") > 0 AND NOT ('grafygo' = ANY("planos"));
