'use strict';
/**
 * Tab Membros — roster consolidado (geral + bairristas + oficiais) com secções
 * por agregado + roster completo filtrável.
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
  kpiStrip,
  tableHeader,
  tableBody,
  totalRow,
  footerBlock,
  autoResizeColumns,
  autoResizeAll,
} = require('./_common');
const { getMembersFull } = require('../queries');

const HEADERS = [
  'Nome',
  'Discord',
  'Role',
  'Tier',
  'Estado',
  'Entrada',
  'Última Saída',
  'Entregas',
  'Itens Totais',
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
    // Bairrista tiers
    young_blood: { label: 'YB', bg: COLOR.GRAPHITE },
    o_gunao: { label: 'OG', bg: COLOR.RED_BLOOD },
    gangster_fodido: { label: 'GF', bg: COLOR.RED_DEEP },
    // Patrão di Zona
    patrao_di_zona: { label: 'PDZ', bg: COLOR.GOLD },
    // Oficial tiers
    real_gangster: { label: 'RG', bg: COLOR.RED_BLOOD },
    og: { label: 'OG', bg: COLOR.RED_DEEP },
    // Chefia tiers
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

const BAIRRISTA_ROLES = new Set(['bairrista']);
const PATRAO_ROLES = new Set(['patrao_di_zona']);
const OFICIAL_ROLES = new Set(['oficial', 'chefia']);

async function syncMembros(batch, sheetId) {
  const rows = await getMembersFull();

  // Diagnóstico: breakdown por role + dump de TODOS os discord_ids
  // encontrados. Permite ao user verificar se um ID específico está na
  // query (e em que role) ou se está em falta.
  const byRole = rows.reduce((acc, m) => {
    const k = m.role || '(null)';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const { log } = require('../../logger');
  log(
    `[SHEETS:membros] ${rows.length} members: ${Object.entries(byRole)
      .map(([k, n]) => `${k}=${n}`)
      .join(' · ')}`
  );
  const ids = rows.map(m => `${m.discord_id}:${m.role || '?'}:${m.status || '?'}`).join(', ');
  log(`[SHEETS:membros] IDs: ${ids}`);

  // Full dump sem filter — inclui status != 'ativo' para ver members "escondidos".
  try {
    const { query } = require('../../db');
    const full = await query('SELECT discord_id, display_name, role, status FROM members ORDER BY id');
    const excluded = full.rows.filter(r => !rows.some(sync => String(sync.discord_id) === String(r.discord_id)));
    if (excluded.length) {
      log(
        `[SHEETS:membros] ⚠️ ${excluded.length} members na DB mas EXCLUÍDOS da sync (status não ativo / NULL): ${excluded.map(e => `${e.discord_id}:${e.role || '?'}:${e.status || '?'}:"${e.display_name || ''}"`).join(' · ')}`
      );
    }
  } catch (e) {
    log(`[SHEETS:membros] dump diagnóstico falhou: ${e.message}`);
  }

  const chefia = rows.filter(m => m.role === 'chefia');
  const oficial = rows.filter(m => m.role === 'oficial');
  const patroes = rows.filter(m => PATRAO_ROLES.has(m.role));
  const bairristas = rows.filter(m => BAIRRISTA_ROLES.has(m.role));
  const allOfficial = [...chefia, ...oficial]; // combate/oficiais ops agregados

  const totalEntregas = rows.reduce((a, m) => a + Number(m.weighted_entregas || 0), 0);
  const totalKills = rows.reduce((a, m) => a + (m.kills || 0), 0);
  const totalProfit = rows.reduce((a, m) => a + Number(m.profit || 0), 0);
  const avgKD = rows.length ? rows.reduce((a, m) => a + Number(m.kd || 0), 0) / rows.length : 0;

  // Oficiais agregados (chefia + oficial)
  const oTotalSaidas = allOfficial.reduce((a, m) => a + (m.saidas_total || 0), 0);
  const oTotalWins = allOfficial.reduce((a, m) => a + (m.wins || 0), 0);
  const oTotalKills = allOfficial.reduce((a, m) => a + (m.kills || 0), 0);
  const oTotalMVPs = allOfficial.reduce((a, m) => a + (m.mvps || 0), 0);
  const oAvgKD = allOfficial.length ? allOfficial.reduce((a, m) => a + Number(m.kd || 0), 0) / allOfficial.length : 0;
  const oCollectiveWR = oTotalSaidas > 0 ? oTotalWins / oTotalSaidas : 0;

  // Counts por tier — cada classe tem a sua
  const countTier = (arr, key) => arr.filter(m => m.tier === key).length;
  const chef = {
    manda_chuva: countTier(chefia, 'manda_chuva'),
    kingpin: countTier(chefia, 'kingpin'),
  };
  const ofic = {
    og: countTier(oficial, 'og'),
    real_gangster: countTier(oficial, 'real_gangster'),
  };
  const bair = {
    gangster_fodido: countTier(bairristas, 'gangster_fodido'),
    o_gunao: countTier(bairristas, 'o_gunao'),
    young_blood: countTier(bairristas, 'young_blood'),
  };

  // Grow é feito pelo syncEngine via pre-flight (PRE_SYNC_MIN_ROWS).
  let row = headerBlock(batch, sheetId, {
    title: 'Membros · Ficha da Casa',
    subtitle: `${rows.length} membros · ${chefia.length} chefia · ${oficial.length} oficiais · ${patroes.length} patrões di zona · ${bairristas.length} bairristas`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Secção 1: Resumo Casa ────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🏠 RESUMO DA CASA',
    hint: 'totais agregados',
    columnCount: COL_COUNT,
  });
  row = kpiStrip(
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
    COL_COUNT,
    {}
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');

  // ── Secção 2: Distribuição por classe ────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '📊 DISTRIBUIÇÃO POR CLASSE',
    hint: 'hierarquia da firma',
    columnCount: COL_COUNT,
  });
  row = kpiStrip(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Chefia',
        value: chefia.length,
        numberFormat: NUM_FMT.INT,
        delta: `MC: ${chef.manda_chuva} · KP: ${chef.kingpin}`,
        deltaDirection: 'flat',
      },
      {
        label: 'Oficiais',
        value: oficial.length,
        numberFormat: NUM_FMT.INT,
        delta: `OG: ${ofic.og} · RG: ${ofic.real_gangster}`,
        deltaDirection: 'flat',
      },
      {
        label: 'Patrão di Zona',
        value: patroes.length,
        numberFormat: NUM_FMT.INT,
        delta: patroes.length ? 'chefes do bairro' : '—',
        deltaDirection: 'flat',
      },
      {
        label: 'Bairristas',
        value: bairristas.length,
        numberFormat: NUM_FMT.INT,
        delta: `GF: ${bair.gangster_fodido} · OG: ${bair.o_gunao} · YB: ${bair.young_blood}`,
        deltaDirection: 'flat',
      },
    ],
    COL_COUNT,
    {}
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');

  // ── Secção 3: Núcleo operacional (chefia + oficiais) ─────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '👑 NÚCLEO OPERACIONAL · CHEFIA + OFICIAIS',
    hint: 'performance agregada',
    columnCount: COL_COUNT,
  });
  row = kpiStrip(
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
    COL_COUNT,
    {}
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Secção 4: Roster completo ────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '👥 ROSTER COMPLETO',
    hint: 'filtros activos — ordena por qualquer coluna',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  batch.freezeRows(sheetId, row);
  const firstDataRow = row;

  // Ordenar por hierarquia: Chefia > Oficiais > Patrão di Zona > Bairristas.
  // Dentro de cada classe, tier mais alto primeiro.
  const roleRank = {
    chefia: 4,
    oficial: 3,
    patrao_di_zona: 2,
    bairrista: 1,
  };
  const tierRank = {
    manda_chuva: 2,
    kingpin: 1, // chefia
    og: 2,
    real_gangster: 1, // oficial
    patrao_di_zona: 1, // patrao_di_zona
    gangster_fodido: 3,
    o_gunao: 2,
    young_blood: 1, // bairrista
  };
  rows.sort((a, b) => {
    const rr = (roleRank[b.role] || 0) - (roleRank[a.role] || 0);
    if (rr !== 0) return rr;
    return (
      (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0) ||
      Number(b.weighted_entregas || 0) - Number(a.weighted_entregas || 0)
    );
  });

  const dataRows = rows.map(m => [
    bodyBoldCell(m.display_name || m.username || '—'),
    captionCell(m.discord_id || ''),
    rolePill(m.role),
    tierPill(m.tier),
    statusBadge(m.status),
    bodyCell(fmtDate(m.joined_at)),
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
  ]);
  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  if (dataRows.length) {
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
        { col: 7, value: sumEntregas, numberFormat: NUM_FMT.INT },
        { col: 8, value: totalEntregas, numberFormat: NUM_FMT.INT },
        { col: 9, value: sumVendas, numberFormat: NUM_FMT.INT },
        { col: 10, value: sumSaidas, numberFormat: NUM_FMT.INT },
        { col: 11, value: sumWins, numberFormat: NUM_FMT.INT },
        { col: 12, value: sumLosses, numberFormat: NUM_FMT.INT },
        { col: 13, value: totalKills, numberFormat: NUM_FMT.INT },
        { col: 18, value: totalProfit, numberFormat: NUM_FMT.EURO },
        { col: 19, value: sumMVPs, numberFormat: NUM_FMT.INT },
      ],
    });
    const N = dataRows.length;
    batch.addRule(
      conditionalGradient(
        sheetId,
        firstDataRow,
        15,
        firstDataRow + N,
        16,
        COLOR.RED_SIGNAL_SOFT,
        COLOR.YELLOW_SOFT,
        COLOR.GREEN_SOFT
      )
    );
    batch.addRule(
      conditionalGradient(
        sheetId,
        firstDataRow,
        16,
        firstDataRow + N,
        17,
        COLOR.RED_SIGNAL_SOFT,
        COLOR.YELLOW_SOFT,
        COLOR.GREEN_SOFT
      )
    );
    batch.addRule(
      conditionalGradient(
        sheetId,
        firstDataRow,
        17,
        firstDataRow + N,
        18,
        COLOR.RED_SIGNAL_SOFT,
        COLOR.YELLOW_SOFT,
        COLOR.GREEN_SOFT
      )
    );
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 18, firstDataRow + N, 19, 1000, COLOR.GREEN_SOFT));
    batch.addRule(conditionalLessThan(sheetId, firstDataRow, 18, firstDataRow + N, 19, -500, COLOR.RED_SIGNAL_SOFT));
  }
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Membros');
  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncMembros };
