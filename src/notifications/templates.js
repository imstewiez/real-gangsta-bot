'use strict';
/**
 * Templates ricos para notificações publicadas pelo bot.
 *
 * Todos os embeds usam:
 *   - formato canónico de data (dd/mm/yyyy - hh:mm via formatPtDate)
 *   - emoji lexicon semântico (src/content/emojis.js)
 *   - footer com Firma RedWood
 *   - título forte + contexto claro
 *
 * Cada função recebe um payload de domínio e devolve um EmbedBuilder.
 */

// const { EmbedBuilder } = require('discord.js');
const { EMOJI, SAIDA_TYPE } = require('../content');
const { formatPtDate } = require('../shared/formatPtDate');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { formatMoney } = require('../shared/formatMoney');
const { fmtOrderStatus, fmtMovementType } = require('../shared/labels');

const fmt = n => (Number(n) || 0).toLocaleString('pt-PT');
const fmtVal = n => formatMoney(n);
const mention = discordId => (discordId ? `<@${discordId}>` : '—');

// ── Inventário ─────────────────────────────────────────────────────────────

const MOVEMENT_LABELS = {
  entrega_bairrista: { label: 'Entrega', color: COLOR.GREEN_ALT, emoji: EMOJI.ENTREGA },
  entrega_oficial: { label: 'Entrega', color: COLOR.GREEN_ALT, emoji: EMOJI.ENTREGA },
  venda_bairrista: { label: 'Venda', color: COLOR.WARNING_SOFT, emoji: EMOJI.VENDA },
  fornecimento_org: { label: 'Fornecimento', color: COLOR.INFO, emoji: EMOJI.FORNECER },
  devolucao_saida: { label: 'Devolução', color: COLOR.INFO, emoji: EMOJI.DEVOLVER },
  perda_saida: { label: 'Perda', color: COLOR.DANGER, emoji: EMOJI.PERDIDO },
  consumo_saida: { label: 'Consumo', color: COLOR.PURPLE, emoji: '🔥' },
  ajuste_manual: { label: 'Ajuste', color: COLOR.MUTED, emoji: EMOJI.AJUSTAR },
  apreendido: { label: 'Apreendido', color: COLOR.WARNING, emoji: '🚔' },
  craftado: { label: 'Craft', color: COLOR.TEAL, emoji: EMOJI.CRAFT },
};

function inventoryMovementEmbed(p) {
  const info = MOVEMENT_LABELS[p.movementType] || {
    label: fmtMovementType(p.movementType),
    color: COLOR.MUTED,
    emoji: EMOJI.MATERIAL,
  };
  const embed = brandEmbed('MOVEMENT')
    .setColor(info.color)
    .setTitle(`${info.emoji} ${info.label}`)
    .setDescription(`**${fmt(p.quantity)}× ${p.itemName}**`);

  const fields = [];
  if (p.memberDiscordId) {
    fields.push({ name: 'Membro', value: mention(p.memberDiscordId), inline: true });
  }
  if (p.actorId && p.actorId !== p.memberDiscordId) {
    fields.push({ name: 'Registou', value: mention(p.actorId), inline: true });
  }
  if ((p.value !== null && p.value !== undefined) || (p.quantity && p.itemValue)) {
    const val =
      p.value !== null && p.value !== undefined ? p.value : (Number(p.quantity) || 0) * (Number(p.itemValue) || 0);
    if (val > 0) fields.push({ name: 'Valor estimado', value: fmtVal(val), inline: true });
  }
  if (p.operationId) {
    fields.push({ name: 'Saída', value: `#${p.operationId}`, inline: true });
  }
  if (p.balanceAfter !== null && p.balanceAfter !== undefined) {
    fields.push({ name: 'Stock após', value: `**${fmt(p.balanceAfter)}**`, inline: true });
  }
  if (p.notes) {
    fields.push({ name: 'Notas', value: String(p.notes).slice(0, 500), inline: false });
  }
  fields.push({ name: 'Data/hora', value: formatPtDate(p.at || new Date()), inline: false });

  embed.addFields(fields);
  return embed;
}

function inventoryTransferEmbed(p) {
  const fields = [{ name: 'Actor', value: mention(p.actorId), inline: true }];
  if (p.notes) fields.push({ name: 'Notas', value: String(p.notes).slice(0, 500), inline: false });
  fields.push({ name: 'Data/hora', value: formatPtDate(p.at || new Date()), inline: false });
  return brandEmbed('MOVEMENT')
    .setColor(COLOR.INFO)
    .setTitle(`${EMOJI.REFRESH} Transferência — ${p.from} → ${p.to}`)
    .setDescription(`**${fmt(p.quantity)}× ${p.itemName}**`)
    .addFields(fields);
}

// ── Encomendas (orders) ────────────────────────────────────────────────────

const ORDER_EVENT_META = {
  created: { label: 'Nova Encomenda', color: COLOR.WARNING_SOFT, emoji: EMOJI.NOVO },
  approved: { label: 'Encomenda Aprovada', color: COLOR.GREEN_ALT, emoji: EMOJI.OK },
  in_progress: { label: 'Encomenda em Processo', color: COLOR.INFO, emoji: '🔧' },
  ready: { label: 'Encomenda Pronta', color: COLOR.PRIMARY, emoji: '📦' },
  fulfilled: { label: 'Encomenda Entregue', color: COLOR.SUCCESS, emoji: EMOJI.MATERIAL },
  denied: { label: 'Encomenda Recusada', color: COLOR.DANGER, emoji: EMOJI.ERRO },
  cancelled: { label: 'Encomenda Cancelada', color: COLOR.MUTED, emoji: '🚫' },
};

function orderLifecycleEmbed(p) {
  const meta = ORDER_EVENT_META[p.event] || ORDER_EVENT_META.created;
  const embed = brandEmbed('HOUSE')
    .setColor(meta.color)
    .setTitle(`${meta.emoji} ${meta.label}`)
    .setDescription(`**${fmt(p.quantity)}× ${p.itemName}**`);

  const fields = [];
  fields.push({ name: 'Pediu', value: mention(p.memberDiscordId), inline: true });
  if (p.actorId && p.actorId !== p.memberDiscordId) {
    fields.push({ name: 'Actor', value: mention(p.actorId), inline: true });
  }
  if (p.status) fields.push({ name: 'Estado', value: fmtOrderStatus(p.status), inline: true });
  if (p.notes) {
    fields.push({ name: 'Observações', value: String(p.notes).slice(0, 500), inline: false });
  }
  if (p.createdAt) fields.push({ name: 'Aberta em', value: formatPtDate(p.createdAt), inline: true });
  if (p.resolvedAt) fields.push({ name: 'Resolvida em', value: formatPtDate(p.resolvedAt), inline: true });
  if (!p.createdAt && !p.resolvedAt) {
    fields.push({ name: 'Data/hora', value: formatPtDate(new Date()), inline: false });
  }

  embed.addFields(fields);
  return embed;
}

// ── Vida da Org ────────────────────────────────────────────────────────────

const ORG_EVENT_META = {
  joined: { label: 'Entrada no servidor', color: COLOR.INFO, emoji: EMOJI.ENTRADA },
  left: { label: 'Saiu do servidor', color: COLOR.MUTED, emoji: '👋' },
  promoted: { label: 'Subida de Cargo', color: COLOR.WARNING_SOFT, emoji: EMOJI.LIDER },
  tier_changed: { label: 'Mudança de Tier', color: COLOR.WARNING_SOFT, emoji: EMOJI.TOPO },
  nickname_changed: { label: 'Mudança de Nome', color: COLOR.MUTED, emoji: EMOJI.EDITAR },
  tag_approved: { label: 'Tag Aprovada', color: COLOR.GREEN_ALT, emoji: EMOJI.TAG },
  tag_denied: { label: 'Tag Recusada', color: COLOR.DANGER, emoji: EMOJI.ERRO },
};

function orgLifecycleEmbed(p) {
  const meta = ORG_EVENT_META[p.event] || { label: p.event, color: COLOR.MUTED, emoji: EMOJI.INFO };
  const embed = brandEmbed('HOUSE').setColor(meta.color).setTitle(`${meta.emoji} ${meta.label}`);

  const lines = [];
  if (p.displayName) lines.push(`**${p.displayName}**${p.discordId ? ` (${mention(p.discordId)})` : ''}`);
  else if (p.discordId) lines.push(mention(p.discordId));
  if (lines.length) embed.setDescription(lines.join('\n'));

  const fields = [];
  if (p.beforeState?.role && p.afterState?.role) {
    fields.push({ name: 'Cargo', value: `\`${p.beforeState.role}\` → **${p.afterState.role}**`, inline: true });
  } else if (p.fromRole && p.toRole) {
    fields.push({ name: 'Cargo', value: `\`${p.fromRole}\` → **${p.toRole}**`, inline: true });
  }
  if (p.beforeState?.tier && p.afterState?.tier) {
    fields.push({ name: 'Tier', value: `\`${p.beforeState.tier}\` → **${p.afterState.tier}**`, inline: true });
  } else if (p.fromTier && p.toTier) {
    fields.push({ name: 'Tier', value: `\`${p.fromTier}\` → **${p.toTier}**`, inline: true });
  }
  if (p.beforeState?.nickname && p.afterState?.nickname) {
    fields.push({
      name: 'Nickname',
      value: `\`${p.beforeState.nickname}\` → **${p.afterState.nickname}**`,
      inline: true,
    });
  }
  if (p.actorId) {
    fields.push({ name: 'Actor', value: mention(p.actorId), inline: true });
  }
  if (p.context) {
    fields.push({ name: 'Contexto', value: String(p.context).slice(0, 500), inline: false });
  }
  fields.push({ name: 'Data/hora', value: formatPtDate(p.at || new Date()), inline: false });

  embed.addFields(fields);
  return embed;
}

