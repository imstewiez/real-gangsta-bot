'use strict';
/**
 * Templates de cabeçalho rotativos para a chamada de disponibilidade diária.
 *
 * O bot escolhe um aleatoriamente por sessão para variar o tom — sem ficar
 * cringe. Mantém a mensagem viva e dá personalidade ao bot sem perder
 * profissionalismo.
 *
 * Para acrescentar/remover linhas, edita este array. Não mexe no engine.
 */

const HEADERS = [
  'Quem vem fazer número hoje?',
  'Bora aparecer — a rua não se domina sozinha.',
  'Marca presença, não fiques a dormir.',
  'Quem está disponível para sair hoje?',
  'Se vais aparecer, vota. Se não vais, também.',
  'Hoje há movimento — quem alinha?',
  'Quem é que vai pôr o casaco e descer?',
  'Vota nos teus horários — assim sabe-se com o que se conta.',
  'A rua chama. Quem responde?',
  'Marca o teu horário. Os planos saem daqui.',
];

const { EMOJI } = require('../content');

const STATE_META = {
  disponivel: { emoji: EMOJI.DISPONIVEL || '✅', label: 'Disponível' },
  indisponivel: { emoji: EMOJI.INDISPONIVEL || '❌', label: 'Não dá' },
  talvez: { emoji: EMOJI.TALVEZ || '⏰', label: 'Talvez / mais tarde' },
};

const STATE_ORDER = ['disponivel', 'talvez', 'indisponivel'];

// ── Intervalos pré-definidos para voto em bloco ────────────────────────────
// Cada range mapeia para um estado e um conjunto de slots (por label).
// O engine filtra contra os slots existentes da sessão.

/** Slots que compõem cada intervalo nomeado (labels hardcoded = default config). */
const RANGE_SLOTS = {
  tarde: ['12:00', '14:00', '16:00', '18:00'],
  noite: ['18:00', '20:00', '22:00'],
  madrugada: ['22:00', '00:00', '02:00'],
};

/**
 * Gera as opções do SelectMenu de voto.
 * Recebe os slots existentes da sessão e devolve array de { value, label, emoji, description }.
 * value = `<rangeKey>:<state>` exceto 'limpar' que é especial.
 */
function buildSelectOptions(slots) {
  const slotLabels = slots.map(s => s.slot_label);
  const opts = [];

  const add = (rangeKey, state, groupLabel, emoji) => {
    let targets;
    if (rangeKey === 'dia_todo') targets = [...slotLabels];
    else if (rangeKey === 'limpar') targets = [...slotLabels];
    else if (RANGE_SLOTS[rangeKey]) {
      targets = RANGE_SLOTS[rangeKey].filter(l => slotLabels.includes(l));
    } else {
      // slot individual
      targets = slotLabels.filter(l => l === rangeKey);
    }
    if (!targets.length) return;
    const stateLabel = STATE_META[state]?.label || state;
    const desc =
      targets.length === slotLabels.length
        ? `Aplica a todos os slots (${targets.length})`
        : `Slots: ${targets.join(', ')}`;
    opts.push({
      label: `${emoji} ${groupLabel}`,
      description: desc,
      value: `${rangeKey}:${state}`,
      emoji,
    });
  };

  // ── Disponível ──
  add('dia_todo', 'disponivel', 'Dia todo', '✅');
  add('tarde', 'disponivel', 'Tarde (12–18h)', '✅');
  add('noite', 'disponivel', 'Noite (18–00h)', '✅');
  add('madrugada', 'disponivel', 'Madrugada (22–02h)', '✅');
  for (const label of slotLabels) {
    // skip se já está num range? Não, deixa o user decidir.
    add(label, 'disponivel', label, '✅');
  }

  // ── Talvez ──
  add('dia_todo', 'talvez', 'Dia todo', '⏰');
  add('tarde', 'talvez', 'Tarde (12–18h)', '⏰');
  add('noite', 'talvez', 'Noite (18–00h)', '⏰');
  add('madrugada', 'talvez', 'Madrugada (22–02h)', '⏰');

  // ── Indisponível ──
  add('dia_todo', 'indisponivel', 'Todo o dia', '❌');

  // ── Limpar ──
  if (slotLabels.length) {
    opts.push({
      label: '🗑️ Limpar marcações',
      description: 'Remove todos os teus votos desta sessão',
      value: 'limpar:limpar',
      emoji: '🗑️',
    });
  }

  return opts;
}

/**
 * Resolve um value do select (ex: 'tarde:disponivel') para a lista de slot_ids
 * e o estado final. Recebe os slots da sessão.
 */
function resolveRangeValue(value, slots) {
  const lastColon = value.lastIndexOf(':');
  if (lastColon === -1) return null;
  const rangeKey = value.slice(0, lastColon);
  const state = value.slice(lastColon + 1);
  if (!rangeKey || !state) return null;

  if (rangeKey === 'limpar') {
    return { state: 'limpar', slotIds: slots.map(s => s.id) };
  }

  const slotLabels = slots.map(s => s.slot_label);
  let targets;
  if (rangeKey === 'dia_todo') targets = [...slotLabels];
  else if (RANGE_SLOTS[rangeKey]) targets = RANGE_SLOTS[rangeKey].filter(l => slotLabels.includes(l));
  else targets = slotLabels.filter(l => l === rangeKey);

  const slotMap = new Map(slots.map(s => [s.slot_label, s.id]));
  const slotIds = targets.map(l => slotMap.get(l)).filter(Boolean);
  return { state, slotIds };
}

function pickHeader() {
  return HEADERS[Math.floor(Math.random() * HEADERS.length)];
}

function stateMeta(state) {
  return STATE_META[state] || { emoji: EMOJI.INFO || '❔', label: state };
}

module.exports = {
  HEADERS,
  STATE_META,
  STATE_ORDER,
  pickHeader,
  stateMeta,
  buildSelectOptions,
  resolveRangeValue,
};
