'use strict';
const sinon = require('sinon');

class MockChannel {
  constructor(data = {}) {
    this.id = data.id || '1234567890123456789';
    this.name = data.name || 'mock-channel';
    this.type = data.type || 0;
    this.send = sinon.stub().resolves({ id: 'msg-1' });
    this.isTextBased = sinon.stub().returns(true);
  }
}

class MockMessage {
  constructor(data = {}) {
    this.id = data.id || '9876543210987654321';
    this.content = data.content || '';
    this.channelId = data.channelId || '1234567890123456789';
    this.author = data.author || { id: '1111111111111111111', username: 'mock-user' };
    this.reply = sinon.stub().resolves(new MockMessage());
    this.edit = sinon.stub().resolves(this);
    this.delete = sinon.stub().resolves();
    this.react = sinon.stub().resolves();
  }
}

class MockClient {
  constructor(data = {}) {
    this.token = data.token || process.env.DISCORD_BOT_TOKEN || 'mock-token';
    this.channels = {
      fetch: sinon.stub().resolves(new MockChannel(data.channel)),
    };
    this.guilds = {
      cache: new Map(),
    };
    this.user = data.user || { id: 'bot-id', username: 'MockBot' };
  }

  addGuild(guildId, guild) {
    this.guilds.cache.set(guildId, guild);
  }
}

class MockInteraction {
  constructor(data = {}) {
    this.id = data.id || 'interaction-1';
    this.type = data.type || 2;
    this.commandName = data.commandName || 'mock';
    this.options = {
      getString: sinon.stub().returns(data.stringOption || null),
      getUser: sinon.stub().returns(data.userOption || null),
      getChannel: sinon.stub().returns(data.channelOption || null),
      getInteger: sinon.stub().returns(data.integerOption || null),
      getBoolean: sinon.stub().returns(data.booleanOption !== undefined ? data.booleanOption : null),
      getMember: sinon.stub().returns(data.memberOption || null),
    };
    this.user = data.user || { id: 'user-1', username: 'test-user' };
    this.member = data.member || { roles: { cache: new Map() } };
    this.channelId = data.channelId || '1234567890123456789';
    this.guildId = data.guildId || 'guild-1';
    this.reply = sinon.stub().resolves();
    this.deferReply = sinon.stub().resolves();
    this.editReply = sinon.stub().resolves();
    this.followUp = sinon.stub().resolves();
    this.isChatInputCommand = sinon.stub().returns(this.type === 2);
    this.isButton = sinon.stub().returns(this.type === 3);
    this.isStringSelectMenu = sinon.stub().returns(this.type === 3);
    this.customId = data.customId || '';
  }
}

module.exports = { MockInteraction, MockClient, MockChannel, MockMessage };
