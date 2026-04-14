'use strict';
/**
 * Template declarativo da estrutura do servidor Real Gangsta.
 *
 * Fonte de verdade para o sync-structure. Dados apenas — sem chamadas à API.
 * IDs reais do servidor lidos via CONFIG (com fallback para valores conhecidos
 * em `scripts/restructureServer.js`). Podem ser sobrepostos via .env.
 */

const CONFIG = require('../config');

// ── Bold Unicode helper ───────────────────────────────────────────────────────
// Converte texto normal para math sans-serif bold, mantendo acentos via
// decomposição (letra base + combining diacritic) — espelha o estilo das
// categorias (`𝗖𝗔𝗧𝗘𝗚𝗢𝗥𝗜𝗔`, `𝗜𝗡𝗩𝗘𝗡𝗧𝗔\u0301𝗥𝗜𝗢`).
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

// Inverso de bold: math-bold → ASCII normal. Necessário para parsear nomes
// que já passaram pelo formatador e voltar a ter o nick original limpo.
const _UNBOLD = Object.fromEntries(Object.entries(_BOLD).map(([k, v]) => [v, k]));
function unbold(s) {
  return [...s].map(c => _UNBOLD[c] || c).join('').normalize('NFC');
}

/**
 * Se `channelName` parece já estar no formato `xxx・𝗧𝗶𝗲𝗿 - 𝗡𝗶𝗰𝗸`,
 * extrai e devolve o nick original (unbolded). Caso contrário devolve null.
 *
 * Garante idempotência do sync: se um canal já foi formatado anteriormente
 * (mesmo com emoji errado / tier errado), recuperamos sempre o nick base
 * em vez de re-aninhar `🍼・Young-Blood-🍼・Young-Blood-simão`.
 *
 * Cobre duas variantes:
 *   1. pré-sanitização: `emoji・𝗧𝗶𝗲𝗿 - 𝗡𝗶𝗰𝗸` (com espaços)
 *   2. pós-sanitização Discord: `emoji・𝗧𝗶𝗲𝗿-𝗡𝗶𝗰𝗸` (Discord converte espaços
 *      em hífens em text channels; a função strip'a prefixos de tier labels
 *      conhecidos).
 */
function extractNicknameFromFormatted(channelName) {
  if (!channelName) return null;

  let s = channelName;
  let changed = true;
  let iterations = 0;

  // Iterativo — strip repetido para lidar com nomes aninhados:
  //   `🍼・𝗬𝗼𝘂𝗻𝗴-𝗕𝗹𝗼𝗼𝗱-🍼・𝗬𝗼𝘂𝗻𝗴-𝗕𝗹𝗼𝗼𝗱-𝗲𝘅` → "ex"
  while (changed && iterations < 10) {
    changed = false;
    iterations++;

    // Variante 1 — separador " - " (nome não sanitizado).
    const lastDash = s.lastIndexOf(' - ');
    if (lastDash !== -1) {
      s = s.slice(lastDash + 3).trim();
      changed = true;
      continue;
    }

    // Variante 2 — `emoji・𝗧𝗶𝗲𝗿-...` (Discord sanitizou espaços para hífens).
    const dotIdx = s.indexOf('・');
    if (dotIdx !== -1 && dotIdx < 6) { // emoji ocupa 1-2 code units; 6 é folga
      const rest = s.slice(dotIdx + 1);
      for (const tierPrefix of _TIER_LABELS_FOR_EXTRACT) {
        if (rest.startsWith(tierPrefix)) {
          s = rest.slice(tierPrefix.length);
          changed = true;
          break;
        }
      }
    }
  }

  if (s === channelName) return null; // nada a extrair
  const result = unbold(s).trim();
  return result || null;
}

