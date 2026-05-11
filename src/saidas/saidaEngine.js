'use strict';
/**
 * Sa├¡da engine ÔÇö motor do dom├¡nio "sa├¡das" (antes operations).
 *
 * Responsabilidades:
 *   - ciclo de vida da sa├¡da (criar, iniciar, cancelar, fechar)
 *   - cadeia de cust├│dia de material por participante
 *   - no fecho: c├ílculo de valores econ├│micos (supplied/returned/lost/consumed/
 *     gross/net/was_profitable), scores de performance e disciplina, MVP,
 *     actualiza├º├úo de spot_stats e member_saida_stats
 *   - reconcilia├º├úo (material unaccounted)
 *
 * Nomes de movement_type e de tabelas mant├¬m-se operation_* na DB (decis├úo
 * de baixo risco) ÔÇö semanticamente s├úo sa├¡das.
 */

const { saidaRepo, memberRepo, inventoryRepo, spotStatsRepo, memberSaidaStatsRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const { notifyMovement } = require('../inventory/stockNotifier');
const { computeSaidaScores } = require('./saidaScoring');
const { ALLOWED_TRANSITIONS, assertTransition: _assertTransition } = require('./saidaStateMachine');
const metrics = require('../lib/metrics');
const { log, warn } = require('../logger');
const eventBus = require('../core/eventBus');
const { NotFoundError, ConflictError, ValidationError } = require('../shared/errors');

// Cliente Discord injectado no boot. Usado apenas para publicar resultados
// ricos no fecho de sa├¡da (fire-and-forget). Se n├úo estiver definido,
// closeSaida funciona na mesma e o publish ├® no-op silencioso.
let _client = null;
function setClient(client) {
  _client = client;
}

// Movement types ligados a sa├¡das (renomeados pela migration #11)
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
  force = false,
}) {
  // Spot cooldown guard: se h├í cooldown activo neste spot, bloquear
  // (excepto com force=true ÔÇö reservado para comandos staff-only).
  if (spot && !force) {
    const spotCooldown = require('./spotCooldown');
    const status = await spotCooldown.getStatus(spot);
    if (status.active) {
      const remaining = spotCooldown.formatRemaining(status.remainingMs);
      throw new ConflictError(
        `Spot "${spot}" em cooldown ÔÇö ainda faltam ${remaining} (sa├¡da anterior #${status.saidaId || 'ÔÇö'}).`,
        { code: 'SPOT_COOLDOWN' }
      );
    }
  }

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

  // Arranca cooldown do spot + posta notifica├º├úo p├║blica.
  // Fire-and-forget: se falha, n├úo aborta a cria├º├úo (sa├¡da j├í foi gravada).
  if (spot) {
    const spotCooldown = require('./spotCooldown');
    const { SAIDA_TYPE } = require('../content');
    let leaderName = 'ÔÇö';
    if (leaderId) {
      const leader = await memberRepo.findById(leaderId).catch(() => null);
      if (leader) leaderName = leader.display_name || leader.username;
    } else if (createdBy) {
      const creator = await memberRepo.findByDiscordId(createdBy).catch(() => null);
      if (creator) leaderName = creator.display_name || creator.username;
    }
    spotCooldown
      .startCooldown({
        spot,
        saidaId: s.id,
        saidaType: SAIDA_TYPE[saidaType] || saidaType,
        leaderName,
      })
      .catch(e => warn(`[SAIDA] Cooldown falhou para "${spot}": ${e.message}`));
  }

  // Event bus ÔÇö notification routing publica em SAIDAS_EVENTS.
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
  const before = await _assertTransition(saidaId, 'cancelada');
  const s = await saidaRepo.updateStatus(saidaId, 'cancelada');
  await logAudit({
    action: 'saida_cancelled',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId,
  });

  // Liberta o cooldown do spot (se ainda pertencer a esta sa├¡da) ÔÇö sem isto
  // ficaria bloqueado at├® expirar o TTL, mesmo j├í cancelada.
  if (before.spot) {
    const spotCooldown = require('./spotCooldown');
    spotCooldown
      .releaseCooldownForSaida(before.spot, saidaId)
      .catch(e => warn(`[SAIDA] releaseCooldown falhou para "${before.spot}": ${e.message}`));
  }

  return s;
}

