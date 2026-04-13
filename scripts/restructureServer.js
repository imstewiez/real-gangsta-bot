'use strict';
require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

const MODE = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

// ══════════════════════════════════════════════════════════════════════════════
// ROLE IDs (from server inspection)
// ══════════════════════════════════════════════════════════════════════════════
const ROLES = {
  EVERYONE:          '1490397554372776096',
  MANDA_CHUVA:       '1490397675525242930',
  KINGPIN:           '1490397676204855308',
  OG:                '1490397683070930945',
  REAL_GANGSTER:     '1491223266487173311',
  PATRAO_DI_ZONA:    '1490397679753101312',
  GANGSTER_FODIDO:   '1491213170961022997',
  O_GUNAO:           '1491213423613317220',
  YOUNG_BLOOD:       '1491213753235275806',
  MORADORES:         '1490397684597653634',
  TROPINHAS:         '1490397688800477215',
  PATRULHA_PATA:     '1490795383448928276',
  BOT:               '1493165105242832919',
  CONFIGURADOR:      '1490397674543906938',
};

// Convenience groups
const CHEFIA_IDS  = [ROLES.MANDA_CHUVA, ROLES.KINGPIN];
const OFICIAL_IDS = [ROLES.OG, ROLES.REAL_GANGSTER];
const CHEFE_MOR   = [ROLES.PATRAO_DI_ZONA];
const MORADOR_IDS = [ROLES.MORADORES, ROLES.GANGSTER_FODIDO, ROLES.O_GUNAO, ROLES.YOUNG_BLOOD];
const ALL_ABOVE_MORADOR = [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR];

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY IDs (from server inspection)
// ══════════════════════════════════════════════════════════════════════════════
const CATS = {
  BEM_VINDO:       '1490397735558451250', // → ENTRADA
  CHEFIA:          '1490411180328489110', // → COMANDO
  CHEFIA_MOR:      '1490397738246869002', // → REPUTAÇÃO (repurpose)
  WOOD:            '1490397740612583575', // → ECONOMIA & TOPS (repurpose)
  OFICIAIS:        '1492729913944309890', // → OFICIAIS
  CALLS:           '1490397742797815978', // → CALLS
  PRECARIOS:       '1490397744324415499', // → ARSENAL
  MAPAS_SPOTS:     '1490397746966822922', // → OPERAÇÕES
  MORADIA:         '1491323110345936916', // → INVENTÁRIO (repurpose)
  MORADIA_TOPICOS: '1491543491233448006', // → GUETTO
  GERAL:           '1490397780450218074', // → GERAL
};

// ══════════════════════════════════════════════════════════════════════════════
// CHANNEL IDs (from server inspection)
// ══════════════════════════════════════════════════════════════════════════════
const CHS = {
  // BEM VINDO
  DIVULGACAO:       '1490397788981166262',
  ENTRADAS:         '1490397783268524215',
  TAGS:             '1490397785948688529',
  LOGS:             '1490397791426576668',
  LOGS_BOT:         '1492739363463758027',
  // CHEFIA
  CHEFIA_COMUN:     '1490411839354573004',
  CHEFIA_CHAT:      '1490411376768717012',
  PRECOS_PARCERIA:  '1492516926063116399',
  CHEFIA_VOZ:       '1490411630616383588',
  // CHEFIA MORADORES
  CHEFIA_MOR_CHAT:  '1490397793511280761',
  BAU_CASA:         '1490397795784593588',
  REG_ENCOMENDAS:   '1490397798745505972',
  MATERIAL_ENTREG:  '1491506821599330545',
  REUNIAO_VOZ:      '1490397953595146392',
  // WOOD
  REGRAS:           '1490397806106513478',
  WOOD_COMUN:       '1491194611543183430',
  INFO_GERAL:       '1490397836490309693',
  COR_ORG:          '1490397834048966890',
  META_SEMANAL:     '1490397816030236883',
  OFERTAS_ORG:      '1491541659853262979',
  PREMIOS_SEMANAIS: '1490397812872183889',
  CLIPS:            '1490397851065253978',
  SUGESTOES:        '1490397829838012466',
  CEMITERIO:        '1492344204012163122',
  // OFICIAIS
  CHAT_OFICIAIS:    '1490397801677590719',
  DISPONIBILIDADE:  '1490397821075984506',
  AUSENCIAS:        '1490397823894818896',
  RADIO_OFIC:       '1492736292838965369',
  COOLDOWN:         '1492736946072453190',
  RESULTADOS:       '1490397810489692292',
  BAU_OFIC:         '1492737820287303750',
  // CALLS
  REDWOOD:          '1490397963015426200',
  REDWOOD2:         '1490397959127564424',
  // PREÇÁRIOS
  AMMUNATION:       '1490397868383670422',
  ARMAS:            '1490397860968271952',
  CARREGADORES:     '1490397871604764773',
  DROGA:            '1490397864558460948',
  // MORADIA
  RADIO_MOR:        '1490397808531079449',
  ROUPA:            '1490773903344406558',
  CHAT_MOR:         '1491323137177030787',
  CONVIVIO_MOR:     '1491323285978480752',
  // GERAL
  CHAT_GERAL:       '1490397931352887328',
  CONVIVIO_GERAL:   '1491285497232883923',
};

