'use strict';
/**
 * Channel invariants — canais individuais de bairristas.
 *
 * REGRA: só quem vê o canal individual de um bairrista é:
 *   - o próprio (owner)
 *   - Patrão di Zona
 *   - Oficiais (OG + Real Gangster)
 *   - Chefia (Manda-Chuva + Kingpin)
 *   - Bot
 *
 * Outros bairristas (mesmo os do mesmo tier) NÃO podem ver.
 *
 * Isto é garantido explicitamente por CHANNEL-LEVEL deny overwrites nas
 * roles `BAIRRISTA_TIER_ROLE_IDS` + `BAIRRISTAS_BASE_ROLE_ID`. A categoria
 * GUETTO permite estas roles ver-se por default (para canais partilhados
 * como chat-moradores, material, etc.), então sem o deny explícito a
 * permissão cascateia para os canais filhos.
 */

const { PermissionFlagsBits } = require('discord.js');
const CONFIG = require('../config');
const { query } = require('../db');
const { queueChannelOp } = require('../discordQueue');
const { log, warn } = require('../logger');

/**
 * Constrói o array de permissionOverwrites para um canal individual de
 * bairrista. Usado no onboarding (channel create) e no reconcile (set).
 *
 * @param {Guild} guild
 * @param {string} ownerId — Discord ID do bairrista dono
 * @param {string} botId — Discord ID do bot
 * @returns {Array} overwrites prontos para `channels.create` ou `overwrites.set`
 */
function buildBairristaChannelOverwrites(guild, ownerId, botId) {
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ownerId,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: botId,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];

  // Comando total (Manda-Chuva, Kingpin) — full control
  for (const roleId of CONFIG.COMMAND_ROLE_IDS) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }
  // Supervisão (OG, Real Gangster) — read/write
  for (const roleId of CONFIG.SUPERVISOR_ROLE_IDS) {
    overwrites.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }
  // Patrão di Zona — gestão do bairro
  for (const roleId of CONFIG.PATRAO_DI_ZONA_ROLE_IDS) {
    overwrites.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  // ── DENY explícito para roles de bairrista + flavor roles ──────────────
  // Sem isto, a categoria GUETTO (que permite bairristas ver) cascata para
  // o canal filho e outros bairristas vêem o canal do colega.
  // Tropinhas/Patrulha Pata: roles flavor — deny por defesa (prevenção
  // contra permissões futuras que os abram acidentalmente).
  const peerRolesToDeny = [
    ...CONFIG.BAIRRISTA_TIER_ROLE_IDS,
    CONFIG.BAIRRISTAS_BASE_ROLE_ID,
    CONFIG.TROPINHAS_DO_GUETTO_ROLE_ID,
    CONFIG.PATRULHA_PATA_ROLE_ID,
    CONFIG.PENDENTE_ROLE_ID,
  ].filter(Boolean);
  for (const roleId of peerRolesToDeny) {
    overwrites.push({ id: roleId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  return overwrites;
}

/**
 * Reaplica as overwrites correctas a todos os canais individuais de
 * bairristas. Fetches `members.channel_id` onde role é bairrista/morador
 * e status=ativo. Idempotente — aplica mesmo que já esteja correcto.
 *
 * Usado pelo `/rg-sync-perms apply` e como one-shot depois do rename.
 *
 * @param {Guild} guild
 * @param {{ dryRun?: boolean }} opts
 */
async function reconcileBairristaChannels(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const botId = guild.members.me.id;

  const res = await query(`
    SELECT m.id, m.discord_id, m.channel_id, m.display_name
      FROM members m
     WHERE m.channel_id IS NOT NULL
       AND m.status = 'ativo'
       AND m.role IN ('bairrista', 'morador', 'patrao_di_zona', 'chefe_moradores')
  `);

  const report = { scanned: 0, fixed: 0, skipped: 0, missing: 0, errors: [] };

  for (const row of res.rows) {
    report.scanned++;
    const channel = guild.channels.cache.get(row.channel_id);
    if (!channel) {
      report.missing++;
      continue;
    }

    const overwrites = buildBairristaChannelOverwrites(guild, row.discord_id, botId);
    if (dryRun) {
      report.fixed++;
      continue;
    }
    try {
      await queueChannelOp(() => channel.permissionOverwrites.set(overwrites, 'reconcileBairristaChannels — deny bairrista peers'));
      report.fixed++;
    } catch (e) {
      warn(`[CHANNEL-INV] Falha em ${row.display_name} (${row.channel_id}): ${e.message}`);
      report.errors.push({ discordId: row.discord_id, channelId: row.channel_id, message: e.message });
    }
  }

  log(`[CHANNEL-INV] scanned=${report.scanned} fixed=${report.fixed} missing=${report.missing} errors=${report.errors.length} dry=${dryRun}`);
  return report;
}

module.exports = {
  buildBairristaChannelOverwrites,
  reconcileBairristaChannels,
};
