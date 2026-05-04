-- Atualiza preços base das armas Red conforme nova tabela
-- As armas Orange mantêm os preços actuais.

UPDATE items SET estimated_value = 30000, updated_at = NOW() WHERE name = 'Heavy Pistol';
UPDATE items SET estimated_value = 50000, updated_at = NOW() WHERE name = '.50';
UPDATE items SET estimated_value = 60000, updated_at = NOW() WHERE name = 'PDW';
UPDATE items SET estimated_value = 60000, updated_at = NOW() WHERE name = 'P90';
UPDATE items SET estimated_value = 85000, updated_at = NOW() WHERE name = 'Bullpup';
UPDATE items SET estimated_value = 100000, updated_at = NOW() WHERE name = 'Carabina Especial';
UPDATE items SET estimated_value = 130000, updated_at = NOW() WHERE name = 'Revolver';
UPDATE items SET estimated_value = 140000, updated_at = NOW() WHERE name = 'Gadget Pistol';
