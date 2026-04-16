'use strict';
/**
 * Formatação uniforme de datas PT-PT.
 *
 * Formato canónico do bot:
 *   `dd/mm/yyyy - hh:mm`
 *
 * Ex: 16/04/2026 - 21:35
 *
 * Usado em:
 *   - logs de notificação
 *   - timestamps em embeds
 *   - auditoria user-facing
 *
 * Aceita Date | string ISO | number (epoch ms) | null.
 */

const TZ = 'Europe/Lisbon';

function toDate(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

// Formatadores em TZ Lisboa — Railway corre UTC mas a UI é para pessoas em PT.
// Usar d.getHours()/d.getDate() dava a hora UTC (ex.: 17:07 em vez de 18:07
// quando em DST/WEST). Intl.DateTimeFormat com timeZone resolve.
const _dtFull = new Intl.DateTimeFormat('pt-PT', {
  timeZone: TZ,
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const _dtOnly = new Intl.DateTimeFormat('pt-PT', {
  timeZone: TZ,
  day: '2-digit', month: '2-digit', year: 'numeric',
});

function _extract(d, formatter) {
  const parts = formatter.formatToParts(d);
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  return m;
}

/**
 * Devolve `dd/mm/yyyy - hh:mm` em TZ Europe/Lisbon.
 * Se input inválido, devolve '—'.
 */
function formatPtDate(input) {
  const d = toDate(input);
  if (!d) return '—';
  const m = _extract(d, _dtFull);
  return `${m.day}/${m.month}/${m.year} - ${m.hour}:${m.minute}`;
}

/**
 * Só a parte da data: `dd/mm/yyyy` em TZ Europe/Lisbon. Útil em tabelas.
 */
function formatPtDateOnly(input) {
  const d = toDate(input);
  if (!d) return '—';
  const m = _extract(d, _dtOnly);
  return `${m.day}/${m.month}/${m.year}`;
}

/**
 * Discord relative timestamp (ex: <t:1234567890:R> → "2 hours ago").
 * Útil quando o formato relativo é mais valioso que absoluto.
 */
function discordRelative(input) {
  const d = toDate(input);
  if (!d) return '—';
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

/**
 * Discord long timestamp (ex: <t:1234567890:F> → "Thursday, 16 April 2026 21:35").
 * Render em fuso do cliente.
 */
function discordLong(input) {
  const d = toDate(input);
  if (!d) return '—';
  return `<t:${Math.floor(d.getTime() / 1000)}:F>`;
}

module.exports = {
  formatPtDate,
  formatPtDateOnly,
  discordRelative,
  discordLong,
};
