'use strict';
/**
 * Settlement wizard — UI de fecho de saída por participante.
 *
 * Fluxo:
 *   1. handleStart(interaction, saidaId): publica ephemeral com embed de
 *      estado actual dos participantes + select "próximo" + botão "Concluir"
 *   2. user escolhe participante no select → abre modal (kills, downs,
 *      morreu S/N, morreu com material S/N, notas)
 *   3. modal submit: actualiza DB participant (settled=true) + re-renderiza
 *      o embed (participante desaparece do select)
 *   4. user clica "Concluir" quando quiser → auto-liquida restantes como
 *      "vivos sem kills", agrega totais (our_kills, deaths) na saída,
 *      chama saidaEngine.finalizeSaidaSettlement(saidaId) que dispara
 *      os stats updates + publish dos 3 embeds.
 *
 * CustomIds:
 *   saida::wz_select::<saidaId>         - select próximo participante
 *   saida::wz_modal::<saidaId>::<discId> - modal para esse participante
 *   saida::wz_finish::<saidaId>         - botão Concluir
 */

const {
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { saidaRepo, killRepo, memberRepo } = require('../repositories');
const { query } = require('../db');
const { safeReply, safeUpdate, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { SAIDAS, EMOJI } = require('../content');
const CONFIG = require('../config');
const { log, warn } = require('../logger');

async function _renderWizardMessage(saidaId) {
  const participants = await saidaRepo.getParticipants(saidaId);
  const saida = await saidaRepo.findById(saidaId);

  const pending = participants.filter(p => !p.settled);
  const settled = participants.filter(p => p.settled);

  const lines = [
    SAIDAS.WIZARD_DESC(saidaId),
    saida?.result ? `Resultado: **${saida.result.toUpperCase()}**` : '',
    '',
    `Pendentes: **${pending.length}** · Liquidados: **${settled.length}**`,
  ].filter(Boolean);

  if (settled.length) {
    lines.push('', `**${EMOJI.OK} Liquidados:**`);
    for (const p of settled.slice(0, 10)) {
      const status = p.died ? `${EMOJI.MORTE} Morto` : `${EMOJI.OK} Vivo`;
      const k = p.kills ? ` · **${p.kills}k**` : '';
      const d = p.downs ? ` · ${p.downs}d` : '';
      lines.push(`• <@${p.discord_id}> — ${status}${k}${d}`);
    }
    if (settled.length > 10) lines.push(`_… e mais ${settled.length - 10}._`);
  }

  const embed = brandEmbed()
    .setColor(0x9B59B6)
    .setTitle(SAIDAS.WIZARD_TITLE)
    .setDescription(lines.join('\n'));

  const components = [];

  if (pending.length) {
    const options = pending.slice(0, 25).map(p => ({
      label: `${p.display_name || p.discord_id}`.slice(0, 100),
      description: p.role_in_op || 'membro',
      value: p.discord_id,
    }));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`saida::wz_select::${saidaId}`)
        .setPlaceholder(SAIDAS.WIZARD_SELECT_PLACEHOLDER(pending.length))
        .setMinValues(1).setMaxValues(1)
        .addOptions(options)
    ));
  }

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`saida::wz_finish::${saidaId}`)
      .setStyle(pending.length ? ButtonStyle.Primary : ButtonStyle.Success)
      .setLabel(pending.length ? SAIDAS.WIZARD_BTN_FINISH_PENDING : SAIDAS.WIZARD_BTN_FINISH_DONE)
      .setEmoji(EMOJI.FECHAR)
  ));

  return { embed, components };
}

async function handleStart(interaction, saidaId) {
  const { embed, components } = await _renderWizardMessage(saidaId);
  return safeReply(interaction, { embeds: [embed], components, flags: MessageFlags.Ephemeral }, { dismissible: false });
}

