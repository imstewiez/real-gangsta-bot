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

const { EmbedBuilder } = require('discord.js');
const { EMOJI, SAIDA_TYPE } = require('../content');
const { formatPtDate } = require('../shared/formatPtDate');
const { brandEmbed } = require('../shared/embedBuilders');

const fmt = n => (Number(n) || 0).toLocaleString('pt-PT');
const fmtVal = n => `${(Number(n) || 0).toLocaleString('pt-PT', { maximumFractionDigits: 0 })}€`;
const mention = discordId => (discordId ? `<@${discordId}>` : '—');

// ── Inventário ─────────────────────────────────────────────────────────────

const MOVEMENT_LABELS = {
  entrega_bairrista: { label: 'Entrega (Bairrista)', color: 0x27ae60, emoji: EMOJI.ENTREGA },
  entrega_oficial: { label: 'Entrega (Oficial)', color: 0x27ae60, emoji: EMOJI.ENTREGA },
  venda_bairrista: { label: 'Venda', color: 0xf39c12, emoji: EMOJI.VENDA },
  fornecimento_org: { label: 'Fornecimento (saída)', color: 0x3498db, emoji: EMOJI.FORNECER },
  devolucao_saida: { label: 'Devolução de saída', color: 0x3498db, emoji: EMOJI.DEVOLVER },
  perda_saida: { label: 'Perda em saída', color: 0xe74c3c, emoji: EMOJI.PERDIDO },
  consumo_saida: { label: 'Consumo em saída', color: 0x9b59b6, emoji: '🔥' },
  ajuste_manual: { label: 'Ajuste manual', color: 0x95a5a6, emoji: EMOJI.AJUSTAR },
  apreendido: { label: 'Apreendido', color: 0xe67e22, emoji: '🚔' },
  craftado: { label: 'Craftado', color: 0x1abc9c, emoji: EMOJI.CRAFT },
};

function inventoryMovementEmbed(p) {
  const info = MOVEMENT_LABELS[p.movementType] || { label: p.movementType, color: 0x95a5a6, emoji: EMOJI.MATERIAL };
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
  if (p.value != null || (p.quantity && p.itemValue)) {
    const val = p.value != null ? p.value : (Number(p.quantity) || 0) * (Number(p.itemValue) || 0);
    if (val > 0) fields.push({ name: 'Valor estimado', value: fmtVal(val), inline: true });
  }
  if (p.operationId) {
    fields.push({ name: 'Saída', value: `#${p.operationId}`, inline: true });
  }
  if (p.balanceAfter != null) {
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
    .setColor(0x3498db)
    .setTitle(`${EMOJI.REFRESH} Transferência — ${p.from} → ${p.to}`)
    .setDescription(`**${fmt(p.quantity)}× ${p.itemName}**`)
    .addFields(fields);
}

// ── Encomendas (orders) ────────────────────────────────────────────────────

const ORDER_EVENT_META = {
  created: { label: 'Nova Encomenda', color: 0xf39c12, emoji: EMOJI.NOVO },
  approved: { label: 'Encomenda Aprovada', color: 0x27ae60, emoji: EMOJI.OK },
  fulfilled: { label: 'Encomenda Entregue', color: 0x2ecc71, emoji: EMOJI.MATERIAL },
  denied: { label: 'Encomenda Recusada', color: 0xe74c3c, emoji: EMOJI.ERRO },
  cancelled: { label: 'Encomenda Cancelada', color: 0x95a5a6, emoji: '🚫' },
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
  if (p.status) fields.push({ name: 'Estado', value: `\`${p.status}\``, inline: true });
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
  joined: { label: 'Entrada no servidor', color: 0x3498db, emoji: EMOJI.ENTRADA },
  left: { label: 'Saiu do servidor', color: 0x95a5a6, emoji: '👋' },
  promoted: { label: 'Subida de Cargo', color: 0xf39c12, emoji: EMOJI.LIDER },
  tier_changed: { label: 'Mudança de Tier', color: 0xf39c12, emoji: EMOJI.TOPO },
  nickname_changed: { label: 'Mudança de Nome', color: 0x95a5a6, emoji: EMOJI.EDITAR },
  tag_approved: { label: 'Tag Aprovada', color: 0x27ae60, emoji: EMOJI.TAG },
  tag_denied: { label: 'Tag Recusada', color: 0xe74c3c, emoji: EMOJI.ERRO },
};

function orgLifecycleEmbed(p) {
  const meta = ORG_EVENT_META[p.event] || { label: p.event, color: 0x95a5a6, emoji: EMOJI.INFO };
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
  opened: { label: 'Saída Criada', color: 0x3498db, emoji: EMOJI.SAIDA },
  started: { label: 'Saída Iniciada', color: 0xf39c12, emoji: EMOJI.SAIDA },
  closed: { label: 'Saída Fechada', color: 0x2ecc71, emoji: EMOJI.VITORIA },
  material_issued: { label: 'Material Fornecido', color: 0x9b59b6, emoji: EMOJI.FORNECER },
  participant_added: { label: 'Participante Adicionado', color: 0x3498db, emoji: EMOJI.PARTICIPANTE },
  cancelled: { label: 'Saída Cancelada', color: 0x95a5a6, emoji: '🚫' },
  weapon_return: { label: 'Devolução de Arma — Decisão', color: 0xf39c12, emoji: '🔫' },
};

function saidaLifecycleEmbed(p) {
  const meta = SAIDA_EVENT_META[p.event] || { label: p.event, color: 0x95a5a6, emoji: EMOJI.SAIDA };
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
  if (p.result) fields.push({ name: 'Resultado', value: `\`${p.result}\``, inline: true });

  if (p.participantsCount != null) {
    const parts = [`**${p.participantsCount}** totais`];
    if (p.characterized_count != null) parts.push(`${p.characterized_count} caracterizados`);
    if (p.workers_count != null) parts.push(`${p.workers_count} trabalhadores`);
    fields.push({ name: 'Participantes', value: parts.join(' · '), inline: false });
  }

  // Material issued (usado quando event = material_issued)
  if (p.event === 'material_issued' && p.itemName) {
    fields.push({ name: 'Material', value: `**${fmt(p.quantity)}× ${p.itemName}**`, inline: true });
    if (p.toMemberId) fields.push({ name: 'Para', value: mention(p.toMemberId), inline: true });
  }

  // Closed stats — material em UNIDADES (não €)
  if (p.event === 'closed') {
    if (p.suppliedUnits != null)
      fields.push({ name: `${EMOJI.MATERIAL} Fornecido`, value: `**${fmt(p.suppliedUnits)}** un.`, inline: true });
    if (p.returnedUnits != null)
      fields.push({ name: `${EMOJI.DEVOLVER} Devolvido`, value: `**${fmt(p.returnedUnits)}** un.`, inline: true });
    if (p.lostUnits != null)
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
