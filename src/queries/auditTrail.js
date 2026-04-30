'use strict';
const { MessageFlags } = require('discord.js');
const { query } = require('../db');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });
  const tipo = interaction.options.getString('tipo');
  const id = interaction.options.getInteger('id');

  let rows = [];
  if (tipo === 'entrega') {
    const r = await query(
      `SELECT * FROM inventory_delivery_requests WHERE id = $1 UNION ALL
       SELECT id, member_id, item_id, quantity, status, notes, created_by, created_at, updated_at, reviewed_by, reviewed_at FROM inventory_delivery_requests WHERE id = $1`,
      [id]
    );
    rows = r.rows;
  } else if (tipo === 'encomenda') {
    const r = await query(`SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY changed_at`, [id]);
    rows = r.rows;
  } else if (tipo === 'membro') {
    const r = await query(
      `SELECT action, entity_type, created_at, actor_tag, context FROM audit_logs WHERE entity_id = $1::text ORDER BY created_at DESC LIMIT 20`,
      [id]
    );
    rows = r.rows;
  } else if (tipo === 'item') {
    const r = await query(`SELECT * FROM item_price_history WHERE item_id = $1 ORDER BY changed_at DESC LIMIT 20`, [
      id,
    ]);
    rows = r.rows;
  }

  const lines = rows.map(r => `• \`${r.created_at || r.changed_at}\` — ${JSON.stringify(r).slice(0, 100)}`);
  const embed = brandEmbed('SHORT')
    .setTitle(`📜 Audit Trail — ${tipo} #${id}`)
    .setDescription(lines.join('\n') || 'Sem registos.');
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handle };
