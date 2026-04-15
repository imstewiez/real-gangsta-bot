'use strict';
/**
 * Helpers de assinatura / footer.
 *
 * Todo o embed relevante passa por aqui. Mantém a marca consistente
 * (Firma RedWood) e aceita variações curtas ("casa", "rua", "topo")
 * quando fizer sentido pelo contexto.
 */

const { SIGNATURES, BRAND } = require('./voice');

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

// Assinatura inline no fim de uma descrição (itálico, discreta).
function inlineSign(variant = 'SHORT') {
  return `_${footerText(variant)}_`;
}

module.exports = {
  BRAND,
  SIGNATURES,
  footer,
  footerText,
  inlineSign,
};
