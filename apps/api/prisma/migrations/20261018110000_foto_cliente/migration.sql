-- Foto/imagem do cliente (avatar nas listas, no painel e nos pedidos). Apagar o arquivo limpa o campo.
ALTER TABLE "clientes" ADD COLUMN     "foto_arquivo_id" UUID;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_foto_arquivo_id_fkey" FOREIGN KEY ("foto_arquivo_id") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
