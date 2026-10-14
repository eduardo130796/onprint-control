-- Arte opcional por item: produto e item do pedido dizem se o pedido espera a arte antes de produzir.
-- Existentes ficam como antes (precisam de arte); a gráfica desmarca no cadastro do produto ou no item do pedido.
ALTER TABLE "produtos" ADD COLUMN "precisa_arte" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "pedido_itens" ADD COLUMN "precisa_arte" BOOLEAN NOT NULL DEFAULT true;
