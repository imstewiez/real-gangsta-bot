'use strict';

const { EmbedBuilder } = require('discord.js');
const { getStateKey, setStateKey } = require('../state');
const { log, warn } = require('../logger');

const DEFAULT_CHANNEL_ID = '1490397821075984506';
const STATE_KEY = 'dailyAvailabilityPanel';
const PANEL_VERSION = 3;
const TIMEZONE = process.env.AVAILABILITY_TIMEZONE || 'Europe/Lisbon';
const DEFAULT_SLOTS = ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '24+'];
const REACTIONS = ['✅', '❌', '❓'];

function getLisbonDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function getSlots() {
  const raw = process.env.AVAILABILITY_PANEL_SLOTS;
  if (!raw) return DEFAULT_SLOTS;
  const out = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return out.length ? out : DEFAULT_SLOTS;
}

function getChannelId() {
  return process.env.AVAILABILITY_PANEL_CHANNEL_ID || DEFAULT_CHANNEL_ID;
}

function getMentionContent() {
  const raw = process.env.AVAILABILITY_PANEL_MENTION;
  if (raw === 'none' || raw === 'false') return '';
  return raw || '@everyone';
}

async function resolveLogoUrl() {
  try {
    const panel = require('../panels/entradaPanel');
    return (await panel.resolveLogoUrl()) || '';
  } catch (_) {
    const CONFIG = require('../config');
    return CONFIG.BALLAS_GANG_LOGO_URL || CONFIG.BOT_LOGO_URL || '';
  }
}

async function deleteOldMessages(channel, messageIds = []) {
  for (const id of messageIds) {
    if (!id) continue;
    try {
      const msg = await channel.messages.fetch(id).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    } catch (_) {
      // best-effort cleanup only
    }
  }
}

async function addAvailabilityReactions(message) {
  for (const emoji of REACTIONS) {
    try {
      await message.react(emoji);
    } catch (e) {
      warn(`[AVAILABILITY] Falha ao reagir ${emoji} na mensagem ${message.id}: ${e.message}`);
    }
  }
}

function buildHeaderEmbed(dateKey, logoUrl = '') {
  const embed = new EmbedBuilder()
    .setColor(0x7b2cbf)
    .setTitle('🟣 Disponibilidade do Bairro')
    .setDescription(
      'Hoje é dia de representar com organização. Marca a tua presença para a equipa saber, de forma simples, quem está disponível e a que horas.\n\n' +
        '**✅ Vou estar** · **❌ Não vou conseguir** · **❓ Talvez / depende**\n\n' +
        'Reage nos horários abaixo. Assim fica tudo limpo, rápido de ler e ninguém precisa andar a perguntar quem aparece.'
    )
    .setFooter({ text: `— Ballas Gang · ${dateKey}`, iconURL: logoUrl || undefined });

  if (logoUrl) embed.setThumbnail(logoUrl);
  return embed;
}

function buildSlotMessage(slot) {
  return `**${slot}**`;
}

async function publishAvailabilityPanel(client, { force = false } = {}) {
  if (!client) return { skipped: true, reason: 'no_client' };

  const channelId = getChannelId();
  const today = getLisbonDateKey();
  const state = await getStateKey(STATE_KEY, {});

  if (
    !force &&
    state.date === today &&
    state.panel_version === PANEL_VERSION &&
    Array.isArray(state.message_ids) &&
    state.message_ids.length > 0
  ) {
    return { skipped: true, reason: 'already_published_today', date: today };
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) {
    warn(`[AVAILABILITY] Canal ${channelId} não encontrado ou não é texto.`);
    return { skipped: true, reason: 'channel_not_found', channelId };
  }

  await deleteOldMessages(channel, state.message_ids || []);

  const sentIds = [];
  const mention = getMentionContent();
  const logoUrl = await resolveLogoUrl();
  const header = await channel.send({
    content: mention,
    embeds: [buildHeaderEmbed(today, logoUrl)],
    allowedMentions: { parse: mention ? ['everyone'] : [] },
  });
  sentIds.push(header.id);

  for (const slot of getSlots()) {
    const msg = await channel.send({ content: buildSlotMessage(slot), allowedMentions: { parse: [] } });
    sentIds.push(msg.id);
    await addAvailabilityReactions(msg);
  }

  await setStateKey(STATE_KEY, {
    date: today,
    panel_version: PANEL_VERSION,
    channel_id: channelId,
    message_ids: sentIds,
    updated_at: new Date().toISOString(),
  });

  log(`[AVAILABILITY] Painel diário publicado/resetado em ${channelId} para ${today} (${sentIds.length} mensagens).`);
  return { published: true, date: today, channelId, messageIds: sentIds };
}

module.exports = {
  publishAvailabilityPanel,
  getLisbonDateKey,
  getSlots,
  DEFAULT_CHANNEL_ID,
};
