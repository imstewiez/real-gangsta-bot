'use strict';
/**
 * Leaderboard publisher — find-or-create + edit atómico da live message.
 *
 * Durable state em `leaderboard_messages` (migration 039); uma row por
 * channel. Em qualquer boot:
 *   1. Tenta fetch da mensagem pelo id guardado → edit se existe
 *   2. Se não existe (apagada, canal mudou, etc.) → send novo + upsert
 *
 * Sem row → cria; com row mas mensagem inacessível → cria novo e
 * substitui. Nunca dois posts em paralelo.
 *
 * Rate-limit do refresh manual por user: Map in-memory 30s/user.
 */

const { query } = require('../db');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { getAllPeriodsLeaders, getPeriodLeaders, navigatePeriod } = require('./leaderboardEngine');
const {
  buildLeaderboardEmbed,
  buildLeaderboardComponents,
  buildDetailsEmbed,
  buildDetailsComponents,
} = require('./leaderboardPanel');

let _client = null;
function setClient(client) {
  _client = client;
}

// ── DB helpers ──────────────────────────────────────────────────────────────

async function _loadState(channelId) {
  const r = await query(
    'SELECT channel_id, message_id, last_refreshed_at FROM leaderboard_messages WHERE channel_id = $1',
    [channelId]
  );
  return r.rows[0] || null;
}

async function _upsertState(channelId, messageId) {
  await query(
    `INSERT INTO leaderboard_messages (channel_id, message_id, last_refreshed_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (channel_id) DO UPDATE
       SET message_id = EXCLUDED.message_id,
           last_refreshed_at = NOW(),
           updated_at = NOW()`,
    [channelId, messageId]
  );
}

async function _touchState(channelId) {
  await query('UPDATE leaderboard_messages SET last_refreshed_at = NOW(), updated_at = NOW() WHERE channel_id = $1', [
    channelId,
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH / REFRESH
// ═══════════════════════════════════════════════════════════════════════════

// Debounce global: se o último refresh foi há < N ms, skip (chamadas de
// 50 users em paralelo via botão não devem disparar 50 × 15 queries).
// Scheduler passa { force: true } — sempre refresca no tick.
const GLOBAL_DEBOUNCE_MS = 15_000;

/**
 * Idempotente: find-or-create a mensagem live no canal configurado e
 * actualiza-a com os dados mais recentes. Pode ser chamado por:
 *   - scheduler (5min) — force=true
 *   - boot (runOnStart) — force=true
 *   - botão manual de refresh — force=false (respeita debounce)
 *
 * Debounce global de 15s protege DB/Discord contra burst de N users
 * a clicar "Atualizar" em simultâneo. Pool DB tem 20 connections; 50
 * clicks sem guard = choke garantido + timeout do ACK Discord (3s).
 *
 * Safe: se client ou channel não estiverem disponíveis, skip silencioso.
 */
async function publishOrRefresh(client = _client, { force = false } = {}) {
  if (!client) return { skipped: 'no_client' };
  const channelId = CONFIG.LEADERBOARD_CHANNEL_ID;
  if (!channelId) return { skipped: 'no_channel_configured' };

  // Debounce antes de qualquer I/O (evita Discord fetch + DB queries
  // quando já há refresh recente).
  if (!force) {
    const cached = await _loadState(channelId).catch(() => null);
    if (cached && Date.now() - new Date(cached.last_refreshed_at).getTime() < GLOBAL_DEBOUNCE_MS) {
      return { skipped: 'debounced', messageId: cached.message_id };
    }
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    warn(`[LEADERBOARD] Canal ${channelId} não acessível.`);
    return { skipped: 'channel_unreachable' };
  }

  let leaders;
  try {
    leaders = await getAllPeriodsLeaders();
  } catch (e) {
    warn(`[LEADERBOARD] getAllPeriodsLeaders falhou: ${e.message}`);
    return { skipped: 'query_error', error: e.message };
  }

  const refreshedAt = new Date();
  const embed = buildLeaderboardEmbed({ ...leaders, refreshedAt });
  const components = buildLeaderboardComponents();

  const state = await _loadState(channelId).catch(() => null);
  if (state?.message_id) {
    const msg = await channel.messages.fetch(state.message_id).catch(() => null);
    if (msg) {
      try {
        await msg.edit({ embeds: [embed], components, allowedMentions: { parse: [] } });
        await _touchState(channelId).catch(() => {});
        return { action: 'edited', messageId: msg.id };
      } catch (e) {
        warn(`[LEADERBOARD] edit falhou: ${e.message}`);
        // Não actualiza last_refreshed_at — permite retry no próximo ciclo
        return { action: 'edit_failed', messageId: msg.id, error: e.message };
      }
    }
    // Fall-through: cria novo (state stale).
  }

  const msg = await channel.send({ embeds: [embed], components, allowedMentions: { parse: [] } }).catch(e => {
    warn(`[LEADERBOARD] send falhou: ${e.message}`);
    return null;
  });
  if (!msg) return { skipped: 'send_failed' };
  await _upsertState(channelId, msg.id);
  log(`[LEADERBOARD] Published new live message ${msg.id} em ${channelId}.`);
  return { action: 'created', messageId: msg.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE-LIMITED MANUAL REFRESH
// ═══════════════════════════════════════════════════════════════════════════

const _userRefreshCooldown = new Map(); // discord_id → last refresh timestamp
const REFRESH_COOLDOWN_MS = 30_000;

function canUserRefresh(discordId) {
  const last = _userRefreshCooldown.get(discordId) || 0;
  const delta = Date.now() - last;
  if (delta < REFRESH_COOLDOWN_MS) {
    return { ok: false, waitMs: REFRESH_COOLDOWN_MS - delta };
  }
  return { ok: true };
}

function markUserRefresh(discordId) {
  _userRefreshCooldown.set(discordId, Date.now());
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAILS (ephemeral) — usado pelos handlers dos botões
// ═══════════════════════════════════════════════════════════════════════════

async function buildDetailsForPeriod(period, offset = 0) {
  const refDate = offset === 0 ? new Date() : navigatePeriod(period, offset);
  const data = await getPeriodLeaders(period, refDate);
  return { embed: buildDetailsEmbed(data), components: buildDetailsComponents(period, offset) };
}

async function buildDetailsForCustomRange(startStr, endStr) {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T23:59:59.999');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    throw new Error('Datas inválidas ou intervalo incorrecto.');
  }

  const [activity, mvp, kda, delivered, sold] = await Promise.all([
    require('./leaderboardEngine').getActivityLeaders(start, end, 5),
    require('./leaderboardEngine').getMvpLeaders(start, end, 5),
    require('./leaderboardEngine').getKdaLeaders(start, end, 5),
    require('./leaderboardEngine').getMaterialDeliveredLeaders(start, end, 5),
    require('./leaderboardEngine').getMaterialSoldLeaders(start, end, 5),
  ]);

  const { formatPtDateOnly } = require('../shared/formatPtDate');
  const data = {
    period: 'custom',
    label: `${formatPtDateOnly(start)} – ${formatPtDateOnly(end)}`,
    categories: { activity, mvp, kda, delivered, sold },
  };
  return { embed: buildDetailsEmbed(data), components: [] };
}

module.exports = {
  setClient,
  publishOrRefresh,
  canUserRefresh,
  markUserRefresh,
  buildDetailsForPeriod,
  buildDetailsForCustomRange,
  REFRESH_COOLDOWN_MS,
};
