'use strict';
/**
 * Copy de stickys.
 */

const E = require('./emojis');

const STICKY = {
  SET: (key, channelId, mode) => `${E.STICKY} Sticky \`${key}\` activa em <#${channelId}> (modo ${mode}).`,
  REMOVED: (key, channelId) => `${E.APAGAR} Sticky \`${key}\` removida de <#${channelId}>.`,
  REFRESHED: key => `${E.REFRESH} Sticky \`${key}\` actualizada.`,
  NOT_FOUND: () => 'Sticky não existe ou está inactiva.',
  EMPTY_LIST: () => 'Sem stickys activas.',
  LIST_TITLE: `${E.STICKY} Stickys Activas`,
};

module.exports = STICKY;
