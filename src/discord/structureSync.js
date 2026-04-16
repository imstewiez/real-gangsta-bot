'use strict';
/**
 * Discord Perms Sync — engine minimalista.
 *
 * RESPONSABILIDADES (limitadas de propósito):
 *   1. Garante que o role Pendente existe (onboarding depende dele)
 *   2. Aplica permissões guild-level a roles conhecidos (setPermissions)
 *   3. Aplica permission overwrites nas categorias conhecidas
 *   4. Aplica permission overwrites em canais conhecidos (por ID e por nome)
 *   5. Sincroniza child channels com a categoria (lockPermissions)
 *
 * O QUE NÃO FAZ (removido propositadamente):
 *   - NÃO renomeia roles (ROLE_DISPLAY_NAMES eliminado)
 *   - NÃO renomeia canais (CHANNEL_RENAMES eliminado)
 *   - NÃO move canais entre categorias (CHANNEL_MOVES eliminado)
 *   - NÃO cria canais globais (CHANNELS_TO_CREATE eliminado)
 *   - NÃO faz auto-restyle de canais com padrão emoji│nome
 *   - NÃO reordena categorias
 *   - NÃO formata canais morador em bulk (só onboarding + promoção fazem isso,
 *     contextualmente, ao ciclo de vida do membro)
 *
 * Para auditar divergências contra o lock usar `/rg-layout-check`.
 */

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const {
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
} = require('./structureTemplate');

/**
 * Resolve o channelId de um painel da mesma forma que o panelBootstrap:
 *   1) CONFIG[panel.channelKey] (env var / default)
 *   2) auto-discover por nome canónico + slugs na categoria esperada
 *
 * Usa `guild.channels.cache` directamente (já populado via `guild.channels.fetch`
 * no início de runPermsOnly).
 */
function _resolvePanelChannelId(guild, panelDef) {
  const explicit = CONFIG[panelDef.channelKey];
  if (explicit) {
    const ch = guild.channels.cache.get(explicit);
    if (ch) return { channelId: explicit, source: 'env' };
  }
  if (!panelDef.autoName || !panelDef.autoCategoryKey) return null;

  const cat = CATEGORY_BY_KEY[panelDef.autoCategoryKey];
  if (!cat || !cat.id) return null;

  const acceptedNames = [panelDef.autoName, ...(panelDef.autoAltNames || [])];
  const slugs = acceptedNames.map(n => n.split('・')[1]).filter(Boolean);
  const found = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    c.parentId === cat.id &&
    (acceptedNames.includes(c.name) || slugs.some(s => c.name.includes(s)))
  );
  return found ? { channelId: found.id, source: 'auto-discover' } : null;
}

function permBits(names = []) {
  return names.map(n => PermissionFlagsBits[n]).filter(Boolean);
}

function buildOverwrites(guild, permConfig) {
  const overwrites = [];
  const everyoneId = guild.roles.everyone.id;

  if (permConfig.denyEveryone || permConfig.allowEveryone) {
    overwrites.push({
      id: everyoneId,
      deny: permBits(permConfig.denyEveryone || []),
      allow: permBits(permConfig.allowEveryone || []),
    });
  }

  for (const rule of permConfig.deny || []) {
    const roleIds = new Set();
    for (const src of rule.roleSources) for (const id of rolesFor(src)) roleIds.add(id);
    for (const roleId of roleIds) {
      const existing = overwrites.find(o => o.id === roleId);
      if (existing) existing.deny = [...(existing.deny || []), ...permBits(rule.perms)];
      else overwrites.push({ id: roleId, deny: permBits(rule.perms) });
    }
  }

  for (const rule of permConfig.allow || []) {
    const roleIds = new Set();
    for (const src of rule.roleSources) for (const id of rolesFor(src)) roleIds.add(id);
    for (const roleId of roleIds) {
      const existing = overwrites.find(o => o.id === roleId);
      if (existing) existing.allow = [...(existing.allow || []), ...permBits(rule.perms)];
      else overwrites.push({ id: roleId, allow: permBits(rule.perms) });
    }
  }
  return overwrites;
}

/**
 * Aplica apenas permissões (nunca renomeia/move/cria canais globais).
 * @param guild {Guild}
 * @param opts {{ apply?: boolean }}
 */
