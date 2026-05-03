-- Migração 061: Correção de categorias, preços e items indesejados no preçário
-- Issues resolvidas:
--   1. Taser a 5.000€ (estava 70.000€)
--   2. Carregadores específicos de arma estavam em 'acessorios' → mover para 'municoes'
--   3. Desactivar 'Lançador da Âncora' (não é vendido pela firma)
--   4. Colete Padrão equipamento (garantir categoria correcta)

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1) TASER → 5.000€
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE items
SET estimated_value = 5000,
    updated_at = NOW()
WHERE name = 'Taser';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2) CARREGADORES específicos de arma → categoria 'municoes'
--    (estavam em 'acessorios' no seeder antigo)
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE items
SET category = 'municoes',
    updated_at = NOW()
WHERE name IN (
  'Micro Carregador',
  'TEC-9 Carregador',
  'TecPistol Carregador',
  'HeavyPistol Carregador',
  'APPistol Carregador',
  'Pistol50 Carregador',
  'AssaultSMG Carregador',
  'AssaultRifle Carregador',
  'PDW Carregador',
  'Bullpup Carregador',
  'CompactRifle Carregador',
  'SpecialCarbine Carregador',
  'Tactical Carregador',
  'BattleRifle Carregador',
  'MilitaryRifle Carregador'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3) Desactivar 'Lançador da Âncora' (não é vendido pela firma)
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE items
SET active = false,
    orderable = false,
    updated_at = NOW()
WHERE name = 'Lançador da Âncora';

-- ══════════════════════════════════════════════════════════════════════════════
-- 4) Garantir que 'Colete Padrão' está em 'equipamento'
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE items
SET category = 'equipamento',
    updated_at = NOW()
WHERE name = 'Colete Padrão';

COMMIT;
