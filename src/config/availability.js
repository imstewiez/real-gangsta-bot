'use strict';
const { optId, optBool, optNum, optList } = require('./_helpers');

// Disponibilidade diária — sessão com SelectMenu (slots × estados) e
// mensagem auto-publicada no canal configurado.
module.exports = {
  AVAILABILITY_CHANNEL_ID: optId('AVAILABILITY_CHANNEL_ID'),
  // Slots default: 12:00 → 02:00 com saltos de 2h. Máx 8 (limite Discord).
  AVAILABILITY_SLOTS: optList('AVAILABILITY_SLOTS', '12:00,14:00,16:00,18:00,20:00,22:00,00:00,02:00').slice(0, 8),
  // Roles mencionados ao publicar. Vazio → fallback para [BAIRRISTAS_BASE_ROLE_ID].
  AVAILABILITY_MENTION_ROLE_IDS: optList('AVAILABILITY_MENTION_ROLE_IDS'),
  // Auto-publish: job corre de 5 em 5 min e age só na hora indicada
  // (idempotente via unique index). Default: meia-noite local.
  AVAILABILITY_AUTO_PUBLISH_ENABLED: optBool('AVAILABILITY_AUTO_PUBLISH_ENABLED', true),
  AVAILABILITY_AUTO_PUBLISH_HOUR: optNum('AVAILABILITY_AUTO_PUBLISH_HOUR', 0),
};
