'use strict';
const { MessageFlags } = require('discord.js');
const { query } = require('../db');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });

  const [incidents, staleSync, unfinalized, orphanCh] = await Promise.all([
    query(
      `SELECT id, title, severity, status, created_at FROM incidents WHERE status IN ('open','analysing') ORDER BY created_at DESC LIMIT 5`
    ),
    query(`SELECT last_synced_at FROM sheet_sync_state WHERE last_synced_at < NOW() - INTERVAL '2 hours' LIMIT 1`),
    query(
      `SELECT id, status, created_at FROM operations WHERE status NOT IN ('concluida','cancelada') AND created_at < NOW() - INTERVAL '48 hours' LIMIT 5`
    ),
    query(
      `SELECT channel_id FROM resident_channels WHERE NOT EXISTS (SELECT 1 FROM members WHERE members.id = resident_channels.member_id AND status='ativo') LIMIT 5`
    ),
  ]);

  const sections = [];
  if (incidents.rows.length) sections.push(`🚨 **${incidents.rows.length}** incidente(s) aberto(s)`);
  if (staleSync.rows.length) sections.push(`📊 Sheets stale (>2h)`);
  if (unfinalized.rows.length) sections.push(`🚗 **${unfinalized.rows.length}** saída(s) não finalizada(s) >48h`);
  if (orphanCh.rows.length) sections.push(`🏠 **${orphanCh.rows.length}** canal(is) órfão(s)`);

  const embed = brandEmbed('SHORT')
    .setTitle('⚠️ Painel de Erros Recentes')
    .setDescription(sections.join('\n') || '✅ Nenhum erro recente.');

  if (incidents.rows.length) {
    const lines = incidents.rows.map(r => `\`#${r.id}\` [${r.severity}] ${r.title} — ${r.status}`);
    embed.addFields({ name: '🚨 Incidentes', value: lines.join('\n') });
  }

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handle };
