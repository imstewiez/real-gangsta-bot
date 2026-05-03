-- Migração 060: Preços completos e crafts conforme tabela do utilizador
BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- Items — INSERT ou UPDATE de estimated_value
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Rádio Estragado', 'reciclagem', 'unidade', 25, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Telemóvel Estragado', 'reciclagem', 'unidade', 25, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Sucata', 'reciclagem', 'unidade', 40, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Lixo Eletrónico', 'reciclagem', 'unidade', 60, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Plástico Velho', 'reciclagem', 'unidade', 20, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Plástico Reciclado', 'reciclagem', 'unidade', 40, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Peças Estragadas', 'reciclagem', 'unidade', 250, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Serradura', 'madeiras', 'unidade', 40, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Tábua Pinho', 'madeiras', 'unidade', 40, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Tábua Carvalho', 'madeiras', 'unidade', 65, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Tábua Cerejeira', 'madeiras', 'unidade', 60, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Tábua Ébano', 'madeiras', 'unidade', 200, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Taninos', 'madeiras', 'unidade', 250, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Borracha', 'componentes', 'unidade', 65, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Tecido', 'componentes', 'unidade', 65, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Pólvora', 'componentes', 'unidade', 100, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Papel', 'componentes', 'unidade', 100, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Couro', 'componentes', 'unidade', 1500, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Kevlar', 'componentes', 'unidade', 600, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Peças', 'componentes', 'unidade', 1400, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Ferro', 'metais', 'unidade', 65, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Cobre', 'metais', 'unidade', 65, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Carvão', 'metais', 'unidade', 40, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Aço', 'metais', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Corpo Pistol XM3', 'componentes', 'unidade', 70000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Corpo UZI', 'componentes', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Corpo TEC-9', 'componentes', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Corpo TEC Pistol', 'componentes', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Corpo AP Pistol', 'componentes', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Print Laranja', 'componentes', 'unidade', 70000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Print Azul', 'componentes', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Print Vermelha', 'componentes', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Print Amarela', 'componentes', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Musket', 'armas_fogo', 'unidade', 70000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Marksman Pistol', 'armas_fogo', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Sniper', 'armas_fogo', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Espingarda de Cano Serrado', 'armas_fogo', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Bullpup Shotgun', 'armas_fogo', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Heavy Shotgun', 'armas_fogo', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Adaga', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Taco de Baseball', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Garrafa Quebrada', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Barra de Crowbar', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Lanterna', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Clube de Golfe', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Martelo', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Machado de Batalha', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Chave de Tubo', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Taco de 8Ball', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Bastão', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Canivete', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Machete', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Faca', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Soqueira', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Taco de Golfe', 'armas_brancas', 'unidade', 1000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Taser', 'armas_fogo', 'unidade', 70000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('SNS Pistol', 'armas_fogo', 'unidade', 20000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Pistol XM3', 'armas_fogo', 'unidade', 55000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Mini SMG', 'armas_fogo', 'unidade', 65000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Micro SMG', 'armas_fogo', 'unidade', 85000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Machine Pistol', 'armas_fogo', 'unidade', 90000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('TEC Pistol', 'armas_fogo', 'unidade', 110000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('AP Pistol', 'armas_fogo', 'unidade', 115000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Compact Rifle', 'armas_fogo', 'unidade', 150000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Assault Shotgun', 'armas_fogo', 'unidade', 120000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Heavy Shotgun', 'armas_fogo', 'unidade', 120000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Gusenberg', 'armas_fogo', 'unidade', 150000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Heavy Pistol', 'armas_fogo', 'unidade', 100000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('.50', 'armas_fogo', 'unidade', 240000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Revolver', 'armas_fogo', 'unidade', 240000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Gadget Pistol', 'armas_fogo', 'unidade', 240000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('P90', 'armas_fogo', 'unidade', 240000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('PDW', 'armas_fogo', 'unidade', 240000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Bullpup', 'armas_fogo', 'unidade', 320000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Carabina Especial', 'armas_fogo', 'unidade', 340000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Carregador Orange', 'municoes', 'unidade', 2500, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Carregador Red', 'municoes', 'unidade', 3000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Carregador Especial', 'municoes', 'unidade', 3500, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Colete Leve', 'equipamento', 'unidade', 1800, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Colete Tático', 'equipamento', 'unidade', 1800, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Colete Pesado', 'equipamento', 'unidade', 1800, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Silenciador', 'acessorios', 'unidade', 1500, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Mira', 'acessorios', 'unidade', 1500, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Grip', 'acessorios', 'unidade', 1500, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Lanterna', 'acessorios', 'unidade', 1500, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Muzzle', 'acessorios', 'unidade', 1500, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Barrel', 'acessorios', 'unidade', 1500, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Extensivo', 'acessorios', 'unidade', 3500, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Mag Expandido', 'acessorios', 'unidade', 5000, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Cabeços', 'droga', 'unidade', 30, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Haxixe', 'droga', 'unidade', 35, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Folhas Erva', 'droga', 'unidade', 35, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Erva', 'droga', 'unidade', 30, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Meth', 'droga', 'unidade', 20, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Ópio', 'droga', 'unidade', 40, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Coca', 'droga', 'unidade', 40, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
VALUES ('Crack', 'droga', 'unidade', 40, true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  updated_at = NOW();

-- ══════════════════════════════════════════════════════════════════════════════
-- Craft Recipes
-- ══════════════════════════════════════════════════════════════════════════════

-- Recipe: Mini SMG
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'orange' FROM items WHERE name = 'Mini SMG'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Mini SMG')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 10
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Mini SMG')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Corpo Mini SMG'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Mini SMG')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Orange'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Mini SMG')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Pistola XM3
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'orange' FROM items WHERE name = 'Pistola XM3'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola XM3')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 10
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola XM3')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Corpo Pistol XM3'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola XM3')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Orange'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola XM3')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Micro SMG
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'orange' FROM items WHERE name = 'Micro SMG'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Micro SMG')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 15
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Micro SMG')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Corpo UZI'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Micro SMG')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Orange'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Micro SMG')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Machine Pistol
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'orange' FROM items WHERE name = 'Machine Pistol'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Machine Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 15
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Machine Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Corpo TEC-9'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Machine Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Orange'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Machine Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: TEC Pistol
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'orange' FROM items WHERE name = 'TEC Pistol'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'TEC Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 20
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'TEC Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Corpo TEC Pistol'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'TEC Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Orange'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'TEC Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: AP Pistola
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'orange' FROM items WHERE name = 'AP Pistola'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'AP Pistola')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 20
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'AP Pistola')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Corpo AP Pistol'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'AP Pistola')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Orange'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'AP Pistola')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Compact Rifle
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'red' FROM items WHERE name = 'Compact Rifle'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 5
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Compact Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 10
FROM craft_recipes cr
JOIN items i ON i.name = 'Tábua de Ébano'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Compact Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 20
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Compact Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Red'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Compact Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Assault Rifle
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'red' FROM items WHERE name = 'Assault Rifle'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 5
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Assault Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 10
FROM craft_recipes cr
JOIN items i ON i.name = 'Tábua de Ébano'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Assault Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 30
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Assault Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Red'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Assault Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Heavy Pistol
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'red' FROM items WHERE name = 'Heavy Pistol'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 5
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Heavy Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 20
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Heavy Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Red'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Heavy Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Pistola .50
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'red' FROM items WHERE name = 'Pistola .50'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 5
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola .50')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 35
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola .50')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Red'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola .50')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: SMG de Assalto
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'red' FROM items WHERE name = 'SMG de Assalto'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 5
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'SMG de Assalto')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 35
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'SMG de Assalto')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Red'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'SMG de Assalto')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Combat PDW
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'red' FROM items WHERE name = 'Combat PDW'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 5
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Combat PDW')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 35
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Combat PDW')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Red'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Combat PDW')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Pistola Gadget
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'red' FROM items WHERE name = 'Pistola Gadget'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola Gadget')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Ouro'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola Gadget')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 45
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola Gadget')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Red'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Pistola Gadget')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Bullpup Rifle
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'red' FROM items WHERE name = 'Bullpup Rifle'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 8
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Bullpup Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 55
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Bullpup Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Red'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Bullpup Rifle')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Carabina Especial
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_weapons', 'red' FROM items WHERE name = 'Carabina Especial'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 8
FROM craft_recipes cr
JOIN items i ON i.name = 'Aço'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Carabina Especial')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 60
FROM craft_recipes cr
JOIN items i ON i.name = 'Peças'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Carabina Especial')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Print de Red'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Carabina Especial')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Micro Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'Micro Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Micro Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Micro Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: TEC-9 Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'TEC-9 Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'TEC-9 Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'TEC-9 Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: APPistol Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'APPistol Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'APPistol Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 2
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'APPistol Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: HeavyPistol Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'HeavyPistol Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 3
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'HeavyPistol Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 3
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'HeavyPistol Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: CompactRifle Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'CompactRifle Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 3
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'CompactRifle Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 3
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'CompactRifle Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: AssaultRifle Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'AssaultRifle Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 3
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'AssaultRifle Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 3
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'AssaultRifle Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: AssaultSMG Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'AssaultSMG Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 3
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'AssaultSMG Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 3
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'AssaultSMG Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: PDW Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'PDW Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 3
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'PDW Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 3
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'PDW Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: SpecialCarbine Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'SpecialCarbine Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 4
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'SpecialCarbine Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 4
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'SpecialCarbine Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Tactical Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'Tactical Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 4
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Tactical Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 4
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Tactical Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: BattleRifle Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'BattleRifle Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 4
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'BattleRifle Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 4
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'BattleRifle Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: MilitaryRifle Carregador
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_carregadores', NULL FROM items WHERE name = 'MilitaryRifle Carregador'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 4
FROM craft_recipes cr
JOIN items i ON i.name = 'Pólvora'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'MilitaryRifle Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 4
FROM craft_recipes cr
JOIN items i ON i.name = 'Barra de Cobre'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'MilitaryRifle Carregador')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Print de Arma Laranja
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_prints', NULL FROM items WHERE name = 'Print de Arma Laranja'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 5000
FROM craft_recipes cr
JOIN items i ON i.name = 'Dinheiro Sujo'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Print de Arma Laranja')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Papel'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Print de Arma Laranja')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Print de Arma Azul
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_prints', NULL FROM items WHERE name = 'Print de Arma Azul'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 25000
FROM craft_recipes cr
JOIN items i ON i.name = 'Dinheiro Sujo'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Print de Arma Azul')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Papel'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Print de Arma Azul')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Print de Arma Vermelho
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_prints', NULL FROM items WHERE name = 'Print de Arma Vermelho'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 40000
FROM craft_recipes cr
JOIN items i ON i.name = 'Dinheiro Sujo'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Print de Arma Vermelho')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Papel'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Print de Arma Vermelho')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Print de Arma Amarelo
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_prints', NULL FROM items WHERE name = 'Print de Arma Amarelo'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 60000
FROM craft_recipes cr
JOIN items i ON i.name = 'Dinheiro Sujo'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Print de Arma Amarelo')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Papel'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Print de Arma Amarelo')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Corpo Pistol XM3
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_corpos', NULL FROM items WHERE name = 'Corpo Pistol XM3'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Molde de Arma'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Corpo Pistol XM3')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 10
FROM craft_recipes cr
JOIN items i ON i.name = 'Sucata'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Corpo Pistol XM3')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Corpo UZI
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_corpos', NULL FROM items WHERE name = 'Corpo UZI'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Molde de Arma'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Corpo UZI')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 15
FROM craft_recipes cr
JOIN items i ON i.name = 'Sucata'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Corpo UZI')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Corpo TEC-9
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_corpos', NULL FROM items WHERE name = 'Corpo TEC-9'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Molde de Arma'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Corpo TEC-9')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 15
FROM craft_recipes cr
JOIN items i ON i.name = 'Sucata'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Corpo TEC-9')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Corpo TEC Pistol
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_corpos', NULL FROM items WHERE name = 'Corpo TEC Pistol'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Molde de Arma'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Corpo TEC Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 20
FROM craft_recipes cr
JOIN items i ON i.name = 'Sucata'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Corpo TEC Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Recipe: Corpo AP Pistol
INSERT INTO craft_recipes (item_id, category, tier)
SELECT id, 'craft_corpos', NULL FROM items WHERE name = 'Corpo AP Pistol'
ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 1
FROM craft_recipes cr
JOIN items i ON i.name = 'Molde de Arma'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Corpo AP Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
SELECT cr.id, i.id, 20
FROM craft_recipes cr
JOIN items i ON i.name = 'Sucata'
WHERE cr.item_id = (SELECT id FROM items WHERE name = 'Corpo AP Pistol')
ON CONFLICT (recipe_id, ingredient_item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

COMMIT;