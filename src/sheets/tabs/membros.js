'use strict';
/**
 * Tab Membros v2 — roster com agrupamento por role, XP, e dias na firma.
 */

const {
  COLOR,
  NUM_FMT,
  cell,
  bodyCell,
  bodyBoldCell,
  captionCell,
  numCell,
  badgeCell,
  killCell,
  deathCell,
  conditionalGradient,
  conditionalGreaterThan,
  conditionalLessThan,
} = require('../theme');
const {
  headerBlock,
  sectionHeader,
  spacer,
  divider,
  miniKPIRow,
  tableHeader,
  tableBody,
  totalRow,
  footerBlock,
  autoResizeAll,
  gangTitle,
  ROW_H,
} = require('./_common');
const { getMembersFull } = require('../queries');
const { query } = require('../../db');
const { CONTRIBUTION_TYPES } = require('../../shared/movementTypes');
const { buildItemPointsCase } = require('../../members/itemPoints');

const HEADERS = [
  'Nome',
  'Discord',
  'Role',
  'Tier',
  'Estado',
  'Entrada',
  'Dias',
  'XP',
  'Última Saída',
  'Entregas',
  'Peso Ent.',
  'Vendas',
  'Saídas',
  'V',
  'D',
  'K',
  'M',
  'K/D',
  'Surv',
  'Return',
  'Lucro',
  'MVPs',
];
const COL_COUNT = HEADERS.length;

function rolePill(role) {
  const map = {
    chefia: { label: 'CHEFIA', bg: COLOR.RED_DEEP },
    oficial: { label: 'OFICIAL', bg: COLOR.RED_BLOOD },
    patrao_di_zona: { label: 'PATRÃO', bg: COLOR.GOLD },
    bairrista: { label: 'BAIRRISTA', bg: COLOR.GRAPHITE },
  };
  const m = map[role];
  return m ? badgeCell(m.label, m.bg) : bodyCell(role || '—');
}

function tierPill(tier) {
  const map = {
    young_blood: { label: 'YB', bg: COLOR.GRAPHITE },
    o_gunao: { label: 'OG', bg: COLOR.RED_BLOOD },
    gangster_fodido: { label: 'GF', bg: COLOR.RED_DEEP },
    patrao_di_zona: { label: 'PDZ', bg: COLOR.GOLD },
    real_gangster: { label: 'RG', bg: COLOR.RED_BLOOD },
    og: { label: 'OG', bg: COLOR.RED_DEEP },
    kingpin: { label: 'KP', bg: COLOR.GOLD },
    manda_chuva: { label: 'MC', bg: COLOR.RED_DEEP },
  };
  const m = map[tier];
  return m ? badgeCell(m.label, m.bg) : bodyCell(tier || '—');
}

function statusBadge(st) {
  if (st === 'ativo' || !st) return badgeCell('ACTIVO', COLOR.GREEN_DEEP);
  if (st === 'inativo') return badgeCell('INACTIVO', COLOR.GRAY_DARK);
  if (st === 'arquivado') return badgeCell('ARQUIVADO', COLOR.IRON);
  return bodyCell(st);
}

function fmtDate(d) {
  try {
    return d ? new Date(d).toISOString().split('T')[0] : '—';
  } catch {
    return '—';
  }
}