// ── Tier emoji + resident channel naming ─────────────────────────────────────
// Cada tier tem um emoji/sigla com sabor gangsta. Aplicado a canais
// individuais de moradores no GUETTO. Format final: `emoji・𝗧𝗶𝗲𝗿 - 𝗡𝗶𝗰𝗸`.
const TIER_EMOJI = {
  young_blood:     '🍼',  // Tag oficial Young Blood
  o_gunao:         '🔫',  // O gun
  gangster_fodido: '💀',  // Topo da hierarquia morador
  patrao_di_zona:  '👑',  // Patrão da zona (não tem canal individual, mas reservado)
  real_gangster:   '🥷',  // Stealth/elite
  og:              '🏆',  // OG status
  kingpin:         '💎',  // Pino-rei
  manda_chuva:     '🐉',  // O dragão, lenda
};
const TIER_LABEL = {
  young_blood:     'Young Blood',
  o_gunao:         'O Gunão',
  gangster_fodido: 'Gangster Fodido',
  patrao_di_zona:  'Patrão di Zona',
  real_gangster:   'Real Gangster',
  og:              'OG',
  kingpin:         'Kingpin',
  manda_chuva:     'Manda-Chuva',
};

// Pré-calcula prefixos sanitizados (espaços→hífens) dos tier labels bolded,
// ordenados do mais longo ao mais curto para o startsWith casar o correcto.
// Usado por extractNicknameFromFormatted para nomes já sanitizados pelo Discord.
const _TIER_LABELS_FOR_EXTRACT = Object.values(TIER_LABEL)
  .map(l => bold(l).replace(/ /g, '-') + '-') // 𝗬𝗼𝘂𝗻𝗴-𝗕𝗹𝗼𝗼𝗱-
  .sort((a, b) => b.length - a.length);

function formatResidentChannelName(tier, nickname) {
  const emoji = TIER_EMOJI[tier] || TIER_EMOJI.young_blood;
  const label = TIER_LABEL[tier] || 'Morador';
  const safeNick = (nickname || '').trim() || 'sem-nome';
  // Discord channel name limit = 100 chars. Trunca o nick se necessário.
  const maxNickChars = 30;
  const truncatedNick = safeNick.length > maxNickChars ? `${safeNick.slice(0, maxNickChars)}…` : safeNick;
  return `${emoji}・${bold(label)} - ${bold(truncatedNick)}`;
}

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