// ══════════════════════════════════════════════════════════════════════════════
// RESTRUCTURING PLAN
// ══════════════════════════════════════════════════════════════════════════════

const plan = {
  categoryRenames: [
    { id: CATS.BEM_VINDO,       from: '・BEM VINDO・',                  to: '╭・𝗘𝗡𝗧𝗥𝗔𝗗𝗔',              pos: 0 },
    { id: CATS.CHEFIA,          from: '・CHEFIA ・',                    to: '╭・𝗖𝗢𝗠𝗔𝗡𝗗𝗢',              pos: 1 },
    { id: CATS.OFICIAIS,        from: '・OFICIAIS・',                   to: '╭・𝗢𝗙𝗜𝗖𝗜𝗔𝗜𝗦',             pos: 2 },
    { id: CATS.MORADIA_TOPICOS, from: '・🥉 Moradia  -  Tópicos🥉・',  to: '╭・𝗚𝗨𝗘𝗧𝗧𝗢',               pos: 3 },
    { id: CATS.MORADIA,         from: '・MORADIA・',                    to: '╭・𝗜𝗡𝗩𝗘𝗡𝗧𝗔\u0301𝗥𝗜𝗢',      pos: 4 },
    { id: CATS.PRECARIOS,       from: '・PREÇÁRIOS - OFICIAIS・',       to: '╭・𝗔𝗥𝗦𝗘𝗡𝗔𝗟',              pos: 5 },
    { id: CATS.MAPAS_SPOTS,     from: '・MAPAS SPOTS・',                to: '╭・𝗢𝗣𝗘𝗥𝗔𝗖\u0327𝗢\u0303𝗘𝗦', pos: 6 },
    { id: CATS.WOOD,            from: '・ WOOD・',                      to: '╭・𝗘𝗖𝗢𝗡𝗢𝗠𝗜𝗔 & 𝗧𝗢𝗣𝗦',     pos: 7 },
    { id: CATS.CHEFIA_MOR,      from: '・CHEFIA MORADORES・',           to: '╭・𝗥𝗘𝗣𝗨𝗧𝗔𝗖\u0327𝗔\u0303𝗢', pos: 8 },
    { id: CATS.CALLS,           from: '・CALLS・',                      to: '╭・𝗖𝗔𝗟𝗟𝗦',                pos: 9 },
    { id: CATS.GERAL,           from: '・GERA・',                       to: '╭・𝗚𝗘𝗥𝗔𝗟',                pos: 10 },
  ],

  channelMoves: [
    // logs + logs-bot → COMANDO
    { id: CHS.LOGS,             to: CATS.CHEFIA,          reason: 'Logs pertencem ao Comando, não à Entrada' },
    { id: CHS.LOGS_BOT,         to: CATS.CHEFIA,          reason: 'Logs do bot pertencem ao Comando' },
    // WOOD → ENTRADA (info channels)
    { id: CHS.REGRAS,           to: CATS.BEM_VINDO,       reason: 'Regras são conteúdo de entrada' },
    { id: CHS.INFO_GERAL,       to: CATS.BEM_VINDO,       reason: 'Informação geral é conteúdo de entrada' },
    { id: CHS.SUGESTOES,        to: CATS.BEM_VINDO,       reason: 'Sugestões acessíveis desde a entrada' },
    // WOOD → GERAL
    { id: CHS.WOOD_COMUN,       to: CATS.GERAL,           reason: 'Comunicados gerais do grupo vão para GERAL' },
    { id: CHS.COR_ORG,          to: CATS.GERAL,           reason: 'Cor da org é conteúdo geral' },
    // WOOD → REPUTAÇÃO (clips + cemitério)
    { id: CHS.CLIPS,            to: CATS.CHEFIA_MOR,      reason: 'Clips são reputação/prestígio' },
    { id: CHS.CEMITERIO,        to: CATS.CHEFIA_MOR,      reason: 'Cemitério (kills) é reputação' },
    // CHEFIA MORADORES → GUETTO
    { id: CHS.CHEFIA_MOR_CHAT,  to: CATS.MORADIA_TOPICOS, reason: 'Consolidar chefia-moradores no GUETTO' },
    { id: CHS.BAU_CASA,         to: CATS.MORADIA_TOPICOS, reason: 'Baú-casa é recurso dos moradores' },
    { id: CHS.REG_ENCOMENDAS,   to: CATS.MORADIA_TOPICOS, reason: 'Registo de encomendas é do GUETTO' },
    { id: CHS.MATERIAL_ENTREG,  to: CATS.MORADIA_TOPICOS, reason: 'Material entregue é core do GUETTO' },
    { id: CHS.REUNIAO_VOZ,      to: CATS.MORADIA_TOPICOS, reason: 'Call de reunião fica no GUETTO' },
    // MORADIA → GUETTO
    { id: CHS.RADIO_MOR,        to: CATS.MORADIA_TOPICOS, reason: 'Rádio moradores fica no GUETTO' },
    { id: CHS.ROUPA,            to: CATS.MORADIA_TOPICOS, reason: 'Roupa fica no GUETTO' },
    { id: CHS.CHAT_MOR,         to: CATS.MORADIA_TOPICOS, reason: 'Chat moradores fica no GUETTO' },
    { id: CHS.CONVIVIO_MOR,     to: CATS.MORADIA_TOPICOS, reason: 'Call convívio moradores fica no GUETTO' },
  ],

  channelRenames: [
    // ENTRADA
    { id: CHS.DIVULGACAO,       from: '📲┃divulgação',       to: '📢│divulgação' },
    { id: CHS.ENTRADAS,         from: '📥┃entradas',         to: '📥│entradas' },
    { id: CHS.TAGS,             from: '🎫┃tags',             to: '🏷️│tags' },
    { id: CHS.REGRAS,           from: '📜┃regras',           to: '📜│regras' },
    { id: CHS.INFO_GERAL,       from: '⚙️┃informação-geral', to: 'ℹ️│informação-geral' },
    { id: CHS.SUGESTOES,        from: '💡┃sugestões',        to: '💡│sugestões' },
    // COMANDO
    { id: CHS.CHEFIA_COMUN,     from: '📯┃comunicados',          to: '📢│comunicados' },
    { id: CHS.CHEFIA_CHAT,      from: '💬┃chefia',               to: '💬│chefia' },
    { id: CHS.PRECOS_PARCERIA,  from: '💰┃preços-parceria',      to: '💰│preços-parceria' },
    { id: CHS.LOGS,             from: '⬜┃logs',                  to: '📋│logs' },
    { id: CHS.LOGS_BOT,         from: '⬜┃logs-bot-atlantic',     to: '🤖│logs-bot' },
    // OFICIAIS
    { id: CHS.CHAT_OFICIAIS,    from: '💬┃chat-oficiais',    to: '💬│chat-oficiais' },
    { id: CHS.DISPONIBILIDADE,  from: '📓┃disponibilidade',  to: '📍│disponibilidade' },
    { id: CHS.AUSENCIAS,        from: '🕥┃ausencias',        to: '⏰│ausências' },
    { id: CHS.RADIO_OFIC,       from: '📻┃rádio',            to: '📻│rádio' },
    { id: CHS.COOLDOWN,         from: '📻┃cooldown',         to: '🧊│cooldown' },
    { id: CHS.RESULTADOS,       from: '📕┃resultados',       to: '📕│resultados' },
    { id: CHS.BAU_OFIC,         from: '💼┃baú',              to: '🧰│baú' },
    // GUETTO
    { id: CHS.CHEFIA_MOR_CHAT,  from: '💬┃chefia-moradores',     to: '💬│chefia-moradores' },
    { id: CHS.BAU_CASA,         from: '📓┃bau-casa',             to: '📦│baú-casa' },
    { id: CHS.REG_ENCOMENDAS,   from: '📋┃registo-encomendas',   to: '🧾│registo-encomendas' },
    { id: CHS.MATERIAL_ENTREG,  from: '🗳️┃material-entregue',   to: '📥│material-entregue' },
    { id: CHS.RADIO_MOR,        from: '📻┃rádio',                to: '📻│rádio' },
    { id: CHS.ROUPA,            from: '👕┃roupa',                to: '👕│roupa' },
    { id: CHS.CHAT_MOR,         from: '💬┃chat',                 to: '💬│chat' },
    // ARSENAL
    { id: CHS.AMMUNATION,       from: '🧰┃ammunation',      to: '💣│munições' },
    { id: CHS.ARMAS,            from: '🔫┃armas',            to: '🔫│armas' },
    { id: CHS.CARREGADORES,     from: '🧨┃carregadores',     to: '🧷│carregadores' },
    { id: CHS.DROGA,            from: '🌿┃droga',            to: '🌿│droga' },
    // ECONOMIA & TOPS
    { id: CHS.META_SEMANAL,     from: '📦┃meta-semanal',         to: '📈│meta-semanal' },
    { id: CHS.OFERTAS_ORG,      from: '📦┃ofertas-org',          to: '🤝│ofertas-org' },
    { id: CHS.PREMIOS_SEMANAIS, from: '🥇┃prémios-semanais',    to: '🎁│prémios-semanais' },
    // REPUTAÇÃO
    { id: CHS.CEMITERIO,        from: '🪦┃cemitério',        to: '☠️│cemitério' },
    { id: CHS.CLIPS,            from: '🎥┃clips',            to: '🎬│clips' },
    // GERAL
    { id: CHS.CHAT_GERAL,       from: '💬┃chat',             to: '💬│chat' },
    { id: CHS.WOOD_COMUN,       from: '📯┃comunicados',      to: '📢│comunicados' },
    { id: CHS.COR_ORG,          from: '🚗┃cor-org',          to: '🚗│cor-org' },
    // CALLS
    { id: CHS.REDWOOD,          from: '🌆┃redwood',          to: '🌆│redwood' },
    { id: CHS.REDWOOD2,         from: '🌆┃redwood2',         to: '🌆│redwood2' },
  ],

  channelsToCreate: [
    // INVENTÁRIO — canais novos
    { name: '📊│resumo-stock',     category: CATS.MORADIA, reason: 'Canal para o bot publicar resumos de stock' },
    { name: '💰│preços-materiais', category: CATS.MORADIA, reason: 'Referência de preços de materiais' },
  ],

  // Permissions for categories (applied on category level, synced to children)
  categoryPermissions: {
    // ENTRADA — visible to all members with any role
    [CATS.BEM_VINDO]: {
      deny_everyone: ['ViewChannel'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR, ...MORADOR_IDS, ROLES.TROPINHAS, ROLES.PATRULHA_PATA, ROLES.BOT], perms: ['ViewChannel'] },
      ],
    },
    // COMANDO — chefia only
    [CATS.CHEFIA]: {
      deny_everyone: ['ViewChannel', 'Connect'],
      allow: [
        { roles: CHEFIA_IDS, perms: ['ViewChannel', 'Connect', 'SendMessages'] },
        { roles: [ROLES.BOT], perms: ['ViewChannel', 'SendMessages'] },
      ],
    },
    // OFICIAIS — oficiais + chefia
    [CATS.OFICIAIS]: {
      deny_everyone: ['ViewChannel', 'Connect'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
        { roles: [ROLES.BOT], perms: ['ViewChannel', 'SendMessages'] },
      ],
    },
    // GUETTO — moradores + acima
    [CATS.MORADIA_TOPICOS]: {
      deny_everyone: ['ViewChannel', 'Connect'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR], perms: ['ViewChannel', 'Connect', 'SendMessages', 'ManageMessages'] },
        { roles: MORADOR_IDS, perms: ['ViewChannel', 'Connect', 'SendMessages'] },
        { roles: [ROLES.BOT], perms: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ManageMessages'] },
      ],
    },
    // INVENTÁRIO — chefia + chefe moradores + bot
    [CATS.MORADIA]: {
      deny_everyone: ['ViewChannel', 'Connect'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
        { roles: MORADOR_IDS, perms: ['ViewChannel'] },
        { roles: [ROLES.BOT], perms: ['ViewChannel', 'SendMessages'] },
      ],
    },
    // ARSENAL — oficiais + chefia + chefe moradores
    [CATS.PRECARIOS]: {
      deny_everyone: ['ViewChannel'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR], perms: ['ViewChannel', 'SendMessages'] },
        { roles: [ROLES.BOT], perms: ['ViewChannel'] },
      ],
    },
    // OPERAÇÕES — moradores + oficiais + chefia
    [CATS.MAPAS_SPOTS]: {
      deny_everyone: ['ViewChannel'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR], perms: ['ViewChannel', 'SendMessages'] },
        { roles: [ROLES.MORADORES], perms: ['ViewChannel'] },
        { roles: [ROLES.BOT], perms: ['ViewChannel'] },
      ],
    },
    // ECONOMIA & TOPS — all members
    [CATS.WOOD]: {
      deny_everyone: ['ViewChannel'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR], perms: ['ViewChannel', 'SendMessages'] },
        { roles: MORADOR_IDS, perms: ['ViewChannel'] },
        { roles: [ROLES.BOT], perms: ['ViewChannel', 'SendMessages'] },
      ],
    },
    // REPUTAÇÃO — all members
    [CATS.CHEFIA_MOR]: {
      deny_everyone: ['ViewChannel'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR, ...MORADOR_IDS], perms: ['ViewChannel', 'SendMessages'] },
        { roles: [ROLES.BOT], perms: ['ViewChannel'] },
      ],
    },
    // CALLS — oficiais + moradores + chefia
    [CATS.CALLS]: {
      deny_everyone: ['ViewChannel', 'Connect'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR], perms: ['ViewChannel', 'Connect'] },
        { roles: MORADOR_IDS, perms: ['ViewChannel', 'Connect'] },
      ],
    },
    // GERAL — all members
    [CATS.GERAL]: {
      deny_everyone: ['ViewChannel'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR, ...MORADOR_IDS], perms: ['ViewChannel', 'Connect', 'SendMessages'] },
        { roles: [ROLES.BOT], perms: ['ViewChannel', 'SendMessages'] },
      ],
    },
  },

  // Special: chefia-moradores channel must be private (only chefia + chefe moradores)
  channelPermissionOverrides: {
    [CHS.CHEFIA_MOR_CHAT]: {
      deny_everyone: ['ViewChannel'],
      allow: [
        { roles: [...CHEFIA_IDS, ...OFICIAL_IDS, ...CHEFE_MOR], perms: ['ViewChannel', 'SendMessages'] },
        { roles: [ROLES.BOT], perms: ['ViewChannel'] },
      ],
      reason: 'chefia-moradores é privado — só chefia + patrão di zona',
    },
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// EXECUTION ENGINE
// ══════════════════════════════════════════════════════════════════════════════

const actions = [];
let actionNum = 0;

function logAction(type, detail) {
  actionNum++;
  actions.push({ num: actionNum, type, detail });
  const emoji = {
    'RENAME_CAT': '🏷️ ',
    'MOVE_CAT_POS': '📐',
    'MOVE_CH': '📦',
    'RENAME_CH': '✏️ ',
    'CREATE_CH': '🆕',
    'PERM_CAT': '🔐',
    'PERM_CH': '🔐',
    'SKIP': '⏭️ ',
  }[type] || '  ';
  console.log(`  ${String(actionNum).padStart(3)}. ${emoji} [${type}] ${detail}`);
}

async function run() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  await client.login(token);

  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();
  await guild.roles.fetch();

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  REAL GANGSTA — Reestruturação do Servidor`);
  console.log(`  Modo: ${MODE.toUpperCase()}`);
  console.log(`  Guild: ${guild.name} (${guild.id})`);
  console.log(`${'═'.repeat(70)}\n`);

  // ── PHASE 1: Category renames + position ────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  FASE 1 — Renomear Categorias`);
  console.log(`${'─'.repeat(50)}`);

  for (const op of plan.categoryRenames) {
    const cat = guild.channels.cache.get(op.id);
    if (!cat) { logAction('SKIP', `Categoria ${op.id} não encontrada`); continue; }
    if (cat.name === op.to) { logAction('SKIP', `Categoria "${op.to}" já tem o nome correto`); continue; }
    logAction('RENAME_CAT', `"${cat.name}" → "${op.to}"`);
    if (MODE === 'apply') await cat.setName(op.to).catch(e => console.error(`  ERR: ${e.message}`));
  }

  // ── PHASE 2: Move channels ──────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  FASE 2 — Mover Canais`);
  console.log(`${'─'.repeat(50)}`);

  for (const op of plan.channelMoves) {
    const ch = guild.channels.cache.get(op.id);
    const targetCat = guild.channels.cache.get(op.to);
    if (!ch) { logAction('SKIP', `Canal ${op.id} não encontrado`); continue; }
    if (!targetCat) { logAction('SKIP', `Categoria destino ${op.to} não encontrada`); continue; }
    if (ch.parentId === op.to) { logAction('SKIP', `"${ch.name}" já está na categoria correta`); continue; }
    const fromCat = guild.channels.cache.get(ch.parentId);
    logAction('MOVE_CH', `"${ch.name}" — de "${fromCat?.name || '?'}" → "${targetCat.name}" (${op.reason})`);
    if (MODE === 'apply') await ch.setParent(op.to, { lockPermissions: false }).catch(e => console.error(`  ERR: ${e.message}`));
  }

  // ── PHASE 3: Rename channels ────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  FASE 3 — Renomear Canais`);
  console.log(`${'─'.repeat(50)}`);

  for (const op of plan.channelRenames) {
    const ch = guild.channels.cache.get(op.id);
    if (!ch) { logAction('SKIP', `Canal ${op.id} não encontrado`); continue; }
    if (ch.name === op.to) { logAction('SKIP', `"${op.to}" já tem o nome correto`); continue; }
    logAction('RENAME_CH', `"${ch.name}" → "${op.to}"`);
    if (MODE === 'apply') {
      await ch.setName(op.to).catch(e => console.error(`  ERR: ${e.message}`));
      await new Promise(r => setTimeout(r, 400)); // Rate limit safety
    }
  }

  // ── PHASE 4: Create new channels ───────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  FASE 4 — Criar Canais Novos`);
  console.log(`${'─'.repeat(50)}`);

  for (const op of plan.channelsToCreate) {
    const existingInCat = guild.channels.cache.find(c => c.parentId === op.category && c.name === op.name);
    if (existingInCat) { logAction('SKIP', `"${op.name}" já existe na categoria`); continue; }
    logAction('CREATE_CH', `"${op.name}" em cat ${op.category} (${op.reason})`);
    if (MODE === 'apply') {
      await guild.channels.create({ name: op.name, type: ChannelType.GuildText, parent: op.category }).catch(e => console.error(`  ERR: ${e.message}`));
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // ── PHASE 5: Category permissions ──────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  FASE 5 — Permissões de Categorias`);
  console.log(`${'─'.repeat(50)}`);

  for (const [catId, permConfig] of Object.entries(plan.categoryPermissions)) {
    const cat = guild.channels.cache.get(catId);
    if (!cat) continue;
    const catName = plan.categoryRenames.find(r => r.id === catId)?.to || cat.name;

    const overwrites = [];
    // @everyone deny
    if (permConfig.deny_everyone) {
      overwrites.push({
        id: ROLES.EVERYONE,
        deny: permConfig.deny_everyone.map(p => PermissionFlagsBits[p]),
      });
    }
    // Allow rules
    for (const rule of permConfig.allow) {
      for (const roleId of rule.roles) {
        const existing = overwrites.find(o => o.id === roleId);
        if (existing) {
          existing.allow = [...(existing.allow || []), ...rule.perms.map(p => PermissionFlagsBits[p])];
        } else {
          overwrites.push({ id: roleId, allow: rule.perms.map(p => PermissionFlagsBits[p]) });
        }
      }
    }

    logAction('PERM_CAT', `"${catName}" — ${overwrites.length} overwrites`);
    if (MODE === 'apply') {
      await cat.permissionOverwrites.set(overwrites).catch(e => console.error(`  ERR: ${e.message}`));
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // ── PHASE 6: Channel-specific permission overrides ─────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  FASE 6 — Permissões Específicas de Canais`);
  console.log(`${'─'.repeat(50)}`);

  for (const [chId, permConfig] of Object.entries(plan.channelPermissionOverrides)) {
    const ch = guild.channels.cache.get(chId);
    if (!ch) continue;

    const overwrites = [];
    if (permConfig.deny_everyone) {
      overwrites.push({ id: ROLES.EVERYONE, deny: permConfig.deny_everyone.map(p => PermissionFlagsBits[p]) });
    }
    for (const rule of permConfig.allow) {
      for (const roleId of rule.roles) {
        const existing = overwrites.find(o => o.id === roleId);
        if (existing) {
          existing.allow = [...(existing.allow || []), ...rule.perms.map(p => PermissionFlagsBits[p])];
        } else {
          overwrites.push({ id: roleId, allow: rule.perms.map(p => PermissionFlagsBits[p]) });
        }
      }
    }

    logAction('PERM_CH', `"${ch.name}" — ${permConfig.reason}`);
    if (MODE === 'apply') {
      await ch.permissionOverwrites.set(overwrites).catch(e => console.error(`  ERR: ${e.message}`));
    }
  }

  // ── PHASE 7: Category repositioning ────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  FASE 7 — Reordenar Categorias`);
  console.log(`${'─'.repeat(50)}`);

  const positionUpdates = plan.categoryRenames
    .filter(op => {
      const cat = guild.channels.cache.get(op.id);
      return cat && cat.position !== op.pos;
    })
    .map(op => ({ channel: op.id, position: op.pos }));

  if (positionUpdates.length) {
    for (const up of positionUpdates) {
      const cat = guild.channels.cache.get(up.channel);
      const newName = plan.categoryRenames.find(r => r.id === up.channel)?.to || cat?.name;
      logAction('MOVE_CAT_POS', `"${newName}" → posição ${up.position}`);
    }
    if (MODE === 'apply') {
      await guild.channels.setPositions(positionUpdates).catch(e => console.error(`  ERR setPositions: ${e.message}`));
    }
  } else {
    logAction('SKIP', 'Categorias já na posição correta');
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  RELATÓRIO FINAL`);
  console.log(`${'═'.repeat(70)}`);

  const counts = {};
  for (const a of actions) {
    counts[a.type] = (counts[a.type] || 0) + 1;
  }

  console.log(`\n  Total de ações: ${actions.length}`);
  for (const [type, count] of Object.entries(counts)) {
    console.log(`    ${type}: ${count}`);
  }

  console.log(`\n  Estrutura final pretendida:`);
  console.log(`    01. ╭・𝗘𝗡𝗧𝗥𝗔𝗗𝗔           — onboarding, regras, info`);
  console.log(`    02. ╭・𝗖𝗢𝗠𝗔𝗡𝗗𝗢           — chefia privada, logs`);
  console.log(`    03. ╭・𝗢𝗙𝗜𝗖𝗜𝗔𝗜𝗦          — núcleo operacional`);
  console.log(`    04. ╭・𝗚𝗨𝗘𝗧𝗧𝗢            — moradores + canais individuais`);
  console.log(`    05. ╭・𝗜𝗡𝗩𝗘𝗡𝗧𝗔́𝗥𝗜𝗢        — stock, preços`);
  console.log(`    06. ╭・𝗔𝗥𝗦𝗘𝗡𝗔𝗟           — armas, munições, droga`);
  console.log(`    07. ╭・𝗢𝗣𝗘𝗥𝗔𝗖̧𝗢̃𝗘𝗦         — spots, mapas`);
  console.log(`    08. ╭・𝗘𝗖𝗢𝗡𝗢𝗠𝗜𝗔 & 𝗧𝗢𝗣𝗦  — metas, prémios, ranking`);
  console.log(`    09. ╭・𝗥𝗘𝗣𝗨𝗧𝗔𝗖̧𝗔̃𝗢         — cemitério, clips`);
  console.log(`    10. ╭・𝗖𝗔𝗟𝗟𝗦             — calls de voz`);
  console.log(`    11. ╭・𝗚𝗘𝗥𝗔𝗟             — convívio transversal`);

  console.log(`\n  Nada foi apagado.`);
  console.log(`  Nenhum canal individual de morador foi tocado.`);
  console.log(`  Roles mantidas como estão.\n`);

  if (MODE === 'dry-run') {
    console.log(`  ⚠️  MODO DRY-RUN — nada foi alterado.`);
    console.log(`  Para aplicar, corre: node scripts/restructureServer.js --apply\n`);
  } else {
    console.log(`  ✅ MODO APPLY — alterações aplicadas.\n`);
  }

  client.destroy();
  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
