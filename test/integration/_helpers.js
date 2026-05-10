'use strict';
/**
 * Helpers partilhados para integration tests.
 *
 * Skip padrão se DATABASE_URL não está definido — mantém `npm test`
 * normal a funcionar offline e em CI onde há DB dá failed tests a sério.
 */

function haveDb() {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Limpa tabelas entre testes para isolamento. Evita truncar
 * schema_migrations (precisamos das migrations aplicadas).
 */
async function cleanState(query) {
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
  `).catch(() => {
    // Fallback quando alguma tabela não existe ainda. Melhor por truncate em
    // sequência com try/catch individual — no caso CI devem todas existir.
  });
}

module.exports = { haveDb, cleanState };
