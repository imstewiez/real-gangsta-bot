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

function _pad2(n) { return String(n).padStart(2, '0'); }

function toDate(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Devolve `dd/mm/yyyy - hh:mm` em fuso local (a UI é para pessoas em PT).
 * Se input inválido, devolve '—'.
 */
function formatPtDate(input) {
  const d = toDate(input);
  if (!d) return '—';
  const dd = _pad2(d.getDate());
  const mm = _pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = _pad2(d.getHours());
  const mi = _pad2(d.getMinutes());
  return `${dd}/${mm}/${yyyy} - ${hh}:${mi}`;
}

/**
 * Só a parte da data: `dd/mm/yyyy`. Útil em tabelas compactas.
 */
function formatPtDateOnly(input) {
  const d = toDate(input);
  if (!d) return '—';
  return `${_pad2(d.getDate())}/${_pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
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
