'use strict';
const { optId, optBool, optNum } = require('./_helpers');

module.exports = {
  RADIO_PUBLISH_CHANNEL_ID: optId('RADIO_PUBLISH_CHANNEL_ID'),
  // Range para geração aleatória (default: 1000-9999, sem leading zero).
  RADIO_RANDOM_MIN: optNum('RADIO_RANDOM_MIN', 1000),
  RADIO_RANDOM_MAX: optNum('RADIO_RANDOM_MAX', 9999),
  // Permite explicitamente 0/0000 como rádio válida.
  RADIO_ALLOW_ZERO: optBool('RADIO_ALLOW_ZERO', false),
};
