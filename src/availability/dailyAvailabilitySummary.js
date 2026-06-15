'use strict';

const { EmbedBuilder } = require('discord.js');
const { getStateKey, setStateKey } = require('../state');
const { log } = require('../logger');

const STATE_KEY = 'dailyAvailabilityPanel';
const SUMMARY_VERSION = 1;
const VOTES = [
  ['✅', 'Vou estar'],
  ['❌', 'Não vou'],
  ['❓', 'Talvez'],
];

async function displayNameFor(channel, user) {
  const member = await channel.guild?.members.fetch(user.id).catch(() => null);
  return member?.displayName || user.globalName || user.username;
}

function compact(list, max = 650) {
  if (!list.length) return '—';
  let text = '';
  let extra = 0;
  for (const name of list) {
    const next = text ? `${text}, ${name}` : name;
    if (next.length > max) {
      extra += 1;
      continue;
    }
    text = next;
  }
  return extra ? `${text} +${extra}` : text;
}

async function namesForReaction(message, emoji, botId) {
  const reaction = message.reactions.cache.get(emoji);
  if (!reaction) return [];
  const users = await reaction.users.fetch({ limit: 100 }).catch(() => null);
  if (!users) return [];

  const names = [];
  for (const [, user] of users) {
    if (user.bot || user.id === botId) continue;
    names.push(await displayNameFor(message.channel, user));
  }
  return names.sort((a, b) => a.localeCompare(b, 'pt'));
}

async function collectSummary(channel, state, slots, client) {
  const ids = Array.isArray(state.message_ids) ? state.message_ids.slice(1) : [];
  const rows = [];
  const unique = new Set();

  for (let i = 0; i < slots.length; i += 1) {
    const msg = await channel.messages.fetch(ids[i]).catch(() => null);
    if (!msg) continue;

    const data = {};
    for (const [emoji] of VOTES) {
      data[emoji] = await namesForReaction(msg, emoji, client.user?.id);
      data[emoji].forEach(name => unique.add(name));
    }
    rows.push({ slot: slots[i], data });
  }

  return { rows, uniqueCount: unique.size };
}

function buildEmbeds(summary, dateKey, logoUrl) {
  const totals = Object.fromEntries(VOTES.map(([emoji]) => [emoji, 0]));
  for (const row of summary.rows) {
    for (const [emoji] of VOTES) totals[emoji] += row.data[emoji]?.length || 0;
  }

  const embeds = [];
  let embed = new EmbedBuilder()
    .setColor(0x7b2cbf)
    .setTitle(`📊 Fecho da disponibilidade · ${dateKey}`)
    .setDescription(
      `Resumo final do dia. **${summary.uniqueCount}** membro(s) marcaram presença no painel.\n\n` +
        `✅ **${totals['✅']}** · ❌ **${totals['❌']}** · ❓ **${totals['❓']}**`
    )
    .setFooter({ text: '— Ballas Gang', iconURL: logoUrl || undefined });
  if (logoUrl) embed.setThumbnail(logoUrl);

  for (const row of summary.rows) {
    const value = VOTES.map(([emoji, label]) => {
      const names = row.data[emoji] || [];
      return `${emoji} **${names.length}** ${label} — ${compact(names)}`;
    }).join('\n');

    if (embed.data.fields?.length >= 20) {
      embeds.push(embed);
      embed = new EmbedBuilder()
        .setColor(0x7b2cbf)
        .setTitle(`📊 Fecho da disponibilidade · ${dateKey} cont.`)
        .setFooter({ text: '— Ballas Gang', iconURL: logoUrl || undefined });
      if (logoUrl) embed.setThumbnail(logoUrl);
    }

    embed.addFields({ name: row.slot, value: value.slice(0, 1024), inline: false });
  }

  embeds.push(embed);
  return embeds;
}

async function postDailySummaryIfNeeded(channel, state, slots, client, logoUrl) {
  if (!state?.date || !Array.isArray(state.message_ids) || state.message_ids.length < 2) return false;
  if (state.summary_version === SUMMARY_VERSION && state.summary_date === state.date) return false;

  const summary = await collectSummary(channel, state, slots, client);
  await channel.send({ embeds: buildEmbeds(summary, state.date, logoUrl), allowedMentions: { parse: [] } });
  await setStateKey(STATE_KEY, {
    ...state,
    summary_version: SUMMARY_VERSION,
    summary_date: state.date,
    summary_posted_at: new Date().toISOString(),
  });
  log(`[AVAILABILITY] Resumo diário publicado para ${state.date}.`);
  return true;
}

module.exports = { postDailySummaryIfNeeded, SUMMARY_VERSION };
