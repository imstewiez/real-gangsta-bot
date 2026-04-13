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
  formatResidentChannelName,
  bold,
  rolesFor,
} = require('./structureTemplate');
const { query } = require('../db');

const EVERYONE = '@everyone'; // resolvido via guild.roles.everyone.id

function permBits(names = []) {
  return names.map(n => PermissionFlagsBits[n]).filter(Boolean);
}

function buildOverwrites(guild, permConfig) {
  const overwrites = [];
  if (permConfig.denyEveryone) {
    overwrites.push({
      id: guild.roles.everyone.id,
      deny: permBits(permConfig.denyEveryone),
    });
  }
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

        // (C) Fallback por nome — canal `joao-silva` → procura member com
        //     nickname ou display_name correspondente. Só aceita match único.
        if (!info) {
          const baseName = ch.name.toLowerCase();
          const r = await query(
            `SELECT id AS member_id, discord_id, tier, nickname, display_name
               FROM members
              WHERE LOWER(nickname) = $1
                 OR LOWER(REPLACE(display_name, ' ', '-')) = $1
                 OR LOWER(full_name) = $1
              LIMIT 2`,
            [baseName]
          );
          if (r.rowCount === 1) { info = r.rows[0]; needsDbInsert = true; }
        }

        if (!info) {
          act('SKIP_RESIDENT_UNKNOWN', { channel: ch.name });
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

module.exports = { runSync, summarize };
