'use strict';
/**
 * Discord Snapshot — captura completa do servidor para ficheiro JSON.
 *
 * Captura:
 *   - Roles (id, nome, posição, cor, permissões, hoisted, mentionable)
 *   - Categorias (id, nome, posição, permission overwrites)
 *   - Canais (id, nome, tipo, categoria, posição, permission overwrites)
 *   - Members (id, username, displayName, roles, joinedAt, bot flag)
 *
 * Uso:
 *   npm run snapshot                  → snapshot para ./snapshots/snapshot-YYYY-MM-DD.json
 *   npm run snapshot -- --out=path    → path customizado
 *
 * Requer DISCORD_BOT_TOKEN e DISCORD_GUILD_ID em .env.
 */

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, PermissionsBitField, ChannelType } = require('discord.js');

const CONFIG = require('../src/config');

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const outArg = args.find(a => a.startsWith('--out='));
const customOut = outArg ? outArg.split('=')[1] : null;

// ── Mappings ────────────────────────────────────────────────────────────────
const CHANNEL_TYPE_NAME = {
  [ChannelType.GuildText]: 'text',
  [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildCategory]: 'category',
  [ChannelType.GuildAnnouncement]: 'announcement',
  [ChannelType.AnnouncementThread]: 'announcement_thread',
  [ChannelType.PublicThread]: 'public_thread',
  [ChannelType.PrivateThread]: 'private_thread',
  [ChannelType.GuildStageVoice]: 'stage',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildMedia]: 'media',
};

/**
 * Converte bitfield de permissões para array de strings legível.
 * Ex: PermissionsBitField.Flags.SendMessages → 'SendMessages'
 */
function permsToArray(bitfield) {
  if (!bitfield) return [];
  try {
    const perms = new PermissionsBitField(BigInt(bitfield));
    return perms.toArray();
  } catch {
    return [];
  }
}

/**
 * Extrai emoji do nome (se começar com um emoji Unicode ou Discord custom).
 * Retorna { emoji, cleanName } onde emoji pode ser null.
 */
function extractEmoji(name) {
  if (!name) return { emoji: null, cleanName: '' };
  // Custom emoji Discord: <:name:id> ou <a:name:id>
  const custom = name.match(/^<a?:([^:]+):(\d+)>/);
  if (custom) return { emoji: custom[0], cleanName: name.slice(custom[0].length).trim() };
  // Unicode emoji (primeiro char)
  const first = Array.from(name)[0];
  if (first && /\p{Extended_Pictographic}/u.test(first)) {
    return { emoji: first, cleanName: name.slice(first.length).replace(/^[・│]\s*/, '').trim() };
  }
  return { emoji: null, cleanName: name };
}

// ── Snapshot collectors ─────────────────────────────────────────────────────

function snapshotRoles(guild) {
  const roles = Array.from(guild.roles.cache.values())
    .sort((a, b) => b.position - a.position)
    .map(r => {
      const { emoji, cleanName } = extractEmoji(r.name);
      return {
        id: r.id,
        name: r.name,
        cleanName,
        emoji,
        position: r.position,
        color: r.hexColor,
        hoisted: r.hoist,
        mentionable: r.mentionable,
        managed: r.managed,
        permissions: permsToArray(r.permissions.bitfield),
        memberCount: r.members.size,
      };
    });
  return roles;
}

function snapshotOverwrites(channel) {
  return Array.from(channel.permissionOverwrites.cache.values()).map(po => ({
    id: po.id,
    type: po.type === 0 ? 'role' : 'member',
    allow: permsToArray(po.allow.bitfield),
    deny: permsToArray(po.deny.bitfield),
  }));
}

function snapshotCategories(guild) {
  const categories = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map(c => {
      const { emoji, cleanName } = extractEmoji(c.name);
      return {
        id: c.id,
        name: c.name,
        cleanName,
        emoji,
        position: c.rawPosition,
        permissionOverwrites: snapshotOverwrites(c),
        channelCount: guild.channels.cache.filter(ch => ch.parentId === c.id).size,
      };
    });
  return Array.from(categories.values());
}

function snapshotChannels(guild) {
  const channels = guild.channels.cache
    .filter(c => c.type !== ChannelType.GuildCategory)
    .sort((a, b) => {
      // Order by category position, then channel position
      const ap = a.parent?.rawPosition ?? -1;
      const bp = b.parent?.rawPosition ?? -1;
      if (ap !== bp) return ap - bp;
      return a.rawPosition - b.rawPosition;
    })
    .map(c => {
      const { emoji, cleanName } = extractEmoji(c.name);
      return {
        id: c.id,
        name: c.name,
        cleanName,
        emoji,
        type: CHANNEL_TYPE_NAME[c.type] || String(c.type),
        categoryId: c.parentId || null,
        categoryName: c.parent?.name || null,
        position: c.rawPosition,
        topic: c.topic || null,
        nsfw: c.nsfw || false,
        rateLimitPerUser: c.rateLimitPerUser || 0,
        permissionOverwrites: snapshotOverwrites(c),
      };
    });
  return Array.from(channels.values());
}

