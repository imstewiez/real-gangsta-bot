'use strict';
/**
 * /nova-categoria-topicos — cria (ou reutiliza) categoria e consolida lá
 * TODOS os tópicos activos.
 *
 * Steps:
 *   1. Procura categoria com o nome indicado (default: "BAIRRISTAS"). Se
 *      existir, reutiliza. Se não, cria com perms clonadas da primary.
 *   2. Regista em managed_topic_categories (role='overflow-auto') se não
 *      estiver lá já.
 *   3. Move TODOS os resident_channels.status='active' para lá, via
 *      setParent. Skip se já estão lá. Se a categoria atingir 50 durante
 *      o processo, pára e reporta os que faltaram.
 *
 * Chefia-only. Sem preview — é acção explícita.
 */

const { ChannelType, MessageFlags } = require('discord.js');
const { query } = require('../db');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI, ERRORS } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { queueChannelOp } = require('../discordQueue');
const { TIER_EMOJI } = require('../discord/structureTemplate');

const DEFAULT_NAME = 'BAIRRISTAS';

// Pattern de canal de bairrista: <tier_emoji>・<tier_label>-<nickname>.
// Usado para varrer Discord e apanhar canais NÃO tracked em resident_channels
// mas que claramente são tópicos de bairrista (YB, Gunão, GF, etc.).
const TIER_EMOJIS = Object.values(TIER_EMOJI);
function _looksLikeBairristaChannel(name) {
  const str = String(name || '');
  const firstChar = Array.from(str)[0]; // primeiro "grapheme" (emoji de tier)
  if (!TIER_EMOJIS.includes(firstChar)) return false;
  // Segunda posição deve ser o `・` (separador do padrão).
  return str.includes('・');
}

async function _cloneOverwritesFromPrimary(guild) {
  const primary = CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID;
  if (!primary) return null;
  const cat = await guild.channels.fetch(primary).catch(() => null);
  if (!cat) return null;
  return cat.permissionOverwrites.cache.map(po => ({
    id: po.id,
    type: po.type,
    allow: po.allow.bitfield.toString(),
    deny: po.deny.bitfield.toString(),
  }));
}

async function _findCategoryByName(guild, name) {
  const wanted = String(name).trim().toLowerCase();
  // Procura por nome exacto (case-insensitive).
  const all = Array.from(guild.channels.cache.values()).filter(c => c.type === ChannelType.GuildCategory);
  return all.find(c => String(c.name).trim().toLowerCase() === wanted) || null;
}

async function _ensureCategory(guild, name, actorTag) {
  const existing = await _findCategoryByName(guild, name);
  if (existing) {
    log(`[NOVA-CATEGORIA] Categoria '${name}' já existe (${existing.id}) — reusing.`);
    // Regista em DB se não estiver.
    await query(
      `INSERT INTO managed_topic_categories (category_id, role, notes)
       VALUES ($1, 'overflow-auto', $2)
       ON CONFLICT (category_id) DO NOTHING`,
      [existing.id, `Reused via /nova-categoria-topicos por ${actorTag} em ${new Date().toISOString()}`]
    );
    return { category: existing, created: false };
  }
  const permissionOverwrites = (await _cloneOverwritesFromPrimary(guild)) || [];
  const cat = await queueChannelOp(() =>
    guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      permissionOverwrites,
      reason: `Criada via /nova-categoria-topicos por ${actorTag}`,
    })
  );
  await query(
    `INSERT INTO managed_topic_categories (category_id, role, notes)
     VALUES ($1, 'overflow-auto', $2)
     ON CONFLICT (category_id) DO NOTHING`,
    [cat.id, `Criada via /nova-categoria-topicos por ${actorTag} em ${new Date().toISOString()}`]
  );
  log(`[NOVA-CATEGORIA] '${name}' (${cat.id}) criada por ${actorTag}.`);
  return { category: cat, created: true };
}

