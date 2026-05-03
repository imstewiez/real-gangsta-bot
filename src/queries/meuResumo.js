'use strict';
const { MessageFlags } = require('discord.js');
const { query } = require('../db');
const { brandEmbed, progressBar } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');
const { formatPtDateOnly } = require('../shared/formatPtDate');

const fmt = n => (Number(n) || 0).toLocaleString('pt-PT');

async function handle(interaction) {
  const discordId = interaction.user.id;
  const mr = await query('SELECT id, display_name, role FROM members WHERE discord_id = $1', [discordId]);
  if (!mr.rows.length) return safeReply(interaction, { content: '❌ Não encontrado.', flags: MessageFlags.Ephemeral });
  const m = mr.rows[0];

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  const [deliveries, sales, rank, pendingDel, pendingOrd, openSaidas, movements, progress] = await Promise.all([
    query(
      "SELECT COALESCE(SUM(quantity),0)::int as n FROM inventory_movements WHERE member_id=$1 AND movement_type IN ('entrega_bairrista','entrega_oficial') AND created_at>=$2",
      [m.id, weekStart]
    ),
    query(
      "SELECT COALESCE(SUM(quantity),0)::int as n FROM inventory_movements WHERE member_id=$1 AND movement_type='venda_bairrista' AND created_at>=$2",
      [m.id, weekStart]
    ),
    query(
      'SELECT position, hybrid_score FROM weekly_rankings WHERE member_id=$1 AND week_start=(SELECT MAX(week_start) FROM weekly_rankings) LIMIT 1',
      [m.id]
    ),
    query(
      "SELECT COUNT(*)::int as n FROM inventory_delivery_requests WHERE requester_member_id=$1 AND status='pending'",
      [m.id]
    ),
    query("SELECT COUNT(*)::int as n FROM orders WHERE member_id=$1 AND status IN ('pending','in_progress','ready')", [
      m.id,
    ]),
    query(
      "SELECT COUNT(*)::int as n FROM operation_participants sp JOIN operations s ON s.id=sp.operation_id WHERE sp.member_id=$1 AND s.status NOT IN ('concluida','cancelada')",
      [m.id]
    ),
    query(
      `SELECT im.quantity, im.movement_type, i.name as item_name, im.created_at
       FROM inventory_movements im
       JOIN items i ON i.id = im.item_id
       WHERE im.member_id=$1
       ORDER BY im.created_at DESC
       LIMIT 10`,
      [m.id]
    ),
    (async () => {
      try {
        const { getPromotionProgress } = require('../members/autoPromotionEngine');
        return await getPromotionProgress(discordId);
      } catch {
        return null;
      }
    })(),
  ]);

  const embed = brandEmbed('HOUSE')
    .setTitle(`📊 Resumo de ${m.display_name}`)
    .setDescription(`Cargo: **${m.role}** | Semana de ${weekStart.toISOString().slice(0, 10)}`);

  // ── Métricas principais ───────────────────────────────────────────────────
  embed.addFields(
    { name: '📥 Entregas', value: `${deliveries.rows[0].n} un`, inline: true },
    { name: '💰 Vendas', value: `${sales.rows[0].n} un`, inline: true },
    { name: '🏆 Ranking', value: rank.rows.length ? `#${rank.rows[0].position}` : 'N/A', inline: true },
    { name: '⏳ Pendentes', value: `${pendingDel.rows[0].n} ent | ${pendingOrd.rows[0].n} enc`, inline: true },
    { name: '🚗 Saídas', value: `${openSaidas.rows[0].n} activas`, inline: true }
  );

  // ── Progresso ─────────────────────────────────────────────────────────────
  if (progress) {
    const tierField = { name: '🎯 Tier Actual', value: `**${progress.currentTierName}**`, inline: true };
    const materialField = {
      name: `${EMOJI.MATERIAL} XP total`,
      value: `**${fmt(progress.totalQty)}**`,
      inline: true,
    };

    if (!progress.maxedOut && progress.threshold) {
      const bar = progressBar(parseFloat(progress.progress), 100, { width: 14 });
      embed.addFields(
        tierField,
        materialField,
        { name: '⬆️ Próximo Tier', value: `**${progress.nextTierName}**`, inline: true },
        {
          name: '📈 Progresso',
          value: `${bar} **${progress.progress}%**\nMeta: **${fmt(progress.threshold)}** · Falta: **${fmt(progress.remaining)}**`,
          inline: false,
        }
      );
    } else {
      embed.addFields(tierField, materialField, { name: '🏅 Estado', value: 'Tier máximo atingido.', inline: true });
    }
  }

  // ── Histórico recente ─────────────────────────────────────────────────────
  const histRows = movements.rows;
  if (histRows.length) {
    const lines = histRows.map(mov => {
      const emj = mov.movement_type === 'venda_bairrista' ? '💰' : '📥';
      const date = formatPtDateOnly(mov.created_at);
      return `${emj} \`${date}\` **${mov.quantity}× ${mov.item_name}**`;
    });
    embed.addFields({ name: '📜 Últimos Movimentos', value: lines.join('\n').slice(0, 1024), inline: false });
  }

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handle };
