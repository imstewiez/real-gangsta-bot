-- Migration 25: saidas_em_liquidacao_state
-- Auto-extracted from dbMigrate.js

ALTER TABLE operations DROP CONSTRAINT IF EXISTS operations_status_check;
      ALTER TABLE operations ADD CONSTRAINT operations_status_check
        CHECK (status IN (
          'aberta', 'em_preparacao', 'em_curso', 'em_liquidacao', 'concluida', 'cancelada'
        ));
