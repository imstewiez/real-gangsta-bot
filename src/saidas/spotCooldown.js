'use strict';
/**
 * Spot cooldown engine.
 *
 * Regra RP: quando a org abre uma saída num spot, esse spot fica "queimado"
 * durante N minutos (default 30, `SPOT_COOLDOWN_MINUTES`). Enquanto estiver
 * queimado, nenhuma outra saída da org pode abrir nesse mesmo spot — evita
 * double-occupancy + dá tempo real para arrefecer atenção.
 *
 * Ciclo de vida:
 *   1. `startCooldown` é chamado por `saidaEngine.createSaida` logo após
 *      criar a saída. UPSERT em `spot_cooldowns` + posta embed público no
 *      canal `SPOT_COOLDOWN_CHANNEL_ID`.
 *   2. `getStatus(spot)` devolve `{ active, expiresAt, remainingMs, saidaId }`
 *      e é consultado antes de qualquer criação.
 *   3. Job `spot_cooldown_expirer` (scheduler, 1/min) limpa rows expirados
 *      e edita a mensagem de notificação para mostrar "livre".
 *
 * Tolerância a reboots: o estado vive na DB, não em memória.
 */

const CONFIG = require('../config');
const { query } = require('../db');
const { log, warn } = require('../logger');
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { formatPtDate } = require('../shared/formatPtDate');

let _client = null;
function setClient(client) {
  _client = client;
}

/**
 * Devolve o estado do cooldown de um spot.
 * @param {string} spot
 * @returns {Promise<{ active: boolean, expiresAt?: Date, remainingMs?: number, saidaId?: number }>}
 */
async function getStatus(spot) {
  if (!spot) return { active: false };
  const r = await query(
    `SELECT spot, started_at, expires_at, saida_id
       FROM spot_cooldowns
      WHERE spot = $1 AND expires_at > NOW()
      LIMIT 1`,
    [spot]
  );
  const row = r.rows[0];
  if (!row) return { active: false };
  const expiresAt = new Date(row.expires_at);
  return {
    active: true,
    expiresAt,
    remainingMs: Math.max(0, expiresAt.getTime() - Date.now()),
    saidaId: row.saida_id,
  };
}

function formatRemaining(ms) {
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin <= 1) return 'menos de 1 min';
  return `${totalMin} min`;
}

/**
 * Arranca (ou prolonga) o cooldown para um spot, e posta notificação
 * pública no canal SPOT_COOLDOWN_CHANNEL_ID.
 *
 * @param {object} opts
 * @param {string} opts.spot           Nome do spot (user-visible).
 * @param {number} opts.saidaId
 * @param {string} [opts.saidaType]
 * @param {string} [opts.leaderName]   Nome do líder (ou '—').
 * @param {number} [opts.minutes]      Override do default.
 * @returns {Promise<{ expiresAt: Date, messageId: string|null }>}
 */
async function startCooldown({ spot, saidaId, saidaType, leaderName, minutes, client = null } = {}) {
  if (!spot) return { expiresAt: null, messageId: null };

  const mins = Number(minutes ?? CONFIG.SPOT_COOLDOWN_MINUTES ?? 30);
  const expiresAt = new Date(Date.now() + mins * 60_000);
  const channelId = CONFIG.SPOT_COOLDOWN_CHANNEL_ID;
  const runner = client || { query: (sql, values) => query(sql, values) };

  // UPSERT: se já havia cooldown, prolonga (reset para o novo saidaId).
  await runner.query(
    `INSERT INTO spot_cooldowns (spot, started_at, expires_at, saida_id, notification_channel_id)
     VALUES ($1, NOW(), $2, $3, $4)
     ON CONFLICT (spot) DO UPDATE
       SET started_at = NOW(),
           expires_at = EXCLUDED.expires_at,
           saida_id   = EXCLUDED.saida_id,
           notification_channel_id = EXCLUDED.notification_channel_id,
           notification_msg_id = NULL`,
    [spot, expiresAt, saidaId, channelId || null]
  );

  // Post notificação (best-effort — se falha, cooldown continua na DB).
  let messageId = null;
  if (_client && channelId) {
    try {
      const channel = await _client.channels.fetch(channelId).catch(() => null);
      if (channel && channel.isTextBased?.()) {
        const embed = applyLogo(
          brandEmbed('SHORT')
            .setColor(COLOR.DANGER)
            .setTitle(`${EMOJI.WARN} Spot Queimado — ${spot}`)
            .setDescription(
              'A org acabou de abrir uma saída neste spot.\n' +
                `**Ninguém da firma pode voltar a ${spot}** durante **${mins} min**.\n` +
                '\n' +
                `${EMOJI.SAIDA} Saída: **#${saidaId}**${saidaType ? ` · ${saidaType}` : ''}\n` +
                `${EMOJI.TEMPO || '⏱️'} Livre a partir de: **${formatPtDate(expiresAt)}**\n` +
                (leaderName ? `${EMOJI.LIDER || '👤'} Líder: **${leaderName}**\n` : '') +
                '\n' +
                '_Respeita a janela. Arrefecer o spot poupa sangue._'
            )
        );
        const msg = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(e => {
          warn(`[SPOT-COOLDOWN] Não consegui postar notificação em ${channelId}: ${e.message}`);
          return null;
        });
        if (msg) {
          messageId = msg.id;
          await runner.query('UPDATE spot_cooldowns SET notification_msg_id = $1 WHERE spot = $2', [messageId, spot]);
        }
      } else {
        warn(`[SPOT-COOLDOWN] SPOT_COOLDOWN_CHANNEL_ID (${channelId}) não acessível.`);
      }
    } catch (e) {
      warn(`[SPOT-COOLDOWN] Falha ao notificar: ${e.message}`);
    }
  }

  log(`[SPOT-COOLDOWN] Spot "${spot}" em cooldown até ${expiresAt.toISOString()} (saida=${saidaId}, ${mins}min).`);
  return { expiresAt, messageId };
}

