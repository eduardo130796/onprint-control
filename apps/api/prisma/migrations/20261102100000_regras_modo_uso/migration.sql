-- Regras comerciais: o dono diz QUANDO cada desconto é usado ("às vezes o cliente nem pede"). Como todas as
-- migrations, roda em todos os schemas. Motor em @onprint/shared (regras-comerciais.ts).

-- 1) Modo de uso da regra: 'sempre' (o sistema aplica sozinho) | 'sugerir' (aparece para o vendedor aplicar com um
-- clique) | 'se_pedir' (só na margem de negociação; nunca aplicado sem o vendedor clicar). Só vale para descontos e
-- preço especial; acréscimo, pedido mínimo, aprovação, bloqueio, aviso e limite são sempre 'sempre'.
ALTER TABLE "regras_comerciais" ADD COLUMN "modo_uso" TEXT NOT NULL DEFAULT 'sempre';

-- Regras que já existem: descontos (e preço especial) passam a ser sugeridos ao vendedor; o resto continua sempre.
UPDATE "regras_comerciais"
SET "modo_uso" = 'sugerir'
WHERE "acao"->>'tipo' IN ('desconto', 'preco_especial');

-- 2) No orçamento: as regras sugeridas que o vendedor aplicou (ids das regras). Ficam gravadas e valem a cada
-- recálculo enquanto a regra servir.
ALTER TABLE "orcamentos" ADD COLUMN "regras_aceitas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Orçamentos que já tinham desconto de regra aplicado (regras.aplicadas, gravado no último salvamento): o desconto
-- conta como aceito, para o próximo salvamento não mudar o preço que o cliente já viu.
UPDATE "orcamentos" o
SET "regras_aceitas" = d.ids
FROM (
  SELECT x."id", array_agg(DISTINCT a->>'regraId') AS ids
  FROM "orcamentos" x
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x."regras"->'aplicadas') = 'array' THEN x."regras"->'aplicadas' ELSE '[]'::jsonb END) a
  WHERE a->>'tipo' IN ('desconto', 'preco_especial')
    AND a->>'regraId' IS NOT NULL
    AND (a->>'valor') ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND (a->>'valor')::numeric < 0
  GROUP BY x."id"
) d
WHERE d."id" = o."id";

-- 3) Assistente GrafyGo: "Explique com suas palavras como você dá desconto" (Regras comerciais), ligado como as
-- outras ajudas internas.
ALTER TABLE "empresa_config" ADD COLUMN "assistente_regras" BOOLEAN NOT NULL DEFAULT true;
