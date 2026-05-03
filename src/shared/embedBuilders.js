'use strict';
const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const content = require('../content');
const { formatPtDateOnly } = require('./formatPtDate');
const { fmtSaidaType, fmtSaidaStatus, fmtRole } = require('./labels');

const { EMOJI, footer, ROLE, STATUS, SAIDA_TYPE, ONBOARDING, INVENTORY, RANKINGS } = content;

// ── Colour palette ──────────────────────────────────────────────────────────
// Canonical hex por estado semântico. Antes espalhado em ~39 sítios como
// literais; centralizar aqui permite alterar "sucesso" num só lugar e
// garante consistência visual entre embeds do mesmo tipo.
const COLOR = Object.freeze({
  BRAND: CONFIG.BOT_COLOR,
  SUCCESS: 0x2ecc71, // verde — entregas, confirmações
  GOLD: 0xf1c40f, // amarelo — vendas, ranking, destaque
  INFO: 0x3498db, // azul — neutro, em curso
  WARNING: 0xe67e22, // laranja — em_liquidacao, atenção
  WARNING_SOFT: 0xf39c12, // laranja soft — avisos menos críticos
  DANGER: 0xe74c3c, // vermelho — combate, spot queimado
  ERROR: 0xc0392b, // vermelho escuro — erro
  MUTED: 0x95a5a6, // cinzento — cancelada, concluída, fechada
  PURPLE: 0x9b59b6, // roxo — wizard, destaques especiais
  PROMOTION_GOLD: 0xffd700, // ouro brilhante — promoções
  DARK: 0x2c2f33, // quase preto — kill log, embeds pesados
  TEAL: 0x1abc9c, // teal — notificações de eventos
  GREEN_ALT: 0x27ae60, // verde alternativo — notificações positivas
});

// ── Brand embeds ────────────────────────────────────────────────────────────

