-- V12: entregas e vendas já não têm approver específico — qualquer OG+ pode aprovar.
-- Remove a constraint NOT NULL para permitir NULL quando não há approver designado.

ALTER TABLE inventory_delivery_requests
  ALTER COLUMN approver_discord_id DROP NOT NULL;
