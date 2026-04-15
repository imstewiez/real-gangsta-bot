'use strict';
/**
 * Voz & tom da Firma RedWood.
 *
 * Centraliza a identidade textual do bot. Todos os embeds, botões,
 * mensagens, placeholders e copy devem passar por esta camada.
 *
 * Regras duras:
 *   - pt-PT sempre. Nunca pt-BR.
 *   - Directo, firme, bairro. Nunca corporate, nunca infantil.
 *   - Frases curtas. Uma ideia por linha.
 *   - Gíria controlada: casa, firma, rua, zona, guetto, movimento, peso, topo.
 *   - Evitar: "sistema", "utilizador", "processado", "entidade", "operação".
 *   - Emojis só quando ancoram semanticamente. Nunca a decorar.
 */

// Assinatura única — a ÚNICA forma aceitável de mencionar a marca.
const BRAND = 'Firma RedWood';

// Assinaturas curtas para footers / fins de linha. Escolhe a que se adequar.
const SIGNATURES = {
  SHORT: `— ${BRAND}`,
  HOUSE: `— ${BRAND} · casa`,
  STREET: `— ${BRAND} · rua`,
  MOVEMENT: `— ${BRAND} · movimento`,
  TOP: `— ${BRAND} · topo`,
};

// Dicionário da casa — termos a usar em vez dos genéricos.
const GLOSSARY = {
  bot: 'bot',
  org: 'firma',
  house: 'casa',
  street: 'rua',
  zone: 'zona',
  hood: 'guetto',
  movement: 'movimento',
  operation: 'saída',
  material: 'material',
  member: 'nome',
  roster: 'movimento',
  presence: 'presença',
  weight: 'peso',
  top: 'topo',
  spot: 'spot',
};

// Tradução dos estados técnicos para linguagem de bairro.
const STATUS = {
  // Saídas
  aberta: 'Aberta',
  em_preparacao: 'A preparar',
  em_curso: 'Na rua',
  concluida: 'Fechada',
  cancelada: 'Cancelada',
  // Presença
  disponivel: 'Na zona',
  indisponivel: 'Fora',
  talvez: 'Talvez',
  // Genéricos
  activo: 'Activo',
  inactivo: 'Inactivo',
  pendente: 'Pendente',
};

// Fraseologia de resultado — para saídas.
const RESULT = {
  win: 'Vitória',
  loss: 'Derrota',
  draw: 'Empate',
  sem_conflito: 'Sem conflito',
};

// Tradução de roles/tiers (usada em embeds e audits).
const ROLE = {
  bairrista: 'Bairrista',
  patrao_di_zona: 'Patrão di Zona',
  oficial: 'Oficial',
  chefia: 'Chefia',
  inativo: 'Inactivo',
  pendente: 'Pendente',
  // Legacy aliases
  morador: 'Bairrista',
  chefe_moradores: 'Patrão di Zona',
};

// Tipo de saída → label curta pt-PT.
const SAIDA_TYPE = {
  craft: 'Craft',
  dominio: 'Domínio',
  ataque: 'Ataque',
  defesa: 'Defesa',
  recolha: 'Recolha',
  outra: 'Outra',
};

module.exports = {
  BRAND,
  SIGNATURES,
  GLOSSARY,
  STATUS,
  RESULT,
  ROLE,
  SAIDA_TYPE,
};
