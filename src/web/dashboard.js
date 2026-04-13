'use strict';
const { memberRepo, inventoryRepo } = require('../repositories');

async function getDashboardData() {
  const [memberCounts, stock] = await Promise.all([
    memberRepo.countByRole(),
    inventoryRepo.getStock(),
  ]);

  return {
    members: memberCounts,
    stockItems: stock.length,
    totalStockValue: stock.reduce((acc, s) => acc + (parseFloat(s.balance) * parseFloat(s.estimated_value || 1)), 0),
  };
}

module.exports = { getDashboardData };
