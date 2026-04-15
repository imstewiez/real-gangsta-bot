'use strict';
/**
 * Compara o estado actual do Discord contra o lock file em
 * `config/discord-layout.lock.json` e reporta divergências.
 *
 * NUNCA altera nada — é só auditoria. Reporta:
 *   - Categorias cujo nome ou posição mudou
 *   - Canais cujo nome, posição ou parentId mudou
 *   - Canais extra (que existem no servidor mas não no lock)
 *   - Canais em falta (que existem no lock mas não no servidor)
 *   - Roles cujo nome ou posição mudou
 *
 * Se o lock file não existir, diz ao user para correr o script de captura.
 */

const fs = require('fs');
const path = require('path');
const { ChannelType } = require('discord.js');

const LOCK_PATH = path.join(__dirname, '..', '..', 'config', 'discord-layout.lock.json');

function loadLock() {
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function checkLayout(guild) {
  const lock = loadLock();
  if (!lock) {
    return {
      ok: false,
      reason: 'missing_lock',
      message: `Lock file não existe em \`${LOCK_PATH}\`. Corre \`node scripts/manual/captureLayout.js\` primeiro.`,
    };
  }

  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  const diffs = {
    categories: { renamed: [], moved: [], missing: [], extra: [] },
    channels:   { renamed: [], moved: [], reordered: [], missing: [], extra: [] },
    roles:      { renamed: [], reordered: [], missing: [] },
  };

  // ── Categorias ────────────────────────────────────────────────────────────
  const currentCats = new Map();
  for (const [, ch] of guild.channels.cache) {
    if (ch.type === ChannelType.GuildCategory) currentCats.set(ch.id, ch);
  }
  for (const lockCat of lock.categories || []) {
    const actual = currentCats.get(lockCat.id);
    if (!actual) {
      diffs.categories.missing.push({ id: lockCat.id, name: lockCat.name });
      continue;
    }
    if (actual.name !== lockCat.name) {
      diffs.categories.renamed.push({ id: lockCat.id, was: lockCat.name, now: actual.name });
    }
    const actualPos = actual.rawPosition ?? actual.position;
    if (actualPos !== lockCat.position) {
      diffs.categories.moved.push({ id: lockCat.id, name: actual.name, was: lockCat.position, now: actualPos });
    }
    currentCats.delete(lockCat.id);
  }
  for (const [, extra] of currentCats) {
    diffs.categories.extra.push({ id: extra.id, name: extra.name });
  }

  // ── Canais ────────────────────────────────────────────────────────────────
  const currentChs = new Map();
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildCategory) currentChs.set(ch.id, ch);
  }
  for (const lockCh of lock.channels || []) {
    const actual = currentChs.get(lockCh.id);
    if (!actual) {
      diffs.channels.missing.push({ id: lockCh.id, name: lockCh.name });
      continue;
    }
    if (actual.name !== lockCh.name) {
      diffs.channels.renamed.push({ id: lockCh.id, was: lockCh.name, now: actual.name });
    }
    if (actual.parentId !== lockCh.parentId) {
      diffs.channels.moved.push({ id: lockCh.id, name: actual.name, was: lockCh.parentId, now: actual.parentId });
    }
    const actualPos = actual.rawPosition ?? actual.position;
    if (actualPos !== lockCh.position) {
      diffs.channels.reordered.push({ id: lockCh.id, name: actual.name, was: lockCh.position, now: actualPos });
    }
    currentChs.delete(lockCh.id);
  }
  // Canais extra — excluir canais individuais de morador (categoria GUETTO
  // tem canais dinâmicos criados por cada nome — são esperados e não entram
  // no lock como referência fixa)
  for (const [, extra] of currentChs) {
    diffs.channels.extra.push({ id: extra.id, name: extra.name, parent: extra.parent?.name || null });
  }

  // ── Roles ────────────────────────────────────────────────────────────────
  const currentRoles = new Map();
  for (const [, r] of guild.roles.cache) currentRoles.set(r.id, r);
  for (const lockRole of lock.roles || []) {
    const actual = currentRoles.get(lockRole.id);
    if (!actual) {
      diffs.roles.missing.push({ id: lockRole.id, name: lockRole.name });
      continue;
    }
    if (actual.name !== lockRole.name) {
      diffs.roles.renamed.push({ id: lockRole.id, was: lockRole.name, now: actual.name });
    }
    const actualPos = actual.rawPosition ?? actual.position;
    if (actualPos !== lockRole.position) {
      diffs.roles.reordered.push({ id: lockRole.id, name: actual.name, was: lockRole.position, now: actualPos });
    }
    currentRoles.delete(lockRole.id);
  }

  const totalDiffs =
    diffs.categories.renamed.length + diffs.categories.moved.length + diffs.categories.missing.length + diffs.categories.extra.length +
    diffs.channels.renamed.length + diffs.channels.moved.length + diffs.channels.reordered.length + diffs.channels.missing.length +
    diffs.roles.renamed.length + diffs.roles.reordered.length + diffs.roles.missing.length;

  return {
    ok: true,
    capturedAt: lock.capturedAt,
    totalDiffs,
    extraChannels: diffs.channels.extra.length,
    diffs,
  };
}

function summarize(result) {
  if (!result.ok) return `⚠️ ${result.message}`;

  const lines = [`**Layout vs lock** · capturado em \`${result.capturedAt}\``];
  if (result.totalDiffs === 0) {
    lines.push('', '✅ Tudo igual ao lock.');
  } else {
    lines.push('', `⚠️ **${result.totalDiffs}** divergências:`);
  }
  const d = result.diffs;

  const section = (title, items, fmt) => {
    if (!items.length) return;
    lines.push('', `**${title}** (${items.length}):`);
    for (const i of items.slice(0, 15)) lines.push(`• ${fmt(i)}`);
    if (items.length > 15) lines.push(`  _… e mais ${items.length - 15}._`);
  };

  section('Categorias renomeadas', d.categories.renamed, i => `\`${i.was}\` → \`${i.now}\``);
  section('Categorias reordenadas', d.categories.moved, i => `\`${i.name}\` pos ${i.was} → ${i.now}`);
  section('Categorias em falta', d.categories.missing, i => `\`${i.name}\` (${i.id})`);
  section('Canais renomeados', d.channels.renamed, i => `\`${i.was}\` → \`${i.now}\``);
  section('Canais movidos', d.channels.moved, i => `\`${i.name}\` mudou de categoria`);
  section('Canais reordenados', d.channels.reordered, i => `\`${i.name}\` pos ${i.was} → ${i.now}`);
  section('Canais em falta', d.channels.missing, i => `\`${i.name}\` (${i.id})`);
  if (result.extraChannels > 0) {
    lines.push('', `_Ignoro ${result.extraChannels} canais extra (moradores individuais são normais)._`);
  }
  section('Roles renomeados', d.roles.renamed, i => `\`${i.was}\` → \`${i.now}\``);
  section('Roles reordenados', d.roles.reordered, i => `\`${i.name}\` pos ${i.was} → ${i.now}`);
  section('Roles em falta', d.roles.missing, i => `\`${i.name}\` (${i.id})`);

  if (result.totalDiffs > 0) {
    lines.push('', '_Para actualizar o lock ao estado actual: \`node scripts/manual/captureLayout.js\`_');
  }
  return lines.join('\n');
}

module.exports = { checkLayout, summarize };
