'use strict';
const { operationRepo, inventoryRepo } = require('../repositories');

async function getOperationBalance(operationId) {
  const summary = await operationRepo.getMaterialSummary(operationId);

  const fornecido = summary.fornecido?.total || 0;
  const devolvido = summary.devolvido?.total || 0;
  const perdido = summary.perdido?.total || 0;
  const consumido = summary.consumido?.total || 0;

  return {
    fornecido,
    devolvido,
    perdido,
    consumido,
    diferencaFinal: fornecido - devolvido - perdido - consumido,
    taxaDevolucao: fornecido > 0 ? ((devolvido / fornecido) * 100).toFixed(1) : '0.0',
  };
}

async function getOperationMaterialDetails(operationId) {
  const materials = await operationRepo.getMaterials(operationId);

  const byDirection = { fornecido: [], devolvido: [], perdido: [], consumido: [] };
  for (const m of materials) {
    if (byDirection[m.direction]) {
      byDirection[m.direction].push(m);
    }
  }

  return byDirection;
}

module.exports = { getOperationBalance, getOperationMaterialDetails };
