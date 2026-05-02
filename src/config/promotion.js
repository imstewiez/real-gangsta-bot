'use strict';
const { optNum } = require('./_helpers');

module.exports = {
  // Tier default de entrada no bairro (set pela onboardingEngine).
  BAIRRISTA_DEFAULT_TIER: process.env.BAIRRISTA_DEFAULT_TIER || 'young_blood',
  // Thresholds de promoção automática (XP acumulado).
  // Young Blood → O Gunão aos 50.000; O Gunão → Gangster Fodido aos 100.000.
  PROMO_YOUNG_BLOOD_TO_GUNAO: optNum('PROMO_YOUNG_BLOOD_TO_GUNAO', 50000),
  PROMO_GUNAO_TO_GANGSTER_FODIDO: optNum('PROMO_GUNAO_TO_GANGSTER_FODIDO', 100000),
};
