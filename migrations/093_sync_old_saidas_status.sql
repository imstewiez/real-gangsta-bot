-- Migration 093: Sync old saidas status from bot to webapp
-- Many old sessions from the bot era show as "open" in the webapp
-- because they have statuses like 'fechada_auto', 'planeada', 'agendada'
-- that the webapp doesn't understand. This migration normalizes them.

BEGIN;

-- 1. Mark very old auto-closed sessions as properly concluded
UPDATE operations
SET status = 'concluida',
    end_time = COALESCE(end_time, start_time, created_at, NOW()),
    updated_at = NOW()
WHERE status = 'fechada_auto'
   OR (status IN ('planeada', 'agendada', 'iniciada', 'em_liquidacao')
       AND COALESCE(start_time, created_at) < NOW() - INTERVAL '7 days');

-- 2. Mark ancient open sessions as cancelled (likely abandoned)
UPDATE operations
SET status = 'cancelada',
    end_time = COALESCE(end_time, created_at, NOW()),
    updated_at = NOW()
WHERE status IN ('criada', 'trancagem', 'em_preparacao')
  AND created_at < NOW() - INTERVAL '30 days';

-- 3. Fix any remaining 'fechada' / 'finalizada' legacy statuses
UPDATE operations
SET status = 'concluida',
    updated_at = NOW()
WHERE status IN ('fechada', 'finalizada');

COMMIT;