/**
 * Liberta o cooldown de um spot SE ainda pertencer à saída indicada.
 * Usado por `cancelSaida` para não manter o spot bloqueado a seguir a um
 * cancelamento. Filtro por `saida_id` evita apagar um cooldown que tenha
 * sido entretanto substituído por outra saída posterior (o UPSERT em
 * `startCooldown` reescreve a row).
 *
 * Best-effort sobre a notificação Discord — edita para "livre" se existir.
 */
async function releaseCooldownForSaida(spot, saidaId) {
  if (!spot || !saidaId) return { released: false };
  const r = await query(
    `DELETE FROM spot_cooldowns
      WHERE spot = $1 AND saida_id = $2
    RETURNING notification_channel_id, notification_msg_id`,
    [spot, saidaId]
  );
  const row = r.rows[0];
  if (!row) return { released: false };

  if (_client && row.notification_channel_id && row.notification_msg_id) {
    (async () => {
      try {
        const ch = await _client.channels.fetch(row.notification_channel_id).catch(() => null);
        if (ch?.isTextBased?.()) {
          const msg = await ch.messages.fetch(row.notification_msg_id).catch(() => null);
          if (msg) {
            const freeEmbed = applyLogo(
              brandEmbed('SHORT')
                .setColor(COLOR.SUCCESS)
                .setTitle(`${EMOJI.OK} Spot Livre — ${spot}`)
                .setDescription(`_Saída #${saidaId} foi cancelada — spot disponível de novo._`)
            );
            await msg.edit({ embeds: [freeEmbed] }).catch(() => {});
          }
        }
      } catch (_) {
        /* non-fatal */
      }
    })();
  }

  log(`[SPOT-COOLDOWN] Spot "${spot}" libertado (saida=${saidaId} cancelada).`);
  return { released: true };
}

/**
 * Job do scheduler: limpa cooldowns expirados e edita as mensagens para
 * indicar que o spot está livre. Idempotente — correr 2× não parte nada.
 */
async function runExpirer(client) {
  if (client) _client = client;

  const expired = await query(
    `SELECT spot, saida_id, notification_channel_id, notification_msg_id
       FROM spot_cooldowns
      WHERE expires_at <= NOW()`
  );
  let cleaned = 0;
  for (const row of expired.rows) {
    // Best-effort: edita a notificação para "livre".
    if (_client && row.notification_channel_id && row.notification_msg_id) {
      try {
        const ch = await _client.channels.fetch(row.notification_channel_id).catch(() => null);
        if (ch && ch.isTextBased?.()) {
          const msg = await ch.messages.fetch(row.notification_msg_id).catch(() => null);
          if (msg) {
            const originalEmbed = msg.embeds?.[0];
            const freeEmbed = applyLogo(
              brandEmbed('SHORT')
                .setColor(COLOR.SUCCESS)
                .setTitle(`${EMOJI.OK} Spot Livre — ${row.spot}`)
                .setDescription(
                  (originalEmbed?.title ? `_Cooldown da saída #${row.saida_id || '—'} terminou._\n\n` : '') +
                    `O spot **${row.spot}** voltou a estar disponível.`
                )
            );
            await msg.edit({ embeds: [freeEmbed] }).catch(() => {});
          }
        }
      } catch (_) {
        /* non-fatal */
      }
    }
    await query('DELETE FROM spot_cooldowns WHERE spot = $1', [row.spot]).catch(() => {});
    cleaned++;
  }
  return { cleaned };
}

module.exports = { setClient, getStatus, startCooldown, releaseCooldownForSaida, runExpirer, formatRemaining };
