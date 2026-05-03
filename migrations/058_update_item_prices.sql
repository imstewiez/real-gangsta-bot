-- Migração 058: Actualização de preços (estimated_value) conforme novo preçário.
-- Preços "Sem material" da tabela do user foram divididos por 1.3 (markup bairrista)
-- para obter o estimated_value base.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- ARMAMENTO — ORANGE
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE items SET estimated_value = 53850, updated_at = NOW() WHERE name = 'Micro SMG';        -- UZI      : 70.000 / 1.3
UPDATE items SET estimated_value = 65385, updated_at = NOW() WHERE name = 'Machine Pistol';   -- TEC 9    : 85.000 / 1.3
UPDATE items SET estimated_value = 84615, updated_at = NOW() WHERE name = 'Pistola Tec';      -- TEC Pistol: 110.000 / 1.3
UPDATE items SET estimated_value = 88460, updated_at = NOW() WHERE name = 'AP Pistola';       -- AP Pistol: 115.000 / 1.3

-- ══════════════════════════════════════════════════════════════════════════════
-- ARMAMENTO — RED
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE items SET estimated_value = 76925,  updated_at = NOW() WHERE name = 'Heavy Pistol';      -- Heavy    : 100.000 / 1.3
UPDATE items SET estimated_value = 184615, updated_at = NOW() WHERE name = 'Pistola .50';       -- .50      : 240.000 / 1.3
UPDATE items SET estimated_value = 184615, updated_at = NOW() WHERE name = 'Combat PDW';        -- PDW/P90  : 240.000 / 1.3
UPDATE items SET estimated_value = 246155, updated_at = NOW() WHERE name = 'Bullpup Rifle';     -- Bullpup  : 320.000 / 1.3
UPDATE items SET estimated_value = 261540, updated_at = NOW() WHERE name = 'Carabina Especial'; -- Carabina : 340.000 / 1.3

-- ══════════════════════════════════════════════════════════════════════════════
-- CARREGADORES
-- ══════════════════════════════════════════════════════════════════════════════
-- Orange (2.500 €)
UPDATE items SET estimated_value = 1925, updated_at = NOW() WHERE name IN ('Micro Carregador', 'TEC-9 Carregador', 'TecPistol Carregador');

-- Red (3.000 €)
UPDATE items SET estimated_value = 2310, updated_at = NOW() WHERE name IN ('APPistol Carregador', 'Pistol50 Carregador', 'AssaultSMG Carregador', 'AssaultRifle Carregador');

-- Especial (3.500 €)
UPDATE items SET estimated_value = 2690, updated_at = NOW() WHERE name IN ('Bullpup Carregador', 'CompactRifle Carregador', 'SpecialCarbine Carregador');

-- ══════════════════════════════════════════════════════════════════════════════
-- COLETES
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE items SET estimated_value = 1385, updated_at = NOW() WHERE name = 'Kevlar';       -- Colete Tático : 1.800 / 1.3
UPDATE items SET estimated_value = 1385, updated_at = NOW() WHERE name = 'Colete Padrão'; -- Colete Padrão : 1.800 / 1.3

-- ══════════════════════════════════════════════════════════════════════════════
-- ACESSÓRIOS
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE items SET estimated_value = 1155, updated_at = NOW() WHERE name = 'Silenciador 1'; -- Silenciador : 1.500 / 1.3
UPDATE items SET estimated_value = 1155, updated_at = NOW() WHERE name = 'Mira 3';       -- Mira        : 1.500 / 1.3
UPDATE items SET estimated_value = 1155, updated_at = NOW() WHERE name = 'Grip 1';       -- Grip        : 1.500 / 1.3
UPDATE items SET estimated_value = 1155, updated_at = NOW() WHERE name = 'Lanterna 1';   -- Lanterna    : 1.500 / 1.3

-- Extensivos / Mag Expandido (3.500 €)
UPDATE items SET estimated_value = 2690, updated_at = NOW() WHERE name IN ('APPistol Extensivo', 'TEC-9 Extensivo', 'SpecialCarbine Extensivo');

-- ══════════════════════════════════════════════════════════════════════════════
-- DROGAS (100u)
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE items SET estimated_value = 23080, updated_at = NOW() WHERE name = 'Saco de Coca';  -- Cabeços 100u  : 30.000 / 1.3
UPDATE items SET estimated_value = 26925, updated_at = NOW() WHERE name = 'Charro';        -- Haxixe 100u   : 35.000 / 1.3
UPDATE items SET estimated_value = 26925, updated_at = NOW() WHERE name = 'Folha de Coca'; -- Folhas Erva 100u: 35.000 / 1.3
UPDATE items SET estimated_value = 23080, updated_at = NOW() WHERE name = 'Coca';          -- Erva 100u     : 30.000 / 1.3
UPDATE items SET estimated_value = 15385, updated_at = NOW() WHERE name = 'Saco de Meth';  -- Meth 100u     : 20.000 / 1.3
UPDATE items SET estimated_value = 30770, updated_at = NOW() WHERE name = 'Ópio';          -- Ópio 100u     : 40.000 / 1.3

-- ══════════════════════════════════════════════════════════════════════════════
-- ARMAS BRANCAS
-- ══════════════════════════════════════════════════════════════════════════════
UPDATE items SET estimated_value = 770, updated_at = NOW() WHERE category = 'armas_brancas';

COMMIT;
