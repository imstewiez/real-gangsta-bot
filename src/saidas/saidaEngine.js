'use strict';
/**
 * Saída engine — motor do domínio "saídas" (antes operations).
 *
 * Responsabilidades:
 *   - ciclo de vida da saída (criar, iniciar, cancelar, fechar)
 *   - cadeia de custódia de material por participante
 *   - no fecho: cálculo de valores económicos (supplied/returned/lost/consumed/
 *     gross/net/was_profitable), scores de performance e disciplina, MVP,
 *     actualização de spot_stats e member_saida_stats
 *   - reconciliação (material unaccounted)
 *
 * Nomes de movement_type e de tabelas mantêm-se operation_* na DB (decisão
 * de baixo risco) — semanticamente são saídas.
 */

const { saidaRepo, memberRepo, inventoryRepo, spotStatsRepo, memberSaidaStatsRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const { notifyMovement } = require('../inventory/stockNotifier');
const { computeSaidaScores } = require('./saidaScoring');
const metrics = require('../lib/metrics');
const { log, warn } = require('../logger');
const eventBus = require('../core/eventBus');

// Cliente Discord injectado no boot. Usado apenas para publicar resultados
// ricos no fecho de saída (fire-and-forget). Se não estiver definido,
// closeSaida funciona na mesma e o publish é no-op silencioso.
let _client = null;
function setClient(client) {
  _client = client;
}

// Movement types ligados a saídas (renomeados pela migration #11)
const MOVEMENT_TYPE_BY_DIRECTION = {
  fornecido: 'fornecimento_org',
  devolvido: 'devolucao_saida',
  perdido: 'perda_saida',
  consumido: 'consumo_saida',
};

async function _notifyMovement({ movementType, itemId, quantity, memberId, saidaId, actorId, notes }) {
  try {
    const item = await inventoryRepo.getItemById(itemId);
    const member = memberId ? await memberRepo.findById(memberId).catch(() => null) : null;
    const balanceAfter = await inventoryRepo.getStockForItem(itemId).catch(() => null);
    await notifyMovement({
      movementType,
      itemName: item?.name,
      quantity,
      memberName: member?.display_name,
      memberDiscordId: member?.discord_id,
      actorId,
      operationId: saidaId,
      balanceAfter,
      context: notes,
    });
  } catch (_) {
    /* fire-and-forget */
  }
}

async function createSaida({
  date,
  scheduledTime,
  spot,
  spotType,
  saidaType,
  leaderDiscordId,
  groupNumber,
  maxParticipants,
  notes,
  createdBy,
}) {
  let leaderId = null;
  if (leaderDiscordId) {
    const leader = await memberRepo.findByDiscordId(leaderDiscordId);
    if (leader) leaderId = leader.id;
  }
  const s = await saidaRepo.create({
    date,
    scheduledTime,
    spot,
    spotType,
    saidaType,
    leaderId,
    groupNumber,
    maxParticipants,
    notes,
    createdBy,
  });
  metrics.operationsCreated.inc();
  await logAudit({
    action: 'saida_created',
    entityType: 'saida',
    entityId: String(s.id),
    actorId: createdBy,
    afterState: { saidaType, spot, spotType, date, groupNumber },
  });

  // Event bus — notification routing publica em SAIDAS_EVENTS.
  eventBus
    .emitAsync('saida.opened', {
      saidaId: s.id,
      date,
      scheduledTime,
      spot,
      spotType,
      saidaType,
      leaderId: leaderDiscordId,
      groupNumber,
      maxParticipants,
      actorId: createdBy,
      notes,
      at: new Date(),
    })
    .catch(e => warn(`[EVENT] saida.opened: ${e.message}`));

  return s;
}

// ── Máquina de estados ─────────────────────────────────────────────────────
// Transições permitidas. Qualquer outra atira.
const ALLOWED_TRANSITIONS = {
  aberta: new Set(['em_preparacao', 'em_curso', 'em_liquidacao', 'cancelada']),
  em_preparacao: new Set(['em_curso', 'em_liquidacao', 'cancelada']),
  em_curso: new Set(['em_liquidacao', 'cancelada']),
  em_liquidacao: new Set(['concluida', 'cancelada']),
  concluida: new Set([]), // terminal — nunca reverter
  cancelada: new Set([]), // terminal
};

async function _assertTransition(saidaId, toStatus) {
  const saida = await saidaRepo.findById(saidaId);
  if (!saida) throw new Error(`Saída #${saidaId} não existe.`);
  const from = saida.status;
  // Rejeitar quando from == toStatus também — evita re-entrância em cálculos
  // (ex.: closeSaida duas vezes duplicaria scores/projecções).
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.has(toStatus)) {
    throw new Error(`Transição proibida: saída #${saidaId} está "${from}" e não pode passar a "${toStatus}".`);
  }
  return saida;
}

