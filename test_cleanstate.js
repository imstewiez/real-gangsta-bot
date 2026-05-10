const { query } = require('./src/db');

async function cleanState() {
  await query(`
    TRUNCATE TABLE
      inventory_movements,
      operation_participants,
      operation_materials,
      operations,
      weekly_rankings,
      monthly_rankings,
      all_time_stats,
      audit_logs,
      tag_requests,
      resident_channels,
      members,
      kill_logs,
      availability_votes,
      availability_slots,
      availability_sessions,
      radio_history,
      sticky_messages
    RESTART IDENTITY CASCADE
  `).catch(e => console.error('cleanState error:', e.message));
}

(async () => {
  await cleanState();
  await query("INSERT INTO members (discord_id, username, display_name, role) VALUES ('test', 't', 'T', 'bairrista')");
  const r = await query("SELECT id FROM members WHERE discord_id = 'test'");
  console.log('member id:', r.rows[0]?.id);
  await cleanState();
  const r2 = await query("SELECT id FROM members WHERE discord_id = 'test'");
  console.log('after clean:', r2.rows.length);
  process.exit(0);
})();
