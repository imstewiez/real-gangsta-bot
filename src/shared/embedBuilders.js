'use strict';
const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

// Footer assinado por redwood (ou override via BOT_DISPLAY_NAME). Icone opcional
// se BOT_LOGO_URL estiver definido.
function brandEmbed() {
  const footer = { text: `— ${CONFIG.BOT_DISPLAY_NAME} ·` };
  if (CONFIG.BOT_LOGO_URL) footer.iconURL = CONFIG.BOT_LOGO_URL;
  return new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setFooter(footer)
    .setTimestamp();
}

function successEmbed(title, description) {
  return brandEmbed()
    .setTitle(`✅ ${title}`)
    .setDescription(description || null);
}

function errorEmbed(title, description) {
  return brandEmbed()
    .setColor(0xC0392B)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description || null);
}

function infoEmbed(title, description) {
  return brandEmbed()
    .setTitle(title)
    .setDescription(description || null);
}

function stockEmbed(items) {
  const embed = brandEmbed().setTitle('Inventário — Stock Atual');
  if (!items.length) {
    embed.setDescription('Sem itens em stock.');
    return embed;
  }
  const lines = items.map(i =>
    `**${i.name}** (${i.category}) — ${i.balance} ${i.unit}`
  );
  embed.setDescription(lines.join('\n'));
  return embed;
}

function operationEmbed(op) {
  const statusMap = {
    aberta: '\uD83D\uDFE2 Aberta',
    em_preparacao: '\uD83D\uDFE1 Em Preparação',
    em_curso: '\uD83D\uDFE0 Em Curso',
    concluida: '\u2705 Concluída',
    cancelada: '\u274C Cancelada',
  };
  const typeMap = {
    craft: 'Craft', dominio: 'Domínio', ataque: 'Ataque',
    defesa: 'Defesa', recolha: 'Recolha', outra: 'Outra',
  };

  return brandEmbed()
    .setTitle(`Operação #${op.id} — ${typeMap[op.operation_type] || op.operation_type}`)
    .addFields(
      { name: 'Data', value: op.date?.toISOString?.()?.split('T')[0] || String(op.date), inline: true },
      { name: 'Estado', value: statusMap[op.status] || op.status, inline: true },
      { name: 'Spot', value: op.spot || '\u2014', inline: true },
      { name: 'Grupo', value: `#${op.group_number} (max ${op.max_participants})`, inline: true },
      { name: 'Líder', value: op.leader_name || '\u2014', inline: true },
    );
}

function rankingEmbed(title, rankings, weekLabel) {
  const embed = brandEmbed().setTitle(`\uD83C\uDFC6 ${title} — ${weekLabel}`);
  if (!rankings.length) {
    embed.setDescription('Sem dados para esta semana.');
    return embed;
  }
  const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
  const lines = rankings.map((r, i) => {
    const prefix = medals[i] || `**${i + 1}.**`;
    return `${prefix} <@${r.discord_id}> — ${r.weighted_value} pts (${r.deliveries} entregas, ${r.sales} vendas, ${r.operations_count} ops)`;
  });
  embed.setDescription(lines.join('\n'));
  return embed;
}

function memberProfileEmbed(member) {
  const roleMap = {
    morador: 'Morador', oficial: 'Oficial',
    chefia: 'Chefia', chefe_moradores: 'Chefe de Moradores',
    inativo: 'Inativo',
  };
  return brandEmbed()
    .setTitle(`Ficha — ${member.display_name || member.username}`)
    .addFields(
      { name: 'Role', value: roleMap[member.role] || member.role, inline: true },
      { name: 'Estado', value: member.status, inline: true },
      { name: 'Desde', value: member.joined_at?.toISOString?.()?.split('T')[0] || '\u2014', inline: true },
    );
}

function welcomeChannelEmbed(memberName) {
  return brandEmbed()
    .setTitle(`🔥 Bem-vindo ao bairro, ${memberName}`)
    .setDescription(
      'Este canal é só teu. A partir daqui manda-se o movimento:\n\n' +
      '📦 **Registar entregas** — material que trazes pra casa\n' +
      '💰 **Registar vendas** — o que é despachado na rua\n' +
      '📋 **Consultar histórico** — o teu rasto no GUETTO\n' +
      '📊 **Ver totais** — quanto já cresceste\n\n' +
      '_Faz por merecer. Cada entrega conta pro próximo tier._'
    );
}

module.exports = {
  brandEmbed,
  successEmbed,
  errorEmbed,
  infoEmbed,
  stockEmbed,
  operationEmbed,
  rankingEmbed,
  memberProfileEmbed,
  welcomeChannelEmbed,
};
