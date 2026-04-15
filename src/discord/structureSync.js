'use strict';
/**
 * Discord Structure Sync — engine idempotente com modos dry-run e apply.
 *
 * Garante que o servidor converge para o template definido em
 * `structureTemplate.js`. Nunca apaga canais, categorias, roles ou calls.
 *
 * Operações suportadas:
 *   - renomear categorias e canais
 *   - mover canais entre categorias
 *   - criar canais em falta
 *   - reordenar posições das categorias
 *   - aplicar overwrites de permissão nas categorias
 *   - aplicar overrides específicos em canais
 *
 * Qualquer canal/categoria fora do template é listado no relatório mas
 * nunca tocado.
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const {
  CATEGORIES,
  CATEGORY_BY_KEY,
  CHANNEL_RENAMES,
  CHANNEL_MOVES,
  CHANNELS_TO_CREATE,
  CATEGORY_PERMS,
  CHANNEL_PERM_OVERRIDES,
  CHANNEL_PERM_OVERRIDES_BY_NAME,
  ROLE_DISPLAY_NAMES,
  ROLE_GUILD_PERMS,
  ROLE_KEY_TO_ID_KEYS,
  formatResidentChannelName,
  extractNicknameFromFormatted,
  bold,
  rolesFor,
  DISCOVERED,
} = require('./structureTemplate');
const { query } = require('../db');

const EVERYONE = '@everyone'; // resolvido via guild.roles.everyone.id

function permBits(names = []) {
  return names.map(n => PermissionFlagsBits[n]).filter(Boolean);
}

function buildOverwrites(guild, permConfig) {
  const overwrites = [];
  const everyoneId = guild.roles.everyone.id;

  // @everyone: deny E allow podem coexistir (ex.: boas-vindas permite View mas
  // nega SendMessages).
  if (permConfig.denyEveryone || permConfig.allowEveryone) {
    overwrites.push({
      id: everyoneId,
      deny: permBits(permConfig.denyEveryone || []),
      allow: permBits(permConfig.allowEveryone || []),
    });
  }

  // Denies específicos por role (útil para tirar ViewChannel a moradores em
  // canais que a categoria partilha com eles — ex.: painel-chefe-moradores
  // em GUETTO).
  for (const rule of permConfig.deny || []) {
    const roleIds = new Set();
    for (const src of rule.roleSources) {
      for (const id of rolesFor(src)) roleIds.add(id);
    }
    for (const roleId of roleIds) {
      const existing = overwrites.find(o => o.id === roleId);
      if (existing) {
        existing.deny = [...(existing.deny || []), ...permBits(rule.perms)];
      } else {
        overwrites.push({ id: roleId, deny: permBits(rule.perms) });
      }
    }
  }

  // Allows por role.
  for (const rule of permConfig.allow || []) {
    const roleIds = new Set();
    for (const src of rule.roleSources) {
      for (const id of rolesFor(src)) roleIds.add(id);
    }
    for (const roleId of roleIds) {
      const existing = overwrites.find(o => o.id === roleId);
      if (existing) {
        existing.allow = [...(existing.allow || []), ...permBits(rule.perms)];
      } else {
        overwrites.push({ id: roleId, allow: permBits(rule.perms) });
      }
    }
  }
  return overwrites;
}

/**
 * Corre o sync.
 * @param guild {Guild}
 * @param opts {{ apply?: boolean }}
 * @returns {Promise<SyncReport>}
 */
/**
 * Corre APENAS perms + renames seguros dos painéis (não toca em categorias,
 * moves, ou canais fora da lista conhecida de painéis). Para uso com
 * STRUCTURE_SYNC_LOCKED=true ou quando o utilizador não quer correr o sync
 * completo e quer apenas apertar permissões.
 */
