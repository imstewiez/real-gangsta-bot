'use strict';
/**
 * Camada central de texto/UX — Firma RedWood.
 *
 * Todo o conteúdo visível ao utilizador final passa por aqui. Evita strings
 * soltas em handlers/engines. Troca global de tom = 1 ficheiro.
 *
 * Estrutura:
 *   voice.js       — assinatura, glossário, status, resultados, roles
 *   emojis.js      — paleta curada (semântica, não decorativa)
 *   footers.js     — helpers de assinatura e footer
 *   errors.js      — mensagens de erro (curtas, directas)
 *   success.js     — confirmações (sem drama)
 *   panels.js      — copy de painéis (título, descrição, labels)
 *   onboarding.js  — entrada, boas-vindas, tags, promoções
 *   saidas.js      — saídas, wizard, publisher
 *   stats.js       — painel de estatísticas
 *   kills.js       — sistema de kills
 *   availability.js— presença / sessão
 *   radio.js       — frequências
 *   inventory.js   — stock, catálogo
 *   rankings.js    — topos
 *   sticky.js      — stickys
 */

const voice = require('./voice');
const EMOJI = require('./emojis');
const footers = require('./footers');
const TONE = require('./tone');
const ERRORS = require('./errors');
const SUCCESS = require('./success');
const PANELS = require('./panels');
const { BUTTONS, STYLE } = require('./buttons');
const MODALS = require('./modals');
const ONBOARDING = require('./onboarding');
const { SAIDAS, RESULT_LABEL } = require('./saidas');
const STATS = require('./stats');
const KILLS = require('./kills');
const AVAILABILITY = require('./availability');
const RADIO = require('./radio');
const INVENTORY = require('./inventory');
const RANKINGS = require('./rankings');
const STICKY = require('./sticky');
const MEMBER_STATS = require('./memberStats');
const BAIRRISTAS = require('./bairristas');

module.exports = {
  ...voice,
  EMOJI,
  ...footers,
  TONE,
  ERRORS,
  SUCCESS,
  PANELS,
  BUTTONS,
  STYLE,
  MODALS,
  ONBOARDING,
  SAIDAS,
  RESULT_LABEL,
  STATS,
  KILLS,
  AVAILABILITY,
  RADIO,
  INVENTORY,
  RANKINGS,
  STICKY,
  MEMBER_STATS,
  BAIRRISTAS,
};
