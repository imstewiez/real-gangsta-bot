'use strict';
/**
 * Settlement wizard — UI de fecho de saída por participante.
 *
 * Fluxo:
 *   1. handleStart(interaction, saidaId): publica ephemeral com embed de
 *      estado actual dos participantes + select "próximo" + botão "Concluir"
 *   2. user escolhe participante no select → abre modal (kills,
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
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const { saidaRepo, memberRepo } = require('../repositories');
const { query } = require('../db');
const { safeReply, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { buildSearchableSelect } = require('../shared/selectSearch');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { SAIDAS, EMOJI, RESULT_LABEL } = require('../content');
const CONFIG = require('../config');
const { log, warn } = require('../logger');

async function _renderWizardMessage(saidaId) {
  const participants = await saidaRepo.getParticipants(saidaId);
  const saida = await saidaRepo.findById(saidaId);

  const pending = participants.filter(p => !p.settled);
  const settled = participants.filter(p => p.settled);

  const lines = [
    SAIDAS.WIZARD_DESC(saidaId),
    saida?.result ? `Resultado: **${RESULT_LABEL[saida.result] || saida.result}**` : '',
    '',
    `Pendentes: **${pending.length}** · Liquidados: **${settled.length}**`,
  ].filter(Boolean);

  if (settled.length) {
    lines.push('', `**${EMOJI.OK} Liquidados:**`);
    for (const p of settled.slice(0, 10)) {
      const status = p.died ? `${EMOJI.MORTE} Morto` : `${EMOJI.OK} Vivo`;
      const typeTag = p.participant_type === 'trabalhador' ? ' · 🛠️' : '';
      const k = p.kills ? ` · **${p.kills}k**` : '';
      lines.push(`• <@${p.discord_id}>${typeTag} — ${status}${k}`);
    }
    if (settled.length > 10) lines.push(`_… e mais ${settled.length - 10}._`);
  }

  const embed = brandEmbed().setColor(COLOR.PURPLE).setTitle(SAIDAS.WIZARD_TITLE).setDescription(lines.join('\n'));

  const components = [];

  if (pending.length) {
    const options = pending.slice(0, 25).map(p => {
      const typeLabel = p.participant_type === 'trabalhador' ? '🛠️ Trabalhador' : '🏴 Caracterizado';
      const weapon = p.own_weapon ? ' · arma própria' : '';
      return {
        label: `${p.display_name || p.discord_id}`.slice(0, 100),
        description: `${typeLabel}${weapon}`.slice(0, 100),
        value: p.discord_id,
      };
    });
    const searchRows = buildSearchableSelect({
      customId: `saida::wz_select::${saidaId}`,
      placeholder: SAIDAS.WIZARD_SELECT_PLACEHOLDER(pending.length),
      options,
      searchKey: `wizard::${saidaId}`,
      modalTitle: 'Pesquisar participante',
      messageClass: 'FLOW',
    });
    components.push(...searchRows);
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::wz_finish::${saidaId}`)
        .setStyle(pending.length ? ButtonStyle.Primary : ButtonStyle.Success)
        .setLabel(pending.length ? SAIDAS.WIZARD_BTN_FINISH_PENDING : SAIDAS.WIZARD_BTN_FINISH_DONE)
        .setEmoji(EMOJI.FECHAR)
    )
  );

  return { embed, components };
}

async function handleStart(interaction, saidaId) {
  const { embed, components } = await _renderWizardMessage(saidaId);
  return safeReply(
    interaction,
    { embeds: [embed], components, flags: MessageFlags.Ephemeral },
    { messageClass: 'FLOW' }
  );
}

// STEP 1: staff escolheu participante → ephemeral com "Vivo / Morto" botões.
async function handleSelectParticipant(interaction) {
  if (isDuplicate(interaction.id)) return;
  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2], 10);
  if (Number.isNaN(saidaId)) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Saída inválida.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  const discordId = interaction.values[0];
  const member = await memberRepo.findByDiscordId(discordId);
  const name = member?.display_name || discordId;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`saida::wz_outcome::${saidaId}::${discordId}::alive`)
      .setLabel('Vivo')
      .setStyle(ButtonStyle.Success)
      .setEmoji(EMOJI.OK),
    new ButtonBuilder()
      .setCustomId(`saida::wz_outcome::${saidaId}::${discordId}::dead`)
      .setLabel('Morto')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(EMOJI.MORTE)
  );

  await safeReply(
    interaction,
    {
      content: SAIDAS.PROMPTS.WIZARD_PARTICIPANT(name),
      components: [row],
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'FLOW' }
  );
}

// STEP 2: clicou Vivo/Morto → se caracterizado+org+vivo, pergunta arma;
// caso contrário salta para o modal de kills/notes.
async function handleOutcome(interaction) {
  if (isDuplicate(interaction.id)) return;
  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2], 10);
  if (Number.isNaN(saidaId)) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Saída inválida.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  const discordId = parts[3];
  const outcome = parts[4]; // 'alive' | 'dead'

  const participants = await saidaRepo.getParticipants(saidaId);
  const p = participants.find(x => x.discord_id === discordId);
  if (!p) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Participante não encontrado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'WARN' }
    );
  }

  const hadOrgWeapon = p.received_org_material && !p.own_weapon;
  const needsWeaponQuestion = outcome === 'alive' && hadOrgWeapon;

  if (needsWeaponQuestion) {
    await interaction.deferUpdate();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::wz_weapon::${saidaId}::${discordId}::alive::returned`)
        .setLabel('Devolveu')
        .setStyle(ButtonStyle.Success)
        .setEmoji(EMOJI.DEVOLVER),
      new ButtonBuilder()
        .setCustomId(`saida::wz_weapon::${saidaId}::${discordId}::alive::not_returned`)
        .setLabel('Não devolveu')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.ERRO),
      new ButtonBuilder()
        .setCustomId(`saida::wz_weapon::${saidaId}::${discordId}::alive::lost`)
        .setLabel('Perdeu na rua')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(EMOJI.PERDIDO)
    );
    return interaction.editReply({
      content: 'E a arma da org?',
      components: [row],
    });
  }

  // Sem pergunta de arma (morto ou sem arma da org) → modal.
  const weaponDecision = outcome === 'dead' ? 'died_auto' : 'no_org_weapon';
  return _openSettleModal(interaction, saidaId, discordId, outcome, weaponDecision);
}

// STEP 3: clicou decisão da arma → abre modal.
async function handleWeaponDecision(interaction) {
  if (isDuplicate(interaction.id)) return;
  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2], 10);
  if (Number.isNaN(saidaId)) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Saída inválida.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  const discordId = parts[3];
  const outcome = parts[4]; // 'alive'
  const weaponDecision = parts[5]; // 'returned' | 'not_returned' | 'lost'
  return _openSettleModal(interaction, saidaId, discordId, outcome, weaponDecision);
}

async function _openSettleModal(interaction, saidaId, discordId, outcome, weaponDecision) {
  const member = await memberRepo.findByDiscordId(discordId);
  const modal = new ModalBuilder()
    .setCustomId(`saida::wz_modal::${saidaId}::${discordId}::${outcome}::${weaponDecision}`)
    .setTitle(`Liquidar — ${member?.display_name || discordId}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('kills')
          .setLabel(SAIDAS.MODAL.KILLS_LABEL)
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(4)
          .setPlaceholder('0')
          .setValue('0')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel(SAIDAS.MODAL.NOTES_LABEL)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(300)
      )
    );
  await safeShowModal(interaction, modal);
}

async function handleSettleModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});

  // Formato custom ID: saida::wz_modal::<saidaId>::<discId>::<outcome>::<weapon>
  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const discordId = parts[3];
  const outcome = parts[4]; // 'alive' | 'dead'
  const weaponDecision = parts[5]; // 'returned' | 'not_returned' | 'lost' | 'died_auto' | 'no_org_weapon'

  const kills = Math.max(0, Math.min(parseInt(getModalField(interaction, 'kills')) || 0, 100));
  const died = outcome === 'dead';
  // Se morreu e tinha material da org, assume perda total. Se morreu sem
  // material, não há perda (weaponDecision='died_auto' mas sem issued).
  // Se sobreviveu: returned → sem perda; not_returned/lost → perda total.
  // const diedWithMat = died;
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
  const issuedValue = fornecidoRes.rows.reduce((acc, r) => acc + r.quantity * (parseFloat(r.estimated_value) || 0), 0);
  const issuedItems = fornecidoRes.rows.map(r => ({ itemId: r.item_id, qty: r.quantity }));

  // Decisão de material baseada em weaponDecision (derivado dos botões).
  // Morreu OU sobreviveu e disse "não devolveu"/"perdeu" → material perdido.
  // Sobreviveu e devolveu → material retornado (sem perda).
  const materialLost = weaponDecision !== 'returned' && weaponDecision !== 'no_org_weapon';

  let lostValue = 0,
    returnedValue = 0;
  if (materialLost && issuedItems.length) {
    const saidaEngine = require('./saidaEngine');
    await saidaEngine.settleParticipantCustody(
      saidaId,
      discordId,
      {
        diedWithItems: issuedItems,
        died,
        survived: !died,
        returned: false,
      },
      interaction.user.id,
      interaction.guild
    );
    lostValue = issuedValue;
  } else {
    await saidaRepo.updateParticipant(saidaId, member.id, {
      died,
      survived: !died,
      returned: !died,
    });
    if (!died) returnedValue = issuedValue;
  }

  const netDelta = returnedValue - lostValue;

  await saidaRepo.updateParticipant(saidaId, member.id, {
    kills,
    deaths_count: died ? 1 : 0,
    issued_value: issuedValue,
    returned_value: returnedValue,
    lost_value: lostValue,
    net_material_delta: netDelta,
    notes: notes.slice(0, 500),
    settled: true,
  });

  log(`[WIZARD] saída #${saidaId} participante ${discordId}: k=${kills} died=${died}`);

  // Re-renderiza a mensagem com o estado actualizado
  const { embed, components } = await _renderWizardMessage(saidaId);
  try {
    await interaction.editReply({ embeds: [embed], components });
  } catch (_) {}
}

async function handleFinish(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2]);
  const saidaEngine = require('./saidaEngine');

  // Guard: se a saída já foi finalizada, mostrar resumo
  const currentSaida = await saidaRepo.findById(saidaId);
  if (currentSaida?.status === 'concluida') {
    const v = { net: currentSaida.net_value || 0, was_profitable: currentSaida.was_profitable };
    const channelId = CONFIG.SAIDA_RESULTS_CHANNEL_ID || CONFIG.AUDIT_CHANNEL_ID || '';
    return safeReply(
      interaction,
      {
        content: SAIDAS.WIZARD_SUMMARY(
          saidaId,
          currentSaida.our_kills || 0,
          currentSaida.deaths || 0,
          currentSaida.survivors || 0,
          v.net,
          v.was_profitable,
          channelId
        ),
      },
      { messageClass: 'BANAL' }
    );
  }

  // Auto-liquida os que ficaram pendentes como "vivo, sem kills"
  const participants = await saidaRepo.getParticipants(saidaId);
  const pending = participants.filter(p => !p.settled);
  for (const p of pending) {
    // Auto-settle: vivo, 0 kills, arma tratada conforme tipo
    const weaponStatus = p.own_weapon || !p.received_org_material ? 'not_applicable' : 'confirmed_returned';
    await saidaRepo.updateParticipant(saidaId, p.member_id, {
      kills: 0,
      deaths_count: 0,
      died: false,
      survived: true,
      returned: true,
      settled: true,
      individual_result_submitted: true,
      individual_result_at: new Date(),
      weapon_return_status: weaponStatus,
    });
  }

  // Step 1: closeSaida → em_liquidacao (guarda metadata de resultado)
  const saida = await saidaRepo.findById(saidaId);
  if (!['concluida', 'em_liquidacao'].includes(saida.status)) {
    await saidaEngine.closeSaida(
      saidaId,
      {
        result: saida.result || 'sem_conflito',
        had_fight: saida.had_fight,
        had_craft: saida.had_craft,
        had_domination: saida.had_domination,
        enemy_name: saida.enemy_name,
        enemy_faction: saida.enemy_faction,
        result_notes: saida.result_notes,
        craft_amount: saida.craft_amount,
      },
      interaction.user.id
    );
  }

  // Step 2: finalizeSaida → concluida (scoring + stats + publish)
  const result = await saidaEngine.finalizeSaida(saidaId, interaction.user.id);

  // Refresh session embed
  const saidaSession = require('./saidaSession');
  saidaSession.refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

  const v = result?.values || {};
  const channelId = CONFIG.SAIDA_RESULTS_CHANNEL_ID || CONFIG.AUDIT_CHANNEL_ID || '';
  return safeReply(
    interaction,
    {
      content: SAIDAS.WIZARD_SUMMARY(
        saidaId,
        result?.totalKills || 0,
        result?.totalDeaths || 0,
        result?.totalSurvivors || 0,
        v.net,
        v.was_profitable,
        channelId
      ),
    },
    { messageClass: 'BANAL' }
  );
}

module.exports = {
  handleStart,
  handleSelectParticipant,
  handleOutcome,
  handleWeaponDecision,
  handleSettleModal,
  handleFinish,
};
