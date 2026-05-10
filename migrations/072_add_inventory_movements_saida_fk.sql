ALTER TABLE inventory_movements
  ADD CONSTRAINT fk_inventory_movements_saida
  FOREIGN KEY (saida_id) REFERENCES operations(id)
  ON DELETE SET NULL;
