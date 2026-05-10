'use strict';
const CONFIG = require('../config');
const { memberRepo } = require('../repositories');
const { CONTRIBUTION_TYPES } = require('../shared/movementTypes');
const { buildItemPointsCase } = require('./itemPoints');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');
const { queueMemberOp, queueChannelOp } = require('../discordQueue');
const { log, warn } = require('../logger');
const eventBus = require('../core/eventBus');
const { COLOR } = require('../shared/embedBuilders');

// ── Thresholds (XP acumulado — pontos por item entregue/vendido) ────────────
// Young Blood (entry) → O Gunão:        50.000 XP
// O Gunão → Gangster Fodido:            100.000 XP
// Gangster Fodido → cima:               manual (Patrão di Zona, Real Gangster, OG, etc.)
//
// Pontos por item:
//   4 pts — Moldes, Corpos, Prints
//   3 pts — Plástico velho/reciclado, Lixo eletrónico, Cobre, Pólvora, Peças
//   2 pts — Sucata, Ferro, Telemóveis Estragados, Rádios Estragados, Carvão, Borracha
//   1 pt  — Restantes materiais
//   0 pts — Itens de mercado/droga (quimicos_droga, dinheiro)
//
// Promoções excepcionais (fora do threshold) continuam a ser feitas por
// atribuição manual de role via Discord.

const TIERS = [
  { tier: 'young_blood', roleIdKey: 'YOUNG_BLOOD_ROLE_ID', dbRole: 'bairrista', level: 1 },
  { tier: 'o_gunao', roleIdKey: 'O_GUNAO_ROLE_ID', dbRole: 'bairrista', level: 2 },
  { tier: 'gangster_fodido', roleIdKey: 'GANGSTER_FODIDO_ROLE_ID', dbRole: 'bairrista', level: 3 },
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
 * Calcula o XP total de material entregue/vendido por um membro.
 * Cada item dá uma quantidade de pontos consoante o tipo.
 * É esta métrica que conta para promoções automáticas.
 */
async function getMemberMaterialPoints(memberId) {
  const { query } = require('../db');
  const pointsCase = buildItemPointsCase();
  const res = await query(
    `
    SELECT COALESCE(SUM(im.quantity * ${pointsCase}), 0)::bigint as total_points
    FROM inventory_movements im
    JOIN items i ON i.id = im.item_id
    WHERE im.member_id = $1
      AND im.movement_type = ANY($2::text[])
  `,
    [memberId, CONTRIBUTION_TYPES]
  );
  return Number(res.rows[0]?.total_points || 0);
}
// Alias legado — manter compatibilidade com callers antigos.
const getMemberMaterialQty = getMemberMaterialPoints;
const getMemberMaterialValue = getMemberMaterialPoints;

/**
 * Verifica se um membro merece promoção automática e aplica-a.
 * Chamado após cada registo de material.
 *
 * **Thread-safety**: usa `withAdvisoryLock('promote:<discord_id>')` para
 * garantir que duas invocações concorrentes para o mesmo user não duplicam
 * a promoção. A região crítica (re-read tier + check qty + UPDATE tier)
 * corre dentro do lock; as side-effects Discord (add/remove role, rename
 * canal, audit, event bus) correm FORA para não prender o pool.
 *
 * Se o lock é concedido e a segunda invocação entra, ela vai ver o tier
 * já actualizado e retornar null (a guard `liveTier !== promotion.from`
 * filtra). Zero duplicação.
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
  const currentTier = dbMember.role === 'bairrista' ? dbMember.tier || CONFIG.BAIRRISTA_DEFAULT_TIER : null;
  if (!currentTier) return null; // Não é bairrista, não aplica

  // Ver se há promoção disponível para este tier
  const promotion = PROMOTIONS.find(p => p.from === currentTier);
  if (!promotion) return null; // Já está no tier máximo automático

  const threshold = CONFIG[promotion.thresholdKey];
  if (!threshold) return null;

  const toRoleId = CONFIG[promotion.toRoleKey];
  const fromRoleId = CONFIG[promotion.fromRoleKey];

  if (!toRoleId) {
    warn(`[AUTO-PROMO] Role ID ${promotion.toRoleKey} não configurado. Promoção abortada.`);
    return null;
  }

  // ── Região crítica: re-read tier + check qty + UPDATE, tudo atómico ──
  // O lock é per-discord_id, não global — não bloqueia outros users.
  const { withAdvisoryLock } = require('../db');
  const decision = await withAdvisoryLock(`promote:${discordId}`, async txClient => {
    // Re-read dentro do lock — se alguém promoveu este user entre o fetch
    // inicial e aqui, o tier já mudou e nós desistimos.
    const memberRes = await txClient.query(
      'SELECT id, tier, role, display_name, nickname, channel_id FROM members WHERE discord_id = $1 FOR UPDATE',
      [discordId]
    );
    const liveMember = memberRes.rows[0];
    if (!liveMember) return null;
    if (liveMember.role !== 'bairrista') return null;
    const liveTier = liveMember.tier || CONFIG.BAIRRISTA_DEFAULT_TIER;
    if (liveTier !== promotion.from) {
      // Outro processo concorrente já promoveu — esta invocação é redundante.
      return null;
    }

    // Calcula XP dentro da mesma transação — precisão total.
    const pointsCase = buildItemPointsCase();
    const ptsRes = await txClient.query(
      `SELECT COALESCE(SUM(im.quantity * ${pointsCase}), 0)::bigint AS total_points
         FROM inventory_movements im
         JOIN items i ON i.id = im.item_id
        WHERE im.member_id = $1
          AND im.movement_type = ANY($2::text[])`,
      [liveMember.id, CONTRIBUTION_TYPES]
    );
    const totalPoints = Number(ptsRes.rows[0].total_points) || 0;
    if (totalPoints < threshold) return null;

    // Decidiu promover — UPDATE com WHERE tier=from para CAS-style safety.
    const upd = await txClient.query(
      'UPDATE members SET tier = $1, updated_at = NOW() WHERE id = $2 AND tier = $3 RETURNING id',
      [promotion.to, liveMember.id, promotion.from]
    );
    if (upd.rowCount === 0) return null; // alguém mexeu mesmo no último microssegundo

    return {
      memberId: liveMember.id,
      displayName: liveMember.display_name,
      nickname: liveMember.nickname,
      channelId: liveMember.channel_id,
      totalPoints,
    };
  });

  if (!decision) return null;

  // ── Side-effects Discord + audit + event (já fora do lock) ──
  try {
    const guildMember = await guild.members.fetch(discordId).catch(() => null);
    if (!guildMember) {
      // DB já actualizada — role invariants job corrige no próximo ciclo.
      warn(
        `[AUTO-PROMO] DB promoveu ${dbMember.display_name} mas guildMember não existe; roles/canal ficam para invariants.`
      );
      return { promoted: true, from: promotion.from, to: promotion.to, points: decision.totalPoints };
    }

    // Remover role anterior e adicionar novo
    if (fromRoleId && guildMember.roles.cache.has(fromRoleId)) {
      await queueMemberOp(() =>
        guildMember.roles.remove(fromRoleId, `Auto-promoção: ${promotion.from} → ${promotion.to}`)
      );
    }
    await queueMemberOp(() =>
      guildMember.roles.add(toRoleId, `Auto-promoção: atingiu ${threshold.toLocaleString('pt-PT')} XP`)
    );

    // Renomear canal individual para reflectir novo tier (se existir)
    if (decision.channelId) {
      try {
        const { formatResidentChannelName } = require('../discord/structureTemplate');
        const { query: dbQuery } = require('../db');
        const channel = await guild.channels.fetch(decision.channelId).catch(() => null);
        if (channel) {
          const newName = formatResidentChannelName(promotion.to, decision.nickname || decision.displayName);
          if (channel.name !== newName) {
            await queueChannelOp(() => channel.setName(newName));
            await dbQuery(
              "UPDATE resident_channels SET channel_name = $1 WHERE channel_id = $2 AND status = 'active'",
              [newName, decision.channelId]
            );
            log(`[AUTO-PROMO] Canal de ${decision.displayName} renomeado: ${newName}`);
          }
        }
      } catch (e) {
        warn(`[AUTO-PROMO] Falha a renomear canal de ${decision.displayName}: ${e.message}`);
      }
    }

    await logAudit({
      action: 'auto_promotion',
      entityType: 'member',
      entityId: discordId,
      actorId: 'system',
      actorName: CONFIG.BOT_DISPLAY_NAME,
      beforeState: { tier: promotion.from, totalQty: decision.totalQty },
      afterState: { tier: promotion.to, threshold },
      context: `XP acumulado: ${decision.totalPoints.toLocaleString('pt-PT')} (meta: ${threshold.toLocaleString('pt-PT')} XP)`,
    });

    await sendAuditToChannel(client, {
      title: 'Promoção Automática!',
      description: `<@${discordId}> subiu de **${formatTierName(promotion.from)}** para **${formatTierName(promotion.to)}**!\n\nXP acumulado: **${decision.totalPoints.toLocaleString('pt-PT')}** (meta: ${threshold.toLocaleString('pt-PT')} XP)`,
      color: COLOR.PROMOTION_GOLD,
    });

    log(`[AUTO-PROMO] ${decision.displayName}: ${promotion.from} → ${promotion.to} (${decision.totalPoints} XP)`);

    // Event — dispara projecção sheets (membros + dashboard + resumo).
    eventBus
      .emitAsync('member.tier_changed', {
        discordId,
        memberId: decision.memberId,
        displayName: decision.displayName,
        from: promotion.from,
        to: promotion.to,
        points: decision.totalPoints,
        at: new Date(),
      })
      .catch(() => {});

    return { promoted: true, from: promotion.from, to: promotion.to, points: decision.totalPoints };
  } catch (e) {
    warn(`[AUTO-PROMO] Falha no side-effect de ${decision.displayName}: ${e.message}`);
    // Não reverte DB — role_invariants job corrige desalinhamento Discord↔DB.
    return { promoted: true, from: promotion.from, to: promotion.to, qty: decision.totalQty };
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

  const currentTier = dbMember.tier || CONFIG.BAIRRISTA_DEFAULT_TIER;
  const promotion = PROMOTIONS.find(p => p.from === currentTier);

  const totalPoints = await getMemberMaterialPoints(dbMember.id);

  if (!promotion) {
    return {
      currentTier,
      currentTierName: formatTierName(currentTier),
      totalPoints,
      // Campos legados
      totalQty: totalPoints,
      totalValue: totalPoints,
      nextTier: null,
      nextTierName: null,
      threshold: null,
      remaining: 0,
      progress: 100,
      maxedOut: true,
    };
  }

  const threshold = CONFIG[promotion.thresholdKey];
  const remaining = Math.max(0, threshold - totalPoints);
  const progress = Math.min(100, (totalPoints / threshold) * 100);

  return {
    currentTier,
    currentTierName: formatTierName(currentTier),
    totalPoints,
    // Campos legados
    totalQty: totalPoints,
    totalValue: totalPoints,
    nextTier: promotion.to,
    nextTierName: formatTierName(promotion.to),
    threshold,
    remaining,
    progress: progress.toFixed(1),
    maxedOut: false,
  };
}

module.exports = {
  checkAndPromote,
  getPromotionProgress,
  getMemberMaterialPoints,
  getMemberMaterialQty, // alias legado
  getMemberMaterialValue, // alias legado
  formatTierName,
  TIERS,
  PROMOTIONS,
};
