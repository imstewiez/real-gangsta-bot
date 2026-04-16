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
const { query } = require('../db');
const { memberRepo } = require('../repositories');
const { buttonRow, button } = require('../shared/ui/buttons');
const { formatPtDate } = require('../shared/formatPtDate');

const fmt = (n) => (Number(n) || 0).toLocaleString('pt-PT');

const STATUS_EMOJI = {
  pending:   '⏳',
  approved:  '✅',
  fulfilled: '📦',
  denied:    '⛔',
  cancelled: '🚫',
};

const STATUS_LABEL = {
  pending:   'Pendente',
  approved:  'Aprovada',
  fulfilled: 'Entregue',
  denied:    'Recusada',
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
    return safeReply(interaction, { content: 'Não estás registado.' }, { dismissible: true });
  }

  const r = await query(`
    SELECT o.id, o.quantity, o.status, o.notes,
           o.created_at, o.resolved_at,
           i.name AS item_name, i.category, i.estimated_value
      FROM orders o
      JOIN items i ON i.id = o.item_id
     WHERE o.member_id = $1
     ORDER BY o.created_at DESC
     LIMIT 20
  `, [member.id]);

  const embed = brandEmbed('HOUSE').setTitle('📋 Minhas Encomendas');

  if (!r.rows.length) {
    embed.setDescription(
      'Ainda não fizeste nenhuma encomenda.\n\n' +
      'Usa o botão **Encomendar** no teu painel para pedir material à firma.'
    );
  } else {
    // KPI stripe — contagens por estado
    const byStatus = r.rows.reduce((a, row) => {
      a[row.status] = (a[row.status] || 0) + 1;
      return a;
    }, {});
    const kpiParts = [];
    for (const s of ['pending', 'approved', 'fulfilled', 'denied', 'cancelled']) {
      if (byStatus[s]) kpiParts.push(`${STATUS_EMOJI[s]} ${byStatus[s]}`);
    }
    embed.setDescription(kpiParts.join(' · ') + `  ·  últimas **${r.rows.length}**`);

    // Pendentes primeiro (mais urgente)
    const pendentes = r.rows.filter(o => o.status === 'pending');
    const outras    = r.rows.filter(o => o.status !== 'pending');

    if (pendentes.length) {
      const lines = pendentes.map(o => {
        const age = ageLabel(o.created_at);
        const val = o.estimated_value ? ` (~${fmt(o.quantity * Number(o.estimated_value))}€)` : '';
        return `⏳ **${o.quantity}× ${o.item_name}**${val} · aberta há ${age}`;
      });
      embed.addFields({ name: '⏳ Pendentes', value: lines.join('\n'), inline: false });
    }

    if (outras.length) {
      const lines = outras.slice(0, 10).map(o => {
        const emj = STATUS_EMOJI[o.status] || '•';
        const lbl = STATUS_LABEL[o.status] || o.status;
        const when = formatPtDate(o.resolved_at || o.created_at);
        return `${emj} \`${when}\` **${o.quantity}× ${o.item_name}** — ${lbl}`;
      });
      embed.addFields({ name: '📜 Histórico recente', value: lines.join('\n'), inline: false });
    }
  }

  const navRow = buttonRow(
    button({ customId: 'bairrista::encomendar', label: 'Nova Encomenda',  style: 'Success',   emoji: EMOJI.NOVO }),
    button({ customId: 'perfil::voltar',      label: 'Voltar ao Perfil', style: 'Secondary', emoji: EMOJI.VOLTAR }),
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
