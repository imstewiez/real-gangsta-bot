'use strict';
const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const content = require('../content');
const { formatPtDate, formatPtDateOnly } = require('./formatPtDate');

const { EMOJI, footer, ROLE, STATUS, SAIDA_TYPE, ONBOARDING, INVENTORY, RANKINGS } = content;

// ── Brand embeds ────────────────────────────────────────────────────────────

// Footer assinado pela Firma RedWood. Icone opcional via BOT_LOGO_URL.
// Todas as embeds do bot devem passar por aqui — garante consistência visual.
function brandEmbed(variant = 'SHORT') {
  return new EmbedBuilder().setColor(CONFIG.BOT_COLOR).setFooter(footer(variant, CONFIG.BOT_LOGO_URL)).setTimestamp();
}

// ── Data-rich helpers (reusáveis em qualquer embed) ─────────────────────────

/**
 * Formata um delta entre dois valores. Devolve "↑ +X (+Y%)" ou "↓ -X (-Y%)".
 * Usado em rankings, stats pessoais, resumos semanais.
 *
 * @param {number} previous
 * @param {number} current
 * @param {'int'|'pct'|'euro'} kind
 * @returns {{ text: string, direction: 'up'|'down'|'flat', delta: number }}
 */
function formatDelta(previous, current, kind = 'int') {
  const prev = Number(previous) || 0;
  const curr = Number(current) || 0;
  const delta = curr - prev;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
  const pctBase = prev === 0 ? (curr === 0 ? 0 : 1) : Math.abs(delta) / Math.abs(prev);
  const fmt = v => {
    if (kind === 'euro') return `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-PT')}€`;
    if (kind === 'pct') return `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(1)}%`;
    return `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-PT')}`;
  };
  const pctTxt = prev === 0 ? '' : ` (${(pctBase * 100).toFixed(0)}%)`;
  return { text: `${arrow} ${fmt(delta)}${pctTxt}`, direction, delta };
}

/**
 * Field pronto a empurrar para .addFields() com valor + delta.
 * @param {string} label
 * @param {number} current
 * @param {number} previous
 * @param {{ kind?: 'int'|'pct'|'euro', inline?: boolean }} opts
 */
function deltaField(label, current, previous, opts = {}) {
  const { kind = 'int', inline = true } = opts;
  const d = formatDelta(previous, current, kind);
  const fmtCur =
    kind === 'euro'
      ? `${Number(current).toLocaleString('pt-PT')}€`
      : kind === 'pct'
        ? `${(Number(current) * 100).toFixed(1)}%`
        : Number(current).toLocaleString('pt-PT');
  return { name: label, value: `**${fmtCur}** · ${d.text}`, inline };
}

/**
 * Barra visual de progresso. Width em chars. Usa caracteres block.
 * @param {number} current
 * @param {number} max
 * @param {{ width?: number, filled?: string, empty?: string }} opts
 */
function progressBar(current, max, opts = {}) {
  const { width = 10, filled = '█', empty = '░' } = opts;
  if (!max || max <= 0) return empty.repeat(width);
  const pct = Math.max(0, Math.min(1, current / max));
  const n = Math.round(pct * width);
  return filled.repeat(n) + empty.repeat(width - n);
}

/**
 * Badge de posição em ranking — 🥇🥈🥉 / #N.
 * @param {number} position 1-based
 */
function rankBadge(position) {
  if (position === 1) return EMOJI.MEDAL_1;
  if (position === 2) return EMOJI.MEDAL_2;
  if (position === 3) return EMOJI.MEDAL_3;
  return `#${position}`;
}

/**
 * Emoji de streak baseado no count. 🔥 para ≥3, ⚡ para ≥5, 💀 para ≥10.
 * @param {number} count
 */
function streakBadge(count) {
  if (count >= 10) return '💀';
  if (count >= 5) return '⚡';
  if (count >= 3) return '🔥';
  return '';
}

/**
 * Seta simples ↑/↓/→ sem formatting.
 */
function trendArrow(prev, curr) {
  if (curr > prev) return '↑';
  if (curr < prev) return '↓';
  return '→';
}

/**
 * Field divisor para embeds densos — zero-width name + linha.
 */
function sectionDivider() {
  return { name: '\u200b', value: '─────────', inline: false };
}