// ── Saídas ─────────────────────────────────────────────────────────────────

const SAIDA_EVENT_META = {
  opened: { label: 'Saída Criada', color: COLOR.INFO, emoji: EMOJI.SAIDA },
  started: { label: 'Saída Iniciada', color: COLOR.WARNING_SOFT, emoji: EMOJI.SAIDA },
  closed: { label: 'Saída Fechada', color: COLOR.SUCCESS, emoji: EMOJI.VITORIA },
  material_issued: { label: 'Material Fornecido', color: COLOR.PURPLE, emoji: EMOJI.FORNECER },
  participant_added: { label: 'Participante Adicionado', color: COLOR.INFO, emoji: EMOJI.PARTICIPANTE },
  cancelled: { label: 'Saída Cancelada', color: COLOR.MUTED, emoji: '🚫' },
  weapon_return: { label: 'Devolução de Arma — Decisão', color: COLOR.WARNING_SOFT, emoji: '🔫' },
};

function saidaLifecycleEmbed(p) {
  const meta = SAIDA_EVENT_META[p.event] || { label: p.event, color: COLOR.MUTED, emoji: EMOJI.SAIDA };
  const embed = brandEmbed('MOVEMENT')
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Saída #${p.saidaId} — ${meta.label}`);

  const fields = [];
  if (p.spot) fields.push({ name: 'Spot', value: p.spot, inline: true });
  if (p.saidaType) {
    const typeLabel = SAIDA_TYPE[p.saidaType] || p.saidaType;
    fields.push({ name: 'Tipo', value: typeLabel, inline: true });
  }
  if (p.leaderId) fields.push({ name: 'Líder', value: mention(p.leaderId), inline: true });
  if (p.result) {
    // Enum → label pt-PT com emoji (nunca mostrar "vitoria" raw).
    const { RESULT_LABEL } = require('../content');
    fields.push({ name: 'Resultado', value: RESULT_LABEL[p.result] || p.result, inline: true });
  }

  if (p.participantsCount !== null && p.participantsCount !== undefined) {
    const parts = [`**${p.participantsCount}** totais`];
    if (p.characterized_count !== null && p.characterized_count !== undefined)
      parts.push(`${p.characterized_count} caracterizados`);
    if (p.workers_count !== null && p.workers_count !== undefined) parts.push(`${p.workers_count} trabalhadores`);
    fields.push({ name: 'Participantes', value: parts.join(' · '), inline: false });
  }

  // Material issued (usado quando event = material_issued)
  if (p.event === 'material_issued' && p.itemName) {
    fields.push({ name: 'Material', value: `**${fmt(p.quantity)}× ${p.itemName}**`, inline: true });
    if (p.toMemberId) fields.push({ name: 'Para', value: mention(p.toMemberId), inline: true });
  }

  // Closed stats — material em UNIDADES (não €)
  if (p.event === 'closed') {
    if (p.suppliedUnits !== null && p.suppliedUnits !== undefined)
      fields.push({ name: `${EMOJI.MATERIAL} Fornecido`, value: `**${fmt(p.suppliedUnits)}** un.`, inline: true });
    if (p.returnedUnits !== null && p.returnedUnits !== undefined)
      fields.push({ name: `${EMOJI.DEVOLVER} Devolvido`, value: `**${fmt(p.returnedUnits)}** un.`, inline: true });
    if (p.lostUnits !== null && p.lostUnits !== undefined)
      fields.push({ name: `${EMOJI.PERDIDO} Perdido`, value: `**${fmt(p.lostUnits)}** un.`, inline: true });
    if (p.craftAmount > 0)
      fields.push({ name: `${EMOJI.CRAFT} Craftado`, value: `**${fmt(p.craftAmount)}** un.`, inline: true });
    if (p.unaccounted > 0) {
      fields.push({ name: `${EMOJI.WARN} Não contabilizado`, value: `**${fmt(p.unaccounted)}** un.`, inline: false });
    }
  }

  if (p.actorId) fields.push({ name: 'Actor', value: mention(p.actorId), inline: true });
  if (p.notes) fields.push({ name: 'Notas', value: String(p.notes).slice(0, 500), inline: false });
  fields.push({ name: 'Data/hora', value: formatPtDate(p.at || new Date()), inline: false });

  embed.addFields(fields);
  return embed;
}

module.exports = {
  inventoryMovementEmbed,
  inventoryTransferEmbed,
  orderLifecycleEmbed,
  orgLifecycleEmbed,
  saidaLifecycleEmbed,
};