async function startSaida(saidaId, actorId) {
  await _assertTransition(saidaId, 'em_curso');
  const r = await saidaRepo.updateStatus(saidaId, 'em_curso', { start_time: new Date() });
  eventBus
    .emitAsync('saida.started', {
      saidaId,
      actorId,
      at: new Date(),
    })
    .catch(e => warn(`[EVENT] saida.started: ${e.message}`));
  return r;
}

async function cancelSaida(saidaId, actorId) {
  await _assertTransition(saidaId, 'cancelada');
  const s = await saidaRepo.updateStatus(saidaId, 'cancelada');
  await logAudit({
    action: 'saida_cancelled',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId,
  });
  return s;
}

/**
 * Fecha saída — transita para 'em_liquidacao'. Guarda metadata de resultado
 * (enemy, had_fight, craft, etc.) mas NÃO faz scoring, NÃO publica, NÃO
 * actualiza stats. Os participantes preenchem os seus resultados individuais
 * neste estado. Quando staff finaliza, finalizeSaida() faz o resto.
 */
async function closeSaida(saidaId, resultData, actorId) {
  await _assertTransition(saidaId, 'em_liquidacao');
  const participants = await saidaRepo.getParticipants(saidaId);

  // Contagem de tipos de participante
  const characterized_count = participants.filter(p => p.participant_type === 'caracterizado').length;
  const workers_count = participants.filter(p => p.participant_type === 'trabalhador').length;

  // Guarda metadata de resultado + transita para em_liquidacao
  const closed = await saidaRepo.updateStatus(saidaId, 'em_liquidacao', {
    result: resultData.result || 'sem_conflito',
    had_fight: resultData.had_fight || false,
    had_craft: resultData.had_craft || false,
    had_domination: resultData.had_domination || false,
    enemy_name: resultData.enemy_name || '',
    enemy_faction: resultData.enemy_faction || '',
    craft_amount: resultData.craft_amount || 0,
    result_notes: resultData.result_notes || '',
    our_kills: resultData.our_kills || 0,
    deaths: resultData.deaths || 0,
    survivors: resultData.survivors || 0,
    characterized_count,
    workers_count,
    updated_at: new Date(),
  });

  await logAudit({
    action: 'saida_em_liquidacao',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId,
    afterState: {
      result: resultData.result,
      participantsCount: participants.length,
      characterized_count,
      workers_count,
    },
  });

  log(`[SAIDA] Saída #${saidaId} em liquidação. result=${resultData.result} participantes=${participants.length}`);

  // Event bus — notifica que a saída entrou em liquidação
  eventBus
    .emitAsync('saida.em_liquidacao', {
      saidaId,
      result: resultData.result,
      participantsCount: participants.length,
      actorId,
      at: new Date(),
    })
    .catch(e => warn(`[EVENT] saida.em_liquidacao: ${e.message}`));

  return { ...closed, participants };
}

