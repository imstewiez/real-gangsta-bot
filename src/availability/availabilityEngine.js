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

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const CONFIG = require('../config');
const { availabilityRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const { brandEmbed, COLOR, setFooterText } = require('../shared/embedBuilders');
const { formatPtDateOnly } = require('../shared/formatPtDate');
const { EMOJI } = require('../content');
const { buildSearchableSelect } = require('../shared/selectSearch');
const {
  pickHeader,
  // stateMeta,
  STATE_ORDER,
  STATE_META,
  buildSelectOptions,
  resolveRangeValue,
} = require('./availabilityTemplates');
const { log, warn } = require('../logger');

function todayDateString() {
  // Data em Europe/Lisbon YYYY-MM-DD — coincide com session_date DATE.
  // Usa timezone explícito para evitar drift se o servidor estiver noutra TZ.
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(new Date());
}

// Fmt dia da semana em PT-PT (segunda, terça, quarta…).
function _weekdayPt(dateInput) {
  try {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('pt-PT', { weekday: 'long', timeZone: 'Europe/Lisbon' }).format(d);
  } catch {
    return '';
  }
}

function buildEmbed(session, tallies, totalVoters) {
  const dateStr = formatPtDateOnly(session.session_date);
  const weekday = _weekdayPt(session.session_date);
  const isClosed = session.status === 'closed';

  const statusLine = isClosed
    ? `${EMOJI.BLOQUEADO} **Sessão fechada** — votos congelados.`
    : `${EMOJI.PRESENCA} _Usa o menu abaixo para marcar a tua disponibilidade._`;

  const voterLabel = totalVoters === 1 ? 'bairrista votou' : 'bairristas votaram';
  const voterBadge = totalVoters === 0 ? '_ninguém ainda_' : `**${totalVoters}** ${voterLabel}`;

  // Slot lines — simples, sem barras empilhadas
  const slotLines = tallies.map(t => {
    const y = t.counts.disponivel || 0;
    const m = t.counts.talvez || 0;
    const n = t.counts.indisponivel || 0;
    const total = y + m + n;
    const breakdown =
      total > 0 ? `${EMOJI.DISPONIVEL} ${y}   ${EMOJI.TALVEZ} ${m}   ${EMOJI.INDISPONIVEL} ${n}` : '_sem votos_';
    return `**${t.label}** — ${breakdown}`;
  });

  const desc = [
    `**${weekday.charAt(0).toUpperCase() + weekday.slice(1)}**, ${dateStr}`,
    '',
    `👥 ${voterBadge}`,
    '',
    statusLine,
    '',
    ...slotLines,
  ];

  const embed = brandEmbed('HOUSE', { skipLogo: true })
    .setColor(isClosed ? COLOR.MUTED : COLOR.INFO)
    .setTitle(`${EMOJI.PRESENCA} Presença do Bairro`)
    .setDescription(desc.join('\n'));

  setFooterText(embed, `sessão #${session.id}${isClosed ? ' · fechada' : ' · reset amanhã às 07:00'}`);
  return embed;
}

function buildComponents(session, slots) {
  if (session.status === 'closed') return []; // nada de votar quando fechada

  const selectOpts = buildSelectOptions(slots);
  const selectRows = buildSearchableSelect({
    customId: `avail::vote_select::${session.id}`,
    placeholder: '📅 Marca a tua disponibilidade',
    options: selectOpts,
    searchKey: `avail::${session.id}`,
    modalTitle: 'Pesquisar opção',
    messageClass: 'FLOW',
  });

  // Atalhos: aplicar mesmo estado a TODOS os slots.
  const allRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`avail::all::${session.id}::disponivel`)
      .setStyle(ButtonStyle.Success)
      .setLabel('Apareço')
      .setEmoji(EMOJI.DISPONIVEL || '✅'),
    new ButtonBuilder()
      .setCustomId(`avail::all::${session.id}::talvez`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Talvez')
      .setEmoji(EMOJI.TALVEZ || '⏰'),
    new ButtonBuilder()
      .setCustomId(`avail::all::${session.id}::indisponivel`)
      .setStyle(ButtonStyle.Danger)
      .setLabel('Não dá')
      .setEmoji(EMOJI.INDISPONIVEL || '❌')
  );
  const utilRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`avail::summary::${session.id}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel('Resumo')
      .setEmoji('📊')
  );

  return [...selectRows, allRow, utilRow];
}

function buildContent(session) {
  const ids = (session.mention_role_ids || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
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
    allowedMentions: {
      roles: (session.mention_role_ids || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    },
  });
  await availabilityRepo.setMessageId(session.id, message.id);
  return message;
}

async function createSession({ client, channelId, createdBy, headerText, mentionRoleIds, slots, sessionDate }) {
  const date = sessionDate || todayDateString();
  const slotLabels = slots && slots.length ? slots : CONFIG.AVAILABILITY_SLOTS;
  if (!slotLabels.length) throw new Error('Sem slots configurados — define AVAILABILITY_SLOTS.');

  // Não permite duplicar sessão aberta no mesmo canal/dia (índice único trata, mas
  // damos erro amigável antes).
  const existing = await availabilityRepo.getOpenSession(channelId, date);
  if (existing) {
    return { session: existing, alreadyOpen: true };
  }

  // Resolve menções: explicit > config > BAIRRISTAS_BASE como fallback final
  // (assim, se nada estiver configurado, todos os bairristas são alertados).
  let resolvedMentions = mentionRoleIds;
  if (!resolvedMentions || !resolvedMentions.length) {
    resolvedMentions = CONFIG.AVAILABILITY_MENTION_ROLE_IDS.length
      ? CONFIG.AVAILABILITY_MENTION_ROLE_IDS
      : CONFIG.BAIRRISTAS_BASE_ROLE_ID
        ? [CONFIG.BAIRRISTAS_BASE_ROLE_ID]
        : [];
  }

  const session = await availabilityRepo.createSession({
    sessionDate: date,
    channelId,
    createdBy,
    headerText: headerText || pickHeader(),
    mentionRoleIds: resolvedMentions,
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
  if (!session) return;

  // 1. Edita a mensagem original (se existe)
  if (session.message_id) {
    const channel = await client.channels.fetch(session.channel_id).catch(() => null);
    if (channel) {
      const message = await channel.messages.fetch(session.message_id).catch(() => null);
      if (message) {
        const slots = await availabilityRepo.getSlots(sessionId);
        const tallies = await availabilityRepo.getTallies(sessionId);
        const total = await availabilityRepo.getDistinctVoterCount(sessionId);
        await message.edit({
          embeds: [buildEmbed(session, tallies, total)],
          components: buildComponents(session, slots),
        });
      }
    }
  }

  // 2. Notifica sticky `availability:daily` — refresca qualquer sticky desse
  // source no canal da sessão. Não bloqueia em caso de falha.
  try {
    const { notifyChange } = require('../sticky/stickyEngine');
    await notifyChange(client, 'availability:daily', { channelId: session.channel_id });
  } catch (e) {
    warn(`[AVAIL] sticky notify falhou: ${e.message}`);
  }
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

/**
 * Voto por intervalo/range — resolve o value do select (ex: 'tarde:disponivel')
 * para a lista de slots e aplica o estado a todos.
 */
async function recordRangeVote({ client, sessionId, discordUserId, value }) {
  const session = await availabilityRepo.getSessionById(sessionId);
  if (!session) return { ok: false, reason: 'session_not_found' };
  if (session.status !== 'open') return { ok: false, reason: 'session_closed' };

  const slots = await availabilityRepo.getSlots(sessionId);
  const resolved = resolveRangeValue(value, slots);
  if (!resolved) return { ok: false, reason: 'invalid_range' };

  if (resolved.state === 'limpar') {
    const deleted = await availabilityRepo.deleteVotesForUser(sessionId, discordUserId);
    updateSessionMessage(client, sessionId).catch(e => warn(`[AVAIL] update msg falhou: ${e.message}`));
    return { ok: true, state: 'limpar', count: deleted };
  }

  if (!STATE_META[resolved.state]) return { ok: false, reason: 'invalid_state' };

  let count = 0;
  for (const slotId of resolved.slotIds) {
    await availabilityRepo.upsertVote({ sessionId, slotId, discordUserId, voteState: resolved.state });
    count++;
  }
  updateSessionMessage(client, sessionId).catch(e => warn(`[AVAIL] update msg falhou: ${e.message}`));
  return { ok: true, state: resolved.state, count, slotIds: resolved.slotIds };
}

async function getSummaryText(sessionId) {
  const session = await availabilityRepo.getSessionById(sessionId);
  if (!session) return null;
  const slots = await availabilityRepo.getSlots(sessionId);
  const voters = await availabilityRepo.getVoters(sessionId);
  const total = await availabilityRepo.getDistinctVoterCount(sessionId);

  const bySlot = new Map(
    slots.map(s => [
      s.id,
      { label: s.slot_label, position: s.position, votes: { disponivel: [], talvez: [], indisponivel: [] } },
    ])
  );
  // Reconstruir slot_id a partir de slot_label (voters traz label, não id)
  const slotByLabel = new Map(slots.map(s => [s.slot_label, s]));
  for (const v of voters) {
    const slot = slotByLabel.get(v.slot_label);
    if (!slot) continue;
    bySlot.get(slot.id).votes[v.vote_state].push(v.discord_user_id);
  }

  const lines = [
    `**Sessão #${session.id}** — ${formatPtDateOnly(session.session_date)}`,
    `Total de votantes: **${total}**`,
    '',
  ];
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
  recordRangeVote,
  getSummaryText,
};
