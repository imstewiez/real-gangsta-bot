'use strict';
/**
 * /saidas — últimas saídas do próprio membro (ou detalhe de uma específica).
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { memberRepo } = require('../repositories');
const { query } = require('../db');

async function handle(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const specificId = interaction.options.getInteger('id');
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(interaction, { content: 'Não estás registado.' }, { dismissible: true });
  }

  if (specificId) {
    const part = await query(
      `SELECT op.*, o.spot, o.date, o.result, o.operation_type
         FROM operation_participants op
         JOIN operations o ON o.id = op.operation_id
        WHERE op.operation_id = $1 AND op.member_id = $2`,
      [specificId, member.id]
    );
    if (!part.rows[0]) {
      return safeReply(interaction, {
        content: `Não participaste na saída #${specificId}.`,
      }, { dismissible: true });
    }
    const p = part.rows[0];
    const typeTag = p.participant_type === 'trabalhador' ? '🛠️ Trabalhador' : '🏴 Caracterizado';
    const embed = brandEmbed('MOVEMENT')
      .setTitle(`${EMOJI.SAIDA} Saída #${specificId} — O teu resultado`)
      .addFields(
        { name: 'Spot', value: p.spot || '—', inline: true },
        { name: 'Data', value: String(p.date).split('T')[0], inline: true },
        { name: 'Tipo', value: typeTag, inline: true },
        { name: `${EMOJI.KILL} Kills`, value: String(p.kills || 0), inline: true },
        { name: p.died ? `${EMOJI.MORTE} Morto` : `${EMOJI.OK} Vivo`, value: '\u200b', inline: true },
        { name: 'Performance', value: `**${Math.round(p.performance_score || 0)}**`, inline: true },
        { name: 'Disciplina', value: `**${Math.round(p.discipline_score || 0)}%**`, inline: true },
        { name: p.mvp_flag ? `${EMOJI.MVP} MVP` : 'MVP', value: p.mvp_flag ? '**Sim**' : 'Não', inline: true },
      );
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  }

  // Últimas 10 saídas
  const recent = await query(
    `SELECT op.kills, op.died, op.performance_score, op.discipline_score, op.mvp_flag,
            op.participant_type, op.own_weapon,
            o.id, o.spot, o.date, o.result, o.operation_type
       FROM operation_participants op
       JOIN operations o ON o.id = op.operation_id
      WHERE op.member_id = $1 AND o.status = 'concluida'
      ORDER BY o.date DESC, o.id DESC LIMIT 10`,
    [member.id]
  );
  if (!recent.rows.length) {
    return safeReply(interaction, { content: 'Ainda não tens saídas fechadas.' }, { dismissible: true });
  }

  const lines = recent.rows.map(r => {
    const result = r.result === 'vitoria' ? `${EMOJI.VITORIA}`
                 : r.result === 'derrota' ? `${EMOJI.DERROTA}`
                 : `${EMOJI.INFO}`;
    const mvp = r.mvp_flag ? ` ${EMOJI.MVP}` : '';
    const death = r.died ? ` ${EMOJI.MORTE}` : '';
    const typeTag = r.participant_type === 'trabalhador' ? ' 🛠️' : '';
    return `\`${String(r.date).split('T')[0]}\` **#${r.id}** ${r.spot || '—'} · ${result} · ${r.kills || 0}k · perf **${Math.round(r.performance_score || 0)}**${death}${mvp}${typeTag}`;
  });

  const embed = brandEmbed('MOVEMENT')
    .setTitle(`${EMOJI.SAIDA} As tuas últimas saídas`)
    .setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = { handle };
