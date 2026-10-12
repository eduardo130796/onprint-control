-- Link da vitrine editável: o slug pode ser trocado e os anteriores continuam abrindo os links antigos
-- (aprovação, vitrine, CNAME do domínio próprio). Uma troca por dia (slug_alterado_em).
ALTER TABLE "assinantes" ADD COLUMN     "slugs_anteriores" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "slug_alterado_em" TIMESTAMPTZ(3);

CREATE INDEX "assinantes_slugs_anteriores_idx" ON "assinantes" USING GIN ("slugs_anteriores");
