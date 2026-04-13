'use strict';
/**
 * Availability engine — sessões diárias de disponibilidade.
 *
 * Fluxo:
 *   1. createSession({ date, channelId, ... }) abre uma sessão e publica
 *      a mensagem com SelectMenu (slot+state) + botões de atalho.
 *   2. Cada voto é um upsert em availability_votes (uma entry por slot+user).
 *   3. updateSessionMessage() reedita a mensagem para refletir contagens.
 *   4. closeSession() trava votos (UI fica visível mas inerte).
 *
 * Sem spam: cada voto é apenas um edit da mensagem existente. A confirmação
 * ao votante é ephemeral.
 */

const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const CONFIG = require('../config');
const { availabilityRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const { brandEmbed } = require('../shared/embedBuilders');
const { pickHeader, stateMeta, STATE_ORDER, STATE_META } = require('./availabilityTemplates');
const { log, warn } = require('../logger');

function todayDateString() {
  // Data local YYYY-MM-DD (sem TZ) — coincide com session_date DATE.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildEmbed(session, tallies, totalVoters) {
  const embed = brandEmbed()
    .setTitle('📍 Disponibilidade — ' + session.session_date.toString().split('T')[0])
    .setDescription([
      `**${session.header_text || pickHeader()}**`,
      '',
      'Vota num horário no menu abaixo. Podes mudar o teu voto a qualquer momento.',
      session.status === 'closed' ? '\n🔒 _Sessão fechada — votos congelados._' : '',
    ].filter(Boolean).join('\n'));

  // Um field por slot, mostra contagens dos 3 estados em-line.
  for (const t of tallies) {
    const counts = STATE_ORDER.map(state => {
      const m = STATE_META[state];
      return `${m.emoji} \`${t.counts[state] || 0}\``;
    }).join('   ');
    embed.addFields({ name: `🕒 ${t.label}`, value: counts, inline: true });
  }

  embed.setFooter({
    text: `${CONFIG.BOT_DISPLAY_NAME} • ${totalVoters} ${totalVoters === 1 ? 'pessoa votou' : 'pessoas votaram'} • sessão #${session.id}`,
  });
  return embed;
}

function buildComponents(session, slots) {
  if (session.status === 'closed') return []; // nada de votar quando fechada

  const select = new StringSelectMenuBuilder()
    .setCustomId(`avail::vote_select::${session.id}`)
    .setPlaceholder('Vota num horário…')
    .setMinValues(1).setMaxValues(1);

  for (const slot of slots) {
    for (const state of STATE_ORDER) {
      const m = STATE_META[state];
      select.addOptions({
        label: `${slot.slot_label} — ${m.label}`,
        description: `Marca ${slot.slot_label} como ${m.label.toLowerCase()}`,
        value: `${slot.id}:${state}`,
        emoji: m.emoji,
      });
    }
  }

  // Atalhos: aplicar mesmo estado a TODOS os slots.
  const allRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`avail::all::${session.id}::disponivel`).setStyle(ButtonStyle.Success).setLabel('Apareço').setEmoji('✅'),
    new ButtonBuilder().setCustomId(`avail::all::${session.id}::talvez`).setStyle(ButtonStyle.Secondary).setLabel('Talvez').setEmoji('⏰'),
    new ButtonBuilder().setCustomId(`avail::all::${session.id}::indisponivel`).setStyle(ButtonStyle.Danger).setLabel('Não dá').setEmoji('❌'),
  );
  const utilRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`avail::summary::${session.id}`).setStyle(ButtonStyle.Primary).setLabel('Resumo').setEmoji('📊'),
    new ButtonBuilder().setCustomId(`avail::refresh::${session.id}`).setStyle(ButtonStyle.Secondary).setLabel('Atualizar').setEmoji('🔁'),
  );

  return [new ActionRowBuilder().addComponents(select), allRow, utilRow];
}

