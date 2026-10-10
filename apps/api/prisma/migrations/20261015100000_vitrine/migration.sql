-- Vitrine online (docs/VITRINE.md): configuração do site, produto na vitrine, galeria de imagens,
-- itens e e-mail da solicitação, e as permissões do módulo "vitrine".

-- Produto na vitrine
ALTER TABLE "produtos" ADD COLUMN     "vitrine_descricao" TEXT,
ADD COLUMN     "vitrine_destaque" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vitrine_modo_preco" TEXT NOT NULL DEFAULT 'sob_consulta',
ADD COLUMN     "vitrine_nome" TEXT,
ADD COLUMN     "vitrine_ordem" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vitrine_publicado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vitrine_slug" TEXT;

CREATE UNIQUE INDEX "produtos_vitrine_slug_key" ON "produtos"("vitrine_slug");

-- E-mail do contato (pedidos da vitrine)
ALTER TABLE "solicitacoes_orcamento" ADD COLUMN     "email" TEXT;

CREATE INDEX "solicitacoes_orcamento_origem_idx" ON "solicitacoes_orcamento"("origem");

-- Galeria do produto (a primeira é a capa)
CREATE TABLE "produto_imagens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "produto_id" UUID NOT NULL,
    "arquivo_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_imagens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "produto_imagens_arquivo_id_key" ON "produto_imagens"("arquivo_id");
CREATE INDEX "produto_imagens_produto_id_ordem_idx" ON "produto_imagens"("produto_id", "ordem");

ALTER TABLE "produto_imagens" ADD CONSTRAINT "produto_imagens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "produto_imagens" ADD CONSTRAINT "produto_imagens_arquivo_id_fkey" FOREIGN KEY ("arquivo_id") REFERENCES "arquivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A imagem atual de cada produto vira a primeira da galeria
INSERT INTO "produto_imagens" ("produto_id", "arquivo_id", "ordem")
SELECT "id", "imagem_arquivo_id", 0 FROM "produtos" WHERE "imagem_arquivo_id" IS NOT NULL
ON CONFLICT ("arquivo_id") DO NOTHING;

-- Itens da lista de orçamento enviada pela vitrine
CREATE TABLE "solicitacao_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "solicitacao_id" UUID NOT NULL,
    "produto_id" UUID,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "largura" DECIMAL(10,3),
    "altura" DECIMAL(10,3),
    "acabamentos" JSONB NOT NULL DEFAULT '[]',
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacao_itens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitacao_itens_solicitacao_id_idx" ON "solicitacao_itens"("solicitacao_id");
CREATE INDEX "solicitacao_itens_produto_id_idx" ON "solicitacao_itens"("produto_id");

ALTER TABLE "solicitacao_itens" ADD CONSTRAINT "solicitacao_itens_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "solicitacao_itens" ADD CONSTRAINT "solicitacao_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Configuração da vitrine (linha única, criada no primeiro acesso)
CREATE TABLE "vitrine_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "titulo" TEXT,
    "slogan" TEXT,
    "sobre" TEXT,
    "horario" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "tiktok" TEXT,
    "youtube" TEXT,
    "mostrar_endereco" BOOLEAN NOT NULL DEFAULT true,
    "mostrar_telefone" BOOLEAN NOT NULL DEFAULT true,
    "mostrar_whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "mensagem_whatsapp" TEXT,
    "mensagem_pedido_enviado" TEXT,
    "seo_descricao" TEXT,
    "banners" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vitrine_config_pkey" PRIMARY KEY ("id")
);

-- Permissões do módulo (o seed completa a matriz padrão dos demais papéis nas empresas novas)
INSERT INTO "permissoes" ("modulo", "acao", "updated_at")
SELECT 'vitrine', a.acao, CURRENT_TIMESTAMP
FROM unnest(ARRAY['visualizar', 'criar', 'editar', 'excluir', 'aprovar', 'exportar', 'ver_todos']) AS a(acao)
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- Administrador recebe tudo
INSERT INTO "papel_permissoes" ("papel_id", "permissao_id")
SELECT p."id", pe."id"
FROM "papeis" p
CROSS JOIN "permissoes" pe
WHERE p."codigo" = 'admin' AND pe."modulo" = 'vitrine'
ON CONFLICT DO NOTHING;
