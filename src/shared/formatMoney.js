'use strict';
/**
 * Formatação uniforme de valores monetários em PT-PT.
 *
 * Regras:
 *   - Nunca mostra cêntimos (sem decimais)
 *   - Usa separador de milhares conforme pt-PT
 *   - Sufixo € sem espaço ou com espaço conforme contexto
 */

function formatMoney(n) {
  const num = Math.round(Number(n) || 0);
  return num.toLocaleString('pt-PT') + '€';
}

function formatMoneySpaced(n) {
  const num = Math.round(Number(n) || 0);
  return num.toLocaleString('pt-PT') + ' €';
}

module.exports = { formatMoney, formatMoneySpaced };
