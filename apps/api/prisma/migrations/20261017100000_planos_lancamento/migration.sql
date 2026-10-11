-- Lançamento comercial: pagamento anual (2 meses grátis) e os planos de lançamento (preço para volume).
ALTER TABLE "planos" ADD COLUMN     "valor_anual" DECIMAL(10,2);
ALTER TABLE "assinaturas" ADD COLUMN     "ciclo" TEXT NOT NULL DEFAULT 'mensal';

-- Só a plataforma tem planos (nos schemas das empresas a tabela fica vazia e nada muda)
UPDATE "planos" SET "nome" = 'Essencial', "descricao" = 'Para começar organizado: orçamentos, pedidos, aprovação de arte, financeiro e caixa.',
  "valor_mensal" = 69.00, "valor_anual" = 690.00, "limite_usuarios" = 3, "ordem" = 1,
  "modulos" = ARRAY['orcamentos','pedidos','artes','clientes','fornecedores','produtos','financeiro','caixa']
  WHERE "codigo" = 'essencial';
UPDATE "planos" SET "nome" = 'Profissional', "descricao" = 'Tudo do Essencial + produção, PCP, estoque e relatórios.',
  "valor_mensal" = 129.00, "valor_anual" = 1290.00, "limite_usuarios" = 8, "ordem" = 2,
  "modulos" = ARRAY['orcamentos','pedidos','artes','clientes','fornecedores','produtos','financeiro','caixa','producao','pcp','estoque','relatorios']
  WHERE "codigo" = 'profissional';
UPDATE "planos" SET "nome" = 'Completo', "descricao" = 'Tudo do Profissional + Vitrine online e usuários ilimitados.',
  "valor_mensal" = 199.00, "valor_anual" = 1990.00, "limite_usuarios" = NULL, "ordem" = 3,
  "modulos" = ARRAY['orcamentos','pedidos','artes','clientes','fornecedores','produtos','financeiro','caixa','producao','pcp','estoque','relatorios','vitrine','whatsapp']
  WHERE "codigo" = 'completo';