async function runPermsOnly(guild, opts = {}) {
  const apply = Boolean(opts.apply);
  const report = { mode: apply ? 'apply' : 'dry-run', actions: [], errors: [], counts: {} };
  const act = (type, detail) => { report.actions.push({ type, detail }); report.counts[type] = (report.counts[type] || 0) + 1; };
  const errored = (stage, e) => { report.errors.push({ stage, message: e?.message || String(e) }); warn(`[PERMS-SYNC] ${stage}: ${e?.message || e}`); };

  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  // ── 1. Garante role Pendente (onboarding depende) ──────────────────────
  if (!CONFIG.PENDENTE_ROLE_ID) {
    let pendente = guild.roles.cache.find(r => r.name.toLowerCase().includes('pendente'));
    if (!pendente) {
      if (apply) {
        try {
          pendente = await guild.roles.create({
            name: 'Pendente',
            color: 0x95A5A6,
            hoist: true,
            mentionable: false,
            permissions: [],
            reason: 'Bot — onboarding requer role Pendente',
          });
          act('CREATE_ROLE_PENDENTE', { id: pendente.id });
        } catch (e) { errored('CREATE_ROLE_PENDENTE', e); }
      } else {
        act('CREATE_ROLE_PENDENTE', { dry: true });
      }
    } else {
      act('FOUND_ROLE_PENDENTE', { id: pendente.id, name: pendente.name });
    }
    if (pendente) CONFIG.PENDENTE_ROLE_ID = pendente.id;
  }

  // ── 2. Perms guild-level por role ──────────────────────────────────────
  for (const [roleKey, idKeys] of Object.entries(ROLE_KEY_TO_ID_KEYS)) {
    const permsList = ROLE_GUILD_PERMS[roleKey];
    if (!permsList) continue;
    const bits = permBits(permsList);
    for (const idKey of idKeys) {
      const roleId = CONFIG[idKey];
      if (!roleId) continue;
      const role = guild.roles.cache.get(roleId);
      if (!role) { act('SKIP_ROLE_PERMS_MISSING', { idKey, roleId }); continue; }
      const currentBits = role.permissions.bitfield;
      const expectedBits = bits.reduce((acc, b) => acc | BigInt(b), 0n);
      if (currentBits === expectedBits) { act('SKIP_ROLE_PERMS_OK', { role: role.name }); continue; }
      act('ROLE_PERMS', { role: role.name, idKey });
      if (apply) {
        try { await role.setPermissions(bits, 'Bot — perms sync'); await new Promise(r => setTimeout(r, 200)); }
        catch (e) { errored(`ROLE_PERMS:${role.name}`, e); }
      }
    }
  }

  // ── 3. Perms de categoria ──────────────────────────────────────────────
  for (const [key, permCfg] of Object.entries(CATEGORY_PERMS)) {
    const tpl = CATEGORY_BY_KEY[key];
    const cat = tpl && guild.channels.cache.get(tpl.id);
    if (!cat) continue;
    const overwrites = buildOverwrites(guild, permCfg);
    act('PERM_CATEGORY', { category: cat.name });
    if (apply) {
      try { await cat.permissionOverwrites.set(overwrites); await new Promise(r => setTimeout(r, 300)); }
      catch (e) { errored(`PERM_CATEGORY:${cat.name}`, e); }
    }
  }

  // ── 4a. Perms de canal por ID ──────────────────────────────────────────
  for (const [chId, permCfg] of Object.entries(CHANNEL_PERM_OVERRIDES)) {
    const ch = guild.channels.cache.get(chId);
    if (!ch) continue;
    const overwrites = buildOverwrites(guild, permCfg);
    act('PERM_CHANNEL_BY_ID', { channel: ch.name, reason: permCfg.reason });
    if (apply) {
      try { await ch.permissionOverwrites.set(overwrites); }
      catch (e) { errored(`PERM_CHANNEL:${ch.name}`, e); }
    }
  }

  // ── 4b. Perms de canal por nome ────────────────────────────────────────
  for (const [chName, permCfg] of Object.entries(CHANNEL_PERM_OVERRIDES_BY_NAME || {})) {
    const ch = guild.channels.cache.find(c => c.name === chName);
    if (!ch) continue;
    const overwrites = buildOverwrites(guild, permCfg);
    act('PERM_CHANNEL_BY_NAME', { channel: ch.name, reason: permCfg.reason });
    if (apply) {
      try { await ch.permissionOverwrites.set(overwrites); }
      catch (e) { errored(`PERM_CHANNEL_BY_NAME:${ch.name}`, e); }
    }
  }

  // ── 4c. Perms de painéis (auto-discover: env var OU nome+categoria) ────
  // Lazy require para evitar problemas de load-order (panelBootstrap puxa
  // db/state/handlers ao carregar).
  const panelChannelIdsHandled = new Set();
  try {
    const { PANELS } = require('../panelBootstrap');
    for (const panelDef of PANELS) {
      const resolved = _resolvePanelChannelId(guild, panelDef);
      if (!resolved) {
        act('SKIP_PANEL_NOT_FOUND', { panel: panelDef.key, reason: `sem env var e auto-discover em ${panelDef.autoCategoryKey} falhou` });
        continue;
      }
      const permCfg = PANEL_PERM_BY_KEY[panelDef.key];
      if (!permCfg) continue;
      const ch = guild.channels.cache.get(resolved.channelId);
      if (!ch) {
        act('SKIP_PANEL_CHANNEL_GONE', { panel: panelDef.key, channelId: resolved.channelId });
        continue;
      }
      panelChannelIdsHandled.add(ch.id);
      const overwrites = buildOverwrites(guild, permCfg);
      act('PERM_PANEL', { panel: panelDef.key, channel: ch.name, source: resolved.source, reason: permCfg.reason });
      if (apply) {
        try { await ch.permissionOverwrites.set(overwrites); }
        catch (e) { errored(`PERM_PANEL:${ch.name}`, e); }
      }
    }
  } catch (e) {
    errored('PANEL_PERMS_SECTION', e);
  }

  // ── 4d. Aggressive sweep de categorias críticas ────────────────────────
  // Força perms em TODOS os children da categoria, mesmo quando têm
  // member-overwrites (lockPermissions de section 5 salta esses casos).
  // Reservado para categorias onde não deve haver canais com overwrites
  // user-specific (ex.: OPERACOES = spots/mapas, INVENTARIO = bau/material).
  const forceSweptIds = new Set();
  for (const [catKey, permCfg] of Object.entries(CATEGORY_CHILD_FORCE_PERMS || {})) {
    const tpl = CATEGORY_BY_KEY[catKey];
    if (!tpl || !tpl.id) continue;
    for (const [chId, ch] of guild.channels.cache) {
      if (ch.parentId !== tpl.id) continue;
      if (CHANNEL_PERM_OVERRIDES[chId]) continue;           // já tem override por ID
      if (CHANNEL_PERM_OVERRIDES_BY_NAME[ch.name]) continue; // já tem override por nome
      if (panelChannelIdsHandled.has(chId)) continue;

      forceSweptIds.add(chId);
      const overwrites = buildOverwrites(guild, permCfg);
      act('PERM_FORCE_CHILD', { category: catKey, channel: ch.name, reason: permCfg.reason });
      if (apply) {
        try { await ch.permissionOverwrites.set(overwrites); }
        catch (e) { errored(`PERM_FORCE_CHILD:${ch.name}`, e); }
      }
    }
  }

  // ── 5. Child channels sync com categoria (idempotente) ─────────────────
  const explicitIds = new Set([
    ...Object.keys(CHANNEL_PERM_OVERRIDES || {}),
    ...panelChannelIdsHandled,
    ...forceSweptIds,
  ]);
  const explicitNames = new Set(Object.keys(CHANNEL_PERM_OVERRIDES_BY_NAME || {}));
  for (const [key] of Object.entries(CATEGORY_PERMS)) {
    const tpl = CATEGORY_BY_KEY[key];
    if (!tpl || !tpl.id) continue;
    for (const [chId, ch] of guild.channels.cache) {
      if (ch.parentId !== tpl.id) continue;
      if (explicitIds.has(chId)) continue;
      if (explicitNames.has(ch.name)) continue;
      // Canal com overrides user-specific (canal individual de morador) — não tocar
      if (ch.permissionOverwrites.cache.some(o => o.type === 1)) continue;
      if (apply) {
        try { await ch.lockPermissions(); act('LOCK_TO_CATEGORY', { channel: ch.name, category: tpl.name }); await new Promise(r => setTimeout(r, 150)); }
        catch (e) { errored(`LOCK_TO_CATEGORY:${ch.name}`, e); }
      } else {
        act('LOCK_TO_CATEGORY', { channel: ch.name, category: tpl.name });
      }
    }
  }

  log(`[PERMS-SYNC] ${report.mode}: ${report.actions.length} ações, ${report.errors.length} erros`);
  return report;
}

function summarize(report) {
  const lines = [];
  lines.push(`**Modo:** \`${report.mode.toUpperCase()}\``);
  lines.push('');
  const counts = report.counts;
  if (Object.keys(counts).length === 0) {
    lines.push('_Tudo sincronizado — nada a fazer._');
  } else {
    lines.push('**Ações:**');
    for (const [type, n] of Object.entries(counts)) lines.push(`• \`${type}\` × ${n}`);
  }
  if (report.errors.length) {
    lines.push('');
    lines.push(`**Erros (${report.errors.length}):**`);
    for (const err of report.errors.slice(0, 10)) lines.push(`  ⚠️ \`${err.stage}\` — ${err.message}`);
  }
  if (report.mode === 'dry-run') {
    lines.push('');
    lines.push('> _Dry-run — nada alterado. Usa `modo:apply` para aplicar perms._');
  }
  return lines.join('\n');
}

module.exports = { runPermsOnly, summarize };
