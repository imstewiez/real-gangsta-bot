'use strict';
/**
 * Perfil → Minhas Encomendas.
 *
 * Lê `orders` por member_id e agrupa por status. Mostra ciclo de vida
 * completo (pendente / aprovada / entregue / recusada / cancelada) com
 * tempo em cada estado.
 */

const { MessageFlags } = require('discord.js');
const { safeReply, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { memberRepo, ordersRepo } = require('../repositories');
const { buttonRow, button } = require('../shared/ui/buttons');
const { formatPtDate } = require('../shared/formatPtDate');
const { formatMoney } = require('../shared/formatMoney');

const fmt = n => (Number(n) || 0).toLocaleString('pt-PT');

const STATUS_EMOJI = {
  pending: '⏳',
  approved: '✅',
  in_progress: '🔧',
  ready: '📦',
  fulfilled: '✅',
  denied: '⛔',
  cancelled: '🚫',
};

const STATUS_LABEL = {
  pending: 'Pendente',
  approved: 'Aprovada',
  in_progress: 'Em Processo',
  ready: 'Pronta',
  fulfilled: 'Entregue',
  denied: 'Recusada',
  cancelled: 'Cancelada',
};

async function handle(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const discordId = interaction.user.id;
  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) {
    return safeReply(interaction, { content: 'Não estás registado.' }, { messageClass: 'BANAL' });
  }

  const rows = await ordersRepo.findByMember(member.id, { limit: 20 });

  const embed = brandEmbed('HOUSE').setTitle('📋 Minhas Encomendas');

  if (!rows.length) {
    embed.setDescription(
      'Ainda não fizeste nenhuma encomenda.\n\n' +
        'Usa o botão **Encomendar** no teu painel para pedir material à firma.'
    );
  } else {
    // KPI stripe — contagens por estado
    const byStatus = rows.reduce((a, row) => {
      a[row.status] = (a[row.status] || 0) + 1;
      return a;
    }, {});
    const kpiParts = [];
    for (const s of ['pending', 'in_progress', 'ready', 'fulfilled', 'denied', 'cancelled']) {
      if (byStatus[s]) kpiParts.push(`${STATUS_EMOJI[s]} ${byStatus[s]}`);
    }
    embed.setDescription(kpiParts.join(' · ') + `  ·  últimas **${rows.length}**`);

    // Activas primeiro (pendentes + em processo + prontas)
    const activas = rows.filter(o => ['pending', 'in_progress', 'ready'].includes(o.status));
    const outras = rows.filter(o => !['pending', 'in_progress', 'ready'].includes(o.status));

    if (activas.length) {
      const lines = activas.map(o => {
        const age = ageLabel(o.created_at);
        const price = o.total_price ? ` (${formatMoney(o.total_price)})` : '';
        return `⏳ **${o.quantity}× ${o.item_name}**${price} · aberta há ${age}`;
      });
      embed.addFields({ name: '🔧 Activas', value: lines.join('\n'), inline: false });
    }

    if (outras.length) {
      const lines = outras.slice(0, 10).map(o => {
        const emj = STATUS_EMOJI[o.status] || '•';
        const lbl = STATUS_LABEL[o.status] || o.status;
        const when = formatPtDate(o.resolved_at || o.created_at);
        const price = o.total_price ? ` (${formatMoney(o.total_price)})` : '';
        return `${emj} \`${when}\` **${o.quantity}× ${o.item_name}**${price} — ${lbl}`;
      });
      embed.addFields({ name: '📜 Histórico recente', value: lines.join('\n'), inline: false });
    }
  }

  const navRow = buttonRow(
    button({ customId: 'bairrista::encomendar', label: 'Nova Encomenda', style: 'Success', emoji: EMOJI.NOVO }),
    button({ customId: 'order::cancel', label: 'Cancelar Encomenda', style: 'Danger', emoji: '❌' }),
    button({ customId: 'perfil::voltar', label: 'Voltar ao Perfil', style: 'Secondary', emoji: EMOJI.VOLTAR })
  );

  return safeReply(interaction, { embeds: [embed], components: [navRow] }, { messageClass: 'COCKPIT' });
}

function ageLabel(ts) {
  const ms = Date.now() - new Date(ts).getTime();
  const h = Math.floor(ms / (60 * 60 * 1000));
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}min`;
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

module.exports = { handle };