/**
 * Finaliza saída — transita de 'em_liquidacao' para 'concluida'.
 * Calcula scores com dados reais dos participantes (kills, deaths, weapon
 * return), actualiza projections (spot_stats, member_saida_stats) e publica
 * resultados ricos.
 */
async function finalizeSaida(saidaId, actorId) {
  await _assertTransition(saidaId, 'concluida');
  const summary = await saidaRepo.getMaterialSummary(saidaId);
  const participants = await saidaRepo.getParticipants(saidaId);
  const saida = await saidaRepo.findById(saidaId);

  // Valores económicos
  const supplied = summary.fornecido?.weightedTotal || 0;
  const returned = summary.devolvido?.weightedTotal || 0;
  const lost = summary.perdido?.weightedTotal || 0;
  const consumed = summary.consumido?.weightedTotal || 0;
  const gross = returned;
  const net = returned - lost - consumed;
  const was_profitable = net > 0;

  // Agrega kills/deaths totais dos resultados individuais
  const totalKills = participants.reduce((a, p) => a + (p.kills || 0), 0);
  const totalDeaths = participants.filter(p => p.died).length;
  const totalSurvivors = participants.filter(p => !p.died).length;

  // Scores + MVP (delegado a saidaScoring) — agora com dados REAIS
  const scoredParticipants = computeSaidaScores({
    participants,
    result: saida.result || 'sem_conflito',
    suppliedTotal: supplied,
  });

  // Persiste scores per-participant
  for (const p of scoredParticipants) {
    await saidaRepo.updateParticipant(saidaId, p.member_id, {
      issued_value: p.issued_value,
      returned_value: p.returned_value,
      lost_value: p.lost_value,
      consumed_value: p.consumed_value,
      net_material_delta: p.net_material_delta,
      performance_score: p.performance_score,
      discipline_score: p.discipline_score,
      mvp_flag: p.mvp_flag,
    });
  }

  // Contagem de tipos
  const characterized_count = participants.filter(p => p.participant_type === 'caracterizado').length;
  const workers_count = participants.filter(p => p.participant_type === 'trabalhador').length;

  // Transita para concluida com valores calculados
  const finalized = await saidaRepo.closeSaida(saidaId, {
    result: saida.result,
    had_fight: saida.had_fight,
    had_craft: saida.had_craft,
    had_domination: saida.had_domination,
    enemy_name: saida.enemy_name,
    enemy_faction: saida.enemy_faction,
    craft_amount: saida.craft_amount,
    result_notes: saida.result_notes,
    our_kills: totalKills,
    deaths: totalDeaths,
    survivors: totalSurvivors,
    supplied_value: supplied,
    returned_value: returned,
    lost_value: lost,
    consumed_value: consumed,
    gross_value: gross,
    net_value: net,
    was_profitable,
    characterized_count,
    workers_count,
  });
  if (!finalized) return null;

  metrics.operationsClosed.inc();

  // Actualiza spot_stats (incremental)
  if (finalized.spot) {
    const mvp = scoredParticipants.find(p => p.mvp_flag);
    await spotStatsRepo
      .applyIncrement({
        spot: finalized.spot,
        result: finalized.result || 'sem_conflito',
        supplied,
        returned,
        lost,
        gross,
        net,
        kills: totalKills,
        deaths: totalDeaths,
        bestMemberId: mvp?.member_id || null,
      })
      .catch(e => warn(`[SAIDA] spotStats falhou: ${e.message}`));
  }

  // Actualiza member_saida_stats (incremental, per-participante)
  for (const p of scoredParticipants) {
    await memberSaidaStatsRepo
      .applyIncrement({
        memberId: p.member_id,
        result: finalized.result || 'sem_conflito',
        kills: p.kills,
        deaths: p.deaths_count,
        profit: p.net_material_delta,
        returnedValue: p.returned_value,
        suppliedValue: p.issued_value,
        survived: !p.died,
        mvp: p.mvp_flag,
      })
      .catch(e => warn(`[SAIDA] memberStats falhou (${p.member_id}): ${e.message}`));
  }

  const recon = {
    fornecido: summary.fornecido?.total || 0,
    devolvido: summary.devolvido?.total || 0,
    perdido: summary.perdido?.total || 0,
    consumido: summary.consumido?.total || 0,
  };
  recon.unaccounted = Math.max(0, recon.fornecido - recon.devolvido - recon.perdido - recon.consumido);

  await logAudit({
    action: 'saida_finalized',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId,
    afterState: {
      result: finalized.result,
      supplied,
      returned,
      lost,
      consumed,
      gross,
      net,
      was_profitable,
      participantsCount: scoredParticipants.length,
      totalKills,
      totalDeaths,
      totalSurvivors,
      mvp: scoredParticipants.find(p => p.mvp_flag)?.display_name,
    },
    context: recon.unaccounted > 0 ? `Fechou com ${recon.unaccounted} unidades não contabilizadas.` : undefined,
  });

  log(
    `[SAIDA] Saída #${saidaId} finalizada. result=${finalized.result} kills=${totalKills} deaths=${totalDeaths} net=${net.toFixed(2)}€`
  );

  // Publica resultados ricos — fire-and-forget
  if (_client) {
    const { publishResults } = require('./saidaResultsPublisher');
    publishResults(_client, saidaId).catch(e => warn(`[SAIDA] publishResults: ${e.message}`));
  }

  // Event bus
  eventBus
    .emitAsync('saida.closed', {
      saidaId,
      spot: finalized.spot,
      saidaType: finalized.operation_type,
      result: finalized.result,
      participantsCount: scoredParticipants.length,
      suppliedUnits: recon.fornecido,
      returnedUnits: recon.devolvido,
      lostUnits: recon.perdido,
      craftAmount: finalized.craft_amount || 0,
      supplied,
      returned,
      lost,
      consumed,
      gross,
      net,
      was_profitable,
      mvp: scoredParticipants.find(p => p.mvp_flag)?.member_id || null,
      characterized_count,
      workers_count,
      totalKills,
      totalDeaths,
      totalSurvivors,
      unaccounted: recon.unaccounted,
      actorId,
      at: new Date(),
    })
    .catch(e => warn(`[EVENT] saida.closed: ${e.message}`));

  return {
    ...finalized,
    reconciliation: recon,
    participants: scoredParticipants,
    values: { supplied, returned, lost, consumed, gross, net, was_profitable },
    totalKills,
    totalDeaths,
    totalSurvivors,
  };
}

