-- Orçamento aprovado vira pedido automaticamente (Configurações → Empresa → Pedidos),
-- com as condições padrão da empresa: sinal (já existente), parcelas do saldo, intervalo, entrega e prioridade.
ALTER TABLE "empresa_config" ADD COLUMN "converter_ao_aprovar" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "empresa_config" ADD COLUMN "parcelas_padrao" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "empresa_config" ADD COLUMN "intervalo_dias_padrao" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "empresa_config" ADD COLUMN "tipo_entrega_padrao" "tipo_entrega" NOT NULL DEFAULT 'retirada';
ALTER TABLE "empresa_config" ADD COLUMN "prioridade_padrao" "prioridade" NOT NULL DEFAULT 'normal';
