-- inventory_movements item_id
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_item_id_fkey;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT;

-- inventory_movements member_id
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_member_id_fkey;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;

-- operations leader_id
ALTER TABLE operations DROP CONSTRAINT IF EXISTS operations_leader_id_fkey;
ALTER TABLE operations ADD CONSTRAINT operations_leader_id_fkey
  FOREIGN KEY (leader_id) REFERENCES members(id) ON DELETE SET NULL;

-- operation_materials item_id
ALTER TABLE operation_materials DROP CONSTRAINT IF EXISTS operation_materials_item_id_fkey;
ALTER TABLE operation_materials ADD CONSTRAINT operation_materials_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT;

-- operation_materials member_id
ALTER TABLE operation_materials DROP CONSTRAINT IF EXISTS operation_materials_member_id_fkey;
ALTER TABLE operation_materials ADD CONSTRAINT operation_materials_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

-- weekly_rankings member_id
ALTER TABLE weekly_rankings DROP CONSTRAINT IF EXISTS weekly_rankings_member_id_fkey;
ALTER TABLE weekly_rankings ADD CONSTRAINT weekly_rankings_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
