'use strict';

// Domínio de saídas: `saidaRepo` é o nome canónico. `operationRepo` mantém-se
// como alias para retro-compatibilidade com código que ainda não migrou.
const saidaRepo = require('./saida');

module.exports = {
  memberRepo: require('./member'),
  inventoryRepo: require('./inventory'),
  saidaRepo,
  operationRepo: saidaRepo, // alias legado
  killRepo: require('./kill'),
  spotStatsRepo: require('./spotStats'),
  memberSaidaStatsRepo: require('./memberSaidaStats'),
  memberAnalyticsRepo: require('./memberAnalytics'),
  rankingRepo: require('./ranking'),
  auditRepo: require('./audit'),
  jobRepo: require('./job'),
  availabilityRepo: require('./availability'),
  radioRepo: require('./radio'),
  stickyRepo: require('./sticky'),
};
