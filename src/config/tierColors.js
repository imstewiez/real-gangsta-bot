/**
 * Cores hex dos tiers/roles — sincronizadas com as cores dos roles no Discord.
 * Fonte: Discord API (GET /guilds/{guild.id}/roles)
 * Atualizado em: 2026-05-16
 */

const TIER_COLORS = {
  // ⛓️・Manda-Chuva — #eec16d
  manda_chuva: '#eec16d',

  // 💎・Kingpin — #b3b5b8
  kingpin: '#b3b5b8',

  // 🩻・OG — #470000
  og: '#470000',

  // 🔪・Real Gangster — #9e6bff
  real_gangster: '#9e6bff',

  // 👑・Patrão di Zona — #021e85
  patrao_di_zona: '#021e85',

  // 🥷・Gangster Fodido — #3a8f97
  gangster_fodido: '#3a8f97',

  // 🚬・O Gunão — #70966e
  o_gunao: '#70966e',

  // 🍼・Young Blood — #4cadd0
  young_blood: '#4cadd0',

  // 🏚️・Bairristas — #826bc2
  bairrista: '#826bc2',
};

/**
 * Gera um gradiente CSS linear (135deg) para um tier.
 * Vai de uma versão mais clara (40% mais brilho) até à cor base.
 */
function tierGradient(tierKey) {
  const base = TIER_COLORS[tierKey];
  if (!base) return 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)';

  // Helper: lighten hex color by a percentage
  const lighten = (hex, pct) => {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(((num >> 16) & 0xff) * pct));
    const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(((num >> 8) & 0xff) * pct));
    const b = Math.min(255, (num & 0xff) + Math.round((num & 0xff) * pct));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };

  const light = lighten(base, 0.35);
  return `linear-gradient(135deg, ${light} 0%, ${base} 100%)`;
}

module.exports = { TIER_COLORS, tierGradient };
