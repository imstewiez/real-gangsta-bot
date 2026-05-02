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

/**
 * Gera as opções do SelectMenu de voto.
 * Recebe os slots existentes da sessão e devolve array de { value, label, emoji, description }.
 * value = `<slotLabel>:<state>` exceto 'limpar' que é especial.
 *
 * Simplificado: apenas 1 opção por slot (marca como disponível).
 * Para outros estados (talvez/indisponível) usar os botões de atalho.
 */
function buildSelectOptions(slots) {
  const slotLabels = slots.map(s => s.slot_label);
  const opts = [];

  for (const label of slotLabels) {
    opts.push({
      label: `${STATE_META.disponivel.emoji} ${label}`,
      description: `Marcar ${label} como disponível`,
      value: `${label}:disponivel`,
      emoji: STATE_META.disponivel.emoji,
    });
  }

  // Limpar
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
 * Resolve um value do select (ex: 'Dia Todo:disponivel') para o slot_id
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

  const slotMap = new Map(slots.map(s => [s.slot_label, s.id]));
  const slotId = slotMap.get(rangeKey);
  if (!slotId) return null;
  return { state, slotIds: [slotId] };
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
