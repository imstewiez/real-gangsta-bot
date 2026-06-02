-- Repair robusto dos preços de compra dos materiais na fonte de verdade: items.
-- A migration 076 era demasiado estrita no matching do nome. Esta usa padrões seguros.
-- Não cria items novos e só mexe em rows existentes/ativas.

WITH normalized AS (
  SELECT i.id,
         i.name,
         lower(regexp_replace(
           translate(trim(i.name),
             'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
             'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
           ),
           '[^a-zA-Z0-9]+', '', 'g'
         )) AS norm_name
  FROM items i
  WHERE i.deleted_at IS NULL
    AND coalesce(i.active, true) = true
), matched AS (
  SELECT id,
    CASE
      WHEN norm_name IN ('taninos','tanino') THEN 20
      WHEN norm_name IN ('radioestragado','radioestragada') THEN 25
      WHEN norm_name IN ('telemovelestragado','telemovelestragada','telefoneestragado','telefoneestragada') THEN 25
      WHEN norm_name = 'sucata' THEN 40
      WHEN norm_name = 'serradura' THEN 40
      WHEN norm_name = 'carvao' THEN 40
      WHEN norm_name IN ('tabuapinho','pinho') THEN 40
      WHEN norm_name IN ('plasticoreciclado','plastico') THEN 40
      WHEN norm_name IN ('tabuacarvalho','carvalho') THEN 65
      WHEN norm_name = 'borracha' THEN 65
      WHEN norm_name IN ('tabuacerejeira','cerejeira') THEN 60
      WHEN norm_name = 'ferro' THEN 65
      WHEN norm_name = 'tecido' THEN 65
      WHEN norm_name = 'cobre' THEN 65
      WHEN norm_name IN ('lixoeletronico','lixoelectronico') THEN 60
      WHEN norm_name = 'polvora' THEN 100
      WHEN norm_name IN ('tabuaebano','ebano') THEN 200
      WHEN norm_name = 'kevlar' THEN 600
      WHEN norm_name = 'papel' THEN 100
      WHEN norm_name = 'couro' THEN 1500
      WHEN norm_name = 'aco' THEN 1000
      ELSE NULL
    END AS price
  FROM normalized
)
UPDATE items i
SET purchase_price = matched.price,
    morador_purchase_price = matched.price,
    estimated_value = matched.price,
    side = CASE
      WHEN i.side = 'venda' THEN 'ambos'
      WHEN i.side IS NULL THEN 'compra'
      ELSE i.side
    END,
    updated_at = now()
FROM matched
WHERE i.id = matched.id
  AND matched.price IS NOT NULL;

-- Relatório visível nos logs do migrator.
DO $$
DECLARE
  v_missing text;
BEGIN
  WITH expected(norm_name) AS (
    VALUES
      ('taninos'), ('radioestragado'), ('telemovelestragado'), ('sucata'),
      ('serradura'), ('carvao'), ('tabuapinho'), ('plasticoreciclado'),
      ('tabuacarvalho'), ('borracha'), ('tabuacerejeira'), ('ferro'),
      ('tecido'), ('cobre'), ('lixoeletronico'), ('polvora'), ('tabuaebano'),
      ('kevlar'), ('papel'), ('couro'), ('aco')
  ), normalized AS (
    SELECT lower(regexp_replace(
      translate(trim(name),
        'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
      ),
      '[^a-zA-Z0-9]+', '', 'g'
    )) AS norm_name
    FROM items
    WHERE deleted_at IS NULL AND coalesce(active, true) = true
  )
  SELECT string_agg(e.norm_name, ', ')
  INTO v_missing
  FROM expected e
  WHERE NOT EXISTS (
    SELECT 1 FROM normalized n
    WHERE n.norm_name = e.norm_name
       OR (e.norm_name = 'plasticoreciclado' AND n.norm_name = 'plastico')
       OR (e.norm_name = 'tabuapinho' AND n.norm_name = 'pinho')
       OR (e.norm_name = 'tabuacarvalho' AND n.norm_name = 'carvalho')
       OR (e.norm_name = 'tabuacerejeira' AND n.norm_name = 'cerejeira')
       OR (e.norm_name = 'tabuaebano' AND n.norm_name = 'ebano')
  );

  IF v_missing IS NOT NULL THEN
    RAISE NOTICE 'Preços materiais: alguns nomes esperados não existem na DB: %', v_missing;
  ELSE
    RAISE NOTICE 'Preços materiais: repair aplicado e todos os nomes esperados foram encontrados.';
  END IF;
END $$;
