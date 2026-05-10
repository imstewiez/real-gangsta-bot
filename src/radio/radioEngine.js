'use strict';
/**
 * Radio engine — gestão das frequências de rádio (apenas principal).
 *
 * Validações:
 *   - valor numérico inteiro
 *   - dentro de [MIN, MAX] (ou exatamente 0 se RADIO_ALLOW_ZERO=true)
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const CONFIG = require('../config');
const { radioRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { log, warn } = require('../logger');
const { ValidationError } = require('../shared/errors');

const TYPE_META = {
  principal: { emoji: '📻', label: 'Principal' },
};

function isValidValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return false;
  const s = String(rawValue).trim();
  if (!/^\d+$/.test(s)) return false;
  const n = parseInt(s, 10);
  if (n === 0) return CONFIG.RADIO_ALLOW_ZERO;
  if (n < CONFIG.RADIO_RANDOM_MIN || n > CONFIG.RADIO_RANDOM_MAX) return false;
  return true;
}

function normaliseValue(rawValue) {
  return String(rawValue).trim();
}

function generateRandom({ exclude = [] } = {}) {
  const min = CONFIG.RADIO_RANDOM_MIN;
  const max = CONFIG.RADIO_RANDOM_MAX;
  if (max < min) throw new ValidationError('RADIO_RANDOM_MAX < RADIO_RANDOM_MIN', { code: 'INVALID_RADIO_CONFIG' });
  const range = max - min + 1;
  if (range <= 0) throw new ValidationError('Range de rádio inválido.', { code: 'INVALID_RADIO_CONFIG' });

  const blocked = new Set(exclude.filter(Boolean).map(normaliseValue));
  for (let i = 0; i < 50; i++) {
    const n = min + Math.floor(Math.random() * range);
    const s = String(n);
    if (!blocked.has(s)) return s;
  }
  return String(min + Math.floor(Math.random() * range));
}

async function setRadio({ type, value, mode = 'manual', actorId, note }) {
  if (!TYPE_META[type]) throw new ValidationError(`Tipo de rádio inválido: ${type}`, { code: 'INVALID_RADIO_TYPE' });
  if (!isValidValue(value)) {
    throw new ValidationError(
      `Valor "${value}" inválido (range ${CONFIG.RADIO_RANDOM_MIN}-${CONFIG.RADIO_RANDOM_MAX}` +
        `${CONFIG.RADIO_ALLOW_ZERO ? ' ou 0' : ''}).`,
      { code: 'INVALID_RADIO_VALUE' }
    );
  }
  const v = normaliseValue(value);

  const result = await radioRepo.setState({ type, value: v, mode, actorId, note });
  await logAudit({
    action: 'radio_set',
    entityType: 'radio',
    entityId: type,
    actorId,
    beforeState: { value: result.previous },
    afterState: { value: v, mode },
    context: note || `${type}: ${result.previous || '∅'} → ${v} (${mode})`,
  });
  log(`[RADIO] ${type}: ${result.previous || '∅'} → ${v} (${mode}, by ${actorId}).`);

  return result;
}

async function notifyStickyChange(client) {
  try {
    const { notifyChange } = require('../sticky/stickyEngine');
    await notifyChange(client, 'radio:current');
  } catch (e) {
    warn(`[RADIO] sticky notify falhou: ${e.message}`);
  }
}

async function setRandom({ type, actorId, note }) {
  const states = await radioRepo.getAllStates();
  const other = states.find(s => s.radio_type !== type);
  const value = generateRandom({ exclude: [other?.value] });
  return setRadio({ type, value, mode: 'random', actorId, note });
}

function buildEmbed(states) {
  const principal = states.find(s => s.radio_type === 'principal');
  const val = principal?.value || '—';
  const when = principal?.updated_at ? `<t:${Math.floor(new Date(principal.updated_at).getTime() / 1000)}:R>` : '—';
  const by = principal?.updated_by ? `<@${principal.updated_by}>` : '—';
  const modeTag = principal?.mode === 'random' ? '🎲 Aleatória' : '✋ Manual';

  const embed = brandEmbed('MOVEMENT')
    .setColor(COLOR.DANGER)
    .setTitle(`${EMOJI.RADIO} Frequência da Firma`)
    .setDescription(`\`\`\`fix\n${val}\n\`\`\`\n` + `> ${modeTag} · ${by} · ${when}`);

  return applyLogo(embed);
}

function buildComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('radio::random::principal')
        .setStyle(ButtonStyle.Danger)
        .setLabel('Nova Frequência')
        .setEmoji('🎲')
    ),
  ];
}

async function publishToChannel(client, { channelId } = {}) {
  const cid = channelId || CONFIG.RADIO_PUBLISH_CHANNEL_ID;
  if (!cid) return null;
  const channel = await client.channels.fetch(cid).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return null;
  const states = await radioRepo.getAllStates();
  const message = await channel.send({
    embeds: [buildEmbed(states)],
    components: buildComponents(),
  });
  return message;
}

async function historyText(limit = 10) {
  const rows = await radioRepo.listHistory(limit);
  if (!rows.length) return '_Sem histórico ainda._';
  const lines = ['**Últimas alterações:**'];
  for (const r of rows) {
    const when = `<t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>`;
    const tag = r.mode === 'random' ? '🎲' : '✋';
    lines.push(`\`${r.old_value || '∅'}\` → \`${r.new_value}\` ${tag} • <@${r.actor_id}> ${when}`);
  }
  return lines.join('\n');
}

module.exports = {
  TYPE_META,
  isValidValue,
  generateRandom,
  setRadio,
  setRandom,
  buildEmbed,
  buildComponents,
  publishToChannel,
  historyText,
  notifyStickyChange,
};