async function _moveAllTopicsInto(guild, targetCatId) {
  const moved = [];
  const skipped = [];
  const failed = [];
  const seen = new Set(); // channel IDs já processados — evita duplicação entre as 2 passes

  const isFullErr = e => {
    const msg = String(e?.message || '');
    return msg.includes('CHANNEL_PARENT_MAX_CHANNELS') || msg.includes('Maximum number of channels');
  };

  // PASS 1 — canais tracked em resident_channels.active (nome vem da DB).
  const active = await query(
    `SELECT rc.channel_id, m.display_name
       FROM resident_channels rc
       JOIN members m ON m.id = rc.member_id
      WHERE rc.status = 'active'
      ORDER BY m.display_name ASC`
  );
  let stop = false;
  for (const r of active.rows) {
    if (stop) break;
    seen.add(r.channel_id);
    try {
      const ch = await guild.channels.fetch(r.channel_id).catch(() => null);
      if (!ch) {
        failed.push({ name: r.display_name, channelId: r.channel_id, error: 'canal não existe em Discord' });
        continue;
      }
      if (ch.parentId === targetCatId) {
        skipped.push({ name: r.display_name, reason: 'já na categoria' });
        continue;
      }
      await queueChannelOp(() => ch.setParent(targetCatId, { lockPermissions: false }));
      await query('UPDATE resident_channels SET category_id = $1 WHERE channel_id = $2', [targetCatId, r.channel_id]);
      moved.push({ name: r.display_name, channelId: r.channel_id });
    } catch (e) {
      failed.push({ name: r.display_name, channelId: r.channel_id, error: e.message });
      if (isFullErr(e)) {
        warn('[NOVA-CATEGORIA] Target cheia em pass 1 — a parar.');
        stop = true;
      }
    }
  }

  // PASS 2 — canais em Discord que MATCH o pattern de bairrista mas NÃO estão
  // tracked em resident_channels (ex: canais órfãos, criados manualmente, de
  // bot antigo). Move-os também para a categoria target.
  if (!stop) {
    const untracked = Array.from(guild.channels.cache.values()).filter(
      c => c.type === ChannelType.GuildText && !seen.has(c.id) && _looksLikeBairristaChannel(c.name)
    );
    for (const ch of untracked) {
      if (stop) break;
      try {
        if (ch.parentId === targetCatId) {
          skipped.push({ name: ch.name, reason: 'já na categoria (untracked)' });
          continue;
        }
        await queueChannelOp(() => ch.setParent(targetCatId, { lockPermissions: false }));
        moved.push({ name: ch.name, channelId: ch.id, untracked: true });
      } catch (e) {
        failed.push({ name: ch.name, channelId: ch.id, error: e.message });
        if (isFullErr(e)) {
          warn('[NOVA-CATEGORIA] Target cheia em pass 2 — a parar.');
          stop = true;
        }
      }
    }
  }

  return { moved, skipped, failed };
}

async function handle(interaction) {
  try {
    return await _handleInner(interaction);
  } catch (e) {
    warn(`[NOVA-CATEGORIA] Erro: ${e.message}\n${e.stack}`);
    const msg = `${EMOJI.ERRO} Falha: ${String(e.message).slice(0, 200)}`;
    return safeReply(interaction, { content: msg, flags: MessageFlags.Ephemeral }, { messageClass: 'ERROR' });
  }
}

async function _handleInner(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('criar categoria de tópicos'), flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  if (!CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} \`BAIRRISTA_TOPICOS_CATEGORY_ID\` não configurado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const nome = (interaction.options.getString('nome') || DEFAULT_NAME).trim();
  const guild = interaction.guild;

  // 1. Ensure category
  const { category, created } = await _ensureCategory(guild, nome, interaction.user.tag);

  // 2. Move all topics
  const { moved, skipped, failed } = await _moveAllTopicsInto(guild, category.id);

  const lines = [];
  lines.push(
    created
      ? `${EMOJI.OK} Criada nova categoria **${category.name}** (<#${category.id}>) com perms clonadas da primary.`
      : `${EMOJI.INFO} Categoria **${category.name}** já existia (<#${category.id}>) — a reutilizar.`
  );
  lines.push('');
  lines.push(`**${moved.length}** tópico(s) movido(s) · **${skipped.length}** já lá · **${failed.length}** falha(s).`);
  if (moved.length) {
    lines.push('');
    lines.push('**Movidos:**');
    for (const m of moved.slice(0, 25)) lines.push(`• ${m.name}`);
    if (moved.length > 25) lines.push(`_… e mais ${moved.length - 25}_`);
  }
  if (failed.length) {
    lines.push('');
    lines.push('**Falhas:**');
    for (const f of failed.slice(0, 10)) lines.push(`${EMOJI.ERRO} ${f.name} · ${String(f.error).slice(0, 80)}`);
    if (failed.length > 10) lines.push(`_… e mais ${failed.length - 10}_`);
  }

  const color = failed.length ? COLOR.DANGER : COLOR.SUCCESS;
  const embed = brandEmbed('MOVEMENT')
    .setColor(color)
    .setTitle(`${EMOJI.REFRESH} Categoria **${category.name}** — ${moved.length} movidos`)
    .setDescription(lines.join('\n').slice(0, 3900));

  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'ERROR' });
}

module.exports = { handle };