async function handleSelectParticipant(interaction) {
  if (isDuplicate(interaction.id)) return;
  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const discordId = interaction.values[0];
  const member = await memberRepo.findByDiscordId(discordId);

  const modal = new ModalBuilder()
    .setCustomId(`saida::wz_modal::${saidaId}::${discordId}`)
    .setTitle(`Liquidar — ${member?.display_name || discordId}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('kills')
          .setLabel(SAIDAS.MODAL.KILLS_LABEL)
          .setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(4).setPlaceholder('0')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('downs')
          .setLabel(SAIDAS.MODAL.DOWNS_LABEL)
          .setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(4).setPlaceholder('0')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('died')
          .setLabel(SAIDAS.MODAL.DIED_LABEL)
          .setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(3).setPlaceholder('N')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('died_with_mat')
          .setLabel(SAIDAS.MODAL.DIED_WITH_MAT_LABEL)
          .setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(3).setPlaceholder('N')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes')
          .setLabel(SAIDAS.MODAL.NOTES_LABEL)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false).setMaxLength(300)),
    );
  await safeShowModal(interaction, modal);
}

async function handleSettleModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const discordId = parts[3];

  const kills = parseInt(getModalField(interaction, 'kills')) || 0;
  const downs = parseInt(getModalField(interaction, 'downs')) || 0;
  const diedRaw = getModalField(interaction, 'died').toLowerCase().trim();
  const died = diedRaw.startsWith('s') || diedRaw.startsWith('y') || diedRaw === '1';
  const diedWithRaw = getModalField(interaction, 'died_with_mat').toLowerCase().trim();
  const diedWithMat = died && (diedWithRaw.startsWith('s') || diedWithRaw.startsWith('y') || diedWithRaw === '1');
  const notes = getModalField(interaction, 'notes') || '';

  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) {
    warn(`[WIZARD] member não encontrado: ${discordId}`);
    return;
  }

  // Material fornecido ao participante
  const fornecidoRes = await query(
    `SELECT om.item_id, om.quantity, i.estimated_value
       FROM operation_materials om
       JOIN items i ON i.id = om.item_id
      WHERE om.operation_id = $1 AND om.direction = 'fornecido' AND om.member_id = $2`,
    [saidaId, member.id]
  );
  const issuedValue = fornecidoRes.rows.reduce((acc, r) => acc + (r.quantity * (parseFloat(r.estimated_value) || 0)), 0);
  const issuedItems = fornecidoRes.rows.map(r => ({ itemId: r.item_id, qty: r.quantity }));

  let lostValue = 0, returnedValue = 0;
  if (diedWithMat && issuedItems.length) {
    // Usa settleParticipantCustody para registar tudo como perdido
    const saidaEngine = require('./saidaEngine');
    await saidaEngine.settleParticipantCustody(saidaId, discordId, {
      diedWithItems: issuedItems, died: true, survived: false, returned: false,
    }, interaction.user.id, interaction.guild);
    lostValue = issuedValue;
  } else {
    // Se não morreu com material (ou sobreviveu), só actualiza o estado básico
    await saidaRepo.updateParticipant(saidaId, member.id, {
      died, survived: !died, returned: !died,
    });
    if (!died) returnedValue = issuedValue; // assumimos que sobrevivente devolveu (aproximação simples)
    else lostValue = issuedValue; // morreu mas sem material registado nominal
  }

  const netDelta = returnedValue - lostValue;

  await saidaRepo.updateParticipant(saidaId, member.id, {
    kills, downs, deaths_count: died ? 1 : 0,
    issued_value: issuedValue,
    returned_value: returnedValue,
    lost_value: lostValue,
    net_material_delta: netDelta,
    notes: notes.slice(0, 500),
    settled: true,
  });

  log(`[WIZARD] saída #${saidaId} participante ${discordId}: k=${kills} d=${downs} died=${died}`);

  // Re-renderiza a mensagem com o estado actualizado
  const { embed, components } = await _renderWizardMessage(saidaId);
  try { await interaction.editReply({ embeds: [embed], components }); } catch (_) {}
}

async function handleFinish(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2]);

  // Auto-liquida os que ficaram pendentes como "vivo, sem kills"
  const participants = await saidaRepo.getParticipants(saidaId);
  const pending = participants.filter(p => !p.settled);
  for (const p of pending) {
    await saidaRepo.updateParticipant(saidaId, p.member_id, {
      kills: 0, downs: 0, deaths_count: 0,
      died: false, survived: true, returned: true,
      settled: true,
    });
  }

  // Agrega totais e actualiza saída
  const refreshed = await saidaRepo.getParticipants(saidaId);
  const totalKills = refreshed.reduce((a, p) => a + (p.kills || 0), 0);
  const totalDeaths = refreshed.filter(p => p.died).length;
  const survivors = refreshed.filter(p => p.survived).length;

  await saidaRepo.updateStatus(saidaId, 'concluida', {
    our_kills: totalKills,
    deaths: totalDeaths,
    survivors,
  });

  // Chama closeSaida para disparar cálculos económicos + scoring + stats +
  // publish dos 3 embeds. Se já foi chamado antes (close modal), isto é
  // idempotente (updateParticipant acumula, scoring recalcula).
  const saidaEngine = require('./saidaEngine');
  const saida = await saidaRepo.findById(saidaId);
  const result = await saidaEngine.closeSaida(saidaId, {
    result: saida.result || 'sem_conflito',
    had_fight: saida.had_fight,
    had_craft: saida.had_craft,
    had_domination: saida.had_domination,
    enemy_name: saida.enemy_name,
    enemy_faction: saida.enemy_faction,
    our_kills: totalKills,
    deaths: totalDeaths,
    survivors,
    result_notes: saida.result_notes,
    craft_amount: saida.craft_amount,
  }, interaction.user.id);

  const v = result?.values || {};
  const channelId = CONFIG.SAIDA_RESULTS_CHANNEL_ID || CONFIG.AUDIT_CHANNEL_ID || '';
  return safeReply(interaction, {
    content: SAIDAS.WIZARD_SUMMARY(saidaId, totalKills, totalDeaths, survivors, v.net, v.was_profitable, channelId),
  }, { dismissible: true });
}

module.exports = { handleStart, handleSelectParticipant, handleSettleModal, handleFinish };
