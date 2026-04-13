'use strict';
require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !guildId) {
  console.error('Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}\n`);

  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();
  await guild.roles.fetch();

  // ── ROLES ──────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════');
  console.log('  ROLES (by position, highest first)');
  console.log('═══════════════════════════════════════════');
  const roles = [...guild.roles.cache.values()].sort((a, b) => b.position - a.position);
  for (const role of roles) {
    const memberCount = role.members.size;
    console.log(`  [${role.position.toString().padStart(2)}] ${role.name} (ID: ${role.id}) — ${memberCount} members — color: #${role.color.toString(16).padStart(6, '0')}`);
  }

  // ── CATEGORIES & CHANNELS ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('  CATEGORIES & CHANNELS');
  console.log('═══════════════════════════════════════════');

  const categories = [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  const orphanChannels = [...guild.channels.cache.values()]
    .filter(c => c.type !== ChannelType.GuildCategory && !c.parentId)
    .sort((a, b) => a.position - b.position);

  if (orphanChannels.length) {
    console.log('\n  [NO CATEGORY]');
    for (const ch of orphanChannels) {
      const typeLabel = ch.type === ChannelType.GuildVoice ? '🔊' : ch.type === ChannelType.GuildStageVoice ? '🎤' : '💬';
      console.log(`    ${typeLabel} ${ch.name} (ID: ${ch.id})`);
    }
  }

  for (const cat of categories) {
    console.log(`\n  📁 ${cat.name} (ID: ${cat.id}, pos: ${cat.position})`);

    // Permission overwrites on category
    const overwrites = [...cat.permissionOverwrites.cache.values()];
    if (overwrites.length) {
      for (const ow of overwrites) {
        const target = ow.type === 0
          ? guild.roles.cache.get(ow.id)?.name || ow.id
          : `user:${ow.id}`;
        const allow = ow.allow.toArray().join(', ') || 'none';
        const deny = ow.deny.toArray().join(', ') || 'none';
        if (allow !== 'none' || deny !== 'none') {
          console.log(`      PERM: ${target} | allow: ${allow} | deny: ${deny}`);
        }
      }
    }

    const children = [...guild.channels.cache.values()]
      .filter(c => c.parentId === cat.id)
      .sort((a, b) => {
        if (a.type !== b.type) {
          // Text before voice
          const aIsVoice = [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(a.type);
          const bIsVoice = [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(b.type);
          if (aIsVoice !== bIsVoice) return aIsVoice ? 1 : -1;
        }
        return a.position - b.position;
      });

    for (const ch of children) {
      const typeLabel = ch.type === ChannelType.GuildVoice ? '🔊' :
        ch.type === ChannelType.GuildStageVoice ? '🎤' :
        ch.type === ChannelType.GuildForum ? '📰' :
        ch.type === ChannelType.GuildAnnouncement ? '📢' : '💬';
      console.log(`    ${typeLabel} ${ch.name} (ID: ${ch.id}, pos: ${ch.position})`);

      // Check for non-synced permissions
      if (!ch.permissionsLocked) {
        const chOverwrites = [...ch.permissionOverwrites.cache.values()];
        for (const ow of chOverwrites) {
          const target = ow.type === 0
            ? guild.roles.cache.get(ow.id)?.name || ow.id
            : `user:${ow.id}`;
          const allow = ow.allow.toArray().join(', ') || 'none';
          const deny = ow.deny.toArray().join(', ') || 'none';
          if (allow !== 'none' || deny !== 'none') {
            console.log(`        PERM(own): ${target} | allow: ${allow} | deny: ${deny}`);
          }
        }
      }
    }
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────
  const allChannels = [...guild.channels.cache.values()];
  const textCount = allChannels.filter(c => c.type === ChannelType.GuildText).length;
  const voiceCount = allChannels.filter(c => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(c.type)).length;
  const catCount = categories.length;

  console.log('\n═══════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════');
  console.log(`  Categories: ${catCount}`);
  console.log(`  Text channels: ${textCount}`);
  console.log(`  Voice channels: ${voiceCount}`);
  console.log(`  Total roles: ${roles.length}`);
  console.log(`  Guild members: ${guild.memberCount}`);

  client.destroy();
  process.exit(0);
});

client.login(token);
