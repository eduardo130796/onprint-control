-- Voto da enquete do WhatsApp na conta com o endereçamento novo (LID): o WhatsApp do cliente cifra o voto com o LID
-- da gráfica (criador da enquete) e o LID dele (quem votou), não com os números. Ver modules/whatsapp/enquete.ts.

-- 1) LID da conta conectada ("…@lid", sem o aparelho), lido das credenciais da instância na Evolution.
ALTER TABLE "whatsapp_config" ADD COLUMN "lid" TEXT;

-- 2) Na linha do orçamento enviado com enquete: a outra identidade do cliente vista no voto (o LID, quando a enquete
-- saiu pelo número) e, se o voto não abriu, o voto cifrado como chegou (encPayload, encIv, jids vistos, chave da
-- enquete) para tentar de novo quando as identidades certas forem conhecidas. Limpo quando o voto abre.
ALTER TABLE "mensagens_whatsapp"
  ADD COLUMN "enquete_jid_alt" TEXT,
  ADD COLUMN "voto_bruto" JSONB;
