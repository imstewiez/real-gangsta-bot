'use strict';
/**
 * Panel System — helpers centralizados para renderização de painéis.
 *
 * Todos os painéis persistentes (chefia, oficial, bairrista, patrao, entrada)
 * usam estas funções para garantir consistência visual, copy e layout.
 *
 * Princípios:
 *   - Nunca duplicar lógica de embed entre painéis
 *   - Footer com timestamp em todos os painéis persistentes
 *   - Estados vazios bem tratados
 *   - Alertas visuais para situações que precisam de atenção
 *   - Botões organizados por prioridade (ação → consulta → pessoal → admin)
 */

const { brandEmbed, applyLogo, COLOR, sectionDivider, setFooterText } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { ValidationError } = require('../shared/errors');

// ═══════════════════════════════════════════════════════════════════════════════
// EMBED BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renderiza um embed de painel padronizado.
 *
 * @param {object} opts
 * @param {string} opts.title — título do painel (curto, com emoji)
 * @param {string} [opts.subtitle] — descrição curta do propósito do painel
 * @param {number} [opts.color] — cor do embed (default COLOR.BRAND)
 * @param {Array}  [opts.fields] — fields do embed (usar formatMetric/formatAlert/etc)
 * @param {Date}   [opts.updatedAt] — timestamp para o footer
 * @param {string} [opts.footerVariant] — variant do footer (default 'MOVEMENT')
 * @param {boolean} [opts.skipLogo] — não aplicar thumbnail
 */
function renderPanelEmbed({
  title,
  subtitle = '',
  color = COLOR.BRAND,
  fields = [],
  updatedAt = new Date(),
  footerVariant = 'MOVEMENT',
  skipLogo = false,
}) {
  const embed = brandEmbed(footerVariant, { skipLogo }).setColor(color).setTitle(String(title));
  if (subtitle) embed.setDescription(String(subtitle));

  // Adiciona fields; insere dividers entre grupos quando detecta mudança de inline=false
  let prevInline = false;
  for (const f of fields) {
    if (!f.inline && prevInline) {
      embed.addFields(sectionDivider());
    }
    embed.addFields(f);
    prevInline = f.inline !== false;
  }

  // Footer com timestamp
  const age = formatAge(updatedAt);
  setFooterText(embed, `Atualizado há ${age}`);

  return skipLogo ? embed : applyLogo(embed);
}

/**
 * Formata uma métrica como field inline.
 * @param {object} opts
 * @param {string} opts.label
 * @param {string|number} opts.value
 * @param {string} [opts.emoji]
 * @param {string} [opts.hint] — texto extra após o valor (ex: "unidades")
 * @param {boolean} [opts.inline=true]
 */
function formatMetric({ label, value, emoji = '', hint = '', inline = true }) {
  const safeValue = value === null || value === undefined ? '—' : String(value);
  const val = hint ? `**${safeValue}** ${hint}` : `**${safeValue}**`;
  return {
    name: emoji ? `${emoji} ${label}` : String(label),
    value: val,
    inline,
  };
}

/**
 * Estado vazio elegante — nunca mostra campo em branco.
 */
function formatEmptyState({ label, emoji = '◻️' }) {
  return {
    name: `${emoji} ${label}`,
    value: '_Nada a registar._',
    inline: true,
  };
}

/**
 * Bloco de alerta visual.
 * @param {string} opts.text
 * @param {string} [opts.emoji='⚠️']
 * @param {'warn'|'critical'|'info'} [opts.severity='warn']
 */
function formatAlert({ text, emoji = '⚠️', severity = 'warn' }) {
  const colorMap = {
    warn: EMOJI.WARN,
    critical: EMOJI.ERRO,
    info: EMOJI.INFO,
  };
  const icon = severity === 'warn' ? emoji : colorMap[severity] || emoji;
  return {
    name: `${icon} Alerta`,
    value: String(text),
    inline: false,
  };
}

/**
 * Secção com título e lista de bullets.
 * @param {string} title
 * @param {string[]} lines — cada linha já formatada
 * @param {boolean} [inline=false]
 */
function formatSection({ title, lines, inline = false }) {
  return {
    name: String(title),
    value: (Array.isArray(lines) ? lines.join('\n') : String(lines)) || '_Sem dados._',
    inline,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUTTON BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Organiza botões em rows por prioridade.
 * Regra: max 5 botões por row, max 5 rows.
 *
 * @param {Array<{customId, label, style, emoji}>} buttons
 * @returns {Array<ActionRowBuilder>}
 */
function buildButtonGrid(buttons) {
  if (buttons.length > 25) {
    throw new ValidationError('Máximo 25 botões por mensagem.');
  }
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const chunk = buttons.slice(i, i + 5);
    rows.push(buttonRow(...chunk.map(b => button(b))));
  }
  return rows;
}

/**
 * Organiza botões em rows com separação por categoria.
 * Cada categoria é um array de defs; categories são separadas visualmente
 * (na verdade o Discord não mostra separadores, mas limitamos a 5 por row).
 *
 * @param {Array<Array<{customId, label, style, emoji}>>} categories
 */
function buildButtonRowsByCategory(categories) {
  const rows = [];
  for (const cat of categories) {
    for (let i = 0; i < cat.length; i += 5) {
      const chunk = cat.slice(i, i + 5);
      rows.push(buttonRow(...chunk.map(b => button(b))));
    }
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formata idade relativa: "2 min", "1 h", "3 dias".
 */
function formatAge(date) {
  const ms = Math.max(0, Date.now() - new Date(date).getTime());
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? 's' : ''}`;
}

/**
 * Formata número com separador de milhares pt-PT.
 */
function fmt(n) {
  return Number(n || 0).toLocaleString('pt-PT');
}

/**
 * Formata percentagem com 1 casa decimal.
 */
function fmtPct(n) {
  return `${(Number(n || 0) * 100).toFixed(1)}%`;
}

module.exports = {
  renderPanelEmbed,
  formatMetric,
  formatEmptyState,
  formatAlert,
  formatSection,
  buildButtonGrid,
  buildButtonRowsByCategory,
  formatAge,
  fmt,
  fmtPct,
};
