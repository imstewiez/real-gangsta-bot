'use strict';
const { req } = require('./_helpers');

module.exports = {
  DISCORD_BOT_TOKEN: req('DISCORD_BOT_TOKEN'),
  DISCORD_GUILD_ID: req('DISCORD_GUILD_ID'),
  DATABASE_URL: process.env.DATABASE_URL || '',
};