// Aplica o logo como thumbnail (canto superior direito) se BOT_LOGO_URL existir.
// Usar nos painéis principais. No-op silencioso se logo não estiver definido.
function applyLogo(embed) {
  if (CONFIG.BOT_LOGO_URL) embed.setThumbnail(CONFIG.BOT_LOGO_URL);
  return embed;
}

function successEmbed(title, description) {
  return brandEmbed()
    .setTitle(`${EMOJI.OK} ${title}`)
    .setDescription(description || null);
}

function errorEmbed(title, description) {
  return brandEmbed()
    .setColor(0xc0392b)
    .setTitle(`${EMOJI.WARN} ${title}`)
    .setDescription(description || null);
}

function infoEmbed(title, description) {
  return brandEmbed()
    .setTitle(title)
    .setDescription(description || null);
}

function stockEmbed(items) {
  const embed = brandEmbed().setTitle(INVENTORY.TITLE);
  if (!items.length) {
    embed.setDescription(INVENTORY.EMPTY);
    return embed;
  }
  const lines = items.map(i => `**${i.name}** (${i.category}) — ${i.balance} ${i.unit}`);
  embed.setDescription(lines.join('\n'));
  return embed;
}

function operationEmbed(op) {
  // Data no formato dd/mm/yyyy; só adiciona hora se scheduled_time foi
  // marcada explicitamente (!= 00:00).
  let dateValue = formatPtDateOnly(op.date);
  if (op.scheduled_time) {
    const t = String(op.scheduled_time).slice(0, 5);
    if (t && t !== '00:00') dateValue += ` · ${t}`;
  }
  return brandEmbed()
    .setTitle(`${EMOJI.SAIDA} Saída #${op.id} — ${SAIDA_TYPE[op.operation_type] || op.operation_type}`)
    .addFields(
      { name: 'Data', value: dateValue, inline: true },
      { name: 'Estado', value: STATUS[op.status] || op.status, inline: true },
      { name: 'Spot', value: op.spot || '—', inline: true },
      { name: 'Grupo', value: `#${op.group_number} (máx ${op.max_participants})`, inline: true },
      { name: 'Líder', value: op.leader_name || '—', inline: true }
    );
}

function rankingEmbed(title, rankings, weekLabel, opts = {}) {
  const { previousMap = null } = opts; // Map<discordId, previousPosition> para deltas
  const embed = brandEmbed('TOP').setTitle(RANKINGS.TITLE(title, weekLabel));
  if (!rankings.length) {
    embed.setDescription(RANKINGS.EMPTY_WEEK);
    return embed;
  }
  const lines = rankings.map((r, i) => {
    const prefix = rankBadge(i + 1);
    const qty = Number(r.weighted_value || 0).toLocaleString('pt-PT');

    // Delta vs semana anterior (se fornecido).
    let deltaMark = '';
    if (previousMap) {
      const prev = previousMap.get(r.discord_id);
      if (prev === undefined) deltaMark = ' ⚡ *novo*';
      else if (prev > i + 1) deltaMark = ` ↑ **${prev - (i + 1)}**`;
      else if (prev < i + 1) deltaMark = ` ↓ **${i + 1 - prev}**`;
    }

    return (
      `${prefix} <@${r.discord_id}> — **${qty}**` +
      `  ·  ${r.deliveries}e · ${r.sales}v · ${r.operations_count}s${deltaMark}`
    );
  });
  embed.setDescription(lines.join('\n'));
  return embed;
}

function memberProfileEmbed(member) {
  return brandEmbed()
    .setTitle(`${EMOJI.TAG} Ficha — ${member.display_name || member.username}`)
    .addFields(
      { name: 'Peso', value: ROLE[member.role] || member.role, inline: true },
      { name: 'Estado', value: STATUS[member.status] || member.status, inline: true },
      { name: 'Na casa desde', value: formatPtDateOnly(member.joined_at), inline: true }
    );
}

function welcomeChannelEmbed(memberName) {
  return applyLogo(
    brandEmbed('HOUSE').setTitle(ONBOARDING.WELCOME_TITLE(memberName)).setDescription(ONBOARDING.WELCOME_BODY)
  );
}

module.exports = {
  brandEmbed,
  applyLogo,
  successEmbed,
  errorEmbed,
  infoEmbed,
  stockEmbed,
  operationEmbed,
  rankingEmbed,
  memberProfileEmbed,
  welcomeChannelEmbed,
  // Data-rich helpers
  formatDelta,
  deltaField,
  progressBar,
  rankBadge,
  streakBadge,
  trendArrow,
  sectionDivider,
};
