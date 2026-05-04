-- Migration 70: Backfill tipo from existing notes
--
-- Parses [TIPO:xxx] prefix from notes and writes to the new tipo column.
-- Idempotent — safe to re-run.

UPDATE inventory_delivery_requests
  SET tipo = COALESCE(
    NULLIF(regexp_replace(notes, '^\[TIPO:(\w+)\].*$', '\1'), notes),
    'entrega'
  )
  WHERE tipo = 'entrega'; -- only touch rows that still have default

-- Clean up the [TIPO:xxx] prefix from notes now that it's in its own column.
UPDATE inventory_delivery_requests
  SET notes = regexp_replace(notes, '^\[TIPO:\w+\]\s?', '')
  WHERE notes ~ '^\[TIPO:\w+\]';
