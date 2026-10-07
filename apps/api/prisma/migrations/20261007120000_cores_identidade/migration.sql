-- Nova identidade visual (grafite + verde WhatsApp): recolore só os status do sistema que ainda estão
-- com as cores padrão antigas (petróleo/turquesa). Cores escolhidas pelo usuário não mudam.
UPDATE "status_config" SET "cor" = '#25D366' WHERE "sistema" = true AND upper("cor") = '#14B8A6';
UPDATE "status_config" SET "cor" = '#2B3036' WHERE "sistema" = true AND upper("cor") = '#0B4F5C';
