'use strict';
/**
 * Template minimalista — apenas referências estáveis e permissões.
 *
 * ATENÇÃO — REGRAS DURAS:
 *   O LAYOUT DO SERVIDOR É CONGELADO em `config/discord-layout.lock.json`.
 *   O bot NÃO renomeia, NÃO move, NÃO cria canais globais, NÃO força
 *   nomes de roles. Tudo o que existe no servidor fica exactamente como
 *   está, a não ser que o utilizador peça algo específico.
 *
 *   O que o bot AINDA faz (contextual, não é alteração global):
 *     - Cria o canal individual de cada bairrista no onboarding
 *     - Renomeia esse canal pessoal quando o bairrista é promovido
 *     - Aplica permissões nas categorias e canais conhecidos (segurança)
 *     - Cria o role Pendente se não existir (necessário para onboarding)
 *
 *   O que FOI removido:
 *     - CHANNEL_RENAMES (renomes em bulk)
 *     - CHANNEL_MOVES (moves entre categorias)
 *     - CHANNELS_TO_CREATE (criação automática de canais fixos)
 *     - ROLE_DISPLAY_NAMES força rename de roles
 *     - Auto-restyle de canais com padrão `emoji│nome`
 *     - Safe renames por ID (ex.: CH_TAGS)
 *
 *   Para auditar o layout actual vs lock, usar `/rg-layout-check`.
 */

const CONFIG = require('../config');

// ── Bold Unicode helper ───────────────────────────────────────────────────────
const _BOLD = {
  a:'𝗮', b:'𝗯', c:'𝗰', d:'𝗱', e:'𝗲', f:'𝗳', g:'𝗴', h:'𝗵', i:'𝗶', j:'𝗷',
  k:'𝗸', l:'𝗹', m:'𝗺', n:'𝗻', o:'𝗼', p:'𝗽', q:'𝗾', r:'𝗿', s:'𝘀', t:'𝘁',
  u:'𝘂', v:'𝘃', w:'𝘄', x:'𝘅', y:'𝘆', z:'𝘇',
  A:'𝗔', B:'𝗕', C:'𝗖', D:'𝗗', E:'𝗘', F:'𝗙', G:'𝗚', H:'𝗛', I:'𝗜', J:'𝗝',
  K:'𝗞', L:'𝗟', M:'𝗠', N:'𝗡', O:'𝗢', P:'𝗣', Q:'𝗤', R:'𝗥', S:'𝗦', T:'𝗧',
  U:'𝗨', V:'𝗩', W:'𝗪', X:'𝗫', Y:'𝗬', Z:'𝗭',
  '0':'𝟬', '1':'𝟭', '2':'𝟮', '3':'𝟯', '4':'𝟰', '5':'𝟱', '6':'𝟲', '7':'𝟳', '8':'𝟴', '9':'𝟵',
};
const _ACCENT_DECOMPOSE = {
  'á':'a\u0301','é':'e\u0301','í':'i\u0301','ó':'o\u0301','ú':'u\u0301',
  'Á':'A\u0301','É':'E\u0301','Í':'I\u0301','Ó':'O\u0301','Ú':'U\u0301',
  'ã':'a\u0303','õ':'o\u0303','Ã':'A\u0303','Õ':'O\u0303',
  'â':'a\u0302','ê':'e\u0302','ô':'o\u0302','Â':'A\u0302','Ê':'E\u0302','Ô':'O\u0302',
  'ç':'c\u0327','Ç':'C\u0327',
};
function bold(s) {
  const decomposed = [...s].map(c => _ACCENT_DECOMPOSE[c] || c).join('');
  return [...decomposed].map(c => _BOLD[c] || c).join('');
}
function ch(emoji, name) {
  return `${emoji}・${bold(name)}`;
}

const _UNBOLD = Object.fromEntries(Object.entries(_BOLD).map(([k, v]) => [v, k]));
function unbold(s) {
  return [...s].map(c => _UNBOLD[c] || c).join('').normalize('NFC');
}

/**
 * Extrai o nick original de um canal de bairrista já formatado (ver docs
 * originais). Continua a ser usado pelo onboarding + promoção.
 */
function extractNicknameFromFormatted(channelName) {
  if (!channelName) return null;
  let s = channelName;
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    const lastDash = s.lastIndexOf(' - ');
    if (lastDash !== -1) { s = s.slice(lastDash + 3).trim(); changed = true; continue; }
    const dotIdx = s.indexOf('・');
    if (dotIdx !== -1 && dotIdx < 6) {
      const rest = s.slice(dotIdx + 1);
      for (const tierPrefix of _TIER_LABELS_FOR_EXTRACT) {
        if (rest.startsWith(tierPrefix)) { s = rest.slice(tierPrefix.length); changed = true; break; }
      }
    }
  }
  if (s === channelName) return null;
  const result = unbold(s).trim();
  return result || null;
}