/**
 * Verifica quantos participantes já preencheram resultado individual.
 * Retorna { total, submitted, pending, allDone }.
 */
async function getResultProgress(saidaId) {
  const participants = await saidaRepo.getParticipants(saidaId);
  const submitted = participants.filter(p => p.individual_result_submitted).length;
  const total = participants.length;
  return {
    total,
    submitted,
    pending: total - submitted,
    allDone: submitted >= total && total > 0,
    participants,
  };
}

async function reconcileSaidaMaterials(saidaId) {
  const summary = await saidaRepo.getMaterialSummary(saidaId);
  const fornecido = summary.fornecido?.total || 0;
  const devolvido = summary.devolvido?.total || 0;
  const perdido = summary.perdido?.total || 0;
  const consumido = summary.consumido?.total || 0;
  return {
    fornecido,
    devolvido,
    perdido,
    consumido,
    unaccounted: Math.max(0, fornecido - devolvido - perdido - consumido),
  };
}

async function _resolveOrCreateMember(discordId, guild = null) {
  let member = await memberRepo.findByDiscordId(discordId);
  if (member) return member;
  let display = '',
    username = '';
  if (guild) {
    const gm = await guild.members.fetch(discordId).catch(() => null);
    if (gm) {
      display = gm.displayName || gm.user?.username || '';
      username = gm.user?.username || '';
    }
  }
  member = await memberRepo.create({
    discordId,
    username: username || discordId,
    displayName: display || username || `member-${discordId}`,
    role: 'bairrista',
  });
  warn(`[SAIDA] Membro ${discordId} não estava na DB — criado automaticamente.`);
  return member;
}