function buildContent(session) {
  const ids = (session.mention_role_ids || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return undefined;
  return ids.map(id => `<@&${id}>`).join(' ');
}

async function publishSession(client, session) {
  const channel = await client.channels.fetch(session.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased?.()) {
    warn(`[AVAIL] Canal ${session.channel_id} não encontrado/não-text.`);
    return null;
  }

  const slots = await availabilityRepo.getSlots(session.id);
  const tallies = await availabilityRepo.getTallies(session.id);
  const total = await availabilityRepo.getDistinctVoterCount(session.id);

  const embed = buildEmbed(session, tallies, total);
  const components = buildComponents(session, slots);
  const content = buildContent(session);

  const message = await channel.send({
    content,
    embeds: [embed],
    components,
    allowedMentions: { roles: (session.mention_role_ids || '').split(',').map(s => s.trim()).filter(Boolean) },
  });
  await availabilityRepo.setMessageId(session.id, message.id);
  return message;
}

async function createSession({ client, channelId, createdBy, headerText, mentionRoleIds, slots, sessionDate }) {
  const date = sessionDate || todayDateString();
  const slotLabels = (slots && slots.length) ? slots : CONFIG.AVAILABILITY_SLOTS;
  if (!slotLabels.length) throw new Error('Sem slots configurados — define AVAILABILITY_SLOTS.');

  // Não permite duplicar sessão aberta no mesmo canal/dia (índice único trata, mas
  // damos erro amigável antes).
  const existing = await availabilityRepo.getOpenSession(channelId, date);
  if (existing) {
    return { session: existing, alreadyOpen: true };
  }

  const session = await availabilityRepo.createSession({
    sessionDate: date,
    channelId,
    createdBy,
    headerText: headerText || pickHeader(),
    mentionRoleIds: mentionRoleIds || CONFIG.AVAILABILITY_MENTION_ROLE_IDS,
    slots: slotLabels,
  });

  await publishSession(client, session);

  await logAudit({
    action: 'availability_created',
    entityType: 'availability_session',
    entityId: String(session.id),
    actorId: createdBy,
    afterState: { date, channelId, slots: slotLabels, mentionRoleIds },
    context: `Sessão diária aberta com ${slotLabels.length} slots.`,
  });
  log(`[AVAIL] Sessão #${session.id} criada (${date}, canal ${channelId}, ${slotLabels.length} slots).`);

  return { session, alreadyOpen: false };
}

async function updateSessionMessage(client, sessionId) {
  const session = await availabilityRepo.getSessionById(sessionId);
  if (!session || !session.message_id) return;
  const channel = await client.channels.fetch(session.channel_id).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(session.message_id).catch(() => null);
  if (!message) return;

  const slots = await availabilityRepo.getSlots(sessionId);
  const tallies = await availabilityRepo.getTallies(sessionId);
  const total = await availabilityRepo.getDistinctVoterCount(sessionId);
  await message.edit({
    embeds: [buildEmbed(session, tallies, total)],
    components: buildComponents(session, slots),
  });
}

async function closeSession({ client, sessionId, actorId }) {
  const closed = await availabilityRepo.closeSession(sessionId);
  if (!closed) return null;
  await updateSessionMessage(client, sessionId);
  await logAudit({
    action: 'availability_closed',
    entityType: 'availability_session',
    entityId: String(sessionId),
    actorId,
    afterState: { closedAt: new Date().toISOString() },
  });
  log(`[AVAIL] Sessão #${sessionId} fechada por ${actorId}.`);
  return closed;
}

async function recordVote({ client, sessionId, slotId, discordUserId, voteState }) {
  const session = await availabilityRepo.getSessionById(sessionId);
  if (!session) return { ok: false, reason: 'session_not_found' };
  if (session.status !== 'open') return { ok: false, reason: 'session_closed' };
  if (!STATE_META[voteState]) return { ok: false, reason: 'invalid_state' };

  const vote = await availabilityRepo.upsertVote({ sessionId, slotId, discordUserId, voteState });
  // Edit não-bloqueante — falha não invalida o voto.
  updateSessionMessage(client, sessionId).catch(e => warn(`[AVAIL] update msg falhou: ${e.message}`));
  return { ok: true, vote };
}

async function recordBulkVote({ client, sessionId, discordUserId, voteState }) {
  const session = await availabilityRepo.getSessionById(sessionId);
  if (!session) return { ok: false, reason: 'session_not_found' };
  if (session.status !== 'open') return { ok: false, reason: 'session_closed' };
  if (!STATE_META[voteState]) return { ok: false, reason: 'invalid_state' };

  const count = await availabilityRepo.bulkVoteAllSlots({ sessionId, discordUserId, voteState });
  updateSessionMessage(client, sessionId).catch(e => warn(`[AVAIL] update msg falhou: ${e.message}`));
  return { ok: true, count };
}

async function getSummaryText(sessionId) {
  const session = await availabilityRepo.getSessionById(sessionId);
  if (!session) return null;
  const slots = await availabilityRepo.getSlots(sessionId);
  const voters = await availabilityRepo.getVoters(sessionId);
  const total = await availabilityRepo.getDistinctVoterCount(sessionId);

  const bySlot = new Map(slots.map(s => [s.id, { label: s.slot_label, position: s.position, votes: { disponivel: [], talvez: [], indisponivel: [] } }]));
  // Reconstruir slot_id a partir de slot_label (voters traz label, não id)
  const slotByLabel = new Map(slots.map(s => [s.slot_label, s]));
  for (const v of voters) {
    const slot = slotByLabel.get(v.slot_label);
    if (!slot) continue;
    bySlot.get(slot.id).votes[v.vote_state].push(v.discord_user_id);
  }

  const lines = [`**Sessão #${session.id}** — ${session.session_date.toString().split('T')[0]}`,
    `Total de votantes: **${total}**`, ''];
  for (const slot of [...bySlot.values()].sort((a, b) => a.position - b.position)) {
    lines.push(`**🕒 ${slot.label}**`);
    for (const state of STATE_ORDER) {
      const m = STATE_META[state];
      const ids = slot.votes[state];
      lines.push(`${m.emoji} (${ids.length}) ${ids.length ? ids.map(i => `<@${i}>`).join(' ') : '_—_'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = {
  todayDateString,
  buildEmbed,
  buildComponents,
  publishSession,
  createSession,
  updateSessionMessage,
  closeSession,
  recordVote,
  recordBulkVote,
  getSummaryText,
};
