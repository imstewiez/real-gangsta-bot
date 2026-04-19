'use strict';
const { optBool, optNum } = require('./_helpers');

// Parâmetros de schedule dos jobs. A lista de jobs em si está em src/jobs/scheduler.js.
module.exports = {
  AUTO_PUBLISH_WEEKLY_TOP: optBool('AUTO_PUBLISH_WEEKLY_TOP', true),
  WEEKLY_TOP_DAY: optNum('WEEKLY_TOP_DAY', 0), // 0=Dom..6=Sáb
  WEEKLY_TOP_HOUR: optNum('WEEKLY_TOP_HOUR', 23),
  DAILY_SUMMARY_HOUR: optNum('DAILY_SUMMARY_HOUR', 20),
  // Bairrista summary hours
  BAIRRISTA_DAILY_SUMMARY_HOUR: optNum('BAIRRISTA_DAILY_SUMMARY_HOUR', 23),
  BAIRRISTA_WEEKLY_SUMMARY_DAY: optNum('BAIRRISTA_WEEKLY_SUMMARY_DAY', 5), // 5 = sexta
  // Cooldown em spots após criar uma saída — durante este tempo, nenhuma
  // outra saída da org pode abrir no mesmo spot.
  SPOT_COOLDOWN_MINUTES: optNum('SPOT_COOLDOWN_MINUTES', 60),
};
