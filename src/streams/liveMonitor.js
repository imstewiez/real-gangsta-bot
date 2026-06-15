'use strict';

const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { getStateKey, setStateKey } = require('../state');
const { log, warn } = require('../logger');
const { canManageOnboarding } = require('../permissions/permissionEngine');

const STATE_KEY = 'streamLiveMonitor';
const DEFAULT_ALERT_CHANNEL_ID = '1490397788981166262';
const COMMAND_PREFIX = process.env.STREAM_COMMAND_PREFIX || '!live';
const PLATFORMS = new Set(['twitch', 'kick', 'tiktok']);

let _handlerInstalled = false;
let twitchToken = null;
let twitchTokenExpiresAt = 0;

function alertChannelId() {
  return process.env.STREAM_ALERT_CHANNEL_ID || DEFAULT_ALERT_CHANNEL_ID;
}

async function logoUrl() {
  try {
    const { resolveLogoUrl } = require('../panels/entradaPanel');
    return (await resolveLogoUrl()) || '';
  } catch (_) {
    return CONFIG.BALLAS_GANG_LOGO_URL || CONFIG.BOT_LOGO_URL || '';
  }
}

async function getState() {
  const state = await getStateKey(STATE_KEY, { streamers: [] });
  if (!Array.isArray(state.streamers)) state.streamers = [];
  return state;
}

async function saveState(state) {
  state.updated_at = new Date().toISOString();
  await setStateKey(STATE_KEY, state);
}

function normalizePlatform(value) {
  const p = String(value || '').trim().toLowerCase();
  if (p === 'tt') return 'tiktok';
  return p;
}