// ── Channel renames (format: emoji・𝗻𝗼𝗺𝗲) ─────────────────────────────────
const CHANNEL_RENAMES = [
  // ENTRADA
  { id: DISCOVERED.CH_DIVULGACAO,       to: ch('📢', 'divulgação') },
  { id: DISCOVERED.CH_ENTRADAS,         to: ch('📥', 'entradas') },
  { id: DISCOVERED.CH_TAGS,             to: ch('🏷️', 'pedido-de-tags') },
  { id: DISCOVERED.CH_REGRAS,           to: ch('📜', 'regras') },
  { id: DISCOVERED.CH_INFO_GERAL,       to: ch('ℹ️', 'informação-geral') },
  { id: DISCOVERED.CH_SUGESTOES,        to: ch('💡', 'sugestões') },
  // COMANDO
  { id: DISCOVERED.CH_CHEFIA_COMUN,     to: ch('📢', 'comunicados') },
  { id: DISCOVERED.CH_CHEFIA_CHAT,      to: ch('💬', 'chefia') },
  { id: DISCOVERED.CH_PRECOS_PARCERIA,  to: ch('💰', 'preços-parceria') },
  { id: DISCOVERED.CH_LOGS,             to: ch('📋', 'logs') },
  { id: DISCOVERED.CH_LOGS_BOT,         to: ch('🤖', 'logs-bot') },
  // OFICIAIS
  { id: DISCOVERED.CH_CHAT_OFICIAIS,    to: ch('💬', 'chat-oficiais') },
  { id: DISCOVERED.CH_DISPONIBILIDADE,  to: ch('📍', 'disponibilidade') },
  { id: DISCOVERED.CH_AUSENCIAS,        to: ch('⏰', 'ausências') },
  { id: DISCOVERED.CH_RADIO_OFIC,       to: ch('📻', 'rádio') },
  { id: DISCOVERED.CH_COOLDOWN,         to: ch('🧊', 'cooldown') },
  { id: DISCOVERED.CH_RESULTADOS,       to: ch('📕', 'resultados') },
  { id: DISCOVERED.CH_BAU_OFIC,         to: ch('🧰', 'baú') },
  // GUETTO
  { id: DISCOVERED.CH_CHEFIA_MOR_CHAT,  to: ch('💬', 'chefia-moradores') },
  { id: DISCOVERED.CH_BAU_CASA,         to: ch('📦', 'baú-casa') },
  { id: DISCOVERED.CH_REG_ENCOMENDAS,   to: ch('🧾', 'registo-encomendas') },
  { id: DISCOVERED.CH_MATERIAL_ENTREG,  to: ch('📥', 'material-entregue') },
  { id: DISCOVERED.CH_RADIO_MOR,        to: ch('📻', 'rádio-moradores') },
  { id: DISCOVERED.CH_ROUPA,            to: ch('👕', 'roupa') },
  { id: DISCOVERED.CH_CHAT_MOR,         to: ch('💬', 'chat-moradores') },
  // ARSENAL
  { id: DISCOVERED.CH_AMMUNATION,       to: ch('💣', 'munições') },
  { id: DISCOVERED.CH_ARMAS,            to: ch('🔫', 'armas') },
  { id: DISCOVERED.CH_CARREGADORES,     to: ch('🧷', 'carregadores') },
  { id: DISCOVERED.CH_DROGA,            to: ch('🌿', 'droga') },
  // ECONOMIA
  { id: DISCOVERED.CH_META_SEMANAL,     to: ch('📈', 'meta-semanal') },
  { id: DISCOVERED.CH_OFERTAS_ORG,      to: ch('🤝', 'ofertas-org') },
  { id: DISCOVERED.CH_PREMIOS_SEMANAIS, to: ch('🎁', 'prémios-semanais') },
  // REPUTAÇÃO
  { id: DISCOVERED.CH_CEMITERIO,        to: ch('☠️', 'cemitério') },
  { id: DISCOVERED.CH_CLIPS,            to: ch('🎬', 'clips') },
  // GERAL
  { id: DISCOVERED.CH_CHAT_GERAL,       to: ch('💬', 'chat') },
  { id: DISCOVERED.CH_WOOD_COMUN,       to: ch('📢', 'comunicados') },
  { id: DISCOVERED.CH_COR_ORG,          to: ch('🚗', 'cor-org') },
  // ── Voice channels ────────────────────────────────────────────────────
  { id: DISCOVERED.CH_CHEFIA_VOZ,       to: ch('🔊', 'voz-chefia') },          // COMANDO
  { id: DISCOVERED.CH_REUNIAO_VOZ,      to: ch('🔊', 'reunião') },             // GUETTO
  { id: DISCOVERED.CH_CONVIVIO_MOR,     to: ch('🔊', 'convívio-moradores') }, // GUETTO
  { id: DISCOVERED.CH_REDWOOD,          to: ch('🌲', 'redwood') },             // CALLS
  { id: DISCOVERED.CH_REDWOOD2,         to: ch('🌲', 'redwood-2') },           // CALLS
  { id: DISCOVERED.CH_CONVIVIO_GERAL,   to: ch('🔊', 'convívio-geral') },     // GERAL
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

// ── Channels to create ────────────────────────────────────────────────────────
// `renameFrom` permite que um sync anterior (que criou com nome antigo) seja
// convergido ao novo nome em vez de duplicar o canal.
// Text channels no Discord convertem espaços em `-` server-side, o que
// partia o match exacto no sync (Phase 4 create + Phase 6b perms by name) e
// deixava o separador visual com um hífen no meio do título.
const SEPARATOR_NAME = `━━━━・${bold('Tópicos')}・${bold('Moradores')}・━━━━`;
const SEPARATOR_LEGACY_NAMES = [
  `━━━━・${bold('Tópicos')}-${bold('Moradores')}・━━━━`, // espaço → hífen via sanitização Discord
  `━━━━・${bold('Tópicos Moradores')}・━━━━`,            // pré-sanitização (cache antes de refetch)
];

const CHANNELS_TO_CREATE = [
  // Inventário — canais novos para publicação automática
  // Canais de stock — vivem em COMANDO (só staff vê). O stockNotifier também
  // move canais com este nome de outras categorias para cá automaticamente.
  { name: ch('📊', 'resumo-stock'),         categoryKey: 'COMANDO', renameFrom: ['📊│resumo-stock'],         reason: 'Canal para resumos automáticos de stock (staff-only)' },
  { name: ch('📥', 'entradas-stock'),       categoryKey: 'COMANDO', renameFrom: ['📥│entradas-stock'],       reason: 'Movimentos de entrada de stock (staff-only)' },
  { name: ch('📤', 'saídas-stock'),         categoryKey: 'COMANDO', renameFrom: ['📤│saídas-stock'],         reason: 'Movimentos de saída de stock (staff-only)' },
  { name: ch('🧾', 'ajustes-stock'),        categoryKey: 'COMANDO', renameFrom: ['🧾│ajustes-stock'],        reason: 'Ajustes manuais de stock (staff-only)' },
  // Operações — canais
  { name: ch('🗺️', 'mapas-spots'),         categoryKey: 'OPERACOES',  renameFrom: ['🗺️│mapas-spots'],         reason: 'Mapas e spots de saídas' },
  { name: ch('🎯', 'spots'),                categoryKey: 'OPERACOES',  renameFrom: ['🎯│spots'],                reason: 'Lista de spots disponíveis' },
  { name: ch('📋', 'planeamento'),          categoryKey: 'OPERACOES',  renameFrom: ['📋│planeamento'],          reason: 'Planeamento de operações' },
  { name: ch('📊', 'resultados-operações'), categoryKey: 'OPERACOES',  renameFrom: ['📊│resultados-operações'], reason: 'Resultados publicados pelo bot' },
  // Economia
  { name: ch('🏆', 'tops-semanais'),        categoryKey: 'ECONOMIA',   renameFrom: ['🏆│tops-semanais'],        reason: 'Tops semanais auto-publicados' },
  // GUETTO — separador visual antes dos canais individuais dos moradores
  { name: SEPARATOR_NAME, categoryKey: 'GUETTO', position: 7, renameFrom: SEPARATOR_LEGACY_NAMES, reason: 'Separador visual — Tópicos Moradores' },
  // Painéis dedicados — 1 canal por painel, read-only (só bot posta).
  // Perm override específico por canal aplicado em CHANNEL_PERM_OVERRIDES_BY_NAME.
  { name: ch('👋', 'boas-vindas'),             categoryKey: 'ENTRADA',  renameFrom: [ch('📋', 'painel-entrada'), '👋│boas-vindas', '📋│painel-entrada'], reason: 'Boas-vindas (Pedir Tag) — visível a toda a gente' },
  { name: ch('📋', 'painel-moradores'),        categoryKey: 'GUETTO',   renameFrom: ['📋│painel-moradores'], reason: 'Painel Morador (registar material/histórico/totais) — só bot posta' },
  { name: ch('📋', 'painel-oficiais'),         categoryKey: 'OFICIAIS', renameFrom: ['📋│painel-oficiais'], reason: 'Painel Oficial — só bot posta' },
  { name: ch('📋', 'painel-chefia'),           categoryKey: 'COMANDO',  renameFrom: ['📋│painel-chefia'], reason: 'Painel Chefia (centro de comando) — só bot posta' },
  { name: ch('📋', 'painel-chefe-moradores'),  categoryKey: 'GUETTO',   renameFrom: ['📋│painel-chefe-moradores'], reason: 'Painel Patrão di Zona — só bot posta, moradores NÃO vêem' },
];

// ── Role groups ───────────────────────────────────────────────────────────────
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

// ── Category permissions ──────────────────────────────────────────────────────
// Moradores (tiers + base) estão em lockdown: só veem ENTRADA, GUETTO, REPUTAÇÃO,
// GERAL. Tudo o resto (INVENTÁRIO, ARSENAL, OPERAÇÕES, ECONOMIA, CALLS,
// OFICIAIS, COMANDO) é staff-only.
const CATEGORY_PERMS = {
  ENTRADA: {
    // @everyone vê (newcomers chegam aqui). Moradores — assim que aprovados —
    // perdem acesso (deny explícito). Staff mantém acesso para aprovar pedidos.
    allowEveryone: ['ViewChannel'],
    deny: [
      { roleSources: ['morador_tiers', 'moradores_base'], perms: ['ViewChannel'] },
    ],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'ReadMessageHistory'] },
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
      { roleSources: ['bot'], perms: ['ViewChannel'] },
    ],
  },
  ECONOMIA: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
  REPUTACAO: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['morador_tiers', 'moradores_base'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
  },
  CALLS: {
    denyEveryone: ['ViewChannel', 'Connect'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'Connect'] },
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