async function runPermsOnly(guild, opts = {}) {
  const apply = Boolean(opts.apply);
  const report = { mode: apply ? 'apply' : 'dry-run', actions: [], errors: [], counts: {} };
  function act(type, detail) { report.actions.push({ type, detail }); report.counts[type] = (report.counts[type] || 0) + 1; }
  function errored(stage, e) { report.errors.push({ stage, message: e?.message || String(e) }); warn(`[PERMS-SYNC] ${stage}: ${e?.message || e}`); }

  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  // ── DIAG (dry-run only): estado actual do @everyone ViewChannel em cada
  //    canal da nossa lista de overrides + categorias. Dá visibilidade directa
  //    de quem consegue ver o quê, evita debug por tentativa-erro.
  if (!apply) {
    try {
      const everyoneId = guild.roles.everyone.id;
      const viewBit = PermissionFlagsBits.ViewChannel;

      for (const [key] of Object.entries(CATEGORY_PERMS)) {
        const tpl = CATEGORY_BY_KEY[key];
        if (!tpl || !tpl.id) continue;
        const cat = guild.channels.cache.get(tpl.id);
        if (!cat) continue;
        const ow = cat.permissionOverwrites.cache.get(everyoneId);
        const allow = ow?.allow.has(viewBit) || false;
        const deny = ow?.deny.has(viewBit) || false;
        act('DIAG_CAT_VIEW', { key, everyone: allow ? 'ALLOW' : deny ? 'DENY' : 'NEUTRAL' });
      }

      for (const chName of Object.keys(CHANNEL_PERM_OVERRIDES_BY_NAME || {})) {
        const ch = guild.channels.cache.find(c => c.name === chName);
        if (!ch) continue;
        const ow = ch.permissionOverwrites.cache.get(everyoneId);
        const allow = ow?.allow.has(viewBit) || false;
        const deny = ow?.deny.has(viewBit) || false;
        const allOwCount = ch.permissionOverwrites.cache.size;
        act('DIAG_CH_VIEW', { channel: ch.name, everyone: allow ? 'ALLOW' : deny ? 'DENY' : 'NEUTRAL', overwrites: allOwCount });
      }
    } catch (e) {
      warn(`[PERMS-SYNC] diag falhou: ${e.message}`);
    }
  }

  // ── ROLE 0 (dry-run only): Audit log lookup — mostra nomes históricos
  //    que o bot renomeou. Ajuda a recuperar emojis que existiam antes do
  //    rename e que agora não temos. Idempotente, apenas lê.
  if (!apply) {
    try {
      const { AuditLogEvent } = require('discord.js');
      const ourBotId = guild.members.me?.id || guild.client.user.id;
      const earliest = new Map(); // roleId → { old, new, ts }
      let before;
      for (let page = 0; page < 15; page++) {
        const r = await guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 100, before }).catch(() => null);
        if (!r || !r.entries.size) break;
        for (const e of r.entries.values()) {
          if (e.executor?.id !== ourBotId) continue;
          for (const ch of e.changes || []) {
            if (ch.key !== 'name') continue;
            const prev = earliest.get(e.targetId);
            if (!prev || e.createdTimestamp < prev.ts) {
              earliest.set(e.targetId, { old: ch.old, new: ch.new, ts: e.createdTimestamp });
            }
          }
        }
        before = [...r.entries.values()].pop()?.id;
        if (r.entries.size < 100) break;
      }
      for (const [roleId, info] of earliest) {
        act('ROLE_AUDIT_HISTORY', { roleId, oldName: info.old, currentName: info.new });
      }
    } catch (e) {
      warn(`[PERMS-SYNC] audit lookup falhou: ${e.message}`);
    }
  }

  // ── ROLE 1: Ensure Pendente exists (cria se faltar) ────────────────────
  if (!CONFIG.PENDENTE_ROLE_ID) {
    // Tenta encontrar role existente por nome (cria se não existir)
    const expectedName = ROLE_DISPLAY_NAMES.PENDENTE_ROLE_ID;
    let pendente = guild.roles.cache.find(r => r.name === expectedName || r.name.toLowerCase().includes('pendente'));
    if (!pendente) {
      if (apply) {
        try {
          pendente = await guild.roles.create({
            name: expectedName,
            color: 0x95A5A6,
            hoist: true,
            mentionable: false,
            permissions: [],
            reason: 'Bot di Zona — criação automática do role Pendente',
          });
          act('CREATE_ROLE', { name: expectedName, id: pendente.id });
        } catch (e) { errored('CREATE_ROLE:Pendente', e); }
      } else {
        act('CREATE_ROLE', { name: expectedName, dry: true });
      }
    } else {
      act('FOUND_EXISTING_ROLE', { name: pendente.name, id: pendente.id });
    }
    // Mutação runtime — as fases seguintes passam a resolver Pendente.
    if (pendente) CONFIG.PENDENTE_ROLE_ID = pendente.id;
  }

  // ── ROLE 2: Apply guild-level permissions a cada role do template ──────
  for (const [roleKey, idKeys] of Object.entries(ROLE_KEY_TO_ID_KEYS)) {
    const permsList = ROLE_GUILD_PERMS[roleKey];
    if (!permsList) continue;
    const bits = permBits(permsList);
    for (const idKey of idKeys) {
      const roleId = CONFIG[idKey];
      if (!roleId) continue;
      const role = guild.roles.cache.get(roleId);
      if (!role) { act('SKIP_ROLE_PERMS_MISSING', { idKey, roleId }); continue; }
      // Usa bitfield para comparar — evita setPermissions redundante.
      const currentBits = role.permissions.bitfield;
      const expectedBits = bits.reduce((acc, b) => acc | BigInt(b), 0n);
      if (currentBits === expectedBits) { act('SKIP_ROLE_PERMS_ALREADY_OK', { role: role.name }); continue; }
      act('ROLE_PERMS', { role: role.name, idKey });
      if (apply) {
        try { await role.setPermissions(bits, 'Bot di Zona — sync perms'); await new Promise(r => setTimeout(r, 200)); }
        catch (e) { errored(`ROLE_PERMS:${role.name}`, e); }
      }
    }
  }

  // ── ROLE 3: Rename roles com bold unicode ──────────────────────────────
  for (const [idKey, expectedName] of Object.entries(ROLE_DISPLAY_NAMES)) {
    const roleId = CONFIG[idKey];
    if (!roleId) continue;
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    if (role.name === expectedName) continue;
    act('ROLE_RENAME', { from: role.name, to: expectedName, idKey });
    if (apply) {
      try { await role.setName(expectedName, 'Bot di Zona — rename unicode'); await new Promise(r => setTimeout(r, 250)); }
      catch (e) { errored(`ROLE_RENAME:${role.name}`, e); }
    }
  }

  // A. Renomes seguros:
  //    A1) Painéis (CHANNELS_TO_CREATE com reason que inclui "painel" ou
  //        "boas-vindas"): procura pelo renameFrom e renomeia se encontrar.
  //    A2) CHANNEL_RENAMES cujo canal está explicitamente listado como "safe"
  //        (só canais onde temos certeza — ex.: pedido-de-tags). NÃO aplicamos
  //        todo o array CHANNEL_RENAMES para evitar mexer em canais que o
  //        utilizador customizou.
  const panelChannelDefs = CHANNELS_TO_CREATE.filter(d =>
    d.reason && (d.reason.toLowerCase().includes('painel') || d.reason.toLowerCase().includes('boas-vindas'))
  );
  for (const def of panelChannelDefs) {
    const target = CATEGORY_BY_KEY[def.categoryKey];
    if (!target) continue;
    const alreadyCorrect = guild.channels.cache.find(c => c.parentId === target.id && c.name === def.name);
    if (alreadyCorrect) continue;
    for (const oldName of def.renameFrom || []) {
      const found = guild.channels.cache.find(c => c.parentId === target.id && c.name === oldName);
      if (found) {
        act('RENAME_PANEL_CHANNEL', { from: oldName, to: def.name });
        if (apply) {
          try { await found.setName(def.name); await new Promise(r => setTimeout(r, 350)); }
          catch (e) { errored(`RENAME_PANEL:${def.name}`, e); }
        }
        break;
      }
    }
  }

  // A2 — Safe renames explícitos por ID (apenas canais conhecidos do bot).
  const SAFE_RENAME_IDS = new Set([
    DISCOVERED.CH_TAGS, // tags → pedido-de-tags (Fase 16)
  ]);
  for (const ren of CHANNEL_RENAMES) {
    if (!SAFE_RENAME_IDS.has(ren.id)) continue;
    const ch = guild.channels.cache.get(ren.id);
    if (!ch) { act('SKIP_SAFE_RENAME_MISSING', { id: ren.id }); continue; }
    if (ch.name === ren.to) continue;
    act('RENAME_SAFE_CHANNEL', { id: ren.id, from: ch.name, to: ren.to });
    if (apply) {
      try { await ch.setName(ren.to); await new Promise(r => setTimeout(r, 350)); }
      catch (e) { errored(`RENAME_SAFE:${ren.id}`, e); }
    }
  }

  // B. Category permissions (Phase 5)
  for (const [key, permCfg] of Object.entries(CATEGORY_PERMS)) {
    const tpl = CATEGORY_BY_KEY[key];
    const cat = tpl && guild.channels.cache.get(tpl.id);
    if (!cat) continue;
    const overwrites = buildOverwrites(guild, permCfg);
    act('PERM_CATEGORY', { category: tpl.name, overwrites: overwrites.length });
    if (apply) {
      try { await cat.permissionOverwrites.set(overwrites); await new Promise(r => setTimeout(r, 400)); }
      catch (e) { errored(`PERM_CATEGORY:${tpl.name}`, e); }
    }
  }

  // C. Channel-specific overrides (by ID) — Phase 6
  for (const [chId, permCfg] of Object.entries(CHANNEL_PERM_OVERRIDES)) {
    const ch = guild.channels.cache.get(chId);
    if (!ch) continue;
    const overwrites = buildOverwrites(guild, permCfg);
    act('PERM_CHANNEL', { channel: ch.name, reason: permCfg.reason });
    if (apply) {
      try { await ch.permissionOverwrites.set(overwrites); }
      catch (e) { errored(`PERM_CHANNEL:${ch.name}`, e); }
    }
  }

  // D. Channel-specific overrides (by name) — Phase 6b
  for (const [chName, permCfg] of Object.entries(CHANNEL_PERM_OVERRIDES_BY_NAME || {})) {
    const ch = guild.channels.cache.find(c => c.name === chName);
    if (!ch) { act('SKIP_PERM_BY_NAME_MISSING', { name: chName }); continue; }
    const overwrites = buildOverwrites(guild, permCfg);
    act('PERM_CHANNEL', { channel: ch.name, reason: permCfg.reason });
    if (apply) {
      try { await ch.permissionOverwrites.set(overwrites); }
      catch (e) { errored(`PERM_CHANNEL_BY_NAME:${ch.name}`, e); }
    }
  }

  // E. Sync child channels com a categoria (fix OPERACOES/spots).
  //    lockPermissions() é idempotente — só escreve se já não estiver igual.
  //    Skips:
  //      - canais com overrides user-specific (canais individuais de morador)
  //      - canais em CHANNEL_PERM_OVERRIDES (por ID) — configuração explícita
  //      - canais em CHANNEL_PERM_OVERRIDES_BY_NAME — configuração explícita
  const explicitIds = new Set(Object.keys(CHANNEL_PERM_OVERRIDES || {}));
  const explicitNames = new Set(Object.keys(CHANNEL_PERM_OVERRIDES_BY_NAME || {}));
  for (const [key] of Object.entries(CATEGORY_PERMS)) {
    const tpl = CATEGORY_BY_KEY[key];
    if (!tpl || !tpl.id) continue;
    for (const [chId, ch] of guild.channels.cache) {
      if (ch.parentId !== tpl.id) continue;
      if (explicitIds.has(chId)) continue;
      if (explicitNames.has(ch.name)) continue;
      if (ch.permissionOverwrites.cache.some(o => o.type === 1)) continue;
      if (apply) {
        try {
          await ch.lockPermissions();
          act('LOCK_TO_CATEGORY', { channel: ch.name, category: tpl.name });
          await new Promise(r => setTimeout(r, 200));
        } catch (e) { errored(`LOCK_TO_CATEGORY:${ch.name}`, e); }
      } else {
        act('LOCK_TO_CATEGORY', { channel: ch.name, category: tpl.name });
      }
    }
  }

  return report;
}

