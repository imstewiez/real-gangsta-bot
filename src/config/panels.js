'use strict';
const { optNum } = require('./_helpers');

// Sticky panels — mantém painéis visíveis no fundo do canal.
// Modos: 'repost' (default, republica após N mensagens), 'update' (edita sempre
// a mesma mensagem), 'none' (desligado).
module.exports = {
  PANELS_STICKY_MODE: (process.env.PANELS_STICKY_MODE || 'repost').toLowerCase(),
  PANELS_STICKY_THRESHOLD_MSGS: optNum('PANELS_STICKY_THRESHOLD_MSGS', 5),
};
