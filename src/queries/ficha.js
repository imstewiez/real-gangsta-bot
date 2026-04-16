'use strict';
/**
 * /ficha — ficha de um membro (delega para memberHandlers).
 */

const { handleMemberCommand } = require('../members/memberHandlers');

module.exports = { handle: handleMemberCommand };
