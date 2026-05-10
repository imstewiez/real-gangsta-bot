'use strict';

// ── PvP Rating ───────────────────────────────────────────────────────────────
const BASE_RATING = 1000;
const RATING_FLOOR = 0;
const WEEKLY_DECAY = 10;

const TIERS = [
  { min: 1400, tier: 'diamante', label: 'Diamante' },
  { min: 1200, tier: 'platina', label: 'Platina' },
  { min: 1000, tier: 'ouro', label: 'Ouro' },
  { min: 800, tier: 'prata', label: 'Prata' },
  { min: 0, tier: 'bronze', label: 'Bronze' },
];

const DELTA_KILL = 5;
const DELTA_SURVIVED = 3;
const DELTA_DEATH = -5;
const DELTA_VICTORY = 10;
const DELTA_DEFEAT = -5;
const DELTA_MVP = 5;

// ── Team Selection ───────────────────────────────────────────────────────────
const MAX_FIGHTERS = 6;
const W_PVP_RATING = 0.3;
const W_KD_RATIO = 0.2;
const W_MVP = 0.1;
const W_DELIVERY = 0.2;
const W_SURVIVAL = 0.2;
const WEAPON_BONUS_PCT = 0.1;
const MATERIAL_NORMALIZATION = 1000;
const PROTECTED_ROLES = new Set(['chefia', 'patrao_di_zona']);

// ── Lifecycle Timers ─────────────────────────────────────────────────────────
const AUTO_LOCK_DELAY_MS = 5 * 60 * 1000; // 5 min
const FORCE_CLOSE_DELAY_MS = 10 * 60 * 1000; // 10 min
const AUTO_FINALIZE_GRACE_MS = 60 * 60 * 1000; // 1 hour

module.exports = {
  BASE_RATING,
  RATING_FLOOR,
  WEEKLY_DECAY,
  TIERS,
  DELTA_KILL,
  DELTA_SURVIVED,
  DELTA_DEATH,
  DELTA_VICTORY,
  DELTA_DEFEAT,
  DELTA_MVP,
  MAX_FIGHTERS,
  W_PVP_RATING,
  W_KD_RATIO,
  W_MVP,
  W_DELIVERY,
  W_SURVIVAL,
  WEAPON_BONUS_PCT,
  MATERIAL_NORMALIZATION,
  PROTECTED_ROLES,
  AUTO_LOCK_DELAY_MS,
  FORCE_CLOSE_DELAY_MS,
  AUTO_FINALIZE_GRACE_MS,
};
