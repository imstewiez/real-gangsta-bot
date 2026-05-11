'use strict';
/**
 * Motor de ciclo de vida de saídas — timers, transições de estado,
 * notificações e auto-finalização.
 */

const { query } = require('../db');
const { log, warn } = require('../logger');
const eventBus = require('../core/eventBus');
const { saidaRepo } = require('../repositories');
const CONFIG = require('../config');
const { AUTO_LOCK_DELAY_MS, FORCE_CLOSE_DELAY_MS, AUTO_FINALIZE_GRACE_MS } = require('./_constants');

class SessionLifecycle {
  constructor(deps) {
    this.client = deps.client;
    this.teamSelector = deps.teamSelector;
    this.pvPRating = deps.pvPRating;
    this.scoring = deps.scoring;
    this.publisher = deps.publisher;
    this._timers = new Map(); // key: `${saidaId}:${type}`
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Scheduling
  // ═══════════════════════════════════════════════════════════════════════

  onCreated(saidaId) {
    if (!CONFIG.SAIDA_AUTO_LOCK_ENABLED) {
      log(`[LIFECYCLE] Auto-lock desactivado (SAIDA_AUTO_LOCK_ENABLED=false). Saída #${saidaId} sem countdown.`);
      return;
    }
    const fireAt = new Date(Date.now() + AUTO_LOCK_DELAY_MS);
    this._schedule(saidaId, 'auto_lock', fireAt, () => this._executeAutoLock(saidaId));
    this._persistCountdown(saidaId, 'auto_lock', fireAt).catch(e =>
      warn(`[LIFECYCLE] persist countdown falhou: ${e.message}`)
    );
  }

  onLiquidacao(saidaId) {
    if (!CONFIG.SAIDA_AUTO_FORCE_CLOSE_ENABLED) {
      log(
        `[LIFECYCLE] Auto-force-close desactivado (SAIDA_AUTO_FORCE_CLOSE_ENABLED=false). Saída #${saidaId} sem countdown.`
      );
      return;
    }
    const fireAt = new Date(Date.now() + FORCE_CLOSE_DELAY_MS);
    this._schedule(saidaId, 'force_close', fireAt, () => this._executeForceClose(saidaId));
    this._persistCountdown(saidaId, 'force_close', fireAt).catch(e =>
      warn(`[LIFECYCLE] persist countdown falhou: ${e.message}`)
    );
  }

  onAllResultsSubmitted(saidaId) {
    const fireAt = new Date(Date.now() + AUTO_FINALIZE_GRACE_MS);
    this._schedule(saidaId, 'auto_finalize', fireAt, () => this._executeAutoFinalize(saidaId));
    this._persistCountdown(saidaId, 'auto_finalize', fireAt).catch(e =>
      warn(`[LIFECYCLE] persist countdown falhou: ${e.message}`)
    );
  }

  manualLock(saidaId, actorId) {
    this._clearCountdown(saidaId, 'auto_lock');
    this._executeAutoLock(saidaId, actorId).catch(e => warn(`[LIFECYCLE] manualLock #${saidaId}: ${e.message}`));
  }

  cancel(saidaId, actorId) {
    this._clearCountdown(saidaId, 'auto_lock');
    this._clearCountdown(saidaId, 'force_close');
    this._clearCountdown(saidaId, 'auto_finalize');
    log(`[LIFECYCLE] Saída #${saidaId} cancelada por ${actorId}. Countdowns limpos.`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Restore after restart
  // ═══════════════════════════════════════════════════════════════════════

  async restoreCountdowns() {
    const result = await query(
      `SELECT saida_id, countdown_type, fire_at
       FROM saida_countdowns
       WHERE cancelled = FALSE AND fire_at > NOW()`
    );
    const rows = result.rows || [];

    let restored = 0;
    for (const row of rows) {
      const remaining = new Date(row.fire_at).getTime() - Date.now();
      if (remaining <= 0) {
        // Já expirou — executa imediatamente
        if (row.countdown_type === 'auto_lock') {
          this._executeAutoLock(row.saida_id).catch(err =>
            warn(`[LIFECYCLE] Auto-lock imediato falhou para #${row.saida_id}: ${err.message}`)
          );
        } else if (row.countdown_type === 'force_close') {
          this._executeForceClose(row.saida_id).catch(err =>
            warn(`[LIFECYCLE] Force-close imediato falhou para #${row.saida_id}: ${err.message}`)
          );
        }
        continue;
      }

      const fn =
        row.countdown_type === 'auto_lock'
          ? () => this._executeAutoLock(row.saida_id)
          : () => this._executeForceClose(row.saida_id);

      this._schedule(row.saida_id, row.countdown_type, new Date(row.fire_at), fn);
      restored++;
    }

    log(`[LIFECYCLE] Restaurados ${restored} countdowns de ${rows.length} registados.`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal execution
  // ═══════════════════════════════════════════════════════════════════════

  async _executeAutoLock(saidaId, actorId = 'system:auto') {
    try {
      const saida = await saidaRepo.findById(saidaId);
      if (!saida || !['criada', 'trancagem'].includes(saida.status)) {
        log(`[LIFECYCLE] Auto-lock skipped para #${saidaId} — status=${saida?.status}`);
        return;
      }

      log(`[LIFECYCLE] Auto-locking saída #${saidaId}`);

      // 1. Move para trancagem brevemente
      await saidaRepo.updateStatus(saidaId, 'trancagem');

      // 2. Selecção de equipas
      const { selectTeams } = require('./saidaTeamSelector');
      const selection = await selectTeams(saidaId);

      // 3. Persiste selecção
      const { persistSelection } = require('./saidaTeamSelector');
      await persistSelection(saidaId, selection);

      // 4. Move para em_preparacao
      await saidaRepo.updateStatus(saidaId, 'em_preparacao', {
        team_selected_at: new Date(),
        fighters_count: selection.fighters.length,
        workers_count: selection.workers.length,
      });

      // 5. Notifica participantes
      await this._notifyTeamAssignment(saidaId, selection);

      // 6. Refresh do embed
      const { refreshSessionEmbed } = require('./saidaSession');
      await refreshSessionEmbed(this.client, saidaId);

      // 7. Evento
      await eventBus
        .emitAsync('saida.team_selected', {
          saidaId,
          fighters: selection.fighters.length,
          workers: selection.workers.length,
          actorId,
          at: new Date(),
        })
        .catch(err => warn(`[LIFECYCLE] Evento saida.team_selected falhou: ${err.message}`));

      log(
        `[LIFECYCLE] Saída #${saidaId} locked: ${selection.fighters.length} fighters, ${selection.workers.length} workers`
      );
    } catch (e) {
      warn(`[LIFECYCLE] Auto-lock falhou para #${saidaId}: ${e.message}`);
    }
  }

  async _executeForceClose(saidaId) {
    try {
      const saida = await saidaRepo.findById(saidaId);
      if (!saida || saida.status !== 'em_liquidacao') return;

      log(`[LIFECYCLE] Force-closing saída #${saidaId} (12h deadline)`);

      // Finaliza
      const { SaidaService } = require('./saidaService');
      const service = new SaidaService({ client: this.client });
      await service.finalize(saidaId, 'system:force_close');

      log(`[LIFECYCLE] Saída #${saidaId} force-closed após 12h`);
    } catch (e) {
      warn(`[LIFECYCLE] Force-close falhou para #${saidaId}: ${e.message}`);
    }
  }

  async _executeAutoFinalize(saidaId) {
    try {
      const saida = await saidaRepo.findById(saidaId);
      if (!saida || saida.status !== 'em_liquidacao') return;

      const { SaidaService } = require('./saidaService');
      const service = new SaidaService({ client: this.client });
      const progress = await service.getResultProgress(saidaId);
      if (!progress.allDone) return;

      log(`[LIFECYCLE] Auto-finalizing saída #${saidaId}`);
      await service.finalize(saidaId, 'system:auto');

      log(`[LIFECYCLE] Saída #${saidaId} auto-finalized`);
    } catch (e) {
      warn(`[LIFECYCLE] Auto-finalize falhou para #${saidaId}: ${e.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Notifications
  // ═══════════════════════════════════════════════════════════════════════

  async _notifyTeamAssignment(saidaId, selection) {
    const saida = await saidaRepo.findById(saidaId);
    const { brandEmbed } = require('../shared/embedBuilders');
    const { COLOR, EMOJI } = require('../content');

    for (const fighter of selection.fighters) {
      try {
        const user = await this.client.users.fetch(fighter.discord_id).catch(() => null);
        if (!user) continue;

        const embed = brandEmbed('MOVEMENT')
          .setTitle(`${EMOJI.ARMA} Escolhido como Lutador — Saída #${saidaId}`)
          .setColor(COLOR.SUCCESS)
          .setDescription(
            `Foste selecionado como **Caracterizado** na saída **#${saidaId}**!\n\n` +
              `${EMOJI.ZONA} Spot: **${saida?.spot || '—'}**\n` +
              `${EMOJI.ARMA} Arma: **${fighter.weapon_name || '—'}**\n` +
              `📊 Score de selecção: **${Math.round(fighter.selection_score || 0)}**\n\n` +
              '_Aguarda instruções da chefia para o início._'
          );

        await user
          .send({ embeds: [embed] })
          .catch(err => warn(`[LIFECYCLE] DM falhou para fighter ${fighter.discord_id}: ${err.message}`));
      } catch (err) {
        warn(`[LIFECYCLE] DM falhou para fighter ${fighter.discord_id}: ${err.message}`);
      }
    }

    for (const worker of selection.workers) {
      try {
        const user = await this.client.users.fetch(worker.discord_id).catch(() => null);
        if (!user) continue;

        const embed = brandEmbed('MOVEMENT')
          .setTitle(`${EMOJI.TRABALHADOR} Atribuído como Trabalhador — Saída #${saidaId}`)
          .setColor(COLOR.INFO)
          .setDescription(
            `Ficas como **Trabalhador** na saída **#${saidaId}**.\n\n` +
              `${EMOJI.ZONA} Spot: **${saida?.spot || '—'}**\n` +
              `📊 Score de selecção: **${Math.round(worker.selection_score || 0)}**\n\n` +
              `_Não te preocupes — houveram ${selection.fighters.length} com score superior._`
          );

        await user.send({ embeds: [embed] }).catch(() => {});
      } catch {
        /* non-fatal */
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Timer helpers
  // ═══════════════════════════════════════════════════════════════════════

  _schedule(saidaId, type, fireAt, fn) {
    const key = `${saidaId}:${type}`;
    this._clearTimer(key);

    const remaining = fireAt.getTime() - Date.now();
    if (remaining <= 0) {
      fn();
      return;
    }

    const timerId = setTimeout(fn, remaining);
    this._timers.set(key, { type, fireAt, timerId });
  }

  _clearCountdown(saidaId, type) {
    const key = `${saidaId}:${type}`;
    this._clearTimer(key);
    query('UPDATE saida_countdowns SET cancelled = TRUE WHERE saida_id = $1 AND countdown_type = $2', [
      saidaId,
      type,
    ]).catch(err => warn(`[LIFECYCLE] Cancel countdown falhou para #${saidaId}: ${err.message}`));
  }

  _clearTimer(key) {
    const existing = this._timers.get(key);
    if (existing) {
      clearTimeout(existing.timerId);
      this._timers.delete(key);
    }
  }

  async _persistCountdown(saidaId, type, fireAt) {
    await query(
      `INSERT INTO saida_countdowns (saida_id, countdown_type, fire_at, cancelled)
       VALUES ($1, $2, $3, FALSE)
       ON CONFLICT (saida_id, countdown_type) DO UPDATE
       SET fire_at = EXCLUDED.fire_at, cancelled = FALSE`,
      [saidaId, type, fireAt]
    );
  }

  getActiveCountdowns() {
    const result = [];
    for (const [key, cd] of this._timers) {
      const [saidaId, type] = key.split(':');
      result.push({
        saidaId: parseInt(saidaId, 10),
        type,
        fireAt: cd.fireAt.toISOString(),
        remainingMs: Math.max(0, cd.fireAt.getTime() - Date.now()),
      });
    }
    return result;
  }
}

module.exports = { SessionLifecycle };
