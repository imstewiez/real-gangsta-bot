'use strict';
/**
 * /nova-categoria-topicos — força criação de uma nova overflow category.
 *
 * Para quando o /organize-topicos não dispara auto-create porque:
 *   - Não há órfãos para mover (sem trigger)
 *   - A primary ainda não está 50/50 (sem trigger)
 *   - Ou simplesmente queremos criar proactivamente antes de encher
 *
 * Diferente de /organize-topicos: este comando NÃO faz preview — cria logo.
 * Chefia-only. Clona perms da primary. Persiste em managed_topic_categories.
 */

const { ChannelType, MessageFlags } = require('discord.js');
const { query } = require('../db');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { EMOJI, ERRORS } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { queueChannelOp } = require('../discordQueue');

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

async function _nextOverflowName(guild) {
  const primary = CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID;
  let baseName = 'Tópicos Bairristas';
  if (primary) {
    const cat = await guild.channels.fetch(primary).catch(() => null);
    if (cat?.name) baseName = cat.name.replace(/\s*#\d+$/, '');
  }
  const r = await query(`SELECT COUNT(*)::int AS n FROM managed_topic_categories WHERE role = 'overflow-auto'`).catch(
    () => ({ rows: [{ n: 0 }] })
  );
  const nextIdx = (r.rows[0]?.n || 0) + 2;
  return `${baseName} #${nextIdx}`;
}

async function handle(interaction) {
  try {
    return await _handleInner(interaction);
  } catch (e) {
    warn(`[NOVA-CATEGORIA] Erro: ${e.message}\n${e.stack}`);
    const msg = `${EMOJI.ERRO} Falha: ${String(e.message).slice(0, 200)}`;
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: msg }).catch(() => {});
    }
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function _handleInner(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('criar categoria de tópicos'), flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }
  if (!CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} \`BAIRRISTA_TOPICOS_CATEGORY_ID\` não configurado.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const name = await _nextOverflowName(guild);
  const permissionOverwrites = (await _cloneOverwritesFromPrimary(guild)) || [];

  const cat = await queueChannelOp(() =>
    guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      permissionOverwrites,
      reason: `Overflow category criada via /nova-categoria-topicos por ${interaction.user.tag}`,
    })
  );

  await query(
    `INSERT INTO managed_topic_categories (category_id, role, notes)
     VALUES ($1, 'overflow-auto', $2)
     ON CONFLICT (category_id) DO NOTHING`,
    [cat.id, `Criada via /nova-categoria-topicos por ${interaction.user.id} em ${new Date().toISOString()}`]
  );

  log(`[NOVA-CATEGORIA] '${name}' (${cat.id}) criada por ${interaction.user.tag}.`);

  const embed = brandEmbed('MOVEMENT')
    .setColor(0x2ecc71)
    .setTitle(`${EMOJI.OK} Categoria criada`)
    .setDescription(
      `**${name}** criada com perms clonadas da primary.\n\n` +
        `Nova categoria: <#${cat.id}>\n\n` +
        `A partir de agora, qualquer /backfill-topicos, /organize-topicos ou approve de tag usa esta categoria como fallback quando a primary estiver cheia.\n\n` +
        `Podes correr \`/organize-topicos executar:true\` para mover órfãos directamente para cá.`
    );
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = { handle };