// Estados em que inscrição é permitida — só enquanto a saída está aberta
// ou em preparação. Em curso/concluída/cancelada = rejeita.
const PARTICIPATION_ALLOWED_STATUSES = new Set(['aberta', 'em_preparacao']);

async function addParticipant(saidaId, discordId, data, actorId, guild = null) {
  const member = await _resolveOrCreateMember(discordId, guild);

  const saida = await saidaRepo.findById(saidaId);
  if (!saida) throw new Error(`Saída #${saidaId} não existe.`);

  // Guard 1: status da saída
  if (!PARTICIPATION_ALLOWED_STATUSES.has(saida.status)) {
    throw new Error(`Saída #${saidaId} já está "${saida.status}" — inscrições fechadas.`);
  }

  const participantType = data.participantType || 'caracterizado';

  // Guard 2: dupla inscrição silenciosa. Se o user já está inscrito
  // (qualquer tipo, qualquer arma), rejeita. Tem de cancelar o registo
  // primeiro via "Cancelar Registo" no painel da saída.
  // Antes, ON CONFLICT DO UPDATE permitia re-inscrição → mudança de
  // tipo / arma sem audit. Ex.: inscrito com "Arma da Org: Bullpup Rifle"
  // → clica outra vez → pica "Arma Própria: X" → fica com X sem audit.
  const existing = (await saidaRepo.getParticipants(saidaId)).find(p => p.member_id === member.id);
  if (existing) {
    const currentType = existing.participant_type;
    throw new Error(
      `Já estás inscrito como **${currentType}** nesta saída. ` +
        'Se queres mudar (tipo ou arma), usa **"Cancelar Registo"** no painel da saída e volta a inscrever-te.'
    );
  }

  // Guard 3: limite 12 caracterizados.
  if (participantType === 'caracterizado') {
    const maxCharacterized = saida.max_participants || 12;
    const currentCount = await saidaRepo.countCharacterized(saidaId);
    if (currentCount >= maxCharacterized) {
      throw new Error(`Limite de ${maxCharacterized} caracterizados atingido. Regista-te como trabalhador.`);
    }
  }

  const participant = await saidaRepo.addParticipant(saidaId, member.id, {
    ...data,
    participantType,
  });

  await logAudit({
    action: 'saida_participant_added',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId,
    afterState: { memberId: member.id, displayName: member.display_name, participantType },
  });

  // Event bus — dispara projection para sheet 'saidas' (debounce 5s).
  eventBus
    .emitAsync('saida.participant_added', {
      saidaId,
      memberId: member.id,
      discordId,
      participantType,
      at: new Date(),
    })
    .catch(e => warn(`[EVENT] saida.participant_added: ${e.message}`));

  return participant;
}

async function updateParticipantResult(saidaId, discordId, fields, actorId) {
  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) throw new Error('Membro não encontrado.');
  return saidaRepo.updateParticipant(saidaId, member.id, fields);
}

async function registerSaidaMaterial(saidaId, itemId, direction, quantity, discordId, notes, actorId) {
  let memberId = null;
  if (discordId) {
    const member = await memberRepo.findByDiscordId(discordId);
    if (member) memberId = member.id;
  }
  const mat = await saidaRepo.addMaterial(saidaId, itemId, direction, quantity, memberId, notes);
  const movementType = MOVEMENT_TYPE_BY_DIRECTION[direction] || 'consumo_saida';

  await inventoryRepo.recordMovement({
    movementType,
    itemId,
    quantity,
    memberId,
    memberRole: '',
    origin: direction === 'fornecido' ? 'org' : 'saida',
    destination: direction === 'devolvido' ? 'org' : 'saida',
    context: `Saída #${saidaId}`,
    notes,
    operationId: saidaId, // a coluna está renomeada para saida_id na DB
    createdBy: actorId,
  });

  await logAudit({
    action: 'saida_material',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId,
    afterState: { itemId, direction, quantity },
  });

  _notifyMovement({ movementType, itemId, quantity, memberId, saidaId, actorId, notes });
  return mat;
}

