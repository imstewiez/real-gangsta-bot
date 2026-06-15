'use strict';

const CONFIG = require('../config');
const { query } = require('../db');
const { queueMemberOp } = require('../discordQueue');
const { getStateKey, setStateKey } = require('../state');
const { log, warn } = require('../logger');

const STATE_KEY = 'cleanupTropinhaExternalRoles';
const CLEANUP_VERSION = 1;

function ids() {
  return {
    tropinha: [CONFIG.TROPINHA_DI_ZONA_ROLE_ID, CONFIG.TROPINHAS_DO_GUETTO_ROLE_ID].filter(Boolean),
    bairro: [
      CONFIG.BAIRRISTAS_BASE_ROLE_ID,
      CONFIG.BAIRRISTAS_ROLE_ID,
      CONFIG.YOUNG_BLOOD_ROLE_ID,
      CONFIG.O_GUNAO_ROLE_ID,
      CONFIG.GANGSTER_FODIDO_ROLE_ID,
    ].filter(Boolean),
  };
}

async function cleanupTropinhaExternalRoles(client, { force = false } = {}) {
  if (!client) return { skipped: true, reason: 'no_client' };

  const state = await getStateKey(STATE_KEY, {});
  if (!force && state.version === CLEANUP_VERSION && state.done === true) {
    return { skipped: true, reason: 'already_done' };
  }

  const guild = client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) return { skipped: true, reason: 'guild_not_found' };

  try {
    await guild.members.fetch();
  } catch (e) {
    warn(`[TROPINHA:CLEANUP] guild.members.fetch falhou; vou usar cache atual: ${e.message}`);
  }

  const { tropinha, bairro } = ids();
  if (!tropinha.length) {
    warn('[TROPINHA:CLEANUP] Nenhuma role Tropinha configurada.');
    return { skipped: true, reason: 'missing_tropinha_role' };
  }

  const touched = [];
  const removed = [];

  for (const [, member] of guild.members.cache) {
    if (member.user.bot) continue;
    const hasTropinha = tropinha.some(roleId => member.roles.cache.has(roleId));
    if (!hasTropinha) continue;

    touched.push(member.id);
    for (const roleId of bairro) {
      if (!member.roles.cache.has(roleId)) continue;
      try {
        await queueMemberOp(() => member.roles.remove(roleId, 'Tropinha externo: não pertence ao bairro'));
        removed.push({ user: member.id, role: roleId });
      } catch (e) {
        warn(`[TROPINHA:CLEANUP] Falha ao remover ${roleId} de ${member.id}: ${e.message}`);
      }
    }
  }

  if (touched.length) {
    await query(
      `UPDATE members
          SET role = 'inativo',
              status = 'inativo',
              lifecycle_state = 'removed',
              lifecycle_changed_at = NOW(),
              lifecycle_changed_by = 'system:tropinha-cleanup',
              lifecycle_notes = 'Tropinha externo: removidas tags internas do bairro',
              deleted_at = NOW(),
              updated_at = NOW()
        WHERE discord_id = ANY($1::text[])
          AND deleted_at IS NULL
          AND coalesce(lifecycle_state::text, status, 'active') IN ('active','ativo','promoted')`,
      [touched]
    ).catch(e => warn(`[TROPINHA:CLEANUP] Falha ao atualizar DB: ${e.message}`));
  }

  await setStateKey(STATE_KEY, {
    version: CLEANUP_VERSION,
    done: true,
    scanned: guild.members.cache.size,
    tropinhas: touched.length,
    removed: removed.length,
    updated_at: new Date().toISOString(),
  });

  log(`[TROPINHA:CLEANUP] Concluído: tropinhas=${touched.length}, roles_removidas=${removed.length}.`);
  return { done: true, tropinhas: touched.length, rolesRemoved: removed.length };
}

module.exports = { cleanupTropinhaExternalRoles };
