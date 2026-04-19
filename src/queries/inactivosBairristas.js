'use strict';
/**
 * /inactivos-bairristas — lista bairristas activos por ordem de menor actividade.
 *
 * Read-only — staff decide manualmente quem kickar. Computa em tempo real
 * (não usa all_time_stats que é refrescado mensalmente).
 *
 * Actividade = MAX de:
 *   - inventory_movements.created_at (entrega_bairrista, venda_bairrista,
 *     entrega_oficial)
 *   - operations.date (via operation_participants)
 *   - kill_logs.created_at (se o killer_id bater)
 *
 * Options:
 *   dias_sem_actividade — threshold N dias (default 30). Filtra quem tem
 *                          last_activity > N dias OU zero actividade.
 *   min_dias_entrada    — ignora bairristas que entraram há < N dias (não é
 *                          justo avaliar newcomers). Default 14.
 *
 * Chefia-only.
 */

const { MessageFlags } = require('discord.js');
const { query } = require('../db');
const { log, warn } = require('../logger');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { EMOJI, ERRORS } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');

const DEFAULT_DIAS = 30;
const DEFAULT_MIN_ENTRADA = 14;

async function _scan() {
  const res = await query(
    `SELECT
       m.id,
       m.display_name,
       m.nickname,
       m.tier,
       m.discord_id,
       m.joined_at,
       m.created_at,
       COALESCE(
         SUM(
           CASE WHEN im.movement_type IN ('entrega_bairrista', 'venda_bairrista', 'entrega_oficial')
                THEN im.quantity ELSE 0 END
         ), 0
       )::int AS material_qtd,
       COUNT(DISTINCT im.id) FILTER (
         WHERE im.movement_type IN ('entrega_bairrista', 'venda_bairrista', 'entrega_oficial')
       )::int AS material_movs,
       COUNT(DISTINCT op.operation_id)::int AS saidas_count,
       COUNT(DISTINCT k.id)::int AS kills,
       GREATEST(
         MAX(im.created_at)::date,
         MAX(o.date),
         MAX(k.created_at)::date
       ) AS last_activity
     FROM members m
     LEFT JOIN inventory_movements im ON im.member_id = m.id
     LEFT JOIN operation_participants op ON op.member_id = m.id
     LEFT JOIN operations o ON o.id = op.operation_id
     LEFT JOIN kill_logs k ON k.killer_id = m.id
     WHERE m.role = 'bairrista'
       AND m.status = 'ativo'
       AND m.deleted_at IS NULL
     GROUP BY m.id
     ORDER BY last_activity ASC NULLS FIRST, m.joined_at ASC`
  );
  return res.rows;
}

function _formatDaysAgo(dateOrNull) {
  if (!dateOrNull) return 'nunca';
  const ts = new Date(dateOrNull).getTime();
  if (!Number.isFinite(ts)) return '?';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days < 0) return 'hoje';
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days}d`;
}

function _daysBetween(fromDate) {
  if (!fromDate) return null;
  const ts = new Date(fromDate).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / 86400000);
}

async function handle(interaction) {
  try {
    return await _handleInner(interaction);
  } catch (e) {
    warn(`[INACTIVOS] Erro: ${e.message}\n${e.stack}`);
    const msg = `${EMOJI.ERRO} Falha: ${String(e.message).slice(0, 200)}`;
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: msg }).catch(() => {});
    }
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function _handleInner(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('ver lista de inactivos'), flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const diasThreshold = interaction.options.getInteger('dias_sem_actividade') ?? DEFAULT_DIAS;
  const minEntrada = interaction.options.getInteger('min_dias_entrada') ?? DEFAULT_MIN_ENTRADA;

  const rows = await _scan();

  // Filtra: entrou há >= minEntrada dias E (zero actividade OU last_activity >= diasThreshold dias)
  const candidates = rows
    .map(r => {
      const joinedDaysAgo = _daysBetween(r.joined_at || r.created_at) || 0;
      const lastActivityDaysAgo = r.last_activity ? _daysBetween(r.last_activity) : null;
      const totalActivity = (r.material_movs || 0) + (r.saidas_count || 0) + (r.kills || 0);
      return { ...r, joinedDaysAgo, lastActivityDaysAgo, totalActivity };
    })
    .filter(r => r.joinedDaysAgo >= minEntrada)
    .filter(r => r.totalActivity === 0 || (r.lastActivityDaysAgo !== null && r.lastActivityDaysAgo >= diasThreshold));

  // Ordena: zero activity primeiro, depois por last_activity mais antiga.
  candidates.sort((a, b) => {
    if (a.totalActivity === 0 && b.totalActivity !== 0) return -1;
    if (b.totalActivity === 0 && a.totalActivity !== 0) return 1;
    const la = a.lastActivityDaysAgo ?? Infinity;
    const lb = b.lastActivityDaysAgo ?? Infinity;
    return lb - la;
  });

  if (!candidates.length) {
    const embed = brandEmbed('MOVEMENT')
      .setColor(0x2ecc71)
      .setTitle(`${EMOJI.OK} Zero candidatos a kick`)
      .setDescription(
        `Com os thresholds actuais (entrada ≥ **${minEntrada}d** · inactividade ≥ **${diasThreshold}d**),\n` +
          `todos os **${rows.length}** bairristas activos têm pelo menos uma actividade recente.`
      );
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  }

  const lines = candidates.slice(0, 30).map(c => {
    const nick = c.nickname || c.display_name;
    const joined = `entrou ${_formatDaysAgo(c.joined_at || c.created_at)}`;
    const last = c.last_activity ? `última: ${_formatDaysAgo(c.last_activity)}` : 'última: **nunca**';
    const stats = `${c.material_movs || 0} entregas · ${c.saidas_count || 0} saídas · ${c.kills || 0} kills`;
    const severity = c.totalActivity === 0 ? EMOJI.ERRO : EMOJI.WARN;
    return `${severity} **${nick}** · <@${c.discord_id}>\n   ${joined} · ${last} · ${stats}`;
  });
  if (candidates.length > 30) lines.push(`\n_… e mais ${candidates.length - 30}_`);

  const zeroActivity = candidates.filter(c => c.totalActivity === 0).length;

  const embed = brandEmbed('MOVEMENT')
    .setColor(zeroActivity > 0 ? 0xe74c3c : 0xf39c12)
    .setTitle(`${EMOJI.WARN} ${candidates.length} candidato(s) a kick`)
    .setDescription(
      `**${zeroActivity}** com zero actividade · ordenados do pior para o menos mau.\n` +
        `Thresholds: entrada ≥ ${minEntrada}d · inactividade ≥ ${diasThreshold}d.\n` +
        `Universo: ${rows.length} bairristas activos.\n\n${lines.join('\n\n').slice(0, 3500)}`
    )
    .setFooter({
      text: 'Read-only — kick manual. Corre de novo com "dias_sem_actividade:14" ou "min_dias_entrada:7" para apertar.',
    });

  log(`[INACTIVOS] ${interaction.user.tag} scan: ${candidates.length} candidatos (${zeroActivity} zero).`);
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = { handle };
