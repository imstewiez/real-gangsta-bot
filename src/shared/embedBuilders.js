'use strict';
const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const content = require('../content');

const { EMOJI, footer, ROLE, STATUS, SAIDA_TYPE, ONBOARDING, INVENTORY, RANKINGS } = content;

// Footer assinado pela Firma RedWood. Icone opcional via BOT_LOGO_URL.
function brandEmbed(variant = 'SHORT') {
  return new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setFooter(footer(variant, CONFIG.BOT_LOGO_URL))
    .setTimestamp();
}

// Aplica o logo como thumbnail (canto superior direito) se BOT_LOGO_URL existir.
// Usar nos painéis principais. No-op silencioso se logo não estiver definido.
function applyLogo(embed) {
  if (CONFIG.BOT_LOGO_URL) embed.setThumbnail(CONFIG.BOT_LOGO_URL);
  return embed;
}

function successEmbed(title, description) {
  return brandEmbed()
    .setTitle(`${EMOJI.OK} ${title}`)
    .setDescription(description || null);
}

function errorEmbed(title, description) {
  return brandEmbed()
    .setColor(0xC0392B)
    .setTitle(`${EMOJI.WARN} ${title}`)
    .setDescription(description || null);
}

function infoEmbed(title, description) {
  return brandEmbed()
    .setTitle(title)
    .setDescription(description || null);
}

function stockEmbed(items) {
  const embed = brandEmbed().setTitle(INVENTORY.TITLE);
  if (!items.length) {
    embed.setDescription(INVENTORY.EMPTY);
    return embed;
  }
  const lines = items.map(i =>
    `**${i.name}** (${i.category}) — ${i.balance} ${i.unit}`
  );
  embed.setDescription(lines.join('\n'));
  return embed;
}

function operationEmbed(op) {
  return brandEmbed()
    .setTitle(`${EMOJI.SAIDA} Saída #${op.id} — ${SAIDA_TYPE[op.operation_type] || op.operation_type}`)
    .addFields(
      { name: 'Data', value: op.date?.toISOString?.()?.split('T')[0] || String(op.date), inline: true },
      { name: 'Estado', value: STATUS[op.status] || op.status, inline: true },
      { name: 'Spot', value: op.spot || '—', inline: true },
      { name: 'Grupo', value: `#${op.group_number} (máx ${op.max_participants})`, inline: true },
      { name: 'Líder', value: op.leader_name || '—', inline: true },
    );
}

function rankingEmbed(title, rankings, weekLabel) {
  const embed = brandEmbed('TOP').setTitle(RANKINGS.TITLE(title, weekLabel));
  if (!rankings.length) {
    embed.setDescription(RANKINGS.EMPTY_WEEK);
    return embed;
  }
  const medals = [EMOJI.MEDAL_1, EMOJI.MEDAL_2, EMOJI.MEDAL_3];
  const lines = rankings.map((r, i) => {
    const prefix = medals[i] || `**${i + 1}.**`;
    const qty = Number(r.weighted_value || 0).toLocaleString('pt-PT');
    return `${prefix} <@${r.discord_id}> — **${qty} itens** (${r.deliveries} ${RANKINGS.LABELS.ENTREGAS}, ${r.sales} ${RANKINGS.LABELS.VENDAS}, ${r.operations_count} ${RANKINGS.LABELS.SAIDAS})`;
  });
  embed.setDescription(lines.join('\n'));
  return embed;
}

function memberProfileEmbed(member) {
  return brandEmbed()
    .setTitle(`${EMOJI.TAG} Ficha — ${member.display_name || member.username}`)
    .addFields(
      { name: 'Peso', value: ROLE[member.role] || member.role, inline: true },
      { name: 'Estado', value: STATUS[member.status] || member.status, inline: true },
      { name: 'Na casa desde', value: member.joined_at?.toISOString?.()?.split('T')[0] || '—', inline: true },
    );
}

function welcomeChannelEmbed(memberName) {
  return brandEmbed('HOUSE')
    .setTitle(ONBOARDING.WELCOME_TITLE(memberName))
    .setDescription(ONBOARDING.WELCOME_BODY);
}

module.exports = {
  brandEmbed,
  applyLogo,
  successEmbed,
  errorEmbed,
  infoEmbed,
  stockEmbed,
  operationEmbed,
  rankingEmbed,
  memberProfileEmbed,
  welcomeChannelEmbed,
};