// ── Tier emoji + resident channel naming ─────────────────────────────────────
// Usado APENAS para canais individuais de bairrista (onboarding + promoção).
const TIER_EMOJI = {
  young_blood:     '🍼',
  o_gunao:         '🔫',
  gangster_fodido: '💀',
  patrao_di_zona:  '👑',
  real_gangster:   '🥷',
  og:              '🏆',
  kingpin:         '💎',
  manda_chuva:     '🐉',
};
// Labels curtos para canais individuais — reduzem comprimento do nome do
// canal. Longos ficavam tipo `🍼・𝗬𝗼𝘂𝗻𝗴 𝗕𝗹𝗼𝗼𝗱 - 𝗡𝗶𝗰𝗸` → agora `🍼・𝗬𝗕 - 𝗡𝗶𝗰𝗸`.
const TIER_LABEL = {
  young_blood:     'YB',
  o_gunao:         'Gunão',
  gangster_fodido: 'GF',
  patrao_di_zona:  'Patrão',
  real_gangster:   'RG',
  og:              'OG',
  kingpin:         'KP',
  manda_chuva:     'MC',
};

// Labels legacy — usados APENAS para extractNicknameFromFormatted conseguir
// ler nomes de canais antigos (pré-encurtamento) quando há promoções ou
// renames. Sem isto, canais antigos ficam unparseable no reconcile.
const _TIER_LABEL_LEGACY_BY_KEY = {
  young_blood:     'Young Blood',
  o_gunao:         'O Gunão',
  gangster_fodido: 'Gangster Fodido',
  patrao_di_zona:  'Patrão di Zona',
  real_gangster:   'Real Gangster',
  kingpin:         'Kingpin',
  manda_chuva:     'Manda-Chuva',
};
const _TIER_LABELS_LEGACY = Object.values(_TIER_LABEL_LEGACY_BY_KEY);
const _TIER_LABELS_FOR_EXTRACT = [...Object.values(TIER_LABEL), ..._TIER_LABELS_LEGACY]
  .map(l => bold(l).replace(/ /g, '-') + '-')
  .sort((a, b) => b.length - a.length);

function formatResidentChannelName(tier, nickname) {
  const emoji = TIER_EMOJI[tier] || TIER_EMOJI.young_blood;
  const label = TIER_LABEL[tier] || 'Bairrista';
  const safeNick = (nickname || '').trim() || 'sem-nome';
  const maxNickChars = 30;
  const truncatedNick = safeNick.length > maxNickChars ? `${safeNick.slice(0, maxNickChars)}…` : safeNick;
  return `${emoji}・${bold(label)} - ${bold(truncatedNick)}`;
}

/**
 * Rewrite de um channel name com label legacy para o formato curto,
 * substituindo bold(legacy) por bold(short). Database-independent —
 * depende apenas do nome actual do canal.
 *
 * IMPORTANTE: Discord normaliza espaços ASCII a `-` em nomes de text
 * channels. Portanto `bold('Young Blood')` escrito (`𝗬𝗼𝘂𝗻𝗴 𝗕𝗹𝗼𝗼𝗱`) vira
 * `𝗬𝗼𝘂𝗻𝗴-𝗕𝗹𝗼𝗼𝗱` depois do `setName`. Temos de tentar AMBAS as formas
 * no match, senão 'Young-Blood-xxxx' nunca bate com `bold('Young Blood')`
 * e o rename nunca dispara.
 *
 * @param {string} oldName
 * @returns {string|null} novo nome se precisa rewrite; null se já está curto.
 */
function normalizeChannelNameToShort(oldName) {
  if (!oldName || typeof oldName !== 'string') return null;
  let newName = oldName;
  for (const [tierKey, shortLabel] of Object.entries(TIER_LABEL)) {
    const legacyLabel = _TIER_LABEL_LEGACY_BY_KEY[tierKey];
    if (!legacyLabel || legacyLabel === shortLabel) continue;
    const legacyBold = bold(legacyLabel);
    const shortBold = bold(shortLabel);
    // Tenta ambas as formas: com espaço (como escrevemos) e com dash
    // (como Discord armazena após normalização de text channels).
    const variants = [legacyBold];
    if (legacyBold.includes(' ')) {
      variants.push(legacyBold.replace(/ /g, '-'));
    }
    for (const variant of variants) {
      if (newName.includes(variant)) {
        newName = newName.split(variant).join(shortBold);
        break;
      }
    }
  }
  return newName !== oldName ? newName : null;
}

