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

const STATE_META = {
  disponivel:    { emoji: '✅', label: 'Disponível' },
  indisponivel:  { emoji: '❌', label: 'Não dá' },
  talvez:        { emoji: '⏰', label: 'Talvez / mais tarde' },
};

const STATE_ORDER = ['disponivel', 'talvez', 'indisponivel'];

function pickHeader() {
  return HEADERS[Math.floor(Math.random() * HEADERS.length)];
}

function stateMeta(state) {
  return STATE_META[state] || { emoji: '❔', label: state };
}

module.exports = {
  HEADERS,
  STATE_META,
  STATE_ORDER,
  pickHeader,
  stateMeta,
};
