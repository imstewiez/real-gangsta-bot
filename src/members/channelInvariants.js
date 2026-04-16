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
const { normalizeChannelNameToShort } = require('../discord/structureTemplate');

/**
 * Constrói o array de permissionOverwrites para um canal individual de
 * bairrista. Usado no onboarding (channel create) e no reconcile (set).
 *
 * @param {Guild} guild
 * @param {string} ownerId — Discord ID do bairrista dono
 * @param {string} botId — Discord ID do bot
 * @param {{ ownerPresent?: boolean }} opts — se ownerPresent=false, omite
 *   o overwrite do dono (ex.: membro saiu do servidor). Sem esta flag,
 *   discord.js rejeita permissionOverwrites.set com "Supplied parameter
 *   is not a cached User or Role". Default true (onboarding + flows
 *   onde o owner está sempre presente).
 * @returns {Array} overwrites prontos para `channels.create` ou `overwrites.set`
 */
function buildBairristaChannelOverwrites(guild, ownerId, botId, opts = {}) {
  const ownerPresent = opts.ownerPresent !== false;

  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: botId,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];

  if (ownerPresent) {
    overwrites.push({
      id: ownerId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

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

  const report = { scanned: 0, fixed: 0, renamed: 0, drift_renamed: 0, skipped: 0, missing: 0, errors: [] };
  const processedChannelIds = new Set();

  for (const row of res.rows) {
    report.scanned++;
    const channel = guild.channels.cache.get(row.channel_id);
    if (!channel) {
      report.missing++;
      continue;
    }
    processedChannelIds.add(channel.id);

    // Guard: owner tem de estar no guild. Se saiu do servidor,
    // permissionOverwrites.set() rejeita com "Supplied parameter is not
    // a cached User or Role". Verifica + pede fetch best-effort; se não
    // resolve, constrói overwrites SEM a entrada do owner (staff + denies
    // ainda aplicam). Evita erros durante reconcile.
    let ownerPresent = guild.members.cache.has(row.discord_id);
    if (!ownerPresent) {
      const fetched = await guild.members.fetch(row.discord_id).catch(() => null);
      ownerPresent = Boolean(fetched);
    }
    const overwrites = buildBairristaChannelOverwrites(guild, row.discord_id, botId, { ownerPresent });

    // Rename: pattern-based (database-independent). Lê o nome actual do canal
    // e substitui bold(legacy label) por bold(short label) se encontrar.
    // Não depende de m.tier / m.nickname (que podem estar null em members
    // antigos — antes dependíamos disso e só 1 canal era renomeado).
    const newName = normalizeChannelNameToShort(channel.name);
    const needsRename = newName && newName !== channel.name;

    if (dryRun) {
      report.fixed++;
      if (needsRename) report.renamed++;
      continue;
    }
    try {
      await queueChannelOp(() => channel.permissionOverwrites.set(overwrites, 'reconcileBairristaChannels — deny bairrista peers'));
      report.fixed++;
    } catch (e) {
      warn(`[CHANNEL-INV] Perms falha em ${row.display_name} (${row.channel_id}): ${e.message}`);
      report.errors.push({ op: 'perms', discordId: row.discord_id, channelId: row.channel_id, message: e.message });
    }

    if (needsRename) {
      try {
        const oldName = channel.name;
        await queueChannelOp(() => channel.setName(newName, 'reconcileBairristaChannels — tier label encurtado'));
        log(`[CHANNEL-INV] Renamed: "${oldName}" → "${newName}"`);
        report.renamed++;
      } catch (e) {
        warn(`[CHANNEL-INV] Rename falha em ${channel.name} (${row.channel_id}): ${e.message}`);
        report.errors.push({ op: 'rename', discordId: row.discord_id, channelId: row.channel_id, message: e.message });
      }
    }
  }

  // Drift sweep — varre a categoria dos tópicos dos bairristas à procura de
  // canais com label legacy cujo ID não esteja no members (DB drift — canal
  // orphan ou member desincronizado). Rename-only, sem perms (não temos
  // discord_id do owner para perms personalizadas).
  const topicosCatId = CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID;
  if (topicosCatId) {
    for (const [chId, ch] of guild.channels.cache) {
      if (ch.parentId !== topicosCatId) continue;
      if (processedChannelIds.has(chId)) continue;
      const newName = normalizeChannelNameToShort(ch.name);
      if (!newName) continue;
      if (dryRun) { report.drift_renamed++; continue; }
      try {
        const oldName = ch.name;
        await queueChannelOp(() => ch.setName(newName, 'reconcileBairristaChannels — drift rename'));
        log(`[CHANNEL-INV] Drift renamed: "${oldName}" → "${newName}"`);
        report.drift_renamed++;
      } catch (e) {
        warn(`[CHANNEL-INV] Drift rename falha em ${ch.name}: ${e.message}`);
        report.errors.push({ op: 'drift_rename', channelId: chId, message: e.message });
      }
    }
  }

  log(`[CHANNEL-INV] scanned=${report.scanned} fixed=${report.fixed} renamed=${report.renamed} drift=${report.drift_renamed} missing=${report.missing} errors=${report.errors.length} dry=${dryRun}`);
  return report;
}

module.exports = {
  buildBairristaChannelOverwrites,
  reconcileBairristaChannels,
};
