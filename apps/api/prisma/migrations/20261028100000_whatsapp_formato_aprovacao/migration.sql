-- Como o cliente aprova o orçamento enviado pelo WhatsApp (tela WhatsApp, por empresa): tocando na enquete
-- "✅ Aprovado / ✏️ Quero modificações" (padrão, como até aqui) ou respondendo 1 (aprovar) / 2 (pedir mudança).

-- 1) A escolha da empresa: enquete | numeros.
ALTER TABLE "whatsapp_config" ADD COLUMN "formato_aprovacao" TEXT NOT NULL DEFAULT 'enquete';

-- 2) Como saiu cada orçamento: enquete | numeros | texto (sem enquete nem 1/2). O "1"/"2" do cliente só vale para o
-- orçamento que saiu como "numeros". As linhas antigas ficam vazias (nunca contam como 1/2).
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "formato_resposta" TEXT;
