-- CreateTable
CREATE TABLE "tokens_senha" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "assinante_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "finalidade" TEXT NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "usado_em" TIMESTAMPTZ(3),
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_senha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_senha_token_hash_key" ON "tokens_senha"("token_hash");

-- CreateIndex
CREATE INDEX "tokens_senha_usuario_id_idx" ON "tokens_senha"("usuario_id");

-- AddForeignKey
ALTER TABLE "tokens_senha" ADD CONSTRAINT "tokens_senha_assinante_id_fkey" FOREIGN KEY ("assinante_id") REFERENCES "assinantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