// Footer assinado pela Firma RedWood. Icone opcional via BOT_LOGO_URL.
// Todas as embeds do bot devem passar por aqui — garante consistência visual.
// V13: logo aplicado automaticamente (skipLogo para excepções).
function brandEmbed(variant = 'SHORT', opts = {}) {
  const embed = new EmbedBuilder().setColor(CONFIG.BOT_COLOR).setFooter(footer(variant, CONFIG.BOT_LOGO_URL));
  if (!opts.skipLogo) applyLogo(embed);
  return embed;
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
    if (kind === 'euro') return `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v)).toLocaleString('pt-PT')}€`;
    if (kind === 'pct') return `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(1)}%`;
    return `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v)).toLocaleString('pt-PT')}`;
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
      ? `${Math.round(Number(current)).toLocaleString('pt-PT')}€`
      : kind === 'pct'
        ? `${(Number(current) * 100).toFixed(1)}%`
        : Math.round(Number(current)).toLocaleString('pt-PT');
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
// V13: chamado automaticamente por brandEmbed() em todos os embeds.
// No-op silencioso se logo não estiver definido.
function applyLogo(embed) {
  if (CONFIG.BOT_LOGO_URL) embed.setThumbnail(CONFIG.BOT_LOGO_URL);
  return embed;
}

// ── Visual helpers v13 — separadores, pills, grids, listas ─────────────────

/** Linha separadora decorativa para descrições: `─ ✦ Título ✦ ─` */
function headerLine(icon, text) {
  return `\n─ ${icon ? icon + ' ' : ''}${text} ${icon ? icon + ' ' : ''}─\n`;
}

/** Formata pares chave-valor em inline fields consistentes. */
function dataGrid(pairs) {
  return pairs.map(p => ({
    name: `${p.icon || '•'} ${p.label}`,
    value: `**${p.value}**`,
    inline: p.inline !== false,
  }));
}

/** Pill de estado com Discord markdown codeblock colorido.
 *  color = 'diff' (verde/vermelho), 'fix' (amarelo), 'yaml' (azul), 'css' (cinza)
 */
function statusPill(text, color = 'diff') {
  const lang = { diff: 'diff', warn: 'fix', info: 'yaml', muted: 'css' }[color] || color;
  return `\`\`${lang}\n${text}\n\`\``;
}

/** Lista numerada ou com bullets de itens. */
function itemList(lines, opts = {}) {
  const { numbered = false, indent = '' } = opts;
  return lines.map((l, i) => `${indent}${numbered ? `${i + 1}.` : '•'} ${l}`).join('\n');
}

/** Card de métrica rico — label + valor bold + delta opcional + icon. */
function metricCard(label, value, opts = {}) {
  const { delta = null, icon = '', inline = true } = opts;
  let val = `**${value}**`;
  if (delta) val += `  ·  ${delta.text || delta}`;
  return { name: `${icon} ${label}`, value: val, inline };
}

/** Altera o texto do footer sem perder o iconURL existente. */
function setFooterText(embed, text) {
  const existing = embed.data?.footer || {};
  const out = { text };
  if (existing.iconURL) out.iconURL = existing.iconURL;
  embed.setFooter(out);
  return embed;
}

// ── Embed presets v13 — padrões comuns com branding automático ──────────────

/** Rich embed para dados estruturados (entregas, saídas, etc). */
function richEmbed({ title, description, color, fields = [], image, footerVariant = 'MOVEMENT' }) {
  const embed = brandEmbed(footerVariant).setTitle(title);
  if (description) embed.setDescription(description);
  if (color) embed.setColor(color);
  if (fields.length) embed.addFields(fields);
  if (image) embed.setImage(image);
  return embed;
}

/** Status embed para estados discretos (pendente/aprovado/recusado). */
function statusEmbed({ status, title, description, actor, details = [], color, footerVariant = 'MOVEMENT' }) {
  const embed = brandEmbed(footerVariant).setTitle(title);
  if (color) embed.setColor(color);
  const desc = [
    description,
    '',
    statusPill(status, color === COLOR.SUCCESS ? 'diff' : color === COLOR.ERROR ? 'diff' : 'fix'),
  ]
    .filter(Boolean)
    .join('\n');
  embed.setDescription(desc);
  if (actor) embed.addFields({ name: '👤 Actor', value: `<@${actor}>`, inline: true });
  if (details.length) embed.addFields(dataGrid(details));
  return embed;
}

/** Dashboard embed para painéis com múltiplas secções. */
function dashboardEmbed({ title, sections = [], color, footerVariant = 'SHORT' }) {
  const embed = brandEmbed(footerVariant).setTitle(title);
  if (color) embed.setColor(color);
  for (const sec of sections) {
    if (sec.title) embed.addFields({ name: '\u200b', value: headerLine(sec.icon, sec.title), inline: false });
    if (sec.lines) embed.addFields({ name: '\u200b', value: sec.lines.join('\n'), inline: false });
    if (sec.fields) embed.addFields(sec.fields);
  }
  return embed;
}

function successEmbed(title, description) {
  return brandEmbed()
    .setColor(COLOR.SUCCESS)
    .setTitle(`${EMOJI.OK} ${title}`)
    .setDescription(description || null);
}

function errorEmbed(title, description) {
  return brandEmbed()
    .setColor(COLOR.ERROR)
    .setTitle(`${EMOJI.WARN} ${title}`)
    .setDescription(description || null);
}

function infoEmbed(title, description) {
  return brandEmbed()
    .setColor(COLOR.INFO)
    .setTitle(title)
    .setDescription(description || null);
}

function warningEmbed(title, description) {
  return brandEmbed()
    .setColor(COLOR.WARNING)
    .setTitle(`${EMOJI.WARN} ${title}`)
    .setDescription(description || null);
}

function stockEmbed(items) {
  const embed = brandEmbed().setTitle(INVENTORY.TITLE);
  if (!items.length) {
    embed.setDescription(INVENTORY.EMPTY);
    return embed;
  }
  // Agrupar por categoria para caber nos limites do embed (4096 chars desc + 25 fields × 1024 chars)
  const byCat = {};
  for (const i of items) {
    const cat = i.category || 'outros';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(i);
  }
  const totalQty = items.reduce((a, i) => a + (Number(i.balance) || 0), 0);
  embed.setDescription(`${items.length} itens · ${totalQty.toLocaleString('pt-PT')} unidades em stock`);
  for (const [cat, catItems] of Object.entries(byCat)) {
    const lines = catItems.map(i => {
      const bal = Number(i.balance) || 0;
      return `${bal > 0 ? '🟢' : bal === 0 ? '⚫' : '🔴'} **${i.name}** — \`${bal}\` ${i.unit || 'un'}`;
    });
    const value = lines.join('\n').slice(0, 1024);
    embed.addFields({ name: `📦 ${cat.toUpperCase()}`, value, inline: false });
    if (embed.data.fields.length >= 25) break;
  }
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
    .setTitle(`${EMOJI.SAIDA} Saída #${op.id} — ${fmtSaidaType(op.operation_type)}`)
    .addFields(
      { name: 'Data', value: dateValue, inline: true },
      { name: 'Estado', value: fmtSaidaStatus(op.status), inline: true },
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
      { name: 'Peso', value: fmtRole(member.role), inline: true },
      { name: 'Estado', value: fmtSaidaStatus(member.status) || STATUS[member.status] || member.status, inline: true },
      { name: 'Na casa desde', value: formatPtDateOnly(member.joined_at), inline: true }
    );
}

function welcomeChannelEmbed(memberName) {
  return applyLogo(
    brandEmbed('HOUSE').setTitle(ONBOARDING.WELCOME_TITLE(memberName)).setDescription(ONBOARDING.WELCOME_BODY)
  );
}

module.exports = {
  COLOR,
  brandEmbed,
  applyLogo,
  successEmbed,
  errorEmbed,
  infoEmbed,
  warningEmbed,
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
  // Visual helpers v13
  headerLine,
  dataGrid,
  statusPill,
  itemList,
  metricCard,
  setFooterText,
  // Embed presets v13
  richEmbed,
  statusEmbed,
  dashboardEmbed,
};
