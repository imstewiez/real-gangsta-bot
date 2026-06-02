'use strict';

require('dotenv').config();
const { query } = require('../src/db');

const sql = `
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
  SELECT id, name, norm_name,
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
), updated AS (
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
    AND matched.price IS NOT NULL
  RETURNING i.id, i.name, i.purchase_price::float AS civil, i.morador_purchase_price::float AS moradores, i.estimated_value::float AS custo, i.side
)
SELECT * FROM updated ORDER BY name;
`;

const expectedSql = `
WITH expected(norm_name, display, price) AS (
  VALUES
    ('taninos','Taninos',20),
    ('radioestragado','Radio estragado',25),
    ('telemovelestragado','Telemóvel estragado',25),
    ('sucata','Sucata',40),
    ('serradura','Serradura',40),
    ('carvao','Carvão',40),
    ('tabuapinho','Tábua Pinho',40),
    ('plasticoreciclado','Plástico Reciclado / Plástico',40),
    ('tabuacarvalho','Tábua Carvalho',65),
    ('borracha','Borracha',65),
    ('tabuacerejeira','Tábua Cerejeira',60),
    ('ferro','Ferro',65),
    ('tecido','Tecido',65),
    ('cobre','Cobre',65),
    ('lixoeletronico','Lixo Eletrónico',60),
    ('polvora','Pólvora',100),
    ('tabuaebano','Tábua Ébano',200),
    ('kevlar','Kevlar',600),
    ('papel','Papel',100),
    ('couro','Couro',1500),
    ('aco','Aço',1000)
), normalized AS (
  SELECT i.id,
         i.name,
         i.purchase_price::float AS civil,
         i.morador_purchase_price::float AS moradores,
         lower(regexp_replace(
           translate(trim(i.name),
             'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
             'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
           ),
           '[^a-zA-Z0-9]+', '', 'g'
         )) AS norm_name
  FROM items i
  WHERE i.deleted_at IS NULL AND coalesce(i.active, true) = true
), expected_matches AS (
  SELECT e.display, e.price, n.name, n.civil, n.moradores
  FROM expected e
  LEFT JOIN normalized n
    ON n.norm_name = e.norm_name
    OR (e.norm_name = 'plasticoreciclado' AND n.norm_name = 'plastico')
    OR (e.norm_name = 'tabuapinho' AND n.norm_name = 'pinho')
    OR (e.norm_name = 'tabuacarvalho' AND n.norm_name = 'carvalho')
    OR (e.norm_name = 'tabuacerejeira' AND n.norm_name = 'cerejeira')
    OR (e.norm_name = 'tabuaebano' AND n.norm_name = 'ebano')
)
SELECT * FROM expected_matches ORDER BY display, name;
`;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL em falta no .env');
  }
  const updated = await query(sql);
  console.log(`\n[repair:material-prices] Atualizados: ${updated.rowCount}`);
  for (const row of updated.rows) {
    console.log(` - ${row.name}: civil=${row.civil} moradores=${row.moradores} custo=${row.custo} side=${row.side}`);
  }

  const report = await query(expectedSql);
  console.log('\n[repair:material-prices] Verificação:');
  for (const row of report.rows) {
    const status = row.name ? `${row.name} => civil=${row.civil ?? 'NULL'} moradores=${row.moradores ?? 'NULL'} esperado=${row.price}` : 'NÃO EXISTE NA DB';
    console.log(` - ${row.display}: ${status}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
