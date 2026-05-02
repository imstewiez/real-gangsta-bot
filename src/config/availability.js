'use strict';
const { optId, optBool, optNum, optList } = require('./_helpers');

// Disponibilidade diária — sessão com SelectMenu (slots × estados) e
// mensagem auto-publicada no canal configurado.
module.exports = {
  AVAILABILITY_CHANNEL_ID: optId('AVAILABILITY_CHANNEL_ID'),
  // Slots simplificados: s� Dia Todo, Tarde, Noite.
  AVAILABILITY_SLOTS: optList('AVAILABILITY_SLOTS', 'Dia Todo,Tarde,Noite').slice(0, 8),
  // Roles mencionados ao publicar. Vazio → fallback para [BAIRRISTAS_BASE_ROLE_ID].
  AVAILABILITY_MENTION_ROLE_IDS: optList('AVAILABILITY_MENTION_ROLE_IDS'),
  // Auto-publish: job corre de 5 em 5 min e age só na hora indicada
  // (idempotente via unique index). Default: meia-noite local.
  AVAILABILITY_AUTO_PUBLISH_ENABLED: optBool('AVAILABILITY_AUTO_PUBLISH_ENABLED', true),
  // Hora do reset diário (local). Default 7h — fecha sessão anterior + abre
  // nova. Mudou de 0h→7h por pedido do user (reset à manhã).
  AVAILABILITY_AUTO_PUBLISH_HOUR: optNum('AVAILABILITY_AUTO_PUBLISH_HOUR', 7),
};
