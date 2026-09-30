-- CreateEnum
CREATE TYPE "tipo_pessoa" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "situacao_cliente" AS ENUM ('pre_cadastro', 'ativo', 'inativo', 'bloqueado');

-- CreateEnum
CREATE TYPE "tipo_endereco" AS ENUM ('principal', 'entrega', 'cobranca');

-- CreateTable
CREATE TABLE "empresa_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "razao_social" TEXT NOT NULL,
    "nome_fantasia" TEXT,
    "cnpj" TEXT,
    "ie" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "site" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "logo_arquivo_id" UUID,
    "validade_orcamento_dias" INTEGER NOT NULL DEFAULT 7,
    "condicoes_padrao" TEXT,
    "sinal_percentual" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "chave_pix" TEXT,
    "area_minima_m2" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "empresa_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entidade" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "cor" VARCHAR(7) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "eh_final" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "status_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "numeracao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entidade" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "numeracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tabela" TEXT NOT NULL,
    "registro_id" TEXT,
    "acao" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "usuario_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entidade" TEXT NOT NULL,
    "entidade_id" UUID,
    "categoria" TEXT NOT NULL,
    "nome_original" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "enviado_por" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "arquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "link" TEXT,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagem_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "mensagem_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo_pessoa" "tipo_pessoa" NOT NULL DEFAULT 'PF',
    "nome" TEXT NOT NULL,
    "fantasia" TEXT,
    "cpf_cnpj" TEXT,
    "ie" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "origem" TEXT,
    "situacao" "situacao_cliente" NOT NULL DEFAULT 'pre_cadastro',
    "limite_credito" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vendedor_id" UUID,
    "observacoes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_enderecos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "tipo" "tipo_endereco" NOT NULL DEFAULT 'principal',
    "cep" TEXT,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "referencia" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "cliente_enderecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_contatos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "cliente_contatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo_pessoa" "tipo_pessoa" NOT NULL DEFAULT 'PJ',
    "nome" TEXT NOT NULL,
    "fantasia" TEXT,
    "cpf_cnpj" TEXT,
    "ie" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "contato" TEXT,
    "categoria_fornecimento" TEXT,
    "prazo_medio_dias" INTEGER,
    "condicoes_pagamento" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "status_config_entidade_codigo_key" ON "status_config"("entidade", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "numeracao_entidade_ano_key" ON "numeracao"("entidade", "ano");

-- CreateIndex
CREATE INDEX "auditoria_tabela_registro_id_idx" ON "auditoria"("tabela", "registro_id");

-- CreateIndex
CREATE INDEX "auditoria_usuario_id_idx" ON "auditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "auditoria_created_at_idx" ON "auditoria"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "arquivos_caminho_key" ON "arquivos"("caminho");

-- CreateIndex
CREATE INDEX "arquivos_entidade_entidade_id_idx" ON "arquivos"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "notificacoes_usuario_id_lida_idx" ON "notificacoes"("usuario_id", "lida");

-- CreateIndex
CREATE INDEX "mensagem_templates_categoria_idx" ON "mensagem_templates"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_cpf_cnpj_key" ON "clientes"("cpf_cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_whatsapp_key" ON "clientes"("whatsapp");

-- CreateIndex
CREATE INDEX "clientes_situacao_idx" ON "clientes"("situacao");

-- CreateIndex
CREATE INDEX "clientes_vendedor_id_idx" ON "clientes"("vendedor_id");

-- CreateIndex
CREATE INDEX "clientes_nome_idx" ON "clientes"("nome");

-- CreateIndex
CREATE INDEX "cliente_enderecos_cliente_id_idx" ON "cliente_enderecos"("cliente_id");

-- CreateIndex
CREATE INDEX "cliente_contatos_cliente_id_idx" ON "cliente_contatos"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_cpf_cnpj_key" ON "fornecedores"("cpf_cnpj");

-- CreateIndex
CREATE INDEX "fornecedores_nome_idx" ON "fornecedores"("nome");

-- AddForeignKey
ALTER TABLE "empresa_config" ADD CONSTRAINT "empresa_config_logo_arquivo_id_fkey" FOREIGN KEY ("logo_arquivo_id") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_enderecos" ADD CONSTRAINT "cliente_enderecos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_contatos" ADD CONSTRAINT "cliente_contatos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
