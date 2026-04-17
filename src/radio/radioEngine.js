'use strict';
/**
 * Radio engine — gestão das frequências de rádio (principal/parceria).
 *
 * Validações:
 *   - valor numérico inteiro
 *   - dentro de [MIN, MAX] (ou exatamente 0 se RADIO_ALLOW_ZERO=true)
 *   - principal e parceria não podem ser iguais (excepto se ambas vazias)
 *
 * Geração aleatória usa CONFIG.RADIO_RANDOM_MIN/MAX e exclui um valor
 * opcional (tipicamente o outro tipo, para evitar colisão).
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const CONFIG = require('../config');
const { radioRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const { brandEmbed } = require('../shared/embedBuilders');
const { log, warn } = require('../logger');

const TYPE_META = {
  principal: { emoji: '📻', label: 'Principal' },
  parceria: { emoji: '🤝', label: 'Parceria' },
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
  if (max < min) throw new Error('RADIO_RANDOM_MAX < RADIO_RANDOM_MIN');
  const range = max - min + 1;
  if (range <= 0) throw new Error('Range de rádio inválido.');

  // Tenta até 50× evitar colisão; se não conseguir, devolve mesmo assim
  // (improvável a menos que range seja minúsculo).
  const blocked = new Set(exclude.filter(Boolean).map(normaliseValue));
  for (let i = 0; i < 50; i++) {
    const n = min + Math.floor(Math.random() * range);
    const s = String(n);
    if (!blocked.has(s)) return s;
  }
  return String(min + Math.floor(Math.random() * range));
}

async function setRadio({ type, value, mode = 'manual', actorId, note }) {
  if (!TYPE_META[type]) throw new Error(`Tipo de rádio inválido: ${type}`);
  if (!isValidValue(value)) {
    throw new Error(
      `Valor "${value}" inválido (range ${CONFIG.RADIO_RANDOM_MIN}-${CONFIG.RADIO_RANDOM_MAX}` +
        `${CONFIG.RADIO_ALLOW_ZERO ? ' ou 0' : ''}).`
    );
  }
  const v = normaliseValue(value);

  // Anti-colisão: principal !== parceria (ambas não-vazias).
  const states = await radioRepo.getAllStates();
  const other = states.find(s => s.radio_type !== type);
  if (other && other.value && other.value === v) {
    throw new Error(`Já está atribuído à rádio ${other.radio_type}. Escolhe outro número.`);
  }

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

  // Notifica stickys que escutam radio:current — sem client à mão aqui, o
  // refresh é diferido para uma chamada explícita do caller (handler tem o
  // client). Para evitar acoplamento, expomos uma função separada e
  // confiamos que o handler chama notifyRadioChange(client) depois.
  return result;
}

/**
 * Helper que dispara refresh em todas as stickys radio:current.
 * Os handlers chamam isto depois de setRadio/setRandom/swapRadios.
 */
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

async function swapRadios({ actorId }) {
  const states = await radioRepo.getAllStates();
  const principal = states.find(s => s.radio_type === 'principal');
  const parceria = states.find(s => s.radio_type === 'parceria');
  if (!principal?.value || !parceria?.value) {
    throw new Error('Para trocar precisas de ter ambas as rádios definidas.');
  }
  // Setamos por ordem segura: usamos um placeholder temporário se necessário.
  // Como setRadio rejeita colisões, não dá para swap directo. Truque: limpamos
  // a parceria primeiro, depois reposicionamos.
  // Em alternativa, usamos um INSERT directo bypass (validação manual).
  const oldP = principal.value;
  const oldS = parceria.value;
  // 1. Limpa parceria temporariamente
  await radioRepo.setState({ type: 'parceria', value: '', mode: 'manual', actorId, note: 'swap step 1' });
  // 2. Define principal = oldS
  await radioRepo.setState({ type: 'principal', value: oldS, mode: 'manual', actorId, note: 'swap step 2' });
  // 3. Define parceria = oldP
  await radioRepo.setState({ type: 'parceria', value: oldP, mode: 'manual', actorId, note: 'swap step 3' });
  await logAudit({
    action: 'radio_swap',
    entityType: 'radio',
    entityId: 'principal+parceria',
    actorId,
    beforeState: { principal: oldP, parceria: oldS },
    afterState: { principal: oldS, parceria: oldP },
  });
  log(`[RADIO] Swap: principal ${oldP} ↔ parceria ${oldS} (by ${actorId}).`);
  return { principal: oldS, parceria: oldP };
}

function buildEmbed(states) {
  const principal = states.find(s => s.radio_type === 'principal');
  const parceria = states.find(s => s.radio_type === 'parceria');

  const fmt = (s, meta) => {
    if (!s || !s.value) return `${meta.emoji} **${meta.label}**\n\`—\``;
    const when = s.updated_at ? `<t:${Math.floor(new Date(s.updated_at).getTime() / 1000)}:R>` : '—';
    const by = s.updated_by ? `<@${s.updated_by}>` : '—';
    const modeTag = s.mode === 'random' ? '🎲' : '✋';
    return `${meta.emoji} **${meta.label}**\n# \`${s.value}\`\n${modeTag} ${s.mode} • ${by} • ${when}`;
  };

  return brandEmbed()
    .setTitle('📻 Frequências')
    .setDescription([fmt(principal, TYPE_META.principal), '', fmt(parceria, TYPE_META.parceria)].join('\n'));
}

function buildComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('radio::random::principal')
        .setStyle(ButtonStyle.Primary)
        .setLabel('Aleatória — Principal')
        .setEmoji('🎲'),
      new ButtonBuilder()
        .setCustomId('radio::random::parceria')
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Aleatória — Parceria')
        .setEmoji('🎲')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('radio::set::principal')
        .setStyle(ButtonStyle.Primary)
        .setLabel('Set Principal')
        .setEmoji('📻'),
      new ButtonBuilder()
        .setCustomId('radio::set::parceria')
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Set Parceria')
        .setEmoji('🤝'),
      new ButtonBuilder().setCustomId('radio::swap').setStyle(ButtonStyle.Success).setLabel('Trocar').setEmoji('🔁')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('radio::history')
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Histórico')
        .setEmoji('📜'),
      new ButtonBuilder()
        .setCustomId('radio::refresh')
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Atualizar')
        .setEmoji('🔄')
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
    const meta = TYPE_META[r.radio_type] || { emoji: '❔', label: r.radio_type };
    const tag = r.mode === 'random' ? '🎲' : '✋';
    lines.push(
      `${meta.emoji} **${meta.label}**: \`${r.old_value || '∅'}\` → \`${r.new_value}\` ${tag} • <@${r.actor_id}> ${when}`
    );
  }
  return lines.join('\n');
}

module.exports = {
  TYPE_META,
  isValidValue,
  generateRandom,
  setRadio,
  setRandom,
  swapRadios,
  buildEmbed,
  buildComponents,
  publishToChannel,
  historyText,
  notifyStickyChange,
};
