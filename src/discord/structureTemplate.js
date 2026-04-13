'use strict';
/**
 * Template declarativo da estrutura do servidor Real Gangsta.
 *
 * Fonte de verdade para o sync-structure. Dados apenas — sem chamadas à API.
 * IDs reais do servidor lidos via CONFIG (com fallback para valores conhecidos
 * em `scripts/restructureServer.js`). Podem ser sobrepostos via .env.
 */

const CONFIG = require('../config');

// IDs conhecidos do servidor actual (podem ser sobrepostos por env)
const DISCOVERED = {
  // Categorias
  CAT_BEM_VINDO:       '1490397735558451250', // → ENTRADA
  CAT_CHEFIA:          '1490411180328489110', // → COMANDO
  CAT_CHEFIA_MOR:      '1490397738246869002', // → REPUTAÇÃO (repurpose)
  CAT_WOOD:            '1490397740612583575', // → ECONOMIA & TOPS
  CAT_OFICIAIS:        '1492729913944309890', // → OFICIAIS
  CAT_CALLS:           '1490397742797815978', // → CALLS
  CAT_PRECARIOS:       '1490397744324415499', // → ARSENAL
  CAT_MAPAS_SPOTS:     '1490397746966822922', // → OPERAÇÕES
  CAT_MORADIA:         '1491323110345936916', // → INVENTÁRIO
  CAT_MORADIA_TOPICOS: '1491543491233448006', // → GUETTO
  CAT_GERAL:           '1490397780450218074', // → GERAL

  // Canais
  CH_DIVULGACAO:       '1490397788981166262',
  CH_ENTRADAS:         '1490397783268524215',
  CH_TAGS:             '1490397785948688529',
  CH_LOGS:             '1490397791426576668',
  CH_LOGS_BOT:         '1492739363463758027',
  CH_CHEFIA_COMUN:     '1490411839354573004',
  CH_CHEFIA_CHAT:      '1490411376768717012',
  CH_PRECOS_PARCERIA:  '1492516926063116399',
  CH_CHEFIA_VOZ:       '1490411630616383588',
  CH_CHEFIA_MOR_CHAT:  '1490397793511280761',
  CH_BAU_CASA:         '1490397795784593588',
  CH_REG_ENCOMENDAS:   '1490397798745505972',
  CH_MATERIAL_ENTREG:  '1491506821599330545',
  CH_REUNIAO_VOZ:      '1490397953595146392',
  CH_REGRAS:           '1490397806106513478',
  CH_WOOD_COMUN:       '1491194611543183430',
  CH_INFO_GERAL:       '1490397836490309693',
  CH_COR_ORG:          '1490397834048966890',
  CH_META_SEMANAL:     '1490397816030236883',
  CH_OFERTAS_ORG:      '1491541659853262979',
  CH_PREMIOS_SEMANAIS: '1490397812872183889',
  CH_CLIPS:            '1490397851065253978',
  CH_SUGESTOES:        '1490397829838012466',
  CH_CEMITERIO:        '1492344204012163122',
  CH_CHAT_OFICIAIS:    '1490397801677590719',
  CH_DISPONIBILIDADE:  '1490397821075984506',
  CH_AUSENCIAS:        '1490397823894818896',
  CH_RADIO_OFIC:       '1492736292838965369',
  CH_COOLDOWN:         '1492736946072453190',
  CH_RESULTADOS:       '1490397810489692292',
  CH_BAU_OFIC:         '1492737820287303750',
  CH_REDWOOD:          '1490397963015426200',
  CH_REDWOOD2:         '1490397959127564424',
  CH_AMMUNATION:       '1490397868383670422',
  CH_ARMAS:            '1490397860968271952',
  CH_CARREGADORES:     '1490397871604764773',
  CH_DROGA:            '1490397864558460948',
  CH_RADIO_MOR:        '1490397808531079449',
  CH_ROUPA:            '1490773903344406558',
  CH_CHAT_MOR:         '1491323137177030787',
  CH_CONVIVIO_MOR:     '1491323285978480752',
  CH_CHAT_GERAL:       '1490397931352887328',
  CH_CONVIVIO_GERAL:   '1491285497232883923',
};

function id(envVar, fallback) {
  return process.env[envVar] || fallback;
}

