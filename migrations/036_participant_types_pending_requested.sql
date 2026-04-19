-- Migration 36: participant_types pending + requested
-- Alarga o CHECK constraint de operation_participants.participant_type para
-- suportar o novo fluxo de saídas:
--
--   'pending'      — user inscreveu-se mas admin ainda não iniciou a sessão
--                    (auto-pick por KDA/MVP/arma/material corre quando admin
--                     clica "Iniciar Sessão" e assigna a cada pending um
--                     role definitivo caracterizado/trabalhador)
--   'requested'    — user pediu para entrar numa sessão já activa, aguarda
--                    aprovação do admin (ao aprovar → trabalhador)
--   'caracterizado', 'trabalhador' — mantêm-se, agora também atribuídos
--                    automaticamente pelo auto-pick

ALTER TABLE operation_participants
  DROP CONSTRAINT IF EXISTS operation_participants_participant_type_check;

ALTER TABLE operation_participants
  ADD CONSTRAINT operation_participants_participant_type_check
  CHECK (participant_type IN ('caracterizado', 'trabalhador', 'pending', 'requested'));
