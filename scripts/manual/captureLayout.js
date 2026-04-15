#!/usr/bin/env node
'use strict';
/**
 * Captura o layout actual do Discord e grava em config/discord-layout.lock.json.
 *
 * USO:
 *   DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node scripts/manual/captureLayout.js
 *
 * O ficheiro resultante é a fonte da verdade imutável do layout — nomes,
 * posições, emojis, roles. Daí em diante o bot NÃO altera nada globalmente;
 * só verifica se o actual bate certo (via /rg-layout-check).
 *
 * Correr uma vez após o servidor estar exactamente como quer.
 */

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const OUT_PATH = path.join(__dirname, '..', '..', 'config', 'discord-layout.lock.json');

if (!TOKEN || !GUILD_ID) {
  console.error('✖ Falta DISCORD_BOT_TOKEN ou DISCORD_GUILD_ID no .env.');
  process.exit(1);
}

function permsToNames(bitfield) {
  return new PermissionsBitField(bitfield).toArray();
}

function serializeOverwrites(permsCache) {
  return [...permsCache.values()].map(ow => ({
    id: ow.id,
    type: ow.type, // 0 = role, 1 = member
    allow: permsToNames(ow.allow.bitfield),
    deny: permsToNames(ow.deny.bitfield),
  }));
}

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  console.log('✓ Bot ligado.');

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();
  await guild.roles.fetch();
  await guild.members.fetch().catch(() => {});
  console.log(`✓ Guild "${guild.name}" (${guild.id})`);

  const categories = [];
  const channels = [];
  for (const [, ch] of guild.channels.cache) {
    if (ch.type === ChannelType.GuildCategory) {
      categories.push({
        id: ch.id,
        name: ch.name,
        position: ch.rawPosition ?? ch.position,
        overwrites: serializeOverwrites(ch.permissionOverwrites.cache),
      });
    } else {
      channels.push({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        typeName: ChannelType[ch.type] || String(ch.type),
        parentId: ch.parentId,
        position: ch.rawPosition ?? ch.position,
        topic: ch.topic || null,
        nsfw: ch.nsfw || false,
        rateLimitPerUser: ch.rateLimitPerUser || 0,
        overwrites: serializeOverwrites(ch.permissionOverwrites.cache),
      });
    }
  }

  const roles = [];
  for (const [, r] of guild.roles.cache) {
    roles.push({
      id: r.id,
      name: r.name,
      color: r.color,
      colorHex: r.hexColor,
      hoist: r.hoist,
      mentionable: r.mentionable,
      position: r.rawPosition ?? r.position,
      permissions: permsToNames(r.permissions.bitfield),
      managed: r.managed,
    });
  }

  categories.sort((a, b) => a.position - b.position);
  channels.sort((a, b) => {
    if (a.parentId !== b.parentId) return String(a.parentId).localeCompare(String(b.parentId));
    return a.position - b.position;
  });
  roles.sort((a, b) => b.position - a.position);

  const lock = {
    capturedAt: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    counts: {
      categories: categories.length,
      channels: channels.length,
      roles: roles.length,
    },
    categories,
    channels,
    roles,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(lock, null, 2), 'utf8');
  console.log(`✓ Layout gravado: ${OUT_PATH}`);
  console.log(`  ${categories.length} categorias · ${channels.length} canais · ${roles.length} roles`);

  await client.destroy();
  process.exit(0);
}

main().catch(e => {
  console.error('✖ Erro:', e);
  process.exit(1);
});
