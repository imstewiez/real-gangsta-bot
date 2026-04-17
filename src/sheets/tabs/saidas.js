'use strict';
/**
 * Tab Saídas & Combate — central operacional unificada.
 *   1. KPIs topo (saídas, winrate, kills, mortes, lucro, top killer, spots)
 *   2. Ledger de saídas (tabela principal)
 *   3. Subsecção participantes (tabela resumida)
 *   4. Subsecção combate (top killers, kill log recente)
 *   5. Subsecção spots (tabela agregada + tier badges)
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, mutedCell, numCell, badgeCell,
  conditionalGradient, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  rankingBlock, footerBlock, autoResizeAll,
} = require('./_common');
const {
  getSaidasFull, getParticipantsFull, getKillsFull, getKillsKPIs, getSpotsFull,
} = require('../queries');
const { growSheet } = require('../cleanup');

const SAIDAS_HEADERS = [
  'ID', 'Data', 'Hora', 'Spot', 'Tipo', 'Líder', 'Estado', 'Resultado',
  'Inimigo', 'Facção', 'Ppl', 'Caract.', 'Trab.', 'K', 'M', 'Viv.', 'Vol.',
  'Forn.(un)', 'Dev.(un)', 'Perd.(un)', 'Cons.(un)',
  'Bruto (€)', 'Líquido (€)', 'Δ', 'Notas',
];
const PART_HEADERS = [
  'Saída', 'Data', 'Spot', 'Nome', 'Tipo', 'Arma', 'Role',
  'Org?',
  'Forn.(un)', 'Dev.(un)', 'Perd.(un)', 'Cons.(un)',
  'K', 'M', 'Vivo?', 'Veio?', 'MVP', 'Perf', 'Disc', 'Notas',
];
const SPOTS_HEADERS = [
  'Spot', 'Saídas', 'V', 'D', 'E', 'N/C', 'Winrate', 'Tier',
  'Kills', 'Mortes', 'K/D',
  'Bruto', 'Líquido', 'Perdido', 'Melhor Nome', 'Última',
];
const KILLS_HEADERS = [
  'Data/Hora', 'Killer', 'Vítima', 'Facção', 'Spot', 'Saída', 'Confirmado', 'Notas',
];
const COL_COUNT = SAIDAS_HEADERS.length; // 23

function resultBadge(r) {
  const map = {
    vitoria:      { label: 'VITÓRIA', bg: COLOR.GREEN_DEEP },
    derrota:      { label: 'DERROTA', bg: COLOR.RED_DEEP },
    empate:       { label: 'EMPATE',  bg: COLOR.YELLOW_DEEP },
    sem_conflito: { label: 'NEUTRO',  bg: COLOR.GRAY_DARK },
    abortada:     { label: 'ABORT.',  bg: COLOR.GRAPHITE },
  };
  const m = map[r];
  return m ? badgeCell(m.label, m.bg) : mutedCell('—', { align: 'CENTER' });
}
function statusBadge(s) {
  const map = {
    aberta:         { label: 'ABERTA',  bg: COLOR.GREEN_DEEP },
    em_preparacao:  { label: 'PREP',    bg: COLOR.YELLOW_DEEP },
    em_curso:       { label: 'CURSO',   bg: COLOR.RED_DEEP },
    em_liquidacao:  { label: 'LIQUID.', bg: COLOR.GOLD || COLOR.YELLOW_DEEP },
    concluida:      { label: 'FECHADA', bg: COLOR.GRAPHITE },
    cancelada:      { label: 'CANCEL',  bg: COLOR.GRAY_DARK },
  };
  const m = map[s];
  return m ? badgeCell(m.label, m.bg) : bodyCell(s || '—');
}
function tierBadge(winRate) {
  if (winRate >= 0.7) return badgeCell('PREMIUM', COLOR.GREEN_DEEP);
  if (winRate >= 0.5) return badgeCell('SÓLIDO',  COLOR.YELLOW_DEEP);
  if (winRate >= 0.3) return badgeCell('MÉDIO',   COLOR.GRAY_DARK);
  return badgeCell('FRACO', COLOR.RED_DEEP);
}
function boolBadge(v) {
  if (v === true)  return badgeCell('SIM', COLOR.GREEN_DEEP);
  if (v === false) return badgeCell('NÃO', COLOR.RED_DEEP);
  return mutedCell('—', { align: 'CENTER' });
}
function mvpBadgeCell(v) {
  return v ? badgeCell('MVP', COLOR.GOLD) : mutedCell('—', { align: 'CENTER' });
}
function participantTypeBadge(t) {
  if (t === 'trabalhador') return badgeCell('TRAB.', COLOR.YELLOW_DEEP);
  return badgeCell('CARACT.', COLOR.RED_DEEP);
}
function weaponBadge(ownWeapon) {
  if (ownWeapon === true) return badgeCell('PRÓPRIA', COLOR.GREEN_DEEP);
  return badgeCell('ORG', COLOR.GRAPHITE);
}
function fmtDate(d) { try { return d ? new Date(d).toISOString().split('T')[0] : '—'; } catch { return '—'; } }
function fmtDT(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 16); } catch { return String(d); }
}

async function syncSaidas(batch, sheetId) {
  const [rows, parts, kpiK, kills, spots] = await Promise.all([
    getSaidasFull(500), getParticipantsFull(2000), getKillsKPIs(),
    getKillsFull(500), getSpotsFull(),
  ]);

  // ── KPIs topo ────────────────────────────────────────────────────────────
  const concluidas  = rows.filter(r => r.status === 'concluida');
  const wins        = concluidas.filter(r => r.result === 'vitoria').length;
  const losses      = concluidas.filter(r => r.result === 'derrota').length;
  const draws       = concluidas.filter(r => r.result === 'empate').length;
  const totalKills  = rows.reduce((a, r) => a + (r.kills || 0), 0);
  const totalDeath  = rows.reduce((a, r) => a + (r.deaths || 0), 0);
  const totalNet    = rows.reduce((a, r) => a + Number(r.net || 0), 0);
  const totalLostU  = rows.reduce((a, r) => a + (r.lost_units || 0), 0);
  const winRate     = concluidas.length ? wins / concluidas.length : 0;
  const mvps        = parts.filter(p => p.mvp_flag).length;
  const pDeaths     = parts.filter(p => p.survived === false).length;
  const survRate    = parts.length ? 1 - (pDeaths / parts.length) : 0;
  const activeSpots = spots.filter(r => (r.total_saidas || 0) > 0);
  const bestSpot    = spots.slice().sort((a, b) => Number(b.total_net_value || 0) - Number(a.total_net_value || 0))[0];
  const worstSpot   = spots.slice().sort((a, b) => (b.our_deaths || 0) - (a.our_deaths || 0))[0];

  growSheet(batch, sheetId, { rows: Math.max(rows.length + parts.length + spots.length + kills.length + 150, 200) });

  let row = headerBlock(batch, sheetId, {
    title: 'Saídas & Combate · Firma RedWood',
    subtitle: `${rows.length} saídas · ${parts.length} participações · ${kpiK.total} kills · ${activeSpots.length} spots activos`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: '🎯 PANORAMA OPERACIONAL', hint: 'acumulado + combate', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Saídas',    value: rows.length,  numberFormat: NUM_FMT.INT,  delta: `${concluidas.length} concluídas`, deltaDirection: 'flat' },
    { label: 'Win Rate',  value: winRate,      numberFormat: NUM_FMT.PCT,  delta: `${wins}V · ${losses}D · ${draws}E`, deltaDirection: winRate >= 0.5 ? 'up' : 'down' },
    { label: 'K/D Org',   value: totalDeath > 0 ? totalKills / totalDeath : totalKills, numberFormat: NUM_FMT.KD, delta: `${totalKills}k · ${totalDeath}d`, deltaDirection: 'flat' },
    { label: 'Balanço',   value: totalNet,     numberFormat: NUM_FMT.EURO, delta: `perdido: ${totalLostU} un.`, deltaDirection: totalNet > 0 ? 'up' : 'down' },
  ], COL_COUNT);
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Top Killer',    value: kpiK.topKiller ? kpiK.topKiller.display_name : '—', numberFormat: null,
      delta: kpiK.topKiller ? `${kpiK.topKiller.kills} kills` : '—', deltaDirection: 'up' },
    { label: 'Melhor Spot',   value: bestSpot  ? bestSpot.spot  : '—', numberFormat: null,
      delta: bestSpot  ? `${Math.round(Number(bestSpot.total_net_value) || 0).toLocaleString('pt-PT')} €` : '—', deltaDirection: 'up' },
    { label: 'Pior Spot',     value: worstSpot ? worstSpot.spot : '—', numberFormat: null,
      delta: worstSpot ? `${worstSpot.our_deaths} mortes` : '—', deltaDirection: 'down' },
    { label: 'Survival Rate', value: survRate,  numberFormat: NUM_FMT.PCT,
      delta: `${mvps} MVPs · ${pDeaths} mortes em participações`, deltaDirection: survRate >= 0.7 ? 'up' : 'down' },
  ], COL_COUNT);
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── A. Ledger de saídas ──────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '📋 LEDGER DE SAÍDAS', hint: 'mais recentes no topo · filtros activos', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, SAIDAS_HEADERS);
  const saidasFirstRow = row;
  const saidasRows = rows.map(s => [
    bodyBoldCell(`#${s.id}`),
    bodyCell(s.date ? new Date(s.date).toISOString().split('T')[0] : '—'),
    bodyCell(s.hora || '—'),
    bodyCell(s.spot || '—'),
    captionCell(s.tipo || '—'),
    bodyCell(s.leader_name || '—'),
    statusBadge(s.status),
    resultBadge(s.result),
    bodyCell(s.enemy_name || '—'),
    captionCell(s.enemy_faction || '—'),
    numCell(s.participantes, NUM_FMT.INT),
    numCell(s.caracterizados || 0, NUM_FMT.INT),
    numCell(s.trabalhadores || 0, NUM_FMT.INT),
    numCell(s.kills, NUM_FMT.INT),
    numCell(s.deaths, NUM_FMT.INT),
    numCell(s.survivors, NUM_FMT.INT),
    numCell(s.returned_bairro, NUM_FMT.INT),
    numCell(s.supplied_units, NUM_FMT.INT),
    numCell(s.returned_units, NUM_FMT.INT),
    numCell(s.lost_units, NUM_FMT.INT),
    numCell(s.consumed_units, NUM_FMT.INT),
    numCell(Number(s.gross), NUM_FMT.EURO),
    numCell(Number(s.net), NUM_FMT.EURO),
    cell(s.was_profitable === true ? '▲' : s.was_profitable === false ? '▼' : '—', {
      bg: COLOR.BG_APP,
      font: s.was_profitable === true
        ? { fontFamily: 'Inter', fontSize: 11, bold: true, foregroundColor: COLOR.GREEN_DEEP }
        : s.was_profitable === false
        ? { fontFamily: 'Inter', fontSize: 11, bold: true, foregroundColor: COLOR.RED_SIGNAL }
        : { fontFamily: 'Inter', fontSize: 11, foregroundColor: COLOR.GRAY },
      align: 'CENTER', vAlign: 'MIDDLE',
    }),
    bodyCell(s.result_notes || '', { wrap: true }),
  ]);
  row = tableBody(batch, sheetId, row, saidasRows, { basicFilter: true, columnCount: COL_COUNT });
  if (saidasRows.length) {
    const N = saidasRows.length;
    // K col=13, M col=14, Líquido col=22 (shifted +2 from Caract./Trab. columns)
    batch.addRule(conditionalGreaterThan(sheetId, saidasFirstRow, 13, saidasFirstRow + N, 14, 3, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, saidasFirstRow, 14, saidasFirstRow + N, 15, 2, COLOR.RED_SIGNAL_SOFT));
    batch.addRule(conditionalLessThan(sheetId, saidasFirstRow, 22, saidasFirstRow + N, 23, 0, COLOR.RED_SIGNAL_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, saidasFirstRow, 22, saidasFirstRow + N, 23, 500, COLOR.GREEN_SOFT));
  }
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── B. Participantes ─────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🎖️ LEDGER DE PARTICIPAÇÕES', hint: `${parts.length} registos · detalhe por membro por saída`, columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, PART_HEADERS.concat(Array(COL_COUNT - PART_HEADERS.length).fill('')));
  const partsFirstRow = row;
  const partsRows = parts.map(p => {
    const cells = [
      bodyBoldCell(`#${p.saida_id}`),
      bodyCell(fmtDate(p.date)),
      bodyCell(p.spot || '—'),
      bodyCell(p.display_name || '—'),
      participantTypeBadge(p.participant_type),
      weaponBadge(p.own_weapon),
      captionCell(p.role || 'membro'),
      boolBadge(p.received_org_material),
      numCell(p.issued_units, NUM_FMT.INT),
      numCell(p.returned_units, NUM_FMT.INT),
      numCell(p.lost_units, NUM_FMT.INT),
      numCell(p.consumed_units, NUM_FMT.INT),
      numCell(p.kills, NUM_FMT.INT),
      numCell(p.deaths, NUM_FMT.INT),
      boolBadge(p.survived),
      boolBadge(p.returned_bairro),
      mvpBadgeCell(p.mvp_flag),
      numCell(Number(p.perf), NUM_FMT.DEC),
      numCell(Number(p.disc), NUM_FMT.DEC),
      bodyCell(p.notes || '', { wrap: true }),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, partsRows);
  if (partsRows.length) {
    const N = partsRows.length;
    // K col=12, Perf col=17, Disc col=18 (Tipo+Arma replaced Próprio?)
    batch.addRule(conditionalGreaterThan(sheetId, partsFirstRow, 12, partsFirstRow + N, 13, 2, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, partsFirstRow, 17, partsFirstRow + N, 18, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, partsFirstRow, 18, partsFirstRow + N, 19, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
  }
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── C. Spots (heatmap + tabela) ──────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '📍 SPOTS · TABELA COMPLETA', hint: `${activeSpots.length} activos`, columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, SPOTS_HEADERS.concat(Array(COL_COUNT - SPOTS_HEADERS.length).fill('')));
  const spotsFirstRow = row;
  const spotsRows = spots.map(s => {
    const wr = Number(s.win_rate) || 0;
    const cells = [
      bodyBoldCell(s.spot || '—'),
      numCell(s.total_saidas, NUM_FMT.INT),
      numCell(s.wins, NUM_FMT.INT),
      numCell(s.losses, NUM_FMT.INT),
      numCell(s.draws, NUM_FMT.INT),
      numCell(s.no_conflict_runs, NUM_FMT.INT),
      numCell(wr, NUM_FMT.PCT),
      tierBadge(wr),
      numCell(s.our_kills, NUM_FMT.INT),
      numCell(s.our_deaths, NUM_FMT.INT),
      numCell(Number(s.kd), NUM_FMT.KD),
      numCell(Number(s.total_gross_value), NUM_FMT.EURO),
      numCell(Number(s.total_net_value), NUM_FMT.EURO),
      numCell(Number(s.total_lost_value), NUM_FMT.EURO),
      bodyCell(s.best_member_name || '—'),
      captionCell(s.last_saida_date ? new Date(s.last_saida_date).toISOString().split('T')[0] : '—'),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, spotsRows);
  if (spotsRows.length) {
    const N = spotsRows.length;
    batch.addRule(conditionalGradient(sheetId, spotsFirstRow, 6, spotsFirstRow + N, 7, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, spotsFirstRow, 10, spotsFirstRow + N, 11, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalLessThan(sheetId, spotsFirstRow, 12, spotsFirstRow + N, 13, 0, COLOR.RED_SIGNAL_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, spotsFirstRow, 12, spotsFirstRow + N, 13, 1000, COLOR.GREEN_SOFT));
  }
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── D. Kill log ──────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🔫 KILL LOG', hint: `últimas ${kills.length} kills`, columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, KILLS_HEADERS.concat(Array(COL_COUNT - KILLS_HEADERS.length).fill('')));
  const killRows = kills.map(k => {
    const cells = [
      bodyCell(fmtDT(k.created_at)),
      bodyBoldCell(k.killer_name || '—'),
      bodyCell(k.victim_name || '—'),
      captionCell(k.victim_faction || '—'),
      bodyCell(k.spot || '—'),
      k.saida_id ? bodyCell(`#${k.saida_id}`) : mutedCell('—'),
      captionCell(k.confirmed_by_name || '—'),
      bodyCell(k.notes || '', { wrap: true }),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, killRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Saídas & Combate');
  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncSaidas };
