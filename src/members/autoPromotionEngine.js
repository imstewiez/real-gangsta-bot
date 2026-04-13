'use strict';
const CONFIG = require('../config');
const { memberRepo, inventoryRepo } = require('../repositories');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');
const { queueMemberOp, queueChannelOp } = require('../discordQueue');
const { log, warn } = require('../logger');

// ── Thresholds ──────────────────────────────────────────────────────────────
// Young Blood → O Gunão:        25.000€ de material
// O Gunão → Gangster Fodido:    50.000€ de material
// Gangster Fodido → cima:       manual (Patrão di Zona, Real Gangster, OG, etc.)

const TIERS = [
  { tier: 'young_blood', roleIdKey: 'YOUNG_BLOOD_ROLE_ID', dbRole: 'morador', level: 1 },
  { tier: 'o_gunao', roleIdKey: 'O_GUNAO_ROLE_ID', dbRole: 'morador', level: 2 },
  { tier: 'gangster_fodido', roleIdKey: 'GANGSTER_FODIDO_ROLE_ID', dbRole: 'morador', level: 3 },
];

const PROMOTIONS = [
  {
    from: 'young_blood',
    to: 'o_gunao',
    thresholdKey: 'PROMO_YOUNG_BLOOD_TO_GUNAO',
    fromRoleKey: 'YOUNG_BLOOD_ROLE_ID',
    toRoleKey: 'O_GUNAO_ROLE_ID',
  },
  {
    from: 'o_gunao',
    to: 'gangster_fodido',
    thresholdKey: 'PROMO_GUNAO_TO_GANGSTER_FODIDO',
    fromRoleKey: 'O_GUNAO_ROLE_ID',
    toRoleKey: 'GANGSTER_FODIDO_ROLE_ID',
  },
];

/**
 * Calcula o valor total de material entregue/vendido por um membro.
 * Usa o preço do item (estimated_value) × quantidade.
 */
async function getMemberMaterialValue(memberId) {
  const { query } = require('../db');
  const res = await query(`
    SELECT COALESCE(SUM(im.quantity * COALESCE(i.estimated_value, 0)), 0) as total_value
    FROM inventory_movements im
    JOIN items i ON i.id = im.item_id
    WHERE im.member_id = $1
      AND im.movement_type IN ('entrega_morador', 'venda_morador', 'entrega_oficial')
  `, [memberId]);
  return parseFloat(res.rows[0]?.total_value || 0);
}

/**
 * Verifica se um membro merece promoção automática e aplica-a.
 * Chamado após cada registo de material.
 *
 * @param {string} discordId - Discord ID do membro
 * @param {object} guild - Discord guild object
 * @param {object} client - Discord client
 * @returns {{ promoted: boolean, from: string, to: string, value: number } | null}
 */
async function checkAndPromote(discordId, guild, client) {
  const dbMember = await memberRepo.findByDiscordId(discordId);
  if (!dbMember) return null;

  // Determinar tier atual pela DB
  const currentTier = dbMember.role === 'morador' ? (dbMember.tier || 'young_blood') : null;
  if (!currentTier) return null; // Não é morador, não aplica

  // Ver se há promoção disponível para este tier
  const promotion = PROMOTIONS.find(p => p.from === currentTier);
  if (!promotion) return null; // Já está no tier máximo automático

  const threshold = CONFIG[promotion.thresholdKey];
  if (!threshold) return null;

  const totalValue = await getMemberMaterialValue(dbMember.id);
  if (totalValue < threshold) return null; // Ainda não atingiu

  // ── Promover! ──────────────────────────────────────────────────────────
  const fromRoleId = CONFIG[promotion.fromRoleKey];
  const toRoleId = CONFIG[promotion.toRoleKey];

  if (!toRoleId) {
    warn(`[AUTO-PROMO] Role ID ${promotion.toRoleKey} não configurado. Promoção abortada.`);
    return null;
  }

  try {
    const guildMember = await guild.members.fetch(discordId).catch(() => null);
    if (!guildMember) return null;

    // Remover role anterior e adicionar novo
    if (fromRoleId && guildMember.roles.cache.has(fromRoleId)) {
      await queueMemberOp(() => guildMember.roles.remove(fromRoleId, `Auto-promoção: ${promotion.from} → ${promotion.to}`));
    }
    await queueMemberOp(() => guildMember.roles.add(toRoleId, `Auto-promoção: atingiu ${threshold}€ em material`));

    // Atualizar DB
    await memberRepo.update(dbMember.id, { tier: promotion.to });

    // Renomear canal individual para reflectir novo tier (se existir)
    if (dbMember.channel_id) {
      try {
        const { formatResidentChannelName } = require('../discord/structureTemplate');
        const { query: dbQuery } = require('../db');
        const channel = await guild.channels.fetch(dbMember.channel_id).catch(() => null);
        if (channel) {
          const newName = formatResidentChannelName(promotion.to, dbMember.nickname || dbMember.display_name);
          if (channel.name !== newName) {
            await queueChannelOp(() => channel.setName(newName));
            await dbQuery(
              `UPDATE resident_channels SET channel_name = $1 WHERE channel_id = $2 AND status = 'active'`,
              [newName, dbMember.channel_id]
            );
            log(`[AUTO-PROMO] Canal de ${dbMember.display_name} renomeado: ${newName}`);
          }
        }
      } catch (e) {
        warn(`[AUTO-PROMO] Falha a renomear canal de ${dbMember.display_name}: ${e.message}`);
      }
    }

    await logAudit({
      action: 'auto_promotion',
      entityType: 'member',
      entityId: discordId,
      actorId: 'system',
      actorName: 'Real Gangsta Bot',
      beforeState: { tier: promotion.from, totalValue },
      afterState: { tier: promotion.to, threshold },
      context: `Material acumulado: ${totalValue.toLocaleString('pt-PT')}€ (meta: ${threshold.toLocaleString('pt-PT')}€)`,
    });

    await sendAuditToChannel(client, {
      title: 'Promoção Automática!',
      description: `<@${discordId}> subiu de **${formatTierName(promotion.from)}** para **${formatTierName(promotion.to)}**!\n\nMaterial acumulado: **${totalValue.toLocaleString('pt-PT')}€** (meta: ${threshold.toLocaleString('pt-PT')}€)`,
      color: 0xFFD700,
    });

    log(`[AUTO-PROMO] ${dbMember.display_name}: ${promotion.from} → ${promotion.to} (${totalValue}€)`);

    return { promoted: true, from: promotion.from, to: promotion.to, value: totalValue };
  } catch (e) {
    warn(`[AUTO-PROMO] Falha ao promover ${dbMember.display_name}: ${e.message}`);
    return null;
  }
}

function formatTierName(tier) {
  const names = {
    young_blood: 'Young Blood',
    o_gunao: 'O Gunão',
    gangster_fodido: 'Gangster Fodido',
    patrao_di_zona: 'Patrão di Zona',
    real_gangster: 'Real Gangster',
    og: 'OG',
    kingpin: 'Kingpin',
    manda_chuva: 'Manda-Chuva',
  };
  return names[tier] || tier;
}

/**
 * Retorna o progresso de um membro para a próxima promoção.
 */
async function getPromotionProgress(discordId) {
  const dbMember = await memberRepo.findByDiscordId(discordId);
  if (!dbMember) return null;

  const currentTier = dbMember.tier || 'young_blood';
  const promotion = PROMOTIONS.find(p => p.from === currentTier);

  const totalValue = await getMemberMaterialValue(dbMember.id);

  if (!promotion) {
    return {
      currentTier,
      currentTierName: formatTierName(currentTier),
      totalValue,
      nextTier: null,
      nextTierName: null,
      threshold: null,
      remaining: 0,
      progress: 100,
      maxedOut: true,
    };
  }

  const threshold = CONFIG[promotion.thresholdKey];
  const remaining = Math.max(0, threshold - totalValue);
  const progress = Math.min(100, (totalValue / threshold) * 100);

  return {
    currentTier,
    currentTierName: formatTierName(currentTier),
    totalValue,
    nextTier: promotion.to,
    nextTierName: formatTierName(promotion.to),
    threshold,
    remaining,
    progress: progress.toFixed(1),
    maxedOut: false,
  };
}

module.exports = { checkAndPromote, getPromotionProgress, getMemberMaterialValue, formatTierName, TIERS, PROMOTIONS };