async function snapshotMembers(guild) {
  await guild.members.fetch();
  const members = Array.from(guild.members.cache.values())
    .sort((a, b) => a.user.username.localeCompare(b.user.username))
    .map(m => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName,
      nickname: m.nickname || null,
      bot: m.user.bot,
      joinedAt: m.joinedAt?.toISOString() || null,
      roles: Array.from(m.roles.cache.values())
        .filter(r => r.id !== guild.id) // skip @everyone
        .sort((a, b) => b.position - a.position)
        .map(r => ({ id: r.id, name: r.name })),
    }));
  return members;
}

// ── Stats summary ───────────────────────────────────────────────────────────

function computeStats(snapshot) {
  const roleMemberCounts = snapshot.roles
    .filter(r => !r.managed && r.name !== '@everyone')
    .sort((a, b) => b.memberCount - a.memberCount)
    .slice(0, 10)
    .map(r => ({ name: r.name, members: r.memberCount }));

  const channelsByType = snapshot.channels.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {});

  return {
    roles: snapshot.roles.length,
    categories: snapshot.categories.length,
    channels: snapshot.channels.length,
    channelsByType,
    members: snapshot.members.length,
    bots: snapshot.members.filter(m => m.bot).length,
    humanMembers: snapshot.members.filter(m => !m.bot).length,
    topRoles: roleMemberCounts,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!CONFIG.DISCORD_BOT_TOKEN) {
    console.error('[SNAPSHOT] DISCORD_BOT_TOKEN em falta. Verifica .env.');
    process.exit(1);
  }
  if (!CONFIG.DISCORD_GUILD_ID) {
    console.error('[SNAPSHOT] DISCORD_GUILD_ID em falta. Verifica .env.');
    process.exit(1);
  }

  console.log('[SNAPSHOT] A conectar ao Discord...');
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
    ],
  });

  client.once('ready', async () => {
    try {
      console.log(`[SNAPSHOT] Conectado como ${client.user.tag}`);
      const guild = await client.guilds.fetch(CONFIG.DISCORD_GUILD_ID);
      if (!guild) throw new Error(`Guild ${CONFIG.DISCORD_GUILD_ID} não encontrada.`);

      console.log(`[SNAPSHOT] Guild: ${guild.name} (${guild.id})`);

      // Fetch everything
      await guild.roles.fetch();
      await guild.channels.fetch();

      console.log('[SNAPSHOT] A capturar roles...');
      const roles = snapshotRoles(guild);
      console.log(`[SNAPSHOT]   → ${roles.length} roles`);

      console.log('[SNAPSHOT] A capturar categorias...');
      const categories = snapshotCategories(guild);
      console.log(`[SNAPSHOT]   → ${categories.length} categorias`);

      console.log('[SNAPSHOT] A capturar canais...');
      const channels = snapshotChannels(guild);
      console.log(`[SNAPSHOT]   → ${channels.length} canais`);

      console.log('[SNAPSHOT] A capturar membros...');
      const members = await snapshotMembers(guild);
      console.log(`[SNAPSHOT]   → ${members.length} membros`);

      const snapshot = {
        capturedAt: new Date().toISOString(),
        guild: {
          id: guild.id,
          name: guild.name,
          ownerId: guild.ownerId,
          memberCount: guild.memberCount,
          createdAt: guild.createdAt?.toISOString() || null,
          iconURL: guild.iconURL({ size: 256 }) || null,
        },
        roles,
        categories,
        channels,
        members,
      };

      snapshot.stats = computeStats(snapshot);

      // Resolve output path
      const outDir = path.resolve(process.cwd(), 'snapshots');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const date = new Date().toISOString().split('T')[0];
      const outPath = customOut
        ? path.resolve(process.cwd(), customOut)
        : path.join(outDir, `snapshot-${date}.json`);

      fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
      const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);

      console.log('');
      console.log('════════════════════════════════════════════════');
      console.log(`[SNAPSHOT] ✓ Guardado em: ${outPath}`);
      console.log(`[SNAPSHOT]   Tamanho: ${sizeKB} KB`);
      console.log('════════════════════════════════════════════════');
      console.log('');
      console.log('Resumo:');
      console.log(`  • Roles:      ${snapshot.stats.roles}`);
      console.log(`  • Categorias: ${snapshot.stats.categories}`);
      console.log(`  • Canais:     ${snapshot.stats.channels}`);
      for (const [type, n] of Object.entries(snapshot.stats.channelsByType)) {
        console.log(`      ${type}: ${n}`);
      }
      console.log(`  • Membros:    ${snapshot.stats.members} (${snapshot.stats.humanMembers} humanos, ${snapshot.stats.bots} bots)`);
      console.log('');
      console.log('Top roles por contagem de membros:');
      for (const r of snapshot.stats.topRoles) {
        console.log(`  • ${r.name.padEnd(30)} ${r.members} membros`);
      }

      await client.destroy();
      process.exit(0);
    } catch (err) {
      console.error('[SNAPSHOT] Erro:', err.message);
      console.error(err);
      await client.destroy();
      process.exit(1);
    }
  });

  client.on('error', (err) => {
    console.error('[SNAPSHOT] Client error:', err.message);
  });

  await client.login(CONFIG.DISCORD_BOT_TOKEN);
}

main().catch(err => {
  console.error('[SNAPSHOT] Fatal:', err);
  process.exit(1);
});
