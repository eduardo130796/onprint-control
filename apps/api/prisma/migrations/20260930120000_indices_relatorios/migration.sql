-- Relatórios e dashboard agregam pedidos e orçamentos por data de criação
CREATE INDEX "pedidos_created_at_idx" ON "pedidos"("created_at");

CREATE INDEX "orcamentos_created_at_idx" ON "orcamentos"("created_at");
