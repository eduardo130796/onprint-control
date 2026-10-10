-- Vitrine nas empresas que já existiam: a mesma matriz padrão das empresas novas
-- (gerente com tudo; vendedor só visualiza). Papéis personalizados não mudam.
INSERT INTO "papel_permissoes" ("papel_id", "permissao_id")
SELECT p."id", pe."id"
FROM "papeis" p
CROSS JOIN "permissoes" pe
WHERE pe."modulo" = 'vitrine'
  AND (p."codigo" = 'gerente' OR (p."codigo" = 'vendedor' AND pe."acao" = 'visualizar'))
ON CONFLICT DO NOTHING;
