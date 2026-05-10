'use strict';
/**
 * SaidaService — serviço centralizado do domínio "saídas".
 *
 * Responsabilidades:
 *   - criar saída (transaction + lifecycle.onCreated)
 *   - registar participante
 *   - submeter resultado individual
 *   - finalizar saída (scoring + PvP rating + publicação)
 *   - consultar progresso de liquidação
 *
 * Nota: BaseService não existe no projecto; segue-se o padrão de
 * OrderService (classe plain com deps no constructor).
 */

const { queryWithTransaction } = require('../db');
const { saidaRepo, memberRepo } = require('../repositories');
const { log, warn } = require('../logger');
const eventBus = require('../core/eventBus');
const { NotFoundError, ConflictError, ValidationError } = require('../shared/errors');
const { computeSaidaScores } = require('./saidaScoring');
const { assertTransition } = require('./saidaStateMachine');

class SaidaService {
  constructor(deps) {
    this.saidaRepo = deps.saidaRepo || saidaRepo;
    this.memberRepo = deps.memberRepo || memberRepo;
    this.lifecycle = deps.lifecycle;
    this.publisher = deps.publisher;
    this.pvPRating = deps.pvPRating;
  }

  async create({ date, scheduledTime, spot, saidaType, notes, createdBy }) {
    const saida = await queryWithTransaction(async client => {
      const created = await this.saidaRepo.create({
        date,
        scheduledTime,
        spot,
        spotType: '',
        saidaType,
        leaderId: null,
        groupNumber: 1,
        maxParticipants: 12,
        notes,
        createdBy,
        client,
      });
      return created;
    });

    if (this.lifecycle) {
      this.lifecycle.onCreated(saida.id);
    }

    eventBus
      .emitAsync('saida.opened', {
        saidaId: saida.id,
        date,
        scheduledTime,
        spot,
        saidaType,
        actorId: createdBy,
        at: new Date(),
      })
      .catch(e => warn(`[EVENT] saida.opened: ${e.message}`));

    log(`[SAIDA-SERVICE] Criada saída #${saida.id} por ${createdBy}`);
    return saida;
  }

