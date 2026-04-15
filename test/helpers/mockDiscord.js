'use strict';
/**
 * Mock Discord.js objects for unit tests.
 * Provides minimal implementations of Interaction, Member, Guild, etc.
 */

const { MessageFlags } = require('discord.js');

/**
 * Create a mock Discord interaction.
 *
 * @param {object} opts
 * @param {string} [opts.userId='user123']
 * @param {string} [opts.guildId='guild123']
 * @param {string} [opts.commandName]
 * @param {string} [opts.customId]
 * @param {string[]} [opts.roleIds=[]]
 * @param {boolean} [opts.isAdmin=false]
 * @returns {object} Mock interaction
 */
function mockInteraction(opts = {}) {
  const {
    userId = 'user123',
    guildId = 'guild123',
    commandName = null,
    customId = null,
    roleIds = [],
    isAdmin = false,
  } = opts;

  const replies = [];
  const followUps = [];
  let _replied = false;
  let _deferred = false;

  const interaction = {
    user: { id: userId, username: `user_${userId}` },
    guildId,
    member: {
      id: userId,
      roles: {
        cache: new Map(roleIds.map(id => [id, { id }])),
        has: (id) => roleIds.includes(id),
      },
      memberPermissions: {
        has: (perm) => isAdmin && perm === 'Administrator',
      },
    },
    guild: { id: guildId },
    commandName,
    customId,
    type: commandName ? 2 : 3,
    options: {
      getString: () => null,
      getInteger: () => null,
      getNumber: () => null,
      getBoolean: () => null,
      getUser: () => null,
      getChannel: () => null,
    },
    fields: {
      getTextInputValue: () => '',
    },
    values: [],
    get replied() { return _replied; },
    get deferred() { return _deferred; },
    async reply(payload) {
      _replied = true;
      replies.push(payload);
      return { id: 'msg1' };
    },
    async deferReply() {
      _deferred = true;
    },
    async editReply(payload) {
      replies.push(payload);
      return { id: 'msg1' };
    },
    async followUp(payload) {
      followUps.push(payload);
      return { id: 'msg2' };
    },
    async update(payload) {
      replies.push(payload);
    },
    async showModal() {},
    async deleteReply() {},
    isChatInputCommand: () => Boolean(commandName),
    isButton: () => Boolean(customId) && !customId?.includes('select'),
    isModalSubmit: () => Boolean(customId) && customId?.includes('modal'),
    isStringSelectMenu: () => Boolean(customId) && customId?.includes('select'),
    isUserSelectMenu: () => false,
    isAnySelectMenu: () => Boolean(customId) && customId?.includes('select'),
    // Test helpers
    _replies: replies,
    _followUps: followUps,
    _getLastReply: () => replies[replies.length - 1] || null,
  };

  return interaction;
}

/**
 * Create a mock Guild member.
 */
function mockMember(opts = {}) {
  const { userId = 'user123', roleIds = [], displayName = 'Test User' } = opts;
  return {
    id: userId,
    displayName,
    user: { id: userId, username: displayName, bot: false },
    roles: {
      cache: new Map(roleIds.map(id => [id, { id }])),
      add: async () => {},
      remove: async () => {},
    },
  };
}

/**
 * Create a mock Discord client.
 */
function mockClient(opts = {}) {
  const { guildId = 'guild123' } = opts;
  return {
    isReady: () => true,
    ws: { ping: 42 },
    user: { id: 'bot123', tag: 'TestBot#0000' },
    guilds: {
      cache: new Map([[guildId, { id: guildId }]]),
      fetch: async () => ({ id: guildId }),
    },
    channels: {
      fetch: async (id) => ({
        id,
        isTextBased: () => true,
        send: async () => ({ id: 'msg1' }),
        messages: { fetch: async () => new Map() },
      }),
    },
  };
}

module.exports = { mockInteraction, mockMember, mockClient, MessageFlags };