// ── IDs descobertos do servidor actual ───────────────────────────────────────
// Usados como fallback quando não há env var. Os IDs NÃO são ordem canónica —
// ordem e nomes vêm do lock file (discord-layout.lock.json).
const DISCOVERED = {
  // Categorias (activas — IDs mortos removidos)
  CAT_BEM_VINDO:       '1490397735558451250',
  CAT_CHEFIA:          '1490411180328489110',
  CAT_OFICIAIS:        '1492729913944309890',
  CAT_CALLS:           '1490397742797815978',
  CAT_MAPAS_SPOTS:     '1490397746966822922',
  CAT_MORADIA:         '1491323110345936916',
  CAT_MORADIA_TOPICOS: '1491543491233448006',
  CAT_GERAL:           '1490397780450218074',

  // Canais (IDs conhecidos — usados para CHANNEL_PERM_OVERRIDES por ID)
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
  CH_ARQUIVOS:         '1493849342161719317',
  CH_TOP_SEMANAL:      '1493242996337147915',
  // Painel público das saídas — malta junta-se aqui + notificações lifecycle.
  // Mesmo canal serve como "session channel" (painel vivo) e "notifications"
  // (started/closed/weapon_return/material_issued).
  CH_SAIDAS_LOG:       '1494383859893276714',
  // Canal do painel oficial — staff abre saídas daqui.
  CH_PAINEL_SAIDAS:    '1493661876557709452',
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

// ── Categorias (referência para lookup por chave nas permissões) ─────────────
// NÃO são usadas para renomear nem reordenar. São apenas um mapa
// `key → id` para saber em que categoria aplicar as permissões.
// Categorias do servidor. ARSENAL/ECONOMIA foram consolidadas — canais
// que viviam lá foram movidos e precisam de pins por ID se queremos
// perms estritas (feito em _applyOgPlusWriteOverrides, etc.).
// OPERACOES (categoria `spots`) MANTIDA — é onde vivem os canais spots/mapas.
const CATEGORIES = [
  { key: 'ENTRADA',    id: id('CAT_BEM_VINDO_ID',       DISCOVERED.CAT_BEM_VINDO) },
  { key: 'COMANDO',    id: id('CAT_CHEFIA_ID',          DISCOVERED.CAT_CHEFIA) },
  { key: 'OFICIAIS',   id: id('CAT_OFICIAIS_ID',        DISCOVERED.CAT_OFICIAIS) },
  { key: 'GUETTO',     id: id('CAT_MORADIA_TOPICOS_ID', DISCOVERED.CAT_MORADIA_TOPICOS) },
  { key: 'INVENTARIO', id: id('CAT_MORADIA_ID',         DISCOVERED.CAT_MORADIA) },
  { key: 'OPERACOES',  id: id('CAT_MAPAS_SPOTS_ID',     DISCOVERED.CAT_MAPAS_SPOTS) },
  { key: 'CALLS',      id: id('CAT_CALLS_ID',           DISCOVERED.CAT_CALLS) },
  { key: 'GERAL',      id: id('CAT_GERAL_ID',           DISCOVERED.CAT_GERAL) },
];

const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

// ── Role guild-level permissions (bitfield em nomes discord.js) ──────────────
const ROLE_GUILD_PERMS = {
  command: ['Administrator'],
  supervisor: [
    'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles',
    'ReadMessageHistory', 'AddReactions', 'UseExternalEmojis', 'UseExternalStickers',
    'Connect', 'Speak', 'UseVAD', 'Stream',
    'ChangeNickname', 'ManageMessages', 'ManageThreads',
    'CreatePublicThreads', 'SendMessagesInThreads',
    'MuteMembers', 'DeafenMembers', 'MoveMembers',
    'ViewAuditLog',
    // KickMembers removido — só chefia (Administrator) pode expulsar.
  ],
  patrao_di_zona: [
    'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles',
    'ReadMessageHistory', 'AddReactions', 'UseExternalEmojis', 'UseExternalStickers',
    'Connect', 'Speak', 'UseVAD', 'Stream',
    'ChangeNickname', 'ManageMessages',
    'MuteMembers', 'DeafenMembers', 'MoveMembers',
  ],
  bairristas_base: [
    'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles',
    'ReadMessageHistory', 'AddReactions', 'UseExternalEmojis', 'UseExternalStickers',
    'Connect', 'Speak', 'UseVAD', 'Stream',
    'ChangeNickname', 'SendMessagesInThreads',
  ],
  bairrista_tiers: [
    'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles',
    'ReadMessageHistory', 'AddReactions', 'UseExternalEmojis', 'UseExternalStickers',
    'Connect', 'Speak', 'UseVAD', 'Stream',
    'ChangeNickname', 'SendMessagesInThreads',
  ],
  pendente: ['ViewChannel', 'ReadMessageHistory'],
  tropinhas: [],
  patrulha_pata: [],
};

const ROLE_KEY_TO_ID_KEYS = {
  command:         ['MANDA_CHUVA_ROLE_ID', 'KINGPIN_ROLE_ID'],
  supervisor:      ['OG_ROLE_ID', 'REAL_GANGSTER_ROLE_ID'],
  patrao_di_zona:  ['PATRAO_DI_ZONA_ROLE_ID'],
  bairrista_tiers: ['YOUNG_BLOOD_ROLE_ID', 'O_GUNAO_ROLE_ID', 'GANGSTER_FODIDO_ROLE_ID'],
  bairristas_base: ['BAIRRISTAS_BASE_ROLE_ID'],
  pendente:        ['PENDENTE_ROLE_ID'],
  tropinhas:       ['TROPINHAS_DO_GUETTO_ROLE_ID'],
  patrulha_pata:   ['PATRULHA_PATA_ROLE_ID'],
};

function rolesFor(key) {
  switch (key) {
    case 'command':         return CONFIG.COMMAND_ROLE_IDS;
    case 'supervisor':      return CONFIG.SUPERVISOR_ROLE_IDS;
    case 'patrao_di_zona':  return CONFIG.PATRAO_DI_ZONA_ROLE_IDS;
    case 'bairrista_tiers': return CONFIG.BAIRRISTA_TIER_ROLE_IDS;
    case 'bairristas_base': return [CONFIG.BAIRRISTAS_BASE_ROLE_ID].filter(Boolean);
    case 'pendente':        return [CONFIG.PENDENTE_ROLE_ID].filter(Boolean);
    case 'tropinhas':       return [CONFIG.TROPINHAS_DO_GUETTO_ROLE_ID].filter(Boolean);
    case 'patrulha_pata':   return [CONFIG.PATRULHA_PATA_ROLE_ID].filter(Boolean);
    case 'bot':             return [CONFIG.BOT_ROLE_ID].filter(Boolean);
    default:                return [];
  }
}

// ── Category permissions ──────────────────────────────────────────────────────
// Estas SÃO aplicadas — são segurança, não layout. Bairristas não vêem staff
// areas, etc. Mantêm-se porque protegem contra regressões acidentais de
// permissões (ninguém mexe a mão e abre o inventory a bairristas).
const CATEGORY_PERMS = {
  ENTRADA: {
    denyEveryone: ['ViewChannel'],
    deny: [
      { roleSources: ['bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
    ],
    allow: [
      { roleSources: ['pendente'], perms: ['ViewChannel', 'ReadMessageHistory'] },
      { roleSources: ['command', 'supervisor', 'patrao_di_zona'], perms: ['ViewChannel', 'ReadMessageHistory'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages', 'ManageMessages'] },
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
    deny: [
      { roleSources: ['pendente'], perms: ['ViewChannel'] },
    ],
    allow: [
      { roleSources: ['command', 'supervisor', 'patrao_di_zona'], perms: ['ViewChannel', 'Connect', 'SendMessages', 'ManageMessages'] },
      { roleSources: ['bairrista_tiers', 'bairristas_base'], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ManageMessages'] },
    ],
  },
  INVENTARIO: {
    denyEveryone: ['ViewChannel', 'Connect'],
    allow: [
      { roleSources: ['command', 'supervisor', 'patrao_di_zona'], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
  OPERACOES: {
    // Categoria `spots` — planeamento e consulta. Admins (OG+) escrevem,
    // patrão/bairristas consultam (read-only).
    denyEveryone: ['ViewChannel'],
    deny: [
      { roleSources: ['pendente'], perms: ['ViewChannel'] },
    ],
    allow: [
      { roleSources: ['command', 'supervisor'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['patrao_di_zona', 'bairrista_tiers', 'bairristas_base'], perms: ['ViewChannel', 'ReadMessageHistory'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
  CALLS: {
    denyEveryone: ['ViewChannel', 'Connect'],
    deny: [
      { roleSources: ['pendente', 'bairrista_tiers', 'bairristas_base'], perms: ['ViewChannel', 'Connect'] },
    ],
    allow: [
      { roleSources: ['command', 'supervisor', 'patrao_di_zona'], perms: ['ViewChannel', 'Connect'] },
    ],
  },
  GERAL: {
    denyEveryone: ['ViewChannel'],
    deny: [
      { roleSources: ['pendente'], perms: ['ViewChannel'] },
    ],
    allow: [
      { roleSources: ['command', 'supervisor', 'patrao_di_zona', 'bairrista_tiers', 'bairristas_base'], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
};

// ── Channel-specific overrides (por ID) ──────────────────────────────────────
const CHANNEL_PERM_OVERRIDES = {
  [DISCOVERED.CH_CHEFIA_MOR_CHAT]: {
    denyEveryone: ['ViewChannel'],
    deny: [
      { roleSources: ['supervisor', 'bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
    ],
    allow: [
      { roleSources: ['command', 'patrao_di_zona'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel'] },
    ],
    reason: 'patrao-di-zona chat — chefia + patrão di zona only (oficiais fora)',
  },
  [DISCOVERED.CH_TAGS]: {
    denyEveryone: ['ViewChannel'],
    deny: [
      { roleSources: ['patrao_di_zona', 'bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
    ],
    allow: [
      { roleSources: ['command'], perms: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'] },
      { roleSources: ['supervisor'], perms: ['ViewChannel', 'ReadMessageHistory'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
    reason: 'tags — só chefia (command) aprova; oficiais consultam (audit)',
  },
  [DISCOVERED.CH_ENTRADAS]: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor'], perms: ['ViewChannel'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
    reason: 'entradas — auditoria staff only',
  },
  [DISCOVERED.CH_CEMITERIO]: {
    denyEveryone: ['ViewChannel', 'SendMessages'],
    deny: [
      { roleSources: ['bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
    ],
    allow: [
      { roleSources: ['command', 'supervisor', 'patrao_di_zona'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
    reason: 'Cemitério — staff only, bairristas não vêem',
  },
};

// Canais de gestão privada do patrão di zona (bau, encomendas, material) —
// definidos abaixo dos PERMS_* (forward-referenced via função diferida).
// Usar IIFE para evitar TDZ (PERMS_PATRAO_DI_ZONA_PRIVATE é declarado mais abaixo).
function _applyPatraoDiZonaPrivateOverrides() {
  CHANNEL_PERM_OVERRIDES[DISCOVERED.CH_BAU_CASA] = PERMS_PATRAO_DI_ZONA_PRIVATE;
  CHANNEL_PERM_OVERRIDES[DISCOVERED.CH_REG_ENCOMENDAS] = PERMS_PATRAO_DI_ZONA_PRIVATE;
  CHANNEL_PERM_OVERRIDES[DISCOVERED.CH_ARQUIVOS] = PERMS_PATRAO_DI_ZONA_PRIVATE;
  // CH_MATERIAL_ENTREG (1491506821599330545) passa a ser o canal consolidado
  // de INVENTORY_EVENTS — ver _applyInventoryLogOverrides abaixo.
}

// Canais consolidados de logs.
function _applyInventoryLogOverrides() {
  // Inventário — logs confidenciais de material. Staff+patrão lêem, bairristas fora.
  const staffLogPerms = {
    denyEveryone: ['ViewChannel', ..._PANEL_WRITE_DENIES],
    deny: [
      { roleSources: ['bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
    ],
    allow: [
      { roleSources: ['command', 'supervisor', 'patrao_di_zona'], perms: ['ViewChannel', 'ReadMessageHistory'] },
      { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
    ],
    reason: 'log staff — bot publica; staff + patrão lêem; bairristas fora',
  };
  if (DISCOVERED.CH_MATERIAL_ENTREG) {
    CHANNEL_PERM_OVERRIDES[DISCOVERED.CH_MATERIAL_ENTREG] = staffLogPerms;
  }

  // Saídas — painel vivo + notificações. TODOS vêem (malta junta-se via
  // buttons do bot); só bot publica (ninguém escreve chat); interacção é
  // pelos buttons do painel da saída (não conta como SendMessages).
  if (DISCOVERED.CH_SAIDAS_LOG) {
    CHANNEL_PERM_OVERRIDES[DISCOVERED.CH_SAIDAS_LOG] = {
      denyEveryone: _PANEL_WRITE_DENIES,
      allow: [
        { roleSources: ['command', 'supervisor', 'patrao_di_zona'], perms: ['ViewChannel', 'ReadMessageHistory'] },
        { roleSources: ['bairrista_tiers', 'bairristas_base'], perms: ['ViewChannel', 'ReadMessageHistory'] },
        { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
      ],
      reason: 'saídas-log — todos vêem, só bot publica (malta inscreve via buttons)',
    };
  }
}

// Canais staff-only (command + supervisor + patrão di zona vêem).
// CH_CHEFIA_COMUN ("comunicados oficial") já está na categoria COMANDO que
// nega everyone, mas a categoria só permite command ver — oficiais/patrão
// também precisam. Pin explícito resolve.
function _applyStaffOnlyOverrides() {
  CHANNEL_PERM_OVERRIDES[DISCOVERED.CH_CHEFIA_COMUN] = PERMS_STAFF_ONLY;
}

// Canais informativos com write restrito a OG+ (command + supervisor).
// Patrão di zona consulta mas não altera (info central não é do domínio dele).
function _applyOgPlusWriteOverrides() {
  const ids = [
    DISCOVERED.CH_ROUPA,           // roupa — catálogo mantido por admin
    DISCOVERED.CH_RADIO_MOR,       // rádio bairristas — frequências definidas por admin
    DISCOVERED.CH_PRECOS_PARCERIA, // preços-parceria — tabela admin-only
  ];
  for (const id of ids) {
    if (id) CHANNEL_PERM_OVERRIDES[id] = PERMS_READONLY_OG_PLUS_WRITE;
  }
}

// Canais informativos pinados por ID (imunes a mismatches de nome):
// readonly_consult — bairristas vêem mas não escrevem.
function _applyReadonlyConsultOverrides() {
  const ids = [
    DISCOVERED.CH_INFO_GERAL,
    DISCOVERED.CH_REGRAS,
    DISCOVERED.CH_META_SEMANAL,
    DISCOVERED.CH_OFERTAS_ORG,
    DISCOVERED.CH_PREMIOS_SEMANAIS,
    DISCOVERED.CH_COR_ORG,
    DISCOVERED.CH_DIVULGACAO,
    DISCOVERED.CH_WOOD_COMUN,
    DISCOVERED.CH_TOP_SEMANAL,  // rankings — bot publica, todos consultam
  ];
  for (const id of ids) {
    if (id) CHANNEL_PERM_OVERRIDES[id] = PERMS_READONLY_BAIRRISTAS_VIEW;
  }
}

// ── Channel-specific overrides (por nome) ────────────────────────────────────
// Usado para os painéis do bot — protege que apenas o bot pode escrever.
// Nomes dos painéis NÃO são forçados pelo bot; o panelBootstrap lê do
// servidor por alternativas, e aqui aplicamos perms à QUE EXISTIR.
const _PANEL_WRITE_DENIES = ['SendMessages', 'AddReactions', 'CreatePublicThreads', 'CreatePrivateThreads', 'SendMessagesInThreads'];
const _BOT_PANEL_PERMS = ['ViewChannel', 'SendMessages', 'ManageMessages', 'ManageChannels', 'ReadMessageHistory', 'EmbedLinks', 'AddReactions'];

const PERMS_BOAS_VINDAS = {
  denyEveryone: ['ViewChannel', ..._PANEL_WRITE_DENIES],
  deny: [
    { roleSources: ['bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
  ],
  allow: [
    { roleSources: ['pendente'], perms: ['ViewChannel', 'ReadMessageHistory'] },
    { roleSources: ['command', 'supervisor', 'patrao_di_zona'], perms: ['ViewChannel', 'ReadMessageHistory'] },
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'boas-vindas — só Pendentes + staff',
};

// Painel público (painel-bairristas) — staff + bairristas vêem, só bot escreve.
// ViewChannel é explícito (não depende da categoria): garante que o painel
// funciona mesmo que o canal tenha sido movido entre categorias ou fique
// com overwrites stale que quebrem a inheritance da categoria GUETTO.
const PERMS_PAINEL_READ_ONLY = {
  denyEveryone: ['ViewChannel', ..._PANEL_WRITE_DENIES],
  allow: [
    { roleSources: ['command', 'supervisor', 'patrao_di_zona'], perms: ['ViewChannel', 'ReadMessageHistory'] },
    { roleSources: ['bairrista_tiers', 'bairristas_base'], perms: ['ViewChannel', 'ReadMessageHistory'] },
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'painel público — staff + bairristas vêem, só bot publica',
};

// Painel chefia — só comando vê, read-only excepto bot
const PERMS_PAINEL_CHEFIA = {
  denyEveryone: ['ViewChannel', ..._PANEL_WRITE_DENIES],
  deny: [
    { roleSources: ['supervisor', 'patrao_di_zona', 'bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
  ],
  allow: [
    { roleSources: ['command'], perms: ['ViewChannel', 'ReadMessageHistory'] },
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'painel-chefia — só comando vê',
};

// Painel oficiais — command + supervisor vêem, read-only excepto bot
const PERMS_PAINEL_OFICIAIS = {
  denyEveryone: ['ViewChannel', ..._PANEL_WRITE_DENIES],
  deny: [
    { roleSources: ['patrao_di_zona', 'bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
  ],
  allow: [
    { roleSources: ['command', 'supervisor'], perms: ['ViewChannel', 'ReadMessageHistory'] },
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'painel-oficiais — staff senior (command + supervisor)',
};

const PERMS_PAINEL_PATRAO_DI_ZONA = {
  denyEveryone: ['ViewChannel', ..._PANEL_WRITE_DENIES],
  deny: [
    { roleSources: ['bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
  ],
  allow: [
    { roleSources: ['command', 'supervisor', 'patrao_di_zona'], perms: ['ViewChannel', 'ReadMessageHistory'] },
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'painel-patrao-di-zona — staff + patrão di zona vêem',
};
// Legacy alias — ainda referenciado acima
const PERMS_PAINEL_CHEFE_MORADORES = PERMS_PAINEL_PATRAO_DI_ZONA;

// Staff-only (command + supervisor) — patrão e bairristas não vêem.
// Usado em canais de comunicação oficial entre chefia e oficiais (ex.:
// comunicados oficial). Patrão di zona gere bairristas, não é oficial —
// fora desse canal.
const PERMS_STAFF_ONLY = {
  denyEveryone: ['ViewChannel', 'Connect'],
  deny: [
    { roleSources: ['patrao_di_zona', 'bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
  ],
  allow: [
    { roleSources: ['command', 'supervisor'], perms: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles'] },
    { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles'] },
  ],
  reason: 'staff only — command + supervisor; patrão/bairristas fora',
};

// Privado patrão di zona — gestão de material/encomendas/bau/arquivos.
// APENAS command (chefia oversight) + patrão di zona. Supervisors (OG,
// Real Gangster) NÃO vêem — não é do domínio deles.
const PERMS_PATRAO_DI_ZONA_PRIVATE = {
  denyEveryone: ['ViewChannel', 'Connect'],
  deny: [
    { roleSources: ['supervisor', 'bairrista_tiers', 'bairristas_base', 'tropinhas', 'patrulha_pata'], perms: ['ViewChannel'] },
  ],
  allow: [
    { roleSources: ['command', 'patrao_di_zona'], perms: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles', 'ManageMessages'] },
    { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles'] },
  ],
  reason: 'privado patrão di zona — chefia + patrão only (oficiais não vêem)',
};

// Read-only consulta com write restrito a OG+ (command + supervisor).
// Usado em canais onde patrão di zona NÃO deve escrever (precários, roupa,
// rádio — info central mantida por admins). Bairristas e patrão consultam.
const PERMS_READONLY_OG_PLUS_WRITE = {
  denyEveryone: ['ViewChannel', ..._PANEL_WRITE_DENIES],
  allow: [
    { roleSources: ['command', 'supervisor'], perms: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles'] },
    { roleSources: ['patrao_di_zona', 'bairrista_tiers', 'bairristas_base'], perms: ['ViewChannel', 'ReadMessageHistory'] },
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'consulta — só OG+ (command + supervisor) escreve; todos consultam',
};

// ── Info institucional: SÓ chefia (command) escreve, todos consultam ──────
// Aplica-se a canais informativos/institucionais: regras, info-geral,
// divulgação, comunicados gerais, cor-org, meta-semanal, ofertas, prémios,
// rankings, tops. Nem oficiais nem patrão escrevem — esses são role-guards
// que lêem. "Os únicos que escrevem em todo o lado são kingpin e manda-chuva"
// — user.
const PERMS_READONLY_BAIRRISTAS_VIEW = {
  denyEveryone: ['ViewChannel', ..._PANEL_WRITE_DENIES],
  allow: [
    { roleSources: ['command'], perms: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles'] },
    { roleSources: ['supervisor', 'patrao_di_zona', 'bairrista_tiers', 'bairristas_base'], perms: ['ViewChannel', 'ReadMessageHistory'] },
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'institucional — só chefia (command) escreve; supervisor/patrão/bairristas consultam',
};

// Aceita tanto o nome formatado (`emoji・𝗻𝗼𝗺𝗲`) como nomes legacy
// (`emoji│nome`). Assim, seja qual for o que existe, as perms aplicam-se.
const _BOAS_VINDAS_NAMES = [
  ch('👋', 'boas-vindas'),
  '👋│boas-vindas',
  ch('📋', 'painel-entrada'),
  '📋│painel-entrada',
];
const _PAINEL_BAIRRISTAS_NAMES   = [ch('📋', 'painel-bairristas'), '📋│painel-bairristas',
                                    ch('📋', 'painel-moradores'),  '📋│painel-moradores']; // legacy
const _PAINEL_OFICIAIS_NAMES     = [ch('📋', 'painel-oficiais'),   '📋│painel-oficiais'];
const _PAINEL_CHEFIA_NAMES       = [ch('📋', 'painel-chefia'),     '📋│painel-chefia'];
const _PAINEL_PATRAO_DI_ZONA_NAMES = [ch('📋', 'painel-patrao-di-zona'), '📋│painel-patrao-di-zona',
                                      ch('📋', 'painel-chefe-moradores'), '📋│painel-chefe-moradores']; // legacy

const CHANNEL_PERM_OVERRIDES_BY_NAME = {};
for (const n of _BOAS_VINDAS_NAMES)            CHANNEL_PERM_OVERRIDES_BY_NAME[n] = PERMS_BOAS_VINDAS;
for (const n of _PAINEL_BAIRRISTAS_NAMES)      CHANNEL_PERM_OVERRIDES_BY_NAME[n] = PERMS_PAINEL_READ_ONLY;
for (const n of _PAINEL_OFICIAIS_NAMES)        CHANNEL_PERM_OVERRIDES_BY_NAME[n] = PERMS_PAINEL_OFICIAIS;
for (const n of _PAINEL_CHEFIA_NAMES)          CHANNEL_PERM_OVERRIDES_BY_NAME[n] = PERMS_PAINEL_CHEFIA;
for (const n of _PAINEL_PATRAO_DI_ZONA_NAMES)  CHANNEL_PERM_OVERRIDES_BY_NAME[n] = PERMS_PAINEL_CHEFE_MORADORES;

// ── Canais de consulta read-only (bairristas vêem, staff/bot escrevem) ──
// Respeita o naming real — nunca renomeia. Cobre formatos bold e legacy.
const _READONLY_CONSULT_NAMES = [
  // spots — canal de consulta de spots (OPERACOES). Bairristas consultam,
  // staff atribui/publica (incluindo patrão di zona).
  'spots', ch('🗺️', 'spots'), ch('📍', 'spots'), '🗺️│spots', '📍│spots',
  // mapas — imagens/layouts de spots (OPERACOES).
  'mapas', ch('🗺️', 'mapas'), '🗺️│mapas',
  // ranking / tops — canais de publicação de rankings (REPUTACAO).
  'ranking', ch('🏆', 'ranking'), ch('📊', 'ranking'),
  'tops-semanais', ch('🏆', 'tops-semanais'), ch('📊', 'tops-semanais'),
  // regras, info-geral — informativos read-only.
  'regras', ch('📜', 'regras'),
  'info-geral', ch('ℹ️', 'info-geral'),
  'meta-semanal', ch('📈', 'meta-semanal'),
  'ofertas-org', ch('💼', 'ofertas-org'),
  'premios-semanais', 'prémios-semanais', ch('🏅', 'premios-semanais'), ch('🏅', 'prémios-semanais'),
];
for (const n of _READONLY_CONSULT_NAMES) {
  CHANNEL_PERM_OVERRIDES_BY_NAME[n] = PERMS_READONLY_BAIRRISTAS_VIEW;
}

// Canais de consulta com write restrito a OG+ (não inclui patrão di zona).
// Precários, roupa, rádio — info central mantida por admins.
const _READONLY_OG_PLUS_NAMES = [
  'precarios', 'precários',
  ch('💰', 'precarios'), ch('💰', 'precários'),
  ch('📋', 'precarios'), ch('📋', 'precários'),
  'roupa', ch('👕', 'roupa'),
  'radio', 'rádio', ch('📻', 'radio'), ch('📻', 'rádio'),
];
for (const n of _READONLY_OG_PLUS_NAMES) {
  CHANNEL_PERM_OVERRIDES_BY_NAME[n] = PERMS_READONLY_OG_PLUS_WRITE;
}

// Aplicar overrides pinados por ID (forward-reference: PERMS_* declarados acima)
_applyPatraoDiZonaPrivateOverrides();
_applyStaffOnlyOverrides();
_applyOgPlusWriteOverrides();
_applyReadonlyConsultOverrides();
_applyInventoryLogOverrides();

// ── Categoria → perm config aplicado a TODOS os children (aggressive sweep) ─
// Usado pelo structureSync.runPermsOnly para forçar perms em todos os canais
// de categorias críticas, bypassando o lockPermissions de section 5 que salta
// canais com member-overwrites. Reserve para categorias onde NÃO deve existir
// qualquer canal com overwrites user-specific (OPERACOES = spots/mapas: só
// staff + bot publicam; INVENTARIO = bau/encomendas/material: staff + patrão).
const CATEGORY_CHILD_FORCE_PERMS = {
  INVENTARIO: PERMS_PATRAO_DI_ZONA_PRIVATE,     // bau/encomendas/arquivos — chefia + patrão di zona
  OPERACOES:  PERMS_READONLY_OG_PLUS_WRITE,     // spots/mapas — OG+ escreve, patrão/bairristas consultam
};

// ── Map panel key → permission config ────────────────────────────────────────
// Consumido pelo `runPermsOnly` (structureSync) — faz auto-discovery dos
// canais de painel (env var OU nome+categoria, espelha panelBootstrap) e
// aplica estas perms em runtime. Resolve o caso em que os
// `PANEL_*_CHANNEL_ID` não estão configurados no env e os nomes dos canais
// não batem com os matchers em `CHANNEL_PERM_OVERRIDES_BY_NAME`.
const PANEL_PERM_BY_KEY = {
  panel_entrada:        PERMS_BOAS_VINDAS,
  panel_bairristas:     PERMS_PAINEL_READ_ONLY,       // público no GUETTO, read-only
  panel_oficiais:       PERMS_PAINEL_OFICIAIS,        // command + supervisor, read-only
  panel_chefia:         PERMS_PAINEL_CHEFIA,          // só command, read-only
  panel_patrao_di_zona: PERMS_PAINEL_PATRAO_DI_ZONA,  // staff + patrão, read-only
};

module.exports = {
  bold,
  unbold,
  extractNicknameFromFormatted,
  TIER_EMOJI,
  TIER_LABEL,
  formatResidentChannelName,
  normalizeChannelNameToShort,
  DISCOVERED,
  CATEGORIES,
  CATEGORY_BY_KEY,
  CATEGORY_PERMS,
  CHANNEL_PERM_OVERRIDES,
  CHANNEL_PERM_OVERRIDES_BY_NAME,
  PANEL_PERM_BY_KEY,
  CATEGORY_CHILD_FORCE_PERMS,
  ROLE_GUILD_PERMS,
  ROLE_KEY_TO_ID_KEYS,
  rolesFor,
};
