'use strict';
const path = require('path');

module.exports = {
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  DEBUG_LOG_DIR: path.resolve(process.cwd(), process.env.DEBUG_LOG_DIR || './logs'),
  DEBUG_LOG_FILE: process.env.DEBUG_LOG_FILE || 'realgangsta-debug.log',
};