// ── Channel-specific overrides (por ID) ──────────────────────────────────────
// Aplicados DEPOIS dos da categoria — restringem ainda mais o acesso ou
// excepcionam canais sensíveis dentro de categorias abertas.
const CHANNEL_PERM_OVERRIDES = {
  // GUETTO: chefia-moradores é privado — moradores não vêem
  [DISCOVERED.CH_CHEFIA_MOR_CHAT]: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel'] },
    ],
    reason: 'chefia-moradores é privado — só chefia + patrão di zona',
  },
  // ENTRADA: tags é workflow de aprovação — moradores não vêem
  [DISCOVERED.CH_TAGS]: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
    reason: 'tags — staff only para aprovações de onboarding',
  },
  // ENTRADA: entradas é canal de auditoria — staff only
  [DISCOVERED.CH_ENTRADAS]: {
    denyEveryone: ['ViewChannel'],
    allow: [
      { roleSources: ['command', 'supervisor'], perms: ['ViewChannel'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
    reason: 'entradas — auditoria staff only',
  },
  // REPUTACAO: cemitério — moradores só vêem; posts vindos do bot (/rg-kill)
  [DISCOVERED.CH_CEMITERIO]: {
    denyEveryone: ['ViewChannel', 'SendMessages'],
    allow: [
      { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'SendMessages'] },
      { roleSources: ['morador_tiers', 'moradores_base'], perms: ['ViewChannel'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
    reason: 'Cemitério — moradores só vêem; staff e bot postam kills',
  },
};

// ── Channel-specific overrides (por nome) ────────────────────────────────────
// Usado para canais criados dinamicamente (ex.: o separador do GUETTO) cujo
// ID só é conhecido após o primeiro sync. Sync resolve por nome.
// Denies base aplicados em todos os painéis (ninguém, excepto bot, escreve).
const _PANEL_WRITE_DENIES = ['SendMessages', 'AddReactions', 'CreatePublicThreads', 'CreatePrivateThreads', 'SendMessagesInThreads'];
const _BOT_PANEL_PERMS = ['ViewChannel', 'SendMessages', 'ManageMessages', 'ManageChannels', 'ReadMessageHistory', 'EmbedLinks', 'AddReactions'];

// boas-vindas: visível só a newcomers (sem role) e staff (aprovadores).
// Moradores NÃO vêem — assim que são aprovados e recebem role, o canal
// desaparece da sidebar deles.
const PERMS_BOAS_VINDAS = {
  denyEveryone: _PANEL_WRITE_DENIES,
  allowEveryone: ['ViewChannel'],
  deny: [
    { roleSources: ['morador_tiers', 'moradores_base'], perms: ['ViewChannel'] },
  ],
  allow: [
    { roleSources: ['command', 'supervisor', 'chefe_moradores'], perms: ['ViewChannel', 'ReadMessageHistory'] },
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'boas-vindas — só newcomers (@everyone) + staff. Moradores bloqueados.',
};

// painel-moradores: herda ViewChannel da categoria GUETTO (mor+base+staff vêem).
// Ninguém escreve excepto bot.
const PERMS_PAINEL_MORADORES = {
  denyEveryone: _PANEL_WRITE_DENIES,
  allow: [
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'painel-moradores — moradores+staff vêem (via categoria), só bot publica',
};

// painel-oficiais: herda da categoria OFICIAIS (command+supervisor). Bot posta.
const PERMS_PAINEL_OFICIAIS = {
  denyEveryone: _PANEL_WRITE_DENIES,
  allow: [
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'painel-oficiais — herda OFICIAIS (supervisor+command), só bot publica',
};

// painel-chefia: herda da categoria COMANDO (command apenas). Bot posta.
const PERMS_PAINEL_CHEFIA = {
  denyEveryone: _PANEL_WRITE_DENIES,
  allow: [
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'painel-chefia — herda COMANDO (command apenas), só bot publica',
};

// painel-chefe-moradores: em GUETTO, mas NÃO queremos que moradores vejam.
// → deny explícito de ViewChannel para morador_tiers + moradores_base.
// Staff (chefe_mor + supervisor + command) mantém view via category.
const PERMS_PAINEL_CHEFE_MORADORES = {
  denyEveryone: _PANEL_WRITE_DENIES,
  deny: [
    { roleSources: ['morador_tiers', 'moradores_base'], perms: ['ViewChannel'] },
  ],
  allow: [
    { roleSources: ['bot'], perms: _BOT_PANEL_PERMS },
  ],
  reason: 'painel-chefe-moradores — staff only (moradores bloqueados)',
};

const CHANNEL_PERM_OVERRIDES_BY_NAME = {
  [SEPARATOR_NAME]: {
    denyEveryone: _PANEL_WRITE_DENIES,
    allow: [
      { roleSources: ['command'], perms: ['SendMessages'] },
      { roleSources: ['bot'], perms: ['ViewChannel', 'SendMessages'] },
    ],
    reason: 'Separador visual — read-only (só staff top pode postar)',
  },
  // Nome novo dos painéis
  [ch('👋', 'boas-vindas')]:            PERMS_BOAS_VINDAS,
  [ch('📋', 'painel-moradores')]:       PERMS_PAINEL_MORADORES,
  [ch('📋', 'painel-oficiais')]:        PERMS_PAINEL_OFICIAIS,
  [ch('📋', 'painel-chefia')]:          PERMS_PAINEL_CHEFIA,
  [ch('📋', 'painel-chefe-moradores')]: PERMS_PAINEL_CHEFE_MORADORES,
  // Nome antigo — aplica os mesmos perms até o canal ser renomeado
  [ch('📋', 'painel-entrada')]:         PERMS_BOAS_VINDAS,
};

module.exports = {
  bold,
  unbold,
  extractNicknameFromFormatted,
  TIER_EMOJI,
  TIER_LABEL,
  formatResidentChannelName,
  SEPARATOR_NAME,
  DISCOVERED,
  CATEGORIES,
  CATEGORY_BY_KEY,
  CHANNEL_RENAMES,
  CHANNEL_MOVES,
  CHANNELS_TO_CREATE,
  CATEGORY_PERMS,
  CHANNEL_PERM_OVERRIDES,
  CHANNEL_PERM_OVERRIDES_BY_NAME,
  rolesFor,
};
