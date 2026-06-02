'use strict';

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const CONFIG = require('../src/config');
const { query } = require('../src/db');
const { detectRoleFromGuildMember } = require('../src/members/backfill');

const OPERATIONAL_TIERS = [
  'young_blood',
  'o_gunao',
  'gangster_fodido',
  'patrao_di_zona',
  'real_gangster',
  'og',
  'kingpin',
  'manda_chuva',
];

function byTier(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.tier || 'sem_tier';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

async function getDbActiveMembers() {
  const res = await query(
    `select id, discord_id, display_name, username, role, tier, status, lifecycle_state::text as lifecycle_state
       from members
      where discord_id is not null
        and deleted_at is null
        and coalesce(lifecycle_state::text, status, 'active') in ('active','ativo','promoted')
        and tier = any($1::text[])
      order by display_name nulls last`,
    [OPERATIONAL_TIERS]
  );
  return res.rows;
}

async function main() {
  if (!process.env.DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN em falta');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL em falta');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  await client.login(process.env.DISCORD_BOT_TOKEN);
  await new Promise((resolve) => client.once('ready', resolve));

  const guild = client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) throw new Error(`Guild não encontrada: ${CONFIG.DISCORD_GUILD_ID}`);

  try {
    await guild.members.fetch();
  } catch (e) {
    console.error('[audit:members] guild.members.fetch falhou. Espera 1-2 minutos e tenta de novo.');
    throw e;
  }

  const discordOperational = [];
  for (const [, gm] of guild.members.cache) {
    if (gm.user.bot) continue;
    const detected = detectRoleFromGuildMember(gm);
    if (!detected) continue;
    discordOperational.push({
      discord_id: gm.id,
      display_name: gm.displayName,
      username: gm.user.username,
      role: detected.role,
      tier: detected.tier,
      roles: gm.roles.cache.map(r => r.name).filter(Boolean).sort(),
    });
  }

  const dbActive = await getDbActiveMembers();
  const dbByDiscord = new Map(dbActive.map(m => [String(m.discord_id), m]));
  const discordById = new Map(discordOperational.map(m => [String(m.discord_id), m]));

  const missingInApp = discordOperational.filter(m => !dbByDiscord.has(String(m.discord_id)));
  const ghostInApp = dbActive.filter(m => !discordById.has(String(m.discord_id)));
  const tierMismatch = discordOperational
    .map(d => ({ discord: d, db: dbByDiscord.get(String(d.discord_id)) }))
    .filter(pair => pair.db && pair.db.tier !== pair.discord.tier);

  console.log('\n========== AUDITORIA MEMBROS DISCORD ↔ APP ==========');
  console.log(`Discord operacional: ${discordOperational.length}`);
  console.log(`App/DB ativo:         ${dbActive.length}`);
  console.log(`Faltam na app:        ${missingInApp.length}`);
  console.log(`Fantasmas na app:     ${ghostInApp.length}`);
  console.log(`Tier diferente:       ${tierMismatch.length}`);

  console.log('\n--- Discord por tier ---');
  console.table(byTier(discordOperational));
  console.log('\n--- App por tier ---');
  console.table(byTier(dbActive));

  if (missingInApp.length) {
    console.log('\n--- FALTAM NA APP / DB ---');
    for (const m of missingInApp) {
      console.log(`- ${m.display_name} (@${m.username}) | ${m.discord_id} | role=${m.role} tier=${m.tier}`);
      console.log(`  roles: ${m.roles.join(', ')}`);
    }
  }

  if (ghostInApp.length) {
    console.log('\n--- FANTASMAS NA APP / DB ---');
    for (const m of ghostInApp) {
      console.log(`- ${m.display_name || m.username || m.discord_id} | ${m.discord_id} | role=${m.role} tier=${m.tier} status=${m.status}/${m.lifecycle_state}`);
    }
  }

  if (tierMismatch.length) {
    console.log('\n--- TIER DIFERENTE DISCORD VS DB ---');
    for (const pair of tierMismatch) {
      console.log(`- ${pair.discord.display_name} | ${pair.discord.discord_id} | Discord=${pair.discord.tier} DB=${pair.db.tier}`);
    }
  }

  await client.destroy();
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
