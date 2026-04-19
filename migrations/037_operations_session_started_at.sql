-- Migration 37: operations.session_started_at
-- Flag do momento em que o admin clicou "Iniciar Sessão" e o auto-pick
-- correu (ou no-op, se ≤ max_participants). Distingue:
--   NULL  → pré-start, inscrições abertas, ninguém ainda foi categorizado
--   SET   → post-start, admin iniciou, caracts/trabs assignados.
--
-- Antes desta migration a distinção era inferida do tipo dos participants
-- ('pending' = pré-start), mas user queria que os inscritos entrassem
-- directamente como caracterizado (não pending). Sem este flag é impossível
-- distinguir "ainda não iniciou" vs "iniciou e todos coube como caract".
--
-- Também: converte participants.participant_type='pending' → 'caracterizado'
-- (legacy de antes deste commit — novo flow inscreve directo como caract).

ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;

UPDATE operation_participants
   SET participant_type = 'caracterizado'
 WHERE participant_type = 'pending';