async function getSaidaSummary(saidaId) {
  const [saida, participants, materials, materialSummary] = await Promise.all([
    saidaRepo.findById(saidaId),
    saidaRepo.getParticipants(saidaId),
    saidaRepo.getMaterials(saidaId),
    saidaRepo.getMaterialSummary(saidaId),
  ]);
  if (!saida) return null;
  return {
    saida,
    participants,
    materials,
    materialSummary,
    participantCount: participants.length,
    survivors: participants.filter(p => p.survived).length,
    deaths: participants.filter(p => p.died).length,
    returned: participants.filter(p => p.returned).length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CADEIA DE CUSTÓDIA POR PARTICIPANTE
// ═══════════════════════════════════════════════════════════════════════════

async function issueMaterialToParticipant(saidaId, discordId, itemId, quantity, actorId, notes = '', guild = null) {
  if (!quantity || quantity <= 0) throw new Error('Quantidade inválida.');

  // Guard: saída tem de estar aberta/em_curso/preparação. Não se fornece material
  // a uma saída já fechada ou cancelada.
  const saida = await saidaRepo.findById(saidaId);
  if (!saida) throw new Error(`Saída #${saidaId} não existe.`);
  if (['concluida', 'cancelada'].includes(saida.status)) {
    throw new Error(`Saída #${saidaId} está ${saida.status} — não aceita mais material.`);
  }

  const member = await _resolveOrCreateMember(discordId, guild);

  // Guard: participante já marcado como morto/liquidado na saída não recebe
  // mais material. Evita reconciliação falsa em saídas multi-etapa.
  const participants = await saidaRepo.getParticipants(saidaId);
  const existing = participants.find(p => p.member_id === member.id);
  if (existing && (existing.died === true || existing.settled === true)) {
    throw new Error(
      `${member.display_name || discordId} já está ${existing.died ? 'marcado como morto' : 'liquidado'} nesta saída.`
    );
  }

  await saidaRepo.addParticipant(saidaId, member.id, {
    roleInSaida: 'membro',
    broughtOwn: false,
    receivedOrg: true,
    notes,
  });
  await saidaRepo.updateParticipant(saidaId, member.id, { material_source: 'org' });
  await saidaRepo.addMaterial(saidaId, itemId, 'fornecido', quantity, member.id, `Fornecimento a <@${discordId}>`);

  await inventoryRepo.recordMovement({
    movementType: 'fornecimento_org',
    itemId,
    quantity,
    memberId: member.id,
    memberRole: member.role,
    origin: 'org',
    destination: `participante:${discordId}`,
    context: `Saída #${saidaId}`,
    notes,
    operationId: saidaId,
    createdBy: actorId,
  });

  await logAudit({
    action: 'saida_material_issued',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId,
    afterState: { member: discordId, itemId, quantity },
  });

  _notifyMovement({ movementType: 'fornecimento_org', itemId, quantity, memberId: member.id, saidaId, actorId, notes });

  // Event bus — dispara projection para sheets 'saidas' + 'stock'.
  eventBus
    .emitAsync('saida.material_issued', {
      saidaId,
      memberId: member.id,
      discordId,
      itemId,
      quantity,
      actorId,
      at: new Date(),
    })
    .catch(e => warn(`[EVENT] saida.material_issued: ${e.message}`));

  return { saidaId, member: discordId, itemId, quantity };
}

async function settleParticipantCustody(saidaId, discordId, outcome, actorId, guild = null) {
  const member = await _resolveOrCreateMember(discordId, guild);

  const returned = outcome.returnedItems || [];
  const lost = outcome.lostItems || [];
  const diedWith = outcome.diedWithItems || [];

  let totalReturnedQty = 0,
    totalLostQty = 0;

  for (const r of returned) {
    if (!r.itemId || !r.qty || r.qty <= 0) continue;
    totalReturnedQty += r.qty;
    await saidaRepo.addMaterial(saidaId, r.itemId, 'devolvido', r.qty, member.id, `Devolvido por <@${discordId}>`);
    await inventoryRepo.recordMovement({
      movementType: 'devolucao_saida',
      itemId: r.itemId,
      quantity: r.qty,
      memberId: member.id,
      memberRole: member.role,
      origin: `participante:${discordId}`,
      destination: 'org',
      context: `Saída #${saidaId} — devolução`,
      operationId: saidaId,
      createdBy: actorId,
    });
    _notifyMovement({
      movementType: 'devolucao_saida',
      itemId: r.itemId,
      quantity: r.qty,
      memberId: member.id,
      saidaId,
      actorId,
      notes: 'devolução',
    });
  }

  for (const r of lost) {
    if (!r.itemId || !r.qty || r.qty <= 0) continue;
    totalLostQty += r.qty;
    await saidaRepo.addMaterial(saidaId, r.itemId, 'perdido', r.qty, member.id, `Perdido por <@${discordId}>`);
    await inventoryRepo.recordMovement({
      movementType: 'perda_saida',
      itemId: r.itemId,
      quantity: r.qty,
      memberId: member.id,
      memberRole: member.role,
      origin: `participante:${discordId}`,
      destination: 'perdido',
      context: `Saída #${saidaId} — perda`,
      operationId: saidaId,
      createdBy: actorId,
    });
    _notifyMovement({
      movementType: 'perda_saida',
      itemId: r.itemId,
      quantity: r.qty,
      memberId: member.id,
      saidaId,
      actorId,
      notes: 'perda',
    });
  }

  for (const r of diedWith) {
    if (!r.itemId || !r.qty || r.qty <= 0) continue;
    totalLostQty += r.qty;
    await saidaRepo.addMaterial(
      saidaId,
      r.itemId,
      'perdido',
      r.qty,
      member.id,
      `Morreu com material (<@${discordId}>)`
    );
    await inventoryRepo.recordMovement({
      movementType: 'perda_saida',
      itemId: r.itemId,
      quantity: r.qty,
      memberId: member.id,
      memberRole: member.role,
      origin: `participante:${discordId}`,
      destination: 'perdido_morte',
      context: `Saída #${saidaId} — morto com material`,
      operationId: saidaId,
      createdBy: actorId,
    });
    _notifyMovement({
      movementType: 'perda_saida',
      itemId: r.itemId,
      quantity: r.qty,
      memberId: member.id,
      saidaId,
      actorId,
      notes: 'morto com material',
    });
  }

  await saidaRepo.updateParticipant(saidaId, member.id, {
    died: outcome.died ?? false,
    survived: outcome.survived ?? !outcome.died,
    returned: outcome.returned ?? !outcome.died,
    returned_material: totalReturnedQty > 0,
    material_returned_qty: totalReturnedQty,
    material_lost_qty: totalLostQty,
  });

  await logAudit({
    action: 'saida_custody_settled',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId,
    afterState: { member: discordId, returned: totalReturnedQty, lost: totalLostQty, died: outcome.died },
  });

  return { member: discordId, returnedQty: totalReturnedQty, lostQty: totalLostQty };
}

module.exports = {
  setClient,
  createSaida,
  startSaida,
  closeSaida,
  finalizeSaida,
  cancelSaida,
  addParticipant,
  updateParticipantResult,
  registerSaidaMaterial,
  issueMaterialToParticipant,
  settleParticipantCustody,
  getSaidaSummary,
  reconcileSaidaMaterials,
  getResultProgress,
  MOVEMENT_TYPE_BY_DIRECTION,
  ALLOWED_TRANSITIONS,
  _assertTransition,
};
