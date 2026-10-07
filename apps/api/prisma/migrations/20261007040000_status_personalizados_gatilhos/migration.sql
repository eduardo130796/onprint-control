-- Coluna própria do kanban vale só enquanto o registro está na base dela:
-- se o status (ou a etapa) muda por qualquer caminho (automação, ação, kanban), a coluna própria é limpa.
-- Se a mesma atualização já define uma coluna própria nova, ela é mantida.

CREATE OR REPLACE FUNCTION limpar_status_personalizado() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status_personalizado_id IS NOT DISTINCT FROM OLD.status_personalizado_id THEN
    NEW.status_personalizado_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION limpar_etapa_personalizada() RETURNS trigger AS $$
BEGIN
  IF NEW.etapa_atual IS DISTINCT FROM OLD.etapa_atual AND NEW.etapa_personalizada_id IS NOT DISTINCT FROM OLD.etapa_personalizada_id THEN
    NEW.etapa_personalizada_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pedidos_limpar_status_personalizado BEFORE UPDATE ON "pedidos"
  FOR EACH ROW EXECUTE FUNCTION limpar_status_personalizado();

CREATE TRIGGER orcamentos_limpar_status_personalizado BEFORE UPDATE ON "orcamentos"
  FOR EACH ROW EXECUTE FUNCTION limpar_status_personalizado();

CREATE TRIGGER ordens_producao_limpar_etapa_personalizada BEFORE UPDATE ON "ordens_producao"
  FOR EACH ROW EXECUTE FUNCTION limpar_etapa_personalizada();
