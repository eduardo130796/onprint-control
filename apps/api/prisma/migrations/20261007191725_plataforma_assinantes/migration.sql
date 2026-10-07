-- CreateTable
CREATE TABLE "assinantes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "schema" TEXT NOT NULL,
    "email" TEXT,
    "cnpj" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assinantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indice_login" (
    "email" TEXT NOT NULL,
    "assinante_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indice_login_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "assinantes_slug_key" ON "assinantes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "assinantes_schema_key" ON "assinantes"("schema");

-- CreateIndex
CREATE INDEX "indice_login_assinante_id_idx" ON "indice_login"("assinante_id");

-- AddForeignKey
ALTER TABLE "indice_login" ADD CONSTRAINT "indice_login_assinante_id_fkey" FOREIGN KEY ("assinante_id") REFERENCES "assinantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
