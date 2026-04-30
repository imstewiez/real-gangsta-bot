'use strict';
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
      `SELECT id, status, created_at FROM saidas WHERE status NOT IN ('concluida','cancelada') AND created_at < NOW() - INTERVAL '48 hours' LIMIT 5`
    ),
    query(
      `SELECT channel_id FROM member_channels WHERE NOT EXISTS (SELECT 1 FROM members WHERE members.id = member_channels.member_id AND active=true) LIMIT 5`
    ),
  ]);

  const sections = [];
  if (incidents.rows.length) sections.push(`🚨 **${incidents.rows.length}** incidente(s) aberto(s)`);
  if (staleSync.rows.length) sections.push(`📊 Sheets stale (>2h)`);
  if (unfinalized.rows.length) sections.push(`🚗 **${unfinalized.rows.length}** saída(s) não finalizada(s) >48h`);
  if (orphanCh.rows.length) sections.push(`🏠 **${orphanCh.rows.length}** canal(is) órfão(s)`);

  const embed = brandEmbed({
    title: '⚠️ Painel de Erros Recentes',
    description: sections.join('\n') || '✅ Nenhum erro recente.',
    messageClass: sections.length ? 'WARNING' : 'SUCCESS',
  });

  if (incidents.rows.length) {
    const lines = incidents.rows.map(r => `\`#${r.id}\` [${r.severity}] ${r.title} — ${r.status}`);
    embed.addFields({ name: '🚨 Incidentes', value: lines.join('\n') });
  }

  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