/**
 * Fecha sa├¡da ÔÇö transita para 'em_liquidacao'. Guarda metadata de resultado
 * (enemy, had_fight, craft, etc.) mas N├âO faz scoring, N├âO publica, N├âO
 * actualiza stats. Os participantes preenchem os seus resultados individuais
 * neste estado. Quando staff finaliza, finalizeSaida() faz o resto.
 */
async function closeSaida(saidaId, resultData, actorId) {
  const saida = await saidaRepo.findById(saidaId);
  if (!saida) throw new NotFoundError(`Sa├¡da #${saidaId} n├úo existe.`, { code: 'SAIDA_NOT_FOUND' });
  if (saida.status === 'concluida') {
    throw new ConflictError(`Sa├¡da #${saidaId} j├í est├í conclu├¡da ÔÇö n├úo pode ser fechada novamente.`, {
      code: 'SAIDA_ALREADY_CLOSED',
    });
  }
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

  log(`[SAIDA] Sa├¡da #${saidaId} em liquida├º├úo. result=${resultData.result} participantes=${participants.length}`);

  // Event bus ÔÇö notifica que a sa├¡da entrou em liquida├º├úo
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
 * Finaliza sa├¡da ÔÇö transita de 'em_liquidacao' para 'concluida'.
 * Calcula scores com dados reais dos participantes (kills, deaths, weapon
 * return), actualiza projections (spot_stats, member_saida_stats) e publica
 * resultados ricos.
 */
async function finalizeSaida(saidaId, actorId) {
  await _assertTransition(saidaId, 'concluida');
  const summary = await saidaRepo.getMaterialSummary(saidaId);
  const participants = await saidaRepo.getParticipants(saidaId);
  const saida = await saidaRepo.findById(saidaId);

  // Valores econ├│micos
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

  // Scores + MVP (delegado a saidaScoring) ÔÇö agora com dados REAIS
  const scoredParticipants = computeSaidaScores({
    participants,
    result: saida.result || 'sem_conflito',
    suppliedTotal: supplied,
  });

  // Persiste scores per-participant (batch paralelo)
  await Promise.all(
    scoredParticipants.map(p =>
      saidaRepo.updateParticipant(saidaId, p.member_id, {
        issued_value: p.issued_value,
        returned_value: p.returned_value,
        lost_value: p.lost_value,
        consumed_value: p.consumed_value,
        net_material_delta: p.net_material_delta,
        performance_score: p.performance_score,
        discipline_score: p.discipline_score,
        mvp_flag: p.mvp_flag,
      })
    )
  );

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

  // Actualiza member_saida_stats (incremental, per-participante ÔÇö batch paralelo)
  await Promise.all(
    scoredParticipants.map(p =>
      memberSaidaStatsRepo
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
        .catch(e => warn(`[SAIDA] memberStats falhou (${p.member_id}): ${e.message}`))
    )
  );

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
    context: recon.unaccounted > 0 ? `Fechou com ${recon.unaccounted} unidades n├úo contabilizadas.` : undefined,
  });

  log(
    `[SAIDA] Sa├¡da #${saidaId} finalizada. result=${finalized.result} kills=${totalKills} deaths=${totalDeaths} net=${net.toFixed(2)}Ôé¼`
  );

  // Publica resultados ricos ÔÇö fire-and-forget
  if (_client) {
    const { publishResults } = require('./saidaResultsPublisher');
    publishResults(_client, saidaId).catch(e => warn(`[SAIDA] publishResults: ${e.message}`));

    // Cleanup: apaga a mensagem do painel vivo no canal operacional.
    // S├│ o embed rico no canal de RESULTS permanece como arquivo. Canal
    // operacional fica limpo automaticamente no conclude (pedido do user).
    if (saida.session_message_id && saida.session_channel_id) {
      (async () => {
        try {
          const channel = await _client.channels.fetch(saida.session_channel_id).catch(() => null);
          if (channel?.isTextBased?.()) {
            const msg = await channel.messages.fetch(saida.session_message_id).catch(() => null);
            if (msg) {
              await msg.delete();
              log(`[SAIDA] Painel da sa├¡da #${saidaId} apagado do canal operacional.`);
            }
          }
        } catch (e) {
          warn(`[SAIDA] cleanup session message #${saidaId} falhou: ${e.message}`);
        }
      })().catch(() => {});
    }
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
 * Verifica o progresso de liquida├º├úo de uma sa├¡da.
 *
 * `allDone` = todos os resultados individuais submetidos **E** nenhuma arma
 * em estado `declared_returned` (que requer confirma├º├úo staff OG+ via
 * "Confirmar Armas"). Auto-finalize s├│ arranca quando `allDone = true`;
 * manual finalize pode for├ºar.
 *
 * Retorna { total, submitted, pending, pendingWeapons, allDone, participants }.
 */
async function getResultProgress(saidaId) {
  const participants = await saidaRepo.getParticipants(saidaId);
  const total = participants.length;
  const submitted = participants.filter(p => p.individual_result_submitted).length;
  const pendingWeapons = participants.filter(p => p.weapon_return_status === 'declared_returned').length;
  return {
    total,
    submitted,
    pending: total - submitted,
    pendingWeapons,
    allDone: submitted >= total && total > 0 && pendingWeapons === 0,
    participants,
  };
}

/**
 * Job peri├│dico: auto-rejeita pedidos `requested` mais antigos que
 * SAIDA_REQUEST_TTL_MINUTES (default 15min). S├│ actua sobre sa├¡das ainda
 * em estados activos; pedidos de sa├¡das j├í canceladas/conclu├¡das s├úo
 * deixados em paz (ser├úo limpos por cascade em operations.delete).
 *
 * DM ao requester a avisar ÔÇö melhor que sil├¬ncio.
 *
 * Idempotente: correr N vezes n├úo parte nada.
 */
async function expireStaleRequests(client) {
  const CONFIG = require('../config');
  const { query } = require('../db');
  const ttlMin = Number(CONFIG.SAIDA_REQUEST_TTL_MINUTES || 15);
  if (!(ttlMin > 0)) return { expired: 0 };

  const stale = await query(
    `SELECT op.id, op.operation_id, op.member_id, m.discord_id, m.display_name,
            o.status, o.spot, o.created_by
       FROM operation_participants op
       JOIN operations o ON o.id = op.operation_id
       JOIN members m ON m.id = op.member_id
      WHERE op.participant_type = 'requested'
        AND op.created_at < NOW() - ($1::int * INTERVAL '1 minute')
        AND o.status IN ('criada','em_preparacao','em_curso')`,
    [ttlMin]
  );

  let expired = 0;
  for (const row of stale.rows) {
    try {
      const del = await query(
        `DELETE FROM operation_participants
          WHERE id = $1 AND participant_type = 'requested'`,
        [row.id]
      );
      if (del.rowCount === 0) continue;
      expired++;
      await logAudit({
        action: 'saida_request_expired',
        entityType: 'saida',
        entityId: String(row.operation_id),
        actorId: 'system:auto',
        afterState: { memberId: row.member_id, displayName: row.display_name, ttlMin },
      });

      if (client && row.discord_id) {
        (async () => {
          try {
            const user = await client.users.fetch(row.discord_id).catch(() => null);
            if (user) {
              await user
                .send({
                  content:
                    `ÔÅ▒´©Å O teu pedido para entrar na sa├¡da #${row.operation_id}${row.spot ? ` (${row.spot})` : ''} ` +
                    `expirou (> ${ttlMin} min sem resposta da chefia).\n` +
                    'Se ainda queres juntar-te, clica **"Pedir para Juntar"** outra vez no painel.',
                })
                .catch(() => {});
            }
          } catch (_) {
            /* non-fatal */
          }
        })().catch(() => {});
      }

      // Refresh painel da sa├¡da afectada para remover da lista de requested.
      if (client) {
        const saidaSession = require('./saidaSession');
        saidaSession.refreshSessionEmbed(client, row.operation_id).catch(() => {});
      }
    } catch (e) {
      warn(`[SAIDA-REQUEST-EXPIRER] participant #${row.id} falhou: ${e.message}`);
    }
  }

  if (expired > 0) log(`[SAIDA-REQUEST-EXPIRER] ${expired} pedido(s) expirado(s) ap├│s ${ttlMin}min.`);
  return { expired };
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
  warn(`[SAIDA] Membro ${discordId} n├úo estava na DB ÔÇö criado automaticamente.`);
  return member;
}

// Estados em que inscri├º├úo ├® permitida ÔÇö s├│ enquanto a sa├¡da est├í aberta
// ou em prepara├º├úo. Em curso/conclu├¡da/cancelada = rejeita.
const PARTICIPATION_ALLOWED_STATUSES = new Set(['criada', 'em_preparacao']);

async function addParticipant(saidaId, discordId, data, actorId, guild = null) {
  const member = await _resolveOrCreateMember(discordId, guild);

  const saida = await saidaRepo.findById(saidaId);
  if (!saida) throw new NotFoundError(`Sa├¡da #${saidaId} n├úo existe.`, { code: 'SAIDA_NOT_FOUND' });

  // Guard 1: status da sa├¡da
  if (!PARTICIPATION_ALLOWED_STATUSES.has(saida.status)) {
    throw new ConflictError(`Sa├¡da #${saidaId} j├í est├í fechada ÔÇö inscri├º├Áes encerradas.`, {
      code: 'SAIDA_CLOSED',
    });
  }

  const participantType = data.participantType || 'caracterizado';

  // Guard 2: dupla inscri├º├úo silenciosa. Se o user j├í est├í inscrito
  // (qualquer tipo, qualquer arma), rejeita. Tem de cancelar o registo
  // primeiro via "Cancelar Registo" no painel da sa├¡da.
  // Antes, ON CONFLICT DO UPDATE permitia re-inscri├º├úo ÔåÆ mudan├ºa de
  // tipo / arma sem audit. Ex.: inscrito com "Arma da Org: Bullpup Rifle"
  // ÔåÆ clica outra vez ÔåÆ pica "Arma Pr├│pria: X" ÔåÆ fica com X sem audit.
  const existing = (await saidaRepo.getParticipants(saidaId)).find(p => p.member_id === member.id);
  if (existing) {
    const currentType = existing.participant_type;
    throw new ConflictError(
      `J├í est├ís inscrito como **${currentType}** nesta sa├¡da. ` +
        'Se queres mudar (tipo ou arma), usa **"Cancelar Registo"** no painel da sa├¡da e volta a inscrever-te.',
      { code: 'SAIDA_ALREADY_REGISTERED' }
    );
  }

  // Guard 3: limite 12 caracterizados.
  if (participantType === 'caracterizado') {
    const maxCharacterized = saida.max_participants || 12;
    const currentCount = await saidaRepo.countCharacterized(saidaId);
    if (currentCount >= maxCharacterized) {
      throw new ConflictError(`Limite de ${maxCharacterized} caracterizados atingido. Regista-te como trabalhador.`, {
        code: 'SAIDA_FULL',
      });
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

  // Event bus ÔÇö dispara projection para sheet 'saidas' (debounce 5s).
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

async function updateParticipantResult(saidaId, discordId, fields, _actorId) {
  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) throw new NotFoundError('Membro n├úo encontrado.', { code: 'MEMBER_NOT_FOUND' });
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
    context: `Sa├¡da #${saidaId}`,
    notes,
    operationId: saidaId, // a coluna est├í renomeada para saida_id na DB
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

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// CADEIA DE CUST├ôDIA POR PARTICIPANTE
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

async function issueMaterialToParticipant(saidaId, discordId, itemId, quantity, actorId, notes = '', guild = null) {
  if (!quantity || quantity <= 0) throw new ValidationError('Quantidade inv├ílida.', { code: 'INVALID_QUANTITY' });

  // Guard: sa├¡da tem de estar aberta/em_curso/prepara├º├úo. N├úo se fornece material
  // a uma sa├¡da j├í fechada ou cancelada.
  const saida = await saidaRepo.findById(saidaId);
  if (!saida) throw new NotFoundError(`Sa├¡da #${saidaId} n├úo existe.`, { code: 'SAIDA_NOT_FOUND' });
  if (['concluida', 'cancelada'].includes(saida.status)) {
    throw new ConflictError(`Sa├¡da #${saidaId} est├í fechada ÔÇö n├úo aceita mais material.`, {
      code: 'SAIDA_CLOSED',
    });
  }

  const member = await _resolveOrCreateMember(discordId, guild);

  // Guard: participante j├í marcado como morto/liquidado na sa├¡da n├úo recebe
  // mais material. Evita reconcilia├º├úo falsa em sa├¡das multi-etapa.
  const participants = await saidaRepo.getParticipants(saidaId);
  const existing = participants.find(p => p.member_id === member.id);
  if (existing && (existing.died === true || existing.settled === true)) {
    throw new ConflictError(
      `${member.display_name || discordId} j├í est├í ${existing.died ? 'marcado como morto' : 'liquidado'} nesta sa├¡da.`,
      { code: 'PARTICIPANT_SETTLED' }
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
    context: `Sa├¡da #${saidaId}`,
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

  // Event bus ÔÇö dispara projection para sheets 'saidas' + 'stock'.
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

  // Batch paralelo: devolu├º├Áes
  const returnedPromises = returned
    .filter(r => r.itemId && r.qty && r.qty > 0)
    .map(r => {
      totalReturnedQty += r.qty;
      return Promise.all([
        saidaRepo.addMaterial(saidaId, r.itemId, 'devolvido', r.qty, member.id, `Devolvido por <@${discordId}>`),
        inventoryRepo.recordMovement({
          movementType: 'devolucao_saida',
          itemId: r.itemId,
          quantity: r.qty,
          memberId: member.id,
          memberRole: member.role,
          origin: `participante:${discordId}`,
          destination: 'org',
          context: `Sa├¡da #${saidaId} ÔÇö devolu├º├úo`,
          operationId: saidaId,
          createdBy: actorId,
        }),
      ]).then(() =>
        _notifyMovement({
          movementType: 'devolucao_saida',
          itemId: r.itemId,
          quantity: r.qty,
          memberId: member.id,
          saidaId,
          actorId,
          notes: 'devolu├º├úo',
        })
      );
    });
  if (returnedPromises.length) await Promise.all(returnedPromises);

  // Batch paralelo: perdas
  const lostPromises = lost
    .filter(r => r.itemId && r.qty && r.qty > 0)
    .map(r => {
      totalLostQty += r.qty;
      return Promise.all([
        saidaRepo.addMaterial(saidaId, r.itemId, 'perdido', r.qty, member.id, `Perdido por <@${discordId}>`),
        inventoryRepo.recordMovement({
          movementType: 'perda_saida',
          itemId: r.itemId,
          quantity: r.qty,
          memberId: member.id,
          memberRole: member.role,
          origin: `participante:${discordId}`,
          destination: 'perdido',
          context: `Sa├¡da #${saidaId} ÔÇö perda`,
          operationId: saidaId,
          createdBy: actorId,
        }),
      ]).then(() =>
        _notifyMovement({
          movementType: 'perda_saida',
          itemId: r.itemId,
          quantity: r.qty,
          memberId: member.id,
          saidaId,
          actorId,
          notes: 'perda',
        })
      );
    });
  if (lostPromises.length) await Promise.all(lostPromises);

  // Batch paralelo: morto com material
  const diedPromises = diedWith
    .filter(r => r.itemId && r.qty && r.qty > 0)
    .map(r => {
      totalLostQty += r.qty;
      return Promise.all([
        saidaRepo.addMaterial(saidaId, r.itemId, 'perdido', r.qty, member.id, `Morreu com material (<@${discordId}>)`),
        inventoryRepo.recordMovement({
          movementType: 'perda_saida',
          itemId: r.itemId,
          quantity: r.qty,
          memberId: member.id,
          memberRole: member.role,
          origin: `participante:${discordId}`,
          destination: 'perdido_morte',
          context: `Sa├¡da #${saidaId} ÔÇö morto com material`,
          operationId: saidaId,
          createdBy: actorId,
        }),
      ]).then(() =>
        _notifyMovement({
          movementType: 'perda_saida',
          itemId: r.itemId,
          quantity: r.qty,
          memberId: member.id,
          saidaId,
          actorId,
          notes: 'morto com material',
        })
      );
    });
  if (diedPromises.length) await Promise.all(diedPromises);

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
  expireStaleRequests,
  MOVEMENT_TYPE_BY_DIRECTION,
  ALLOWED_TRANSITIONS,
  _assertTransition,
};