function daysSince(d) {
  if (!d) return 0;
  try {
    return Math.floor(Math.max(0, Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

const BAIRRISTA_ROLES = new Set(['bairrista']);
const PATRAO_ROLES = new Set(['patrao_di_zona']);

async function syncMembros(batch, sheetId) {
  const rows = await getMembersFull();

  // XP de todos os membros numa só query
  const pointsCase = buildItemPointsCase();
  const xpRes = await query(
    `SELECT m.id, COALESCE(SUM(im.quantity * ${pointsCase}), 0)::bigint as xp
     FROM members m
     LEFT JOIN inventory_movements im ON im.member_id = m.id AND im.movement_type = ANY($1)
     LEFT JOIN items i ON i.id = im.item_id
     GROUP BY m.id`,
    [CONTRIBUTION_TYPES]
  );
  const xpMap = new Map(xpRes.rows.map(r => [r.id, Number(r.xp) || 0]));

  const chefia = rows.filter(m => m.role === 'chefia');
  const oficial = rows.filter(m => m.role === 'oficial');
  const patroes = rows.filter(m => PATRAO_ROLES.has(m.role));
  const bairristas = rows.filter(m => BAIRRISTA_ROLES.has(m.role));
  const allOfficial = [...chefia, ...oficial];

  const totalEntregas = rows.reduce((a, m) => a + Number(m.weighted_entregas || 0), 0);
  const totalKills = rows.reduce((a, m) => a + (m.kills || 0), 0);
  const totalProfit = rows.reduce((a, m) => a + Number(m.profit || 0), 0);
  const avgKD = rows.length ? rows.reduce((a, m) => a + Number(m.kd || 0), 0) / rows.length : 0;

  const oTotalSaidas = allOfficial.reduce((a, m) => a + (m.saidas_total || 0), 0);
  const oTotalWins = allOfficial.reduce((a, m) => a + (m.wins || 0), 0);
  const oTotalKills = allOfficial.reduce((a, m) => a + (m.kills || 0), 0);
  const oTotalMVPs = allOfficial.reduce((a, m) => a + (m.mvps || 0), 0);
  const oAvgKD = allOfficial.length ? allOfficial.reduce((a, m) => a + Number(m.kd || 0), 0) / allOfficial.length : 0;
  const oCollectiveWR = oTotalSaidas > 0 ? oTotalWins / oTotalSaidas : 0;

  const countTier = (arr, key) => arr.filter(m => m.tier === key).length;

  let row = headerBlock(batch, sheetId, {
    title: gangTitle('Membros'),
    subtitle: `${rows.length} membros · ${chefia.length} chefia · ${oficial.length} oficiais · ${patroes.length} patrões · ${bairristas.length} bairristas`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Secção 1: Resumo da Casa ─────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'RESUMO DA CASA',
    hint: 'totais agregados',
    columnCount: COL_COUNT,
  });
  row = miniKPIRow(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Membros',
        value: rows.length,
        numberFormat: NUM_FMT.INT,
        delta: `${chefia.length + oficial.length} oficiais · ${patroes.length + bairristas.length} bairro`,
        deltaDirection: 'flat',
      },
      {
        label: 'Entregues',
        value: totalEntregas,
        numberFormat: NUM_FMT.INT,
        delta: 'material total',
        deltaDirection: 'flat',
      },
      {
        label: 'Kills',
        value: totalKills,
        numberFormat: NUM_FMT.INT,
        delta: `KD médio ${avgKD.toFixed(2)}`,
        deltaDirection: 'flat',
      },
      {
        label: 'Lucro',
        value: totalProfit,
        numberFormat: NUM_FMT.EURO,
        delta: 'gerado colectivamente',
        deltaDirection: totalProfit > 0 ? 'up' : 'flat',
      },
    ],
    COL_COUNT
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Secção 2: Distribuição por classe (tabela compacta) ──────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'DISTRIBUIÇÃO POR CLASSE',
    hint: 'hierarquia da firma',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, [
    'Classe',
    'Total',
    'Tier A',
    'Tier B',
    'Tier C',
    ...Array(COL_COUNT - 5).fill(''),
  ]);
  const distRows = [
    ['Chefia', chefia.length, countTier(chefia, 'manda_chuva'), countTier(chefia, 'kingpin'), 0],
    ['Oficiais', oficial.length, countTier(oficial, 'og'), countTier(oficial, 'real_gangster'), 0],
    ['Patrão di Zona', patroes.length, patroes.length, 0, 0],
    [
      'Bairristas',
      bairristas.length,
      countTier(bairristas, 'gangster_fodido'),
      countTier(bairristas, 'o_gunao'),
      countTier(bairristas, 'young_blood'),
    ],
  ].map(([classe, total, t1, t2, t3]) => {
    const cells = [
      bodyBoldCell(classe),
      numCell(total, NUM_FMT.INT),
      numCell(t1, NUM_FMT.INT),
      numCell(t2, NUM_FMT.INT),
      numCell(t3, NUM_FMT.INT),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, distRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Secção 3: Núcleo operacional ─────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'NÚCLEO OPERACIONAL · CHEFIA + OFICIAIS',
    hint: 'performance agregada',
    columnCount: COL_COUNT,
  });
  row = miniKPIRow(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Núcleo',
        value: allOfficial.length,
        numberFormat: NUM_FMT.INT,
        delta: `${chefia.length} chefia · ${oficial.length} oficiais`,
        deltaDirection: 'flat',
      },
      {
        label: 'Win Rate',
        value: oCollectiveWR,
        numberFormat: NUM_FMT.PCT,
        delta: `${oTotalWins}V em ${oTotalSaidas} saídas`,
        deltaDirection: oCollectiveWR >= 0.5 ? 'up' : 'down',
      },
      {
        label: 'K/D Médio',
        value: oAvgKD,
        numberFormat: NUM_FMT.KD,
        delta: `${oTotalKills} kills totais`,
        deltaDirection: oAvgKD >= 1 ? 'up' : 'flat',
      },
      { label: 'MVPs', value: oTotalMVPs, numberFormat: NUM_FMT.INT, delta: 'entre oficiais', deltaDirection: 'flat' },
    ],
    COL_COUNT
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Secção 4: Roster completo com sub-headers por role ───────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'ROSTER COMPLETO',
    hint: 'filtros activos · ordena por qualquer coluna',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  batch.freezeRows(sheetId, row);
  const firstDataRow = row;

  const roleRank = { chefia: 4, oficial: 3, patrao_di_zona: 2, bairrista: 1 };
  const tierRank = {
    manda_chuva: 2,
    kingpin: 1,
    og: 2,
    real_gangster: 1,
    patrao_di_zona: 1,
    gangster_fodido: 3,
    o_gunao: 2,
    young_blood: 1,
  };
  rows.sort((a, b) => {
    const rr = (roleRank[b.role] || 0) - (roleRank[a.role] || 0);
    if (rr !== 0) return rr;
    return (
      (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0) ||
      Number(b.weighted_entregas || 0) - Number(a.weighted_entregas || 0)
    );
  });

  let currentRole = null;
  for (const m of rows) {
    // Sub-header quando muda de role
    if (m.role !== currentRole) {
      currentRole = m.role;
      const roleLabel =
        currentRole === 'chefia'
          ? 'CHEFIA'
          : currentRole === 'oficial'
            ? 'OFICIAIS'
            : currentRole === 'patrao_di_zona'
              ? 'PATRÕES DI ZONA'
              : 'BAIRRISTAS';
      const subCells = Array(COL_COUNT).fill(cell('', { bg: COLOR.GRAPHITE }));
      subCells[0] = cell(roleLabel, {
        bg: COLOR.GRAPHITE,
        font: { fontFamily: 'Inter', fontSize: 9, bold: true, foregroundColor: COLOR.GRAY_LIGHT },
        align: 'LEFT',
        vAlign: 'MIDDLE',
      });
      batch.updateCells(sheetId, row, 0, [subCells]);
      batch.setRowHeight(sheetId, row, 20);
      row += 1;
    }

    const memberXP = xpMap.get(m.id) || 0;
    const memberDays = daysSince(m.joined_at);

    const dataRow = [
      bodyBoldCell(m.display_name || m.username || '—'),
      captionCell(m.discord_id || ''),
      rolePill(m.role),
      tierPill(m.tier),
      statusBadge(m.status),
      bodyCell(fmtDate(m.joined_at)),
      numCell(memberDays, NUM_FMT.INT),
      numCell(memberXP, NUM_FMT.INT),
      bodyCell(fmtDate(m.last_saida)),
      numCell(m.entregas, NUM_FMT.INT),
      numCell(Number(m.weighted_entregas), NUM_FMT.INT),
      numCell(m.vendas, NUM_FMT.INT),
      numCell(m.saidas_total, NUM_FMT.INT),
      numCell(m.wins, NUM_FMT.INT),
      numCell(m.losses, NUM_FMT.INT),
      killCell(m.kills),
      deathCell(m.deaths),
      numCell(Number(m.kd), NUM_FMT.KD),
      numCell(Number(m.survival_rate) / 100, NUM_FMT.PCT),
      numCell(Number(m.return_rate) / 100, NUM_FMT.PCT),
      numCell(Number(m.profit), NUM_FMT.EURO),
      numCell(m.mvps, NUM_FMT.INT),
    ];
    while (dataRow.length < COL_COUNT) dataRow.push(cell('', { bg: COLOR.BG_APP }));
    batch.updateCells(sheetId, row, 0, [dataRow]);
    batch.setRowHeight(sheetId, row, ROW_H.TABLE_ROW);
    row += 1;
  }

  // Total row
  const sumEntregas = rows.reduce((a, m) => a + (m.entregas || 0), 0);
  const sumVendas = rows.reduce((a, m) => a + (m.vendas || 0), 0);
  const sumSaidas = rows.reduce((a, m) => a + (m.saidas_total || 0), 0);
  const sumWins = rows.reduce((a, m) => a + (m.wins || 0), 0);
  const sumLosses = rows.reduce((a, m) => a + (m.losses || 0), 0);
  const sumMVPs = rows.reduce((a, m) => a + (m.mvps || 0), 0);
  row = totalRow(batch, sheetId, row, {
    label: 'TOTAL',
    columnCount: COL_COUNT,
    values: [
      { col: 9, value: sumEntregas, numberFormat: NUM_FMT.INT },
      { col: 10, value: totalEntregas, numberFormat: NUM_FMT.INT },
      { col: 11, value: sumVendas, numberFormat: NUM_FMT.INT },
      { col: 12, value: sumSaidas, numberFormat: NUM_FMT.INT },
      { col: 13, value: sumWins, numberFormat: NUM_FMT.INT },
      { col: 14, value: sumLosses, numberFormat: NUM_FMT.INT },
      { col: 15, value: totalKills, numberFormat: NUM_FMT.INT },
      { col: 20, value: totalProfit, numberFormat: NUM_FMT.EURO },
      { col: 21, value: sumMVPs, numberFormat: NUM_FMT.INT },
    ],
  });

  if (rows.length) {
    batch.addRule(
      conditionalGradient(
        sheetId,
        firstDataRow,
        17,
        row,
        18,
        COLOR.RED_SIGNAL_SOFT,
        COLOR.YELLOW_SOFT,
        COLOR.GREEN_SOFT
      )
    );
    batch.addRule(
      conditionalGradient(
        sheetId,
        firstDataRow,
        18,
        row,
        19,
        COLOR.RED_SIGNAL_SOFT,
        COLOR.YELLOW_SOFT,
        COLOR.GREEN_SOFT
      )
    );
    batch.addRule(
      conditionalGradient(
        sheetId,
        firstDataRow,
        19,
        row,
        20,
        COLOR.RED_SIGNAL_SOFT,
        COLOR.YELLOW_SOFT,
        COLOR.GREEN_SOFT
      )
    );
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 20, row, 21, 1000, COLOR.GREEN_SOFT));
    batch.addRule(conditionalLessThan(sheetId, firstDataRow, 20, row, 21, -500, COLOR.RED_SIGNAL_SOFT));
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Membros');
  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncMembros };
