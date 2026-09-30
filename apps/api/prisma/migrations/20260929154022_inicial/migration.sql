-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "telefone" TEXT,
    "avatar" TEXT,
    "papel_id" UUID NOT NULL,
    "comissao_percentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "deve_trocar_senha" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_login" TIMESTAMPTZ(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "revogada" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papeis" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "papeis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "modulo" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "descricao" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permissoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papel_permissoes" (
    "papel_id" UUID NOT NULL,
    "permissao_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "papel_permissoes_pkey" PRIMARY KEY ("papel_id","permissao_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_papel_id_idx" ON "usuarios"("papel_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_refresh_token_hash_key" ON "sessoes"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessoes_usuario_id_idx" ON "sessoes"("usuario_id");

-- CreateIndex
CREATE INDEX "sessoes_expira_em_idx" ON "sessoes"("expira_em");

-- CreateIndex
CREATE UNIQUE INDEX "papeis_codigo_key" ON "papeis"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permissoes_modulo_acao_key" ON "permissoes"("modulo", "acao");

-- CreateIndex
CREATE INDEX "papel_permissoes_permissao_id_idx" ON "papel_permissoes"("permissao_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_papel_id_fkey" FOREIGN KEY ("papel_id") REFERENCES "papeis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "papel_permissoes" ADD CONSTRAINT "papel_permissoes_papel_id_fkey" FOREIGN KEY ("papel_id") REFERENCES "papeis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "papel_permissoes" ADD CONSTRAINT "papel_permissoes_permissao_id_fkey" FOREIGN KEY ("permissao_id") REFERENCES "permissoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
