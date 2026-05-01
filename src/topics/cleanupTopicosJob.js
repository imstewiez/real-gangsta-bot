'use strict';
const { query } = require('../db');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { queueChannelOp } = require('../discordQueue');

async function _findZombies() {
  const res = await query(
    `SELECT rc.channel_id, rc.channel_name, rc.discord_id,
            m.id AS member_id, m.display_name, m.role, m.status, m.deleted_at
       FROM resident_channels rc
       JOIN members m ON m.id = rc.member_id
      WHERE rc.status = 'active'
        AND (
          m.role != 'bairrista'
          OR m.status != 'ativo'
          OR m.deleted_at IS NOT NULL
        )
      ORDER BY m.display_name ASC`
  );
  return res.rows;
}

async function _archiveOne(guild, zombie) {
  const channel = await guild.channels.fetch(zombie.channel_id).catch(() => null);
  if (!channel) {
    await query(
      `UPDATE resident_channels SET status = 'deleted', deleted_at = NOW()
        WHERE channel_id = $1 AND status = 'active'`,
      [zombie.channel_id]
    );
    return { action: 'db-only', channelId: zombie.channel_id };
  }

  if (CONFIG.BAIRRISTA_ARQUIVO_CATEGORY_ID) {
    await queueChannelOp(() => channel.setParent(CONFIG.BAIRRISTA_ARQUIVO_CATEGORY_ID, { lockPermissions: true }));
    await query(
      `UPDATE resident_channels SET status = 'archived', archived_at = NOW()
        WHERE channel_id = $1 AND status = 'active'`,
      [zombie.channel_id]
    );
    return { action: 'archived', channelId: zombie.channel_id };
  }

  await query(
    `UPDATE resident_channels SET status = 'archived', archived_at = NOW()
      WHERE channel_id = $1 AND status = 'active'`,
    [zombie.channel_id]
  );
  return { action: 'db-only-no-archive-cat', channelId: zombie.channel_id };
}

async function cleanup(guild, { dryRun = false } = {}) {
  const zombies = await _findZombies();
  if (!zombies.length) {
    log('[CLEANUP-TOPICOS] Nenhum tópico zombie encontrado.');
    return { archived: 0, zombies: 0 };
  }

  if (dryRun) {
    return { archived: 0, zombies: zombies.length, preview: zombies.map(z => z.display_name) };
  }

  const results = [];
  for (const zombie of zombies) {
    try {
      const r = await _archiveOne(guild, zombie);
      results.push(r);
      log(`[CLEANUP-TOPICOS] ${r.action} ${r.channelId} (${zombie.display_name})`);
    } catch (e) {
      warn(`[CLEANUP-TOPICOS] Falha ao arquivar ${zombie.channel_id}: ${e.message}`);
    }
  }

  return { archived: results.length, zombies: zombies.length };
}

module.exports = { cleanup };