  async register({ saidaId, discordId, type, weaponItemId, weaponSource }) {
    const saida = await this.saidaRepo.findById(saidaId);
    if (!saida) throw new NotFoundError(`Saída #${saidaId} não existe.`, { code: 'SAIDA_NOT_FOUND' });

    const allowedStatuses = new Set(['criada', 'trancagem', 'em_preparacao']);
    if (!allowedStatuses.has(saida.status)) {
      throw new ConflictError(`Saída #${saidaId} já está fechada — inscrições encerradas.`, { code: 'SAIDA_CLOSED' });
    }

    const member = await this.memberRepo.findByDiscordId(discordId);
    if (!member) throw new NotFoundError('Membro não encontrado.', { code: 'MEMBER_NOT_FOUND' });

    const existing = (await this.saidaRepo.getParticipants(saidaId)).find(p => p.member_id === member.id);
    if (existing) {
      throw new ConflictError(
        `Já estás inscrito como **${existing.participant_type}** nesta saída. ` +
          'Se queres mudar, cancela o registo primeiro.',
        { code: 'SAIDA_ALREADY_REGISTERED' }
      );
    }

    const participantType = type || 'caracterizado';
    if (participantType === 'caracterizado') {
      const maxChar = saida.max_participants || 12;
      const currentCount = await this.saidaRepo.countCharacterized(saidaId);
      if (currentCount >= maxChar) {
        throw new ConflictError(`Limite de ${maxChar} caracterizados atingido.`, { code: 'SAIDA_FULL' });
      }
    }

    const participant = await this.saidaRepo.addParticipant(saidaId, member.id, {
      participantType,
      ownWeapon: weaponSource === 'own',
      broughtOwn: weaponSource === 'own',
      receivedOrgMaterial: weaponSource === 'org',
      weaponItemId: weaponItemId || null,
    });

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

  async submitResult({ saidaId, memberId, survived, kills, weaponReturned, notes }) {
    const saida = await this.saidaRepo.findById(saidaId);
    if (!saida) throw new NotFoundError(`Saída #${saidaId} não existe.`, { code: 'SAIDA_NOT_FOUND' });
    if (saida.status !== 'em_liquidacao') {
      throw new ConflictError('Só é possível submeter resultados em liquidação.', { code: 'SAIDA_NOT_LIQUIDACAO' });
    }

    const participants = await this.saidaRepo.getParticipants(saidaId);
    const me = participants.find(p => p.member_id === memberId);
    if (!me) throw new NotFoundError('Participante não encontrado nesta saída.', { code: 'PARTICIPANT_NOT_FOUND' });

    const died = !survived;
    const weaponStatus = this._determineWeaponStatus(died, weaponReturned);

    await this.saidaRepo.updateParticipant(saidaId, memberId, {
      kills: Number(kills) || 0,
      died,
      survived: !died,
      deaths_count: died ? 1 : 0,
      notes: notes || '',
      individual_result_submitted: true,
      individual_result_at: new Date(),
      weapon_return_status: weaponStatus,
    });

    const progress = await this.getResultProgress(saidaId);
    if (progress.allDone && this.lifecycle) {
      this.lifecycle.onAllResultsSubmitted(saidaId);
    }

    eventBus
      .emitAsync('saida.result_submitted', {
        saidaId,
        memberId,
        survived,
        kills,
        at: new Date(),
      })
      .catch(e => warn(`[EVENT] saida.result_submitted: ${e.message}`));

    return progress;
  }

  async finalize(saidaId, actorId) {
    await assertTransition(saidaId, 'concluida');

    const saida = await this.saidaRepo.findById(saidaId);
    const participants = await this.saidaRepo.getParticipants(saidaId);
    const summary = await this.saidaRepo.getMaterialSummary(saidaId);

    // Valores económicos
    const supplied = summary.fornecido?.weightedTotal || 0;
    const returned = summary.devolvido?.weightedTotal || 0;
    const lost = summary.perdido?.weightedTotal || 0;
    const consumed = summary.consumido?.weightedTotal || 0;
    const net = returned - lost - consumed;
    const was_profitable = net > 0;

    const totalKills = participants.reduce((a, p) => a + (p.kills || 0), 0);
    const totalDeaths = participants.filter(p => p.died).length;
    const totalSurvivors = participants.filter(p => !p.died).length;

    // Scores + MVP
    const scoredParticipants = computeSaidaScores({
      participants,
      result: saida.result || 'sem_conflito',
      suppliedTotal: supplied,
    });

    await Promise.all(
      scoredParticipants.map(p =>
        this.saidaRepo.updateParticipant(saidaId, p.member_id, {
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

    // Aplica PvP rating
    if (this.pvPRating) {
      for (const p of scoredParticipants) {
        await this.pvPRating
          .applyRatingChange(p.member_id, {
            kills: p.kills,
            survived: p.survived,
            victory: saida.result === 'vitoria',
            mvp: p.mvp_flag,
            hadFight: !!saida.had_fight,
          })
          .catch(e => warn(`[SAIDA-SERVICE] PvP rating falhou (${p.member_id}): ${e.message}`));
      }
    }

    const characterized_count = participants.filter(p => p.participant_type === 'caracterizado').length;
    const workers_count = participants.filter(p => p.participant_type === 'trabalhador').length;

    const finalized = await this.saidaRepo.closeSaida(saidaId, {
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
      gross_value: returned,
      net_value: net,
      was_profitable,
      characterized_count,
      workers_count,
    });

    // Publica resultados
    if (this.publisher) {
      this.publisher.publish(saidaId).catch(e => warn(`[SAIDA-SERVICE] publish falhou: ${e.message}`));
    }

    eventBus
      .emitAsync('saida.closed', {
        saidaId,
        spot: finalized.spot,
        saidaType: finalized.operation_type,
        result: finalized.result,
        participantsCount: scoredParticipants.length,
        supplied,
        returned,
        lost,
        consumed,
        net,
        was_profitable,
        mvp: scoredParticipants.find(p => p.mvp_flag)?.member_id || null,
        totalKills,
        totalDeaths,
        totalSurvivors,
        actorId,
        at: new Date(),
      })
      .catch(e => warn(`[EVENT] saida.closed: ${e.message}`));

    log(`[SAIDA-SERVICE] Saída #${saidaId} finalizada por ${actorId}.`);
    return {
      ...finalized,
      participants: scoredParticipants,
      values: { supplied, returned, lost, consumed, net, was_profitable },
      totalKills,
      totalDeaths,
      totalSurvivors,
    };
  }

  _determineWeaponStatus(died, weaponReturned) {
    if (died) return 'confirmed_not_returned';
    return weaponReturned ? 'declared_returned' : 'confirmed_not_returned';
  }

  async getResultProgress(saidaId) {
    const participants = await this.saidaRepo.getParticipants(saidaId);
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
}

module.exports = { SaidaService };
