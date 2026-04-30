-- Migration 047: data quality views and helpers
-- Views para detectar problemas de qualidade nos dados

CREATE OR REPLACE VIEW v_members_without_record AS
SELECT m.discord_id, m.display_name, m.role
FROM members m
WHERE m.status = 'ativo'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_movements im WHERE im.member_id = m.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM operation_participants sp WHERE sp.member_id = m.id
  );

CREATE OR REPLACE VIEW v_orphan_channels AS
SELECT channel_id, member_id, discord_id
FROM resident_channels mc
WHERE NOT EXISTS (
  SELECT 1 FROM members m WHERE m.id = mc.member_id AND m.status = 'ativo'
);

CREATE OR REPLACE VIEW v_unfinalized_saidas AS
SELECT s.id, s.status, s.created_at, s.created_by
FROM operations s
WHERE s.status NOT IN ('concluida', 'cancelada')
  AND s.created_at < NOW() - INTERVAL '48 hours';

CREATE OR REPLACE VIEW v_orders_without_price AS
SELECT o.id, o.status, o.created_at
FROM orders o
WHERE o.unit_price IS NULL OR o.total_price IS NULL;

CREATE OR REPLACE VIEW v_delivery_requests_without_member AS
SELECT dr.id, dr.status, dr.created_at
FROM inventory_delivery_requests dr
WHERE NOT EXISTS (
  SELECT 1 FROM members m WHERE m.id = dr.requester_member_id
);

CREATE OR REPLACE VIEW v_stale_sheet_sync AS
SELECT last_synced_at
FROM sheet_sync_state
WHERE last_synced_at < NOW() - INTERVAL '2 hours';
