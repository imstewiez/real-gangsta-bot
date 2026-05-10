'use strict';

/**
 * Valida que as chaves de um objeto de campos dinâmicos estão num whitelist
 * conhecido. Usado em repositórios que constroem UPDATE ... SET dinamicamente
 * para prevenir SQL injection via nomes de colunas.
 */
function guardColumns(fields, allowedSet) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!allowedSet.has(k)) {
      throw new Error(`Coluna não permitida: ${k}`);
    }
    out[k] = v;
  }
  return out;
}

module.exports = { guardColumns };