async function runSync(guild, opts = {}) {
  const apply = Boolean(opts.apply);
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    guild: { id: guild.id, name: guild.name },
    actions: [],
    extras: { categories: [], channels: [] },
    errors: [],
    counts: {},
  };

  function act(type, detail) {
    report.actions.push({ type, detail });
    report.counts[type] = (report.counts[type] || 0) + 1;
  }

  function errored(stage, e) {
    report.errors.push({ stage, message: e?.message || String(e) });
    warn(`[SYNC] ${stage}: ${e?.message || e}`);
  }

  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  // ── Phase 1: rename categories ──────────────────────────────────────────
  for (const tpl of CATEGORIES) {
    const cat = guild.channels.cache.get(tpl.id);
    if (!cat) { act('SKIP_CAT_MISSING', { id: tpl.id, name: tpl.name }); continue; }
    if (cat.type !== ChannelType.GuildCategory) continue;
    if (cat.name !== tpl.name) {
      act('RENAME_CATEGORY', { from: cat.name, to: tpl.name });
      if (apply) {
        try { await cat.setName(tpl.name); }
        catch (e) { errored(`RENAME_CATEGORY:${tpl.name}`, e); }
      }
    }
  }

  // ── Phase 2: move channels ─────────────────────────────────────────────
  for (const mv of CHANNEL_MOVES) {
    const ch = guild.channels.cache.get(mv.id);
    const target = CATEGORY_BY_KEY[mv.toCategoryKey];
    if (!ch || !target) { act('SKIP_MOVE_MISSING', mv); continue; }
    if (ch.parentId === target.id) continue;
    const fromCat = guild.channels.cache.get(ch.parentId);
    act('MOVE_CHANNEL', { name: ch.name, from: fromCat?.name || null, to: target.name, reason: mv.reason });
    if (apply) {
      try { await ch.setParent(target.id, { lockPermissions: false }); }
      catch (e) { errored(`MOVE_CHANNEL:${ch.name}`, e); }
    }
  }

  // ── Phase 3: rename channels ───────────────────────────────────────────
  for (const rn of CHANNEL_RENAMES) {
    const ch = guild.channels.cache.get(rn.id);
    if (!ch) { act('SKIP_RENAME_MISSING', rn); continue; }
    if (ch.name === rn.to) continue;
    act('RENAME_CHANNEL', { from: ch.name, to: rn.to });
    if (apply) {
      try {
        await ch.setName(rn.to);
        await new Promise(r => setTimeout(r, 350));
      } catch (e) { errored(`RENAME_CHANNEL:${rn.to}`, e); }
    }
  }

  // ── Phase 4: create (or converge) channels ─────────────────────────────
  for (const def of CHANNELS_TO_CREATE) {
    const target = CATEGORY_BY_KEY[def.categoryKey];
    if (!target) { act('SKIP_CREATE_CAT_MISSING', def); continue; }

    // Existe já com o nome novo?
    let existing = guild.channels.cache.find(c => c.parentId === target.id && c.name === def.name);

    // Existe com nome antigo? (sync anterior criou-o assim) → renomear em vez de duplicar
    if (!existing && Array.isArray(def.renameFrom) && def.renameFrom.length) {
      for (const oldName of def.renameFrom) {
        const found = guild.channels.cache.find(c => c.parentId === target.id && c.name === oldName);
        if (found) {
          act('RENAME_CREATED_CHANNEL', { from: oldName, to: def.name });
          if (apply) {
            try {
              await found.setName(def.name);
              await new Promise(r => setTimeout(r, 350));
            } catch (e) { errored(`RENAME_CREATED:${def.name}`, e); }
          }
          existing = found;
          break;
        }
      }
    }

    if (!existing) {
      act('CREATE_CHANNEL', { name: def.name, category: target.name, reason: def.reason });
      if (apply) {
        try {
          existing = await guild.channels.create({ name: def.name, type: ChannelType.GuildText, parent: target.id });
          await new Promise(r => setTimeout(r, 800));
        } catch (e) { errored(`CREATE_CHANNEL:${def.name}`, e); existing = null; }
      }
    }

    // Posição dentro da categoria (após criar ou se já existia)
    if (existing && def.position !== undefined && existing.position !== def.position) {
      act('REORDER_CHANNEL', { channel: def.name, position: def.position });
      if (apply) {
        try {
          await existing.setPosition(def.position);
          await new Promise(r => setTimeout(r, 300));
        } catch (e) { errored(`REORDER_CHANNEL:${def.name}`, e); }
      }
    }
  }

  // ── Phase 5: category permissions ──────────────────────────────────────
  for (const [key, permCfg] of Object.entries(CATEGORY_PERMS)) {
    const tpl = CATEGORY_BY_KEY[key];
    const cat = tpl && guild.channels.cache.get(tpl.id);
    if (!cat) continue;
    const overwrites = buildOverwrites(guild, permCfg);
    act('PERM_CATEGORY', { category: tpl.name, overwrites: overwrites.length });
    if (apply) {
      try {
        await cat.permissionOverwrites.set(overwrites);
        await new Promise(r => setTimeout(r, 400));
      } catch (e) { errored(`PERM_CATEGORY:${tpl.name}`, e); }
    }
  }

  // ── Phase 6: channel-specific overrides (por ID) ───────────────────────
  for (const [chId, permCfg] of Object.entries(CHANNEL_PERM_OVERRIDES)) {
    const ch = guild.channels.cache.get(chId);
    if (!ch) continue;
    const overwrites = buildOverwrites(guild, permCfg);
    act('PERM_CHANNEL', { channel: ch.name, reason: permCfg.reason, overwrites: overwrites.length });
    if (apply) {
      try { await ch.permissionOverwrites.set(overwrites); }
      catch (e) { errored(`PERM_CHANNEL:${ch.name}`, e); }
    }
  }

  // ── Phase 6b: channel-specific overrides (por nome) ────────────────────
  // Para canais criados dinamicamente cujo ID só fica conhecido após criação.
  for (const [chName, permCfg] of Object.entries(CHANNEL_PERM_OVERRIDES_BY_NAME || {})) {
    const ch = guild.channels.cache.find(c => c.name === chName);
    if (!ch) { act('SKIP_PERM_BY_NAME_MISSING', { name: chName }); continue; }
    const overwrites = buildOverwrites(guild, permCfg);
    act('PERM_CHANNEL', { channel: ch.name, reason: permCfg.reason, overwrites: overwrites.length });
    if (apply) {
      try { await ch.permissionOverwrites.set(overwrites); }
      catch (e) { errored(`PERM_CHANNEL_BY_NAME:${ch.name}`, e); }
    }
  }

  // ── Phase 6c: rename morador (resident) channels in GUETTO ─────────────
  // Cada morador tem um canal individual em GUETTO. Nome canónico:
  // `emoji・𝗧𝗶𝗲𝗿 - 𝗡𝗶𝗰𝗸` (formatResidentChannelName).
  //
  // Discovery em 3 passos:
  //   A) DB resident_channels (fonte de verdade quando bot criou o canal)
  //   B) Fallback via permission overwrites (canais antigos criados manualmente)
  //   C) Fallback por correspondência de nome do canal a nickname/display_name
  //
  // Quando descobre via B/C, persiste em resident_channels para que
  // operações futuras (auto-promoção, etc.) saibam do canal.
  try {
    const guettoId = CATEGORY_BY_KEY.GUETTO?.id;
    if (guettoId) {
      // (A) Carrega tudo o que já está no DB
      const dbRes = await query(`
        SELECT rc.channel_id, rc.member_id, m.discord_id, m.tier, m.nickname, m.display_name
          FROM resident_channels rc
          JOIN members m ON m.id = rc.member_id
         WHERE rc.status = 'active'
      `);
      const dbResMap = new Map(dbRes.rows.map(r => [r.channel_id, r]));

      // Skip lists — canais cobertos por outras fases
      const skipResIds = new Set([
        ...CHANNEL_RENAMES.map(r => r.id),
        ...Object.keys(CHANNEL_PERM_OVERRIDES),
      ]);
      const skipResNames = new Set([
        ...CHANNELS_TO_CREATE.map(c => c.name),
        ...CHANNELS_TO_CREATE.flatMap(c => c.renameFrom || []),
        ...Object.keys(CHANNEL_PERM_OVERRIDES_BY_NAME || {}),
      ]);

      for (const [chId, ch] of guild.channels.cache) {
        if (ch.type !== ChannelType.GuildText) continue;
        if (ch.parentId !== guettoId) continue;
        if (skipResIds.has(chId)) continue;
        if (skipResNames.has(ch.name)) continue;

        let info = dbResMap.get(chId);
        let needsDbInsert = false;

        // Nick limpo: se o canal já tinha sido formatado por sync anterior,
        // extraímos o nick original — evita aninhamento `🍼・YB - 🐺・YB - X`.
        const cleanNick = extractNicknameFromFormatted(ch.name) || ch.name;
        const cleanNickLower = cleanNick.toLowerCase();

        // (B) Descoberta via permission overwrites — procura um user
        //     com ViewChannel allow (esse é o dono do canal individual).
        if (!info) {
          const memberOws = [...ch.permissionOverwrites.cache.values()]
            .filter(o => o.type === 1 /* member */);
          for (const ow of memberOws) {
            if (ow.allow.has(PermissionFlagsBits.ViewChannel)) {
              const r = await query(
                `SELECT id AS member_id, discord_id, tier, nickname, display_name
                   FROM members WHERE discord_id = $1`,
                [ow.id]
              );
              if (r.rowCount > 0) { info = r.rows[0]; needsDbInsert = true; break; }
            }
          }
        }

        // (C) Fallback por nome — exact match contra DB
        if (!info) {
          // Tenta tanto o nome bruto como o cleanNick (sem formatação)
          for (const candidate of new Set([ch.name.toLowerCase(), cleanNickLower])) {
            const r = await query(
              `SELECT id AS member_id, discord_id, tier, nickname, display_name
                 FROM members
                WHERE LOWER(nickname) = $1
                   OR LOWER(REPLACE(display_name, ' ', '-')) = $1
                   OR LOWER(full_name) = $1
                LIMIT 2`,
              [candidate]
            );
            if (r.rowCount === 1) { info = r.rows[0]; needsDbInsert = true; break; }
          }
        }

        // (D) members.channel_id directo (canais migrados/manuais cuja
        //     associação só ficou guardada no campo do membro).
        if (!info) {
          const r = await query(
            `SELECT id AS member_id, discord_id, tier, nickname, display_name
               FROM members WHERE channel_id = $1 LIMIT 1`,
            [chId]
          );
          if (r.rowCount === 1) { info = r.rows[0]; needsDbInsert = true; }
        }

        // (F) Procura no Discord guild — membro cujo display name (ou
        //     username) bate com o nome do canal. Se achar, infere o tier
        //     pelas roles que tem e cria entrada no DB.
        let discoveredFromGuild = null;
        if (!info) {
          const targets = new Set([ch.name.toLowerCase(), cleanNickLower].filter(Boolean));
          for (const [, gm] of guild.members.cache) {
            const display = (gm.displayName || '').toLowerCase();
            const username = (gm.user?.username || '').toLowerCase();
            const nick = (gm.nickname || '').toLowerCase();
            const matches = [...targets].some(t =>
              display === t || username === t || nick === t
              || (t && (display.includes(t) || nick.includes(t)))
            );
            if (matches) { discoveredFromGuild = gm; break; }
          }
          if (discoveredFromGuild) {
            // Infere tier a partir das roles do membro
            const rolesIds = discoveredFromGuild.roles.cache;
            let inferredTier = 'young_blood';
            if (rolesIds.has(CONFIG.GANGSTER_FODIDO_ROLE_ID)) inferredTier = 'gangster_fodido';
            else if (rolesIds.has(CONFIG.O_GUNAO_ROLE_ID)) inferredTier = 'o_gunao';
            else if (rolesIds.has(CONFIG.YOUNG_BLOOD_ROLE_ID)) inferredTier = 'young_blood';
            else if (rolesIds.has(CONFIG.PATRAO_DI_ZONA_ROLE_ID)) inferredTier = 'patrao_di_zona';

            // Cria entrada em members (ou actualiza se já existe por outro motivo)
            try {
              const existing = await query(
                `SELECT id FROM members WHERE discord_id = $1 LIMIT 1`,
                [discoveredFromGuild.id]
              );
              let memberId;
              if (existing.rowCount > 0) {
                memberId = existing.rows[0].id;
                await query(
                  `UPDATE members SET tier = COALESCE(NULLIF(tier, ''), $1),
                                       nickname = COALESCE(NULLIF(nickname, ''), $2),
                                       display_name = COALESCE(NULLIF(display_name, ''), $3),
                                       updated_at = NOW()
                     WHERE id = $4`,
                  [inferredTier, cleanNick, discoveredFromGuild.displayName || cleanNick, memberId]
                );
              } else {
                const ins = await query(
                  `INSERT INTO members (discord_id, username, display_name, role, tier, nickname)
                   VALUES ($1, $2, $3, 'morador', $4, $5)
                   RETURNING id`,
                  [discoveredFromGuild.id, discoveredFromGuild.user?.username || '', discoveredFromGuild.displayName || cleanNick, inferredTier, cleanNick]
                );
                memberId = ins.rows[0].id;
              }
              info = {
                member_id: memberId,
                discord_id: discoveredFromGuild.id,
                tier: inferredTier,
                nickname: cleanNick,
                display_name: discoveredFromGuild.displayName || cleanNick,
              };
              needsDbInsert = true;
              act('IMPORTED_MEMBER_FROM_GUILD', { member: discoveredFromGuild.displayName, channel: ch.name, tier: inferredTier });
            } catch (e) {
              errored(`IMPORT_MEMBER:${ch.name}`, e);
            }
          }
        }

        // (E) Fuzzy match — descasca emojis/separadores/bold do nome,
        //     reduz a [a-z0-9-], e tenta bater contra nickname/display.
        //     Cobre canais já estilizados ou com prefixos/emojis arbitrários.
        if (!info) {
          // Strip combining marks + non-letter/digit/space/hyphen
          const stripped = ch.name
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s-]+/g, ' ')
            .trim()
            .replace(/\s+/g, '-');
          // Tira prefixos comuns (separators "・", "│", "┃", "-", "tier - ")
          const candidates = new Set();
          if (stripped) candidates.add(stripped);
          // Se houver " - " no nome, tentamos a parte depois
          const dashSplit = ch.name.split(/\s-\s|\s—\s/);
          if (dashSplit.length > 1) {
            const tail = dashSplit[dashSplit.length - 1]
              .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
              .toLowerCase().replace(/[^a-z0-9\s-]+/g, ' ').trim().replace(/\s+/g, '-');
            if (tail) candidates.add(tail);
          }
          for (const cand of candidates) {
            const r = await query(
              `SELECT id AS member_id, discord_id, tier, nickname, display_name
                 FROM members
                WHERE LOWER(nickname) = $1
                   OR LOWER(REPLACE(display_name, ' ', '-')) = $1
                   OR LOWER(REPLACE(full_name, ' ', '-')) = $1
                LIMIT 2`,
              [cand]
            );
            if (r.rowCount === 1) { info = r.rows[0]; needsDbInsert = true; break; }
          }
        }

        // (G) Last resort — só renomeia cosmeticamente, sem persistir no DB.
        //     Usa SEMPRE o cleanNick (extracção do formatado anterior, ou nome
        //     cru se nunca foi formatado) para garantir idempotência: aplicar
        //     o sync N vezes converge para `🍼・Young Blood - simão` em vez de
        //     aninhar `🍼・YB - 🍼・YB - simão`.
        if (!info) {
          const fallbackName = formatResidentChannelName('young_blood', cleanNick);
          if (ch.name !== fallbackName) {
            act('RENAME_RESIDENT_FALLBACK', { from: ch.name, to: fallbackName });
            if (apply) {
              try {
                await ch.setName(fallbackName);
                await new Promise(r => setTimeout(r, 350));
              } catch (e) { errored(`RENAME_RESIDENT_FALLBACK:${ch.name}`, e); }
            }
          } else {
            act('SKIP_RESIDENT_ALREADY_FORMATTED', { channel: ch.name });
          }
          continue;
        }

        const expected = formatResidentChannelName(
          info.tier || 'young_blood',
          info.nickname || info.display_name
        );

        // Renomear se necessário
        if (ch.name !== expected) {
          act('RENAME_RESIDENT', { from: ch.name, to: expected, member: info.display_name });
          if (apply) {
            try {
              await ch.setName(expected);
              await new Promise(r => setTimeout(r, 350));
            } catch (e) { errored(`RENAME_RESIDENT:${info.display_name}`, e); }
          }
        }

        // Persistir descoberta no DB (cobre canais legacy criados manualmente)
        if (apply && needsDbInsert) {
          try {
            await query(
              `INSERT INTO resident_channels (member_id, discord_id, channel_id, channel_name, category_id)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name, status = 'active'`,
              [info.member_id, info.discord_id, chId, expected, guettoId]
            );
            await query(
              `UPDATE members SET channel_id = $1 WHERE id = $2 AND (channel_id IS NULL OR channel_id = '')`,
              [chId, info.member_id]
            );
            act('REGISTER_RESIDENT_CHANNEL', { member: info.display_name, channel: expected });
          } catch (e) { errored(`REGISTER_RESIDENT:${info.display_name}`, e); }
        } else if (apply && info && ch.name !== expected) {
          // Sync DB name para residentes já conhecidos
          await query(
            `UPDATE resident_channels SET channel_name = $1 WHERE channel_id = $2 AND status = 'active'`,
            [expected, chId]
          ).catch(() => {});
        }
      }
    }
  } catch (e) {
    errored('RENAME_RESIDENT_BULK', e);
  }

  // ── Phase 6d: auto-restyle untracked channels in template categories ──
  // Apanha canais (incluindo spots de operações, calls customizados, etc.)
  // que estejam em categorias do template mas não em CHANNEL_RENAMES nem
  // CHANNELS_TO_CREATE. Detecta padrão `emoji[│┃|・]nome` e reformata para
  // `emoji・𝗻𝗼𝗺𝗲` — uniformiza tudo. Canais sem padrão reconhecido ficam
  // em paz (não arriscamos modificar nomes que não sabemos parsear).
  const SEPARATOR_RE = /[│┃|・]/;
  const knownChannelIds = new Set([
    ...CHANNEL_RENAMES.map(r => r.id),
    ...Object.keys(CHANNEL_PERM_OVERRIDES),
  ]);
  const knownChannelNames = new Set([
    ...CHANNELS_TO_CREATE.map(c => c.name),
    ...CHANNELS_TO_CREATE.flatMap(c => c.renameFrom || []),
    ...Object.keys(CHANNEL_PERM_OVERRIDES_BY_NAME || {}),
  ]);
  const guettoIdForRestyle = CATEGORY_BY_KEY.GUETTO?.id;
  const templateCatIdsForRestyle = new Set(CATEGORIES.map(c => c.id));

  for (const [, anyCh] of guild.channels.cache) {
    if (anyCh.type === ChannelType.GuildCategory) continue;
    if (!anyCh.parentId || !templateCatIdsForRestyle.has(anyCh.parentId)) continue;
    if (knownChannelIds.has(anyCh.id)) continue;
    if (knownChannelNames.has(anyCh.name)) continue;
    // GUETTO inteiro está reservado à Phase 6c (residentes) + renames fixos
    if (anyCh.parentId === guettoIdForRestyle) continue;

    const sepMatch = anyCh.name.match(SEPARATOR_RE);
    if (!sepMatch) continue;  // sem padrão reconhecido → não tocar
    const emojiPart = anyCh.name.slice(0, sepMatch.index).trim();
    const namePart  = anyCh.name.slice(sepMatch.index + 1).trim();
    if (!namePart) continue;
    const newName = emojiPart
      ? `${emojiPart}・${bold(namePart)}`
      : `・${bold(namePart)}`;
    if (newName === anyCh.name) continue;

    act('RESTYLE_CHANNEL', { from: anyCh.name, to: newName });
    if (apply) {
      try {
        await anyCh.setName(newName);
        await new Promise(r => setTimeout(r, 350));
      } catch (e) { errored(`RESTYLE:${anyCh.name}`, e); }
    }
  }

  // ── Phase 7: reorder categories ────────────────────────────────────────
  const positionUpdates = CATEGORIES
    .map(tpl => {
      const cat = guild.channels.cache.get(tpl.id);
      return cat && cat.position !== tpl.position ? { channel: tpl.id, position: tpl.position, name: tpl.name } : null;
    })
    .filter(Boolean);

  if (positionUpdates.length) {
    for (const p of positionUpdates) {
      act('REORDER_CATEGORY', { category: p.name, position: p.position });
    }
    if (apply) {
      try {
        await guild.channels.setPositions(positionUpdates.map(p => ({ channel: p.channel, position: p.position })));
      } catch (e) { errored('REORDER_CATEGORIES', e); }
    }
  }

  // ── Relatório de extras (fora do template) ─────────────────────────────
  const templateCatIds = new Set(CATEGORIES.map(c => c.id));
  const templateChannelIds = new Set([
    ...CHANNEL_RENAMES.map(r => r.id),
    ...CHANNEL_MOVES.map(m => m.id),
    ...Object.keys(CHANNEL_PERM_OVERRIDES),
  ]);
  const templateChannelNames = new Set(CHANNELS_TO_CREATE.map(c => c.name));

  for (const [, ch] of guild.channels.cache) {
    if (ch.type === ChannelType.GuildCategory) {
      if (!templateCatIds.has(ch.id)) {
        report.extras.categories.push({ id: ch.id, name: ch.name });
      }
    } else {
      // Canais individuais de moradores ficam na categoria GUETTO — ignorar
      const guettoId = CATEGORY_BY_KEY.GUETTO?.id;
      if (ch.parentId === guettoId) continue;
      if (templateChannelIds.has(ch.id)) continue;
      if (templateChannelNames.has(ch.name)) continue;
      report.extras.channels.push({ id: ch.id, name: ch.name, parent: ch.parent?.name });
    }
  }

  log(`[SYNC] ${report.mode}: ${report.actions.length} ações, ${report.errors.length} erros, ${report.extras.categories.length + report.extras.channels.length} extras`);

  return report;
}