const CATEGORIES = [
  { key: 'ENTRADA',    id: id('CAT_BEM_VINDO_ID',       DISCOVERED.CAT_BEM_VINDO),       name: '╭・𝗘𝗡𝗧𝗥𝗔𝗗𝗔',              position: 0 },
  { key: 'COMANDO',    id: id('CAT_CHEFIA_ID',          DISCOVERED.CAT_CHEFIA),          name: '╭・𝗖𝗢𝗠𝗔𝗡𝗗𝗢',              position: 1 },
  { key: 'OFICIAIS',   id: id('CAT_OFICIAIS_ID',        DISCOVERED.CAT_OFICIAIS),        name: '╭・𝗢𝗙𝗜𝗖𝗜𝗔𝗜𝗦',             position: 2 },
  { key: 'GUETTO',     id: id('CAT_MORADIA_TOPICOS_ID', DISCOVERED.CAT_MORADIA_TOPICOS), name: '╭・𝗚𝗨𝗘𝗧𝗧𝗢',               position: 3 },
  { key: 'INVENTARIO', id: id('CAT_MORADIA_ID',         DISCOVERED.CAT_MORADIA),         name: '╭・𝗜𝗡𝗩𝗘𝗡𝗧𝗔\u0301𝗥𝗜𝗢',      position: 4 },
  { key: 'ARSENAL',    id: id('CAT_PRECARIOS_ID',       DISCOVERED.CAT_PRECARIOS),       name: '╭・𝗔𝗥𝗦𝗘𝗡𝗔𝗟',              position: 5 },
  { key: 'OPERACOES',  id: id('CAT_MAPAS_SPOTS_ID',     DISCOVERED.CAT_MAPAS_SPOTS),     name: '╭・𝗢𝗣𝗘𝗥𝗔𝗖\u0327𝗢\u0303𝗘𝗦', position: 6 },
  { key: 'ECONOMIA',   id: id('CAT_WOOD_ID',            DISCOVERED.CAT_WOOD),            name: '╭・𝗘𝗖𝗢𝗡𝗢𝗠𝗜𝗔 & 𝗧𝗢𝗣𝗦',     position: 7 },
  { key: 'REPUTACAO',  id: id('CAT_CHEFIA_MOR_ID',      DISCOVERED.CAT_CHEFIA_MOR),      name: '╭・𝗥𝗘𝗣𝗨𝗧𝗔𝗖\u0327𝗔\u0303𝗢', position: 8 },
  { key: 'CALLS',      id: id('CAT_CALLS_ID',           DISCOVERED.CAT_CALLS),           name: '╭・𝗖𝗔𝗟𝗟𝗦',                position: 9 },
  { key: 'GERAL',      id: id('CAT_GERAL_ID',           DISCOVERED.CAT_GERAL),           name: '╭・𝗚𝗘𝗥𝗔𝗟',                position: 10 },
];

const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

const CHANNEL_RENAMES = [
  // ENTRADA
  { id: DISCOVERED.CH_DIVULGACAO,       to: '📢│divulgação' },
  { id: DISCOVERED.CH_ENTRADAS,         to: '📥│entradas' },
  { id: DISCOVERED.CH_TAGS,             to: '🏷️│tags' },
  { id: DISCOVERED.CH_REGRAS,           to: '📜│regras' },
  { id: DISCOVERED.CH_INFO_GERAL,       to: 'ℹ️│informação-geral' },
  { id: DISCOVERED.CH_SUGESTOES,        to: '💡│sugestões' },
  // COMANDO
  { id: DISCOVERED.CH_CHEFIA_COMUN,     to: '📢│comunicados' },
  { id: DISCOVERED.CH_CHEFIA_CHAT,      to: '💬│chefia' },
  { id: DISCOVERED.CH_PRECOS_PARCERIA,  to: '💰│preços-parceria' },
  { id: DISCOVERED.CH_LOGS,             to: '📋│logs' },
  { id: DISCOVERED.CH_LOGS_BOT,         to: '🤖│logs-bot' },
  // OFICIAIS
  { id: DISCOVERED.CH_CHAT_OFICIAIS,    to: '💬│chat-oficiais' },
  { id: DISCOVERED.CH_DISPONIBILIDADE,  to: '📍│disponibilidade' },
  { id: DISCOVERED.CH_AUSENCIAS,        to: '⏰│ausências' },
  { id: DISCOVERED.CH_RADIO_OFIC,       to: '📻│rádio' },
  { id: DISCOVERED.CH_COOLDOWN,         to: '🧊│cooldown' },
  { id: DISCOVERED.CH_RESULTADOS,       to: '📕│resultados' },
  { id: DISCOVERED.CH_BAU_OFIC,         to: '🧰│baú' },
  // GUETTO
  { id: DISCOVERED.CH_CHEFIA_MOR_CHAT,  to: '💬│chefia-moradores' },
  { id: DISCOVERED.CH_BAU_CASA,         to: '📦│baú-casa' },
  { id: DISCOVERED.CH_REG_ENCOMENDAS,   to: '🧾│registo-encomendas' },
  { id: DISCOVERED.CH_MATERIAL_ENTREG,  to: '📥│material-entregue' },
  { id: DISCOVERED.CH_RADIO_MOR,        to: '📻│rádio' },
  { id: DISCOVERED.CH_ROUPA,            to: '👕│roupa' },
  { id: DISCOVERED.CH_CHAT_MOR,         to: '💬│chat' },
  // ARSENAL
  { id: DISCOVERED.CH_AMMUNATION,       to: '💣│munições' },
  { id: DISCOVERED.CH_ARMAS,            to: '🔫│armas' },
  { id: DISCOVERED.CH_CARREGADORES,     to: '🧷│carregadores' },
  { id: DISCOVERED.CH_DROGA,            to: '🌿│droga' },
  // ECONOMIA
  { id: DISCOVERED.CH_META_SEMANAL,     to: '📈│meta-semanal' },
  { id: DISCOVERED.CH_OFERTAS_ORG,      to: '🤝│ofertas-org' },
  { id: DISCOVERED.CH_PREMIOS_SEMANAIS, to: '🎁│prémios-semanais' },
  // REPUTAÇÃO
  { id: DISCOVERED.CH_CEMITERIO,        to: '☠️│cemitério' },
  { id: DISCOVERED.CH_CLIPS,            to: '🎬│clips' },
  // GERAL
  { id: DISCOVERED.CH_CHAT_GERAL,       to: '💬│chat' },
  { id: DISCOVERED.CH_WOOD_COMUN,       to: '📢│comunicados' },
  { id: DISCOVERED.CH_COR_ORG,          to: '🚗│cor-org' },
];

