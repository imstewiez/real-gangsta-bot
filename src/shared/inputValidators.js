'use strict';
/**
 * Validadores centrais para inputs de modais Discord.
 *
 * Objectivos:
 *   - prevenir strings com markdown/embeds potencialmente enganosos
 *   - validar números (positivos, faixas)
 *   - validar formatos (data, hora, S/N, IDs)
 *   - limite de tamanho coerente
 *
 * Todos os validators devolvem `{ ok, value, error }`. Nunca atiram.
 */

const MAX_DEFAULT_LEN = 500;

// Caracteres / sequências que podem quebrar layouts ou induzir em erro.
// Removemos mentions tipo <@123>, <#456>, <@&789> e bloqueamos backticks
// triplicados que podem quebrar blocos de código em embeds.
const DANGEROUS_PATTERNS = [
  /<@!?&?\d{15,20}>/g, // mentions user/role/channel-like
  /<#\d{15,20}>/g,
  /```/g, // triple backtick
];

function sanitizeText(v, maxLen = MAX_DEFAULT_LEN) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  for (const re of DANGEROUS_PATTERNS) s = s.replace(re, '');
  // Collapse whitespace + trim (depois de remover mentions — evita trailing space)
  s = s.replace(/\s+/g, ' ').trim();
  // Trunca
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
  return s;
}

function validateText(v, { required = false, minLen = 0, maxLen = MAX_DEFAULT_LEN, name = 'campo' } = {}) {
  const s = sanitizeText(v, maxLen);
  if (required && !s) return { ok: false, error: `O ${name} é obrigatório.` };
  if (s.length < minLen) return { ok: false, error: `O ${name} tem de ter pelo menos ${minLen} caracteres.` };
  return { ok: true, value: s };
}

function validateInt(v, { required = false, min = null, max = null, name = 'número' } = {}) {
  const raw = v === null || v === undefined ? '' : String(v).trim();
  if (!raw) {
    if (required) return { ok: false, error: `O ${name} é obrigatório.` };
    return { ok: true, value: 0 };
  }
  const n = parseInt(raw, 10);
  if (isNaN(n)) return { ok: false, error: `${name} inválido — tem de ser número inteiro.` };
  if (min !== null && n < min) return { ok: false, error: `${name} tem de ser ≥ ${min}.` };
  if (max !== null && n > max) return { ok: false, error: `${name} tem de ser ≤ ${max}.` };
  return { ok: true, value: n };
}

function validateFloat(v, { required = false, min = null, max = null, name = 'valor' } = {}) {
  const raw = v === null || v === undefined ? '' : String(v).trim().replace(',', '.');
  if (!raw) {
    if (required) return { ok: false, error: `O ${name} é obrigatório.` };
    return { ok: true, value: 0 };
  }
  const n = parseFloat(raw);
  if (isNaN(n)) return { ok: false, error: `${name} inválido.` };
  if (min !== null && n < min) return { ok: false, error: `${name} tem de ser ≥ ${min}.` };
  if (max !== null && n > max) return { ok: false, error: `${name} tem de ser ≤ ${max}.` };
  return { ok: true, value: n };
}

function validateYesNo(v, { required = false, name = 'campo' } = {}) {
  const s = v === null || v === undefined ? '' : String(v).trim().toLowerCase();
  if (!s) {
    if (required) return { ok: false, error: `${name} é obrigatório (S/N).` };
    return { ok: true, value: false };
  }
  if (['s', 'sim', 'y', 'yes', '1', 'true'].includes(s)) return { ok: true, value: true };
  if (['n', 'nao', 'não', 'no', '0', 'false'].includes(s)) return { ok: true, value: false };
  return { ok: false, error: `${name} inválido — usa S ou N.` };
}

function validateDate(v, { required = false, name = 'data' } = {}) {
  const s = v === null || v === undefined ? '' : String(v).trim();
  if (!s) {
    if (required) return { ok: false, error: `${name} obrigatória.` };
    return { ok: true, value: null };
  }
  // Aceita YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { ok: false, error: `${name} inválida — formato: YYYY-MM-DD.` };
  const d = new Date(`${s}T00:00:00Z`);
  if (isNaN(d.getTime())) return { ok: false, error: `${name} inválida.` };
  return { ok: true, value: s };
}

function validateTime(v, { required = false, name = 'hora' } = {}) {
  const s = v === null || v === undefined ? '' : String(v).trim();
  if (!s) {
    if (required) return { ok: false, error: `${name} obrigatória.` };
    return { ok: true, value: null };
  }
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { ok: false, error: `${name} inválida — formato: HH:MM.` };
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh > 23 || mm > 59) return { ok: false, error: `${name} fora de intervalo.` };
  return { ok: true, value: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

function validateEnum(v, allowed, { required = false, name = 'opção' } = {}) {
  const s = v === null || v === undefined ? '' : String(v).trim().toLowerCase();
  if (!s) {
    if (required) return { ok: false, error: `${name} obrigatório.` };
    return { ok: true, value: null };
  }
  if (!allowed.includes(s)) return { ok: false, error: `${name} inválido. Usa: ${allowed.join(', ')}.` };
  return { ok: true, value: s };
}

/**
 * Helper para correr um batch de validações e agregar erros.
 *   const r = runAll({
 *     nome: [validateText, input.nome, { required: true, maxLen: 50, name: 'nome' }],
 *   });
 *   if (!r.ok) return reply(r.firstError);
 */
function runAll(checks) {
  const out = { ok: true, values: {}, errors: {}, firstError: null };
  for (const [field, [fn, value, opts]] of Object.entries(checks)) {
    const res = fn(value, opts || {});
    if (!res.ok) {
      out.ok = false;
      out.errors[field] = res.error;
      if (!out.firstError) out.firstError = res.error;
    } else {
      out.values[field] = res.value;
    }
  }
  return out;
}

module.exports = {
  sanitizeText,
  validateText,
  validateInt,
  validateFloat,
  validateYesNo,
  validateDate,
  validateTime,
  validateEnum,
  runAll,
  DANGEROUS_PATTERNS,
  MAX_DEFAULT_LEN,
};
