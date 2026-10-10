-- Domínio próprio da vitrine (docs/VITRINE.md, seção 1.1): www.suagrafica.com.br → CNAME para {slug}.{DOMINIO_VITRINE}
ALTER TABLE "assinantes" ADD COLUMN     "dominio_vitrine" TEXT,
ADD COLUMN     "dominio_vitrine_verificado_em" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "assinantes_dominio_vitrine_key" ON "assinantes"("dominio_vitrine");
