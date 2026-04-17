'use strict';
const { optNum } = require('./_helpers');

module.exports = {
  // Tier default de entrada no bairro (set pela onboardingEngine).
  BAIRRISTA_DEFAULT_TIER: process.env.BAIRRISTA_DEFAULT_TIER || 'young_blood',
  // Thresholds de promoção automática (unidades entregues).
  // Young Blood → O Gunão aos 25.000; O Gunão → Gangster Fodido aos 50.000.
  PROMO_YOUNG_BLOOD_TO_GUNAO: optNum('PROMO_YOUNG_BLOOD_TO_GUNAO', 25000),
  PROMO_GUNAO_TO_GANGSTER_FODIDO: optNum('PROMO_GUNAO_TO_GANGSTER_FODIDO', 50000),
};