function normalizeHandle(value) {
  let h = String(value || '').trim();
  h = h.replace(/^https?:\/\//i, '');
  h = h.replace(/^www\./i, '');
  h = h.replace(/^twitch\.tv\//i, '');
  h = h.replace(/^kick\.com\//i, '');
  h = h.replace(/^tiktok\.com\/@?/i, '');
  h = h.replace(/^@/, '');
  h = h.split(/[/?#]/)[0];
  return h.trim();
}

function streamerKey(platform, handle) {
  return `${platform}:${handle.toLowerCase()}`;
}

function streamUrl(platform, handle) {
  if (platform === 'twitch') return `https://www.twitch.tv/${handle}`;
  if (platform === 'kick') return `https://kick.com/${handle}`;
  if (platform === 'tiktok') return `https://www.tiktok.com/@${handle}/live`;
  return '';
}

function platformLabel(platform) {
  if (platform === 'twitch') return 'Twitch';
  if (platform === 'kick') return 'Kick';
  if (platform === 'tiktok') return 'TikTok LIVE';
  return platform;
}

async function addStreamer({ platform, handle, addedBy }) {
  const state = await getState();
  const key = streamerKey(platform, handle);
  const existing = state.streamers.find(s => s.key === key);
  if (existing) {
    existing.enabled = true;
    existing.handle = handle;
    existing.url = streamUrl(platform, handle);
    existing.updated_at = new Date().toISOString();
    await saveState(state);
    return { created: false, streamer: existing };
  }

  const streamer = {
    key,
    platform,
    handle,
    url: streamUrl(platform, handle),
    enabled: true,
    added_by: addedBy || null,
    added_at: new Date().toISOString(),
    last_live: false,
    last_live_id: null,
    last_alert_id: null,
    last_checked_at: null,
  };
  state.streamers.push(streamer);
  await saveState(state);
  return { created: true, streamer };
}

async function removeStreamer(platform, handle) {
  const state = await getState();
  const key = streamerKey(platform, handle);
  const before = state.streamers.length;
  state.streamers = state.streamers.filter(s => s.key !== key);
  await saveState(state);
  return before !== state.streamers.length;
}

async function getTwitchToken() {
  if (twitchToken && Date.now() < twitchTokenExpiresAt - 60_000) return twitchToken;
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('grant_type', 'client_credentials');

  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Twitch token HTTP ${res.status}`);
  const json = await res.json();
  twitchToken = json.access_token;
  twitchTokenExpiresAt = Date.now() + Number(json.expires_in || 3600) * 1000;
  return twitchToken;
}

async function checkTwitch(handle) {
  const token = await getTwitchToken();
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return { supported: false, live: false, reason: 'missing_twitch_credentials' };

  const url = new URL('https://api.twitch.tv/helix/streams');
  url.searchParams.set('user_login', handle);
  const res = await fetch(url, {
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Twitch streams HTTP ${res.status}`);
  const json = await res.json();
  const stream = Array.isArray(json.data) ? json.data[0] : null;
  if (!stream) return { supported: true, live: false };
  return {
    supported: true,
    live: true,
    liveId: String(stream.id || `${handle}:${stream.started_at || ''}`),
    title: stream.title || '',
    game: stream.game_name || '',
    viewers: stream.viewer_count,
    startedAt: stream.started_at || null,
    url: streamUrl('twitch', handle),
  };
}

async function checkKick(handle) {
  const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(handle)}`, {
    headers: { 'user-agent': 'BallasGangBot/1.0' },
  });
  if (!res.ok) return { supported: true, live: false, reason: `kick_http_${res.status}` };
  const json = await res.json();
  const live = json.livestream || json.live_stream || null;
  if (!live) return { supported: true, live: false };
  return {
    supported: true,
    live: true,
    liveId: String(live.id || live.slug || live.created_at || `${handle}:live`),
    title: live.session_title || live.title || '',
    game: live.categories?.[0]?.name || live.category?.name || '',
    viewers: live.viewer_count || live.viewers || null,
    startedAt: live.created_at || live.start_time || null,
    url: streamUrl('kick', handle),
  };
}

async function checkTikTok(handle) {
  const url = streamUrl('tiktok', handle);
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; BallasGangBot/1.0)',
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) return { supported: true, live: false, reason: `tiktok_http_${res.status}` };
  const html = await res.text();
  const live = /LiveRoom|liveRoom|LIVE_ROOM|isLive\W*[:=]\W*true|roomStatus\W*[:=]\W*2/i.test(html);
  if (!live) return { supported: true, live: false };
  const idMatch = html.match(/roomId["']?\s*[:=]\s*["']?(\d+)/i) || html.match(/room_id["']?\s*[:=]\s*["']?(\d+)/i);
  return {
    supported: true,
    live: true,
    liveId: idMatch?.[1] || `${handle}:live`,
    title: '',
    game: '',
    viewers: null,
    startedAt: null,
    url,
  };
}

async function checkStreamer(streamer) {
  if (streamer.platform === 'twitch') return checkTwitch(streamer.handle);
  if (streamer.platform === 'kick') return checkKick(streamer.handle);
  if (streamer.platform === 'tiktok') return checkTikTok(streamer.handle);
  return { supported: false, live: false, reason: 'unknown_platform' };
}

async function sendLiveAlert(client, streamer, liveData) {
  const channel = await client.channels.fetch(alertChannelId()).catch(() => null);
  if (!channel || !channel.isTextBased?.()) {
    warn(`[STREAMS] Canal de alerts ${alertChannelId()} não encontrado.`);
    return null;
  }

  const icon = await logoUrl();
  const label = platformLabel(streamer.platform);
  const url = liveData.url || streamer.url || streamUrl(streamer.platform, streamer.handle);
  const embed = new EmbedBuilder()
    .setColor(0x7b2cbf)
    .setTitle(`🔴 ${streamer.handle} está live`)
    .setURL(url)
    .setDescription(`O bairro está em live na **${label}**. Entra, dá força e puxa pela stream.`)
    .addFields({ name: 'Canal', value: `[${streamer.handle}](${url})`, inline: true }, { name: 'Plataforma', value: label, inline: true })
    .setFooter({ text: '— Ballas Gang', iconURL: icon || undefined });

  if (liveData.title) embed.addFields({ name: 'Título', value: String(liveData.title).slice(0, 250), inline: false });
  if (liveData.game) embed.addFields({ name: 'Categoria', value: String(liveData.game).slice(0, 100), inline: true });
  if (liveData.viewers !== null && liveData.viewers !== undefined) embed.addFields({ name: 'Viewers', value: String(liveData.viewers), inline: true });
  if (icon) embed.setThumbnail(icon);

  return channel.send({
    content: '@everyone',
    embeds: [embed],
    allowedMentions: { parse: ['everyone'] },
  });
}

async function monitorLiveStreams(client) {
  if (!client) return { skipped: true, reason: 'no_client' };
  const state = await getState();
  let checked = 0;
  let alerts = 0;

  for (const streamer of state.streamers.filter(s => s.enabled !== false)) {
    checked += 1;
    try {
      const liveData = await checkStreamer(streamer);
      streamer.last_checked_at = new Date().toISOString();
      streamer.last_error = null;

      if (!liveData.supported) {
        streamer.last_error = liveData.reason || 'not_supported';
        continue;
      }

      const wasLive = Boolean(streamer.last_live);
      const liveId = liveData.liveId || null;
      const alreadyAlerted = liveId && streamer.last_alert_id === liveId;

      streamer.last_live = Boolean(liveData.live);
      streamer.last_live_id = liveId;
      streamer.last_title = liveData.title || '';
      streamer.last_url = liveData.url || streamer.url;

      if (liveData.live && (!wasLive || !alreadyAlerted)) {
        const msg = await sendLiveAlert(client, streamer, liveData);
        if (msg) {
          streamer.last_alert_id = liveId || `${streamer.key}:${Date.now()}`;
          streamer.last_alert_at = new Date().toISOString();
          alerts += 1;
        }
      }
    } catch (e) {
      streamer.last_error = e.message;
      warn(`[STREAMS] Falha ao verificar ${streamer.key}: ${e.message}`);
    }
  }

  await saveState(state);
  if (checked) log(`[STREAMS] Monitor checked=${checked} alerts=${alerts}.`);
  return { checked, alerts };
}

async function handleLiveCommand(message) {
  if (!message.content.startsWith(COMMAND_PREFIX)) return false;
  if (!canManageOnboarding(message.member)) {
    await message.reply('🚫 Não tens permissão para gerir alertas de lives.');
    return true;
  }

  const parts = message.content.trim().split(/\s+/);
  const sub = (parts[1] || 'help').toLowerCase();

  if (sub === 'help' || sub === 'ajuda') {
    await message.reply(
      '**Comandos de live:**\n' +
        '`!live add twitch nome`\n' +
        '`!live add kick nome`\n' +
        '`!live add tiktok nome`\n' +
        '`!live remove twitch nome`\n' +
        '`!live list`\n' +
        '`!live check`'
    );
    return true;
  }

  if (sub === 'add') {
    const platform = normalizePlatform(parts[2]);
    const handle = normalizeHandle(parts[3]);
    if (!PLATFORMS.has(platform) || !handle) {
      await message.reply('Uso: `!live add twitch|kick|tiktok nome_ou_url`');
      return true;
    }
    const { created, streamer } = await addStreamer({ platform, handle, addedBy: message.author.id });
    await message.reply(`${created ? '✅ Registado' : '♻️ Atualizado'}: **${platformLabel(platform)}** · ${streamer.url}`);
    return true;
  }

  if (sub === 'remove' || sub === 'del') {
    const platform = normalizePlatform(parts[2]);
    const handle = normalizeHandle(parts[3]);
    if (!PLATFORMS.has(platform) || !handle) {
      await message.reply('Uso: `!live remove twitch|kick|tiktok nome_ou_url`');
      return true;
    }
    const ok = await removeStreamer(platform, handle);
    await message.reply(ok ? `✅ Removido: **${platformLabel(platform)}** · ${handle}` : '⚠️ Não encontrei esse streamer registado.');
    return true;
  }

  if (sub === 'list') {
    const state = await getState();
    if (!state.streamers.length) {
      await message.reply('Ainda não há streamers registados.');
      return true;
    }
    const lines = state.streamers.map(s => `• **${platformLabel(s.platform)}** · ${s.handle} · ${s.enabled === false ? 'off' : 'on'}${s.last_live ? ' · 🔴 live' : ''}`);
    await message.reply(lines.join('\n'));
    return true;
  }

  if (sub === 'check') {
    const res = await monitorLiveStreams(message.client);
    await message.reply(`✅ Check feito. Streamers: **${res.checked || 0}** · alertas: **${res.alerts || 0}**.`);
    return true;
  }

  await message.reply('Comando inválido. Usa `!live help`.');
  return true;
}

function registerLiveCommandHandler(client) {
  if (_handlerInstalled) return;
  _handlerInstalled = true;
  client.on('messageCreate', message => {
    if (!message || message.author?.bot) return;
    handleLiveCommand(message).catch(e => warn(`[STREAMS] Comando falhou: ${e.message}`));
  });
  log(`[STREAMS] Comando ${COMMAND_PREFIX} ativo.`);
}

module.exports = {
  registerLiveCommandHandler,
  monitorLiveStreams,
  handleLiveCommand,
  addStreamer,
  removeStreamer,
  getState,
};
