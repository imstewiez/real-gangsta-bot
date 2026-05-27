'use strict';
/**
 * Cliente HTTP para disparar acções na web app (ballasgang.eu).
 * Usado para recalcular rankings automaticamente após eventos de domínio.
 */

const { log, warn } = require('../logger');

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://ballasgang.eu';
const CRON_SECRET = process.env.CRON_SECRET;

async function triggerRecalc(source = 'bot') {
  if (!CRON_SECRET) {
    warn(`[WEB_APP] CRON_SECRET não configurado — recalc ignorado (source=${source})`);
    return { skipped: true, reason: 'CRON_SECRET_MISSING' };
  }

  const url = `${WEB_APP_URL}/api/cron/recalc`;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-cron-secret': CRON_SECRET,
        'content-type': 'application/json',
      },
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      warn(`[WEB_APP] Recalc falhou (${res.status}): ${JSON.stringify(body)}`);
      return { success: false, status: res.status, body };
    }

    log(`[WEB_APP] Recalc disparado com sucesso (source=${source}, ${Date.now() - start}ms): ${JSON.stringify(body)}`);
    return { success: true, ...body };
  } catch (e) {
    warn(`[WEB_APP] Recalc erro de rede (source=${source}): ${e.message}`);
    return { success: false, error: e.message };
  }
}

module.exports = { triggerRecalc };
