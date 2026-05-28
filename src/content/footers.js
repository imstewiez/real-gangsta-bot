'use strict';
/**
 * Helpers de assinatura / footer.
 *
 * Todo o embed relevante passa por aqui. Mantém a marca consistente
 * (Ballas Gang) e aceita variações curtas ("casa", "rua", "topo")
 * quando fizer sentido pelo contexto.
 */

const BRAND = 'Ballas Gang';

const SIGNATURES = {
  SHORT: `— ${BRAND}`,
  HOUSE: `— ${BRAND}`,
  STREET: `— ${BRAND}`,
  MOVEMENT: `— ${BRAND}`,
  TOP: `— ${BRAND}`,
};

// Footer principal — usa sempre.
function footerText(variant = 'SHORT') {
  return SIGNATURES[variant] || SIGNATURES.SHORT;
}

// Objecto pronto para .setFooter({...}).
function footer(variant = 'SHORT', iconURL) {
  const out = { text: footerText(variant) };
  if (iconURL) out.iconURL = iconURL;
  return out;
}

// Footer com contexto extra (ex: `Ballas Gang · movimento · pedido #abc123`).
function footerWithContext(variant = 'SHORT', extra) {
  const base = footerText(variant);
  return extra ? `${base} · ${extra}` : base;
}

// Assinatura inline no fim de uma descrição (itálico, discreta).
function inlineSign(variant = 'SHORT') {
  return `_${footerText(variant)}_`;
}

module.exports = {
  BRAND,
  SIGNATURES,
  footer,
  footerText,
  footerWithContext,
  inlineSign,
};
