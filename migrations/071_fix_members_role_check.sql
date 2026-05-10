ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE members ADD CONSTRAINT members_role_check CHECK (role IN (
  'bairrista', 'young_blood', 'o_gunao', 'gangster_fodido',
  'patrao_di_zona', 'real_gangster', 'og', 'kingpin', 'manda_chuva',
  'oficial', 'chefia', 'chefe_moradores', 'inativo', 'morador'
));