function summarize(report) {
  const lines = [];
  lines.push(`**Modo:** \`${report.mode.toUpperCase()}\`  •  **Guild:** ${report.guild.name}`);
  lines.push('');
  const counts = report.counts;
  if (Object.keys(counts).length === 0) {
    lines.push('_Nada a fazer — estrutura já está sincronizada._');
  } else {
    lines.push('**Ações:**');
    for (const [type, n] of Object.entries(counts)) {
      lines.push(`• \`${type}\` × ${n}`);
    }
  }
  if (report.extras.categories.length || report.extras.channels.length) {
    lines.push('');
    lines.push(`**Fora do template** (não tocados):`);
    for (const c of report.extras.categories.slice(0, 10)) {
      lines.push(`  📁 \`${c.name}\``);
    }
    for (const c of report.extras.channels.slice(0, 15)) {
      lines.push(`  💬 \`${c.name}\` (em ${c.parent || '—'})`);
    }
    const totalExtras = report.extras.categories.length + report.extras.channels.length;
    if (totalExtras > 25) lines.push(`  _… e mais ${totalExtras - 25}._`);
  }
  if (report.errors.length) {
    lines.push('');
    lines.push(`**Erros (${report.errors.length}):**`);
    for (const err of report.errors.slice(0, 10)) {
      lines.push(`  ⚠️ \`${err.stage}\` — ${err.message}`);
    }
  }
  if (report.mode === 'dry-run') {
    lines.push('');
    lines.push('> _Dry-run — nada foi alterado. Usa `/rg-sync-structure modo:apply` para aplicar._');
  }
  return lines.join('\n');
}

module.exports = { runSync, runPermsOnly, summarize };