const CHANNEL_MOVES = [
  // logs → COMANDO
  { id: DISCOVERED.CH_LOGS,             toCategoryKey: 'COMANDO',    reason: 'Logs pertencem ao Comando' },
  { id: DISCOVERED.CH_LOGS_BOT,         toCategoryKey: 'COMANDO',    reason: 'Logs do bot pertencem ao Comando' },
  // ex-WOOD → ENTRADA
  { id: DISCOVERED.CH_REGRAS,           toCategoryKey: 'ENTRADA',    reason: 'Regras são conteúdo de entrada' },
  { id: DISCOVERED.CH_INFO_GERAL,       toCategoryKey: 'ENTRADA',    reason: 'Informação geral é conteúdo de entrada' },
  { id: DISCOVERED.CH_SUGESTOES,        toCategoryKey: 'ENTRADA',    reason: 'Sugestões acessíveis desde a entrada' },
  // ex-WOOD → GERAL
  { id: DISCOVERED.CH_WOOD_COMUN,       toCategoryKey: 'GERAL',      reason: 'Comunicados gerais do grupo' },
  { id: DISCOVERED.CH_COR_ORG,          toCategoryKey: 'GERAL',      reason: 'Cor da org é conteúdo geral' },
  // Reputação
  { id: DISCOVERED.CH_CLIPS,            toCategoryKey: 'REPUTACAO',  reason: 'Clips são reputação/prestígio' },
  { id: DISCOVERED.CH_CEMITERIO,        toCategoryKey: 'REPUTACAO',  reason: 'Cemitério (kills) é reputação' },
  // CHEFIA_MOR → GUETTO
  { id: DISCOVERED.CH_CHEFIA_MOR_CHAT,  toCategoryKey: 'GUETTO',     reason: 'Consolidar chefia-moradores no GUETTO' },
  { id: DISCOVERED.CH_BAU_CASA,         toCategoryKey: 'GUETTO',     reason: 'Baú-casa é recurso dos moradores' },
  { id: DISCOVERED.CH_REG_ENCOMENDAS,   toCategoryKey: 'GUETTO',     reason: 'Registo de encomendas é do GUETTO' },
  { id: DISCOVERED.CH_MATERIAL_ENTREG,  toCategoryKey: 'GUETTO',     reason: 'Material entregue é core do GUETTO' },
  { id: DISCOVERED.CH_REUNIAO_VOZ,      toCategoryKey: 'GUETTO',     reason: 'Call de reunião fica no GUETTO' },
  // MORADIA → GUETTO
  { id: DISCOVERED.CH_RADIO_MOR,        toCategoryKey: 'GUETTO',     reason: 'Rádio moradores' },
  { id: DISCOVERED.CH_ROUPA,            toCategoryKey: 'GUETTO',     reason: 'Roupa' },
  { id: DISCOVERED.CH_CHAT_MOR,         toCategoryKey: 'GUETTO',     reason: 'Chat moradores' },
  { id: DISCOVERED.CH_CONVIVIO_MOR,     toCategoryKey: 'GUETTO',     reason: 'Call convívio moradores' },
];

const CHANNELS_TO_CREATE = [
  // Inventário — canais novos para publicação automática
  { name: '📊│resumo-stock',     categoryKey: 'INVENTARIO', reason: 'Canal para resumos automáticos de stock' },
  { name: '📥│entradas-stock',   categoryKey: 'INVENTARIO', reason: 'Movimentos de entrada de stock (auditoria)' },
  { name: '📤│saídas-stock',     categoryKey: 'INVENTARIO', reason: 'Movimentos de saída de stock (auditoria)' },
  { name: '🧾│ajustes-stock',    categoryKey: 'INVENTARIO', reason: 'Ajustes manuais de stock' },
  // Operações — canais
  { name: '🗺️│mapas-spots',      categoryKey: 'OPERACOES',  reason: 'Mapas e spots de saídas' },
  { name: '🎯│spots',            categoryKey: 'OPERACOES',  reason: 'Lista de spots disponíveis' },
  { name: '📋│planeamento',      categoryKey: 'OPERACOES',  reason: 'Planeamento de operações' },
  { name: '📊│resultados-operações', categoryKey: 'OPERACOES', reason: 'Resultados publicados pelo bot' },
  // Economia
  { name: '🏆│tops-semanais',    categoryKey: 'ECONOMIA',   reason: 'Tops semanais auto-publicados' },
];

/**
 * Permissões por categoria — estrutura lê-se como RBAC declarativo.
 * `allow: [{ roleSource, perms }]` onde `roleSource` é uma função que lê CONFIG.
 */
function rolesFor(key) {
  switch (key) {
    case 'command':         return CONFIG.COMMAND_ROLE_IDS;
    case 'supervisor':      return CONFIG.SUPERVISOR_ROLE_IDS;
    case 'chefe_moradores': return CONFIG.CHEFE_MORADORES_ROLE_IDS;
    case 'morador_tiers':   return CONFIG.MORADOR_TIER_ROLE_IDS;
    case 'moradores_base':  return [CONFIG.MORADORES_BASE_ROLE_ID].filter(Boolean);
    case 'tropinhas':       return [CONFIG.TROPINHAS_DO_GUETTO_ROLE_ID].filter(Boolean);
    case 'patrulha_pata':   return [CONFIG.PATRULHA_PATA_ROLE_ID].filter(Boolean);
    case 'bot':             return [CONFIG.BOT_ROLE_ID].filter(Boolean);
    default:                return [];
  }
}

const CATEGORY_PERMS = {
  ENTRADA: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores', 'morador_tiers', 'moradores_base', 'tropinhas', 'patrulha_pata', 'bot'], perms: ['ViewChannel'] },
    ],
  },
  COMANDO: {
    denyEveryone: ['ViewChannel', 'Connect'],
    allow: [
      { roleSources: ['command'], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
  OFICIAIS: {
    denyEveryone: ['ViewChannel', 'Connect'],
    allow: [
      { roleSources: ['command', 'supervisor'], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
  GUETTO: {
    denyEveryone: ['ViewChannel', 'Connect'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'Connect', 'SendMessages', 'ManageMessages'] },
      { roleSources: ['morador_tiers', 'moradores_base'], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ManageMessages'] },
    ],
  },
  INVENTARIO: {
    denyEveryone: ['ViewChannel', 'Connect'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
      { roleSources: ['morador_tiers', 'moradores_base'], perms: ['ViewChannel'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
  ARSENAL: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel'] },
    ],
  },
  OPERACOES: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['morador_tiers', 'moradores_base'], perms: ['ViewChannel'] },
      { roleSources: ['bot'], perms: ['ViewChannel'] },
    ],
  },
  ECONOMIA: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['morador_tiers', 'moradores_base'], perms: ['ViewChannel'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
  REPUTACAO: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores', 'morador_tiers', 'moradores_base'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
  CALLS: {
    denyEveryone: ['ViewChannel', 'Connect'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'Connect'] },
      { roleSources: ['morador_tiers', 'moradores_base'], perms: ['ViewChannel', 'Connect'] },
    ],
  },
  GERAL: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores', 'morador_tiers', 'moradores_base'], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
};

// Canais com overrides específicos (são aplicados DEPOIS dos da categoria)
const CHANNEL_PERM_OVERRIDES = {
  [DISCOVERED.CH_CHEFIA_MOR_CHAT]: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel'] },
    ],
    reason: 'chefia-moradores é privado — só chefia + patrão di zona',
  },
};

module.exports = {
  DISCOVERED,
  CATEGORIES,
  CATEGORY_BY_KEY,
  CHANNEL_RENAMES,
  CHANNEL_MOVES,
  CHANNELS_TO_CREATE,
  CATEGORY_PERMS,
  CHANNEL_PERM_OVERRIDES,
  rolesFor,
};
