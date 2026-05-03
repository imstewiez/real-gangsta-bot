'use strict';
/**
 * Queries analíticas para o sync do Google Sheet.
 *
 * Regras:
 *   - JOINs únicos em vez de loops N+1
 *   - Funções dedicadas por domínio (kpi, weekly, daily, spots, rankings)
 *   - Sem dependências de repositories — SQL directo para controlar shape
 *
 * Todas as funções recebem `{query}` para poder ser testadas com stub.
 */

const { query } = require('../db');
const { weekBounds: _weekBounds } = require('../util');

// ─── Helpers de datas ────────────────────────────────────────────────────────
function weekBounds(ref = new Date()) {
  const { start, end } = _weekBounds(ref);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function prevWeekBounds(ref = new Date()) {
  const d = new Date(ref);
  d.setUTCDate(d.getUTCDate() - 7);
  return weekBounds(d);
}

function daysAgoISO(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split('T')[0];
}

// Sinal de cada movement_type para cálculo de saldo de stock.
// Mantém-se em sync com src/repositories/inventory.js::getStock.
//
// Importante sobre 2 casas:
//   - Movimentos têm coluna `location` ('armazem' | 'grupo' | NULL).
//   - 'transferencia' aparece como par de movimentos: ajuste_manual -X numa casa
//     + ajuste_manual +X na outra casa, mantendo total global inalterado.
// Movement types considerados "entrada de stock" (+quantity no balance).
const POSITIVE_MOVES = `(
  'saldo_inicial',
  'entrega_bairrista', 'venda_bairrista', 'entrega_oficial',
  'devolucao_saida', 'apreendido', 'craftado'
)`;
// Movement types agregados como "entregas" (in-flow para stock, tipicamente
// bairristas e oficiais). Usado em queries de rankings e entregas.
const _ENTREGA_MOVES = "('entrega_bairrista', 'entrega_oficial')";
// Movement types de venda (sobrepõem a entrega_bairrista no sentido oposto).
const _VENDA_MOVES = "('venda_bairrista')";

const STOCK_BALANCE_CASE = `
  CASE
    WHEN im.movement_type IN ${POSITIVE_MOVES} THEN im.quantity
    WHEN im.movement_type IN ('fornecimento_org','consumo_saida','perda_saida')
      THEN -im.quantity
    WHEN im.movement_type = 'ajuste_manual'
      THEN im.quantity
    ELSE 0
  END`;

// Variantes filtradas por casa — usar em queries que querem balance por casa.
const STOCK_BALANCE_ARMAZEM = `(CASE WHEN im.location = 'armazem' THEN ${STOCK_BALANCE_CASE} ELSE 0 END)`;
const STOCK_BALANCE_GRUPO = `(CASE WHEN im.location = 'grupo'   THEN ${STOCK_BALANCE_CASE} ELSE 0 END)`;

// Display name com fallback — se display_name tiver menos de 2 caracteres
// alfanuméricos (ex: ".", "᲼᲼᲼", " ", ""), usa username. Aplicável a qualquer
// query que seleccione display_name de `members` (com alias m).
const DISPLAY_NAME_EXPR = (alias = 'm') => `CASE
  WHEN LENGTH(REGEXP_REPLACE(COALESCE(${alias}.display_name, ''), '[^[:alnum:]À-ÿ]+', '', 'g')) < 2
    THEN COALESCE(${alias}.username, ${alias}.discord_id, '—')
  ELSE ${alias}.display_name
END`;

// ─── KPIs do Dashboard ───────────────────────────────────────────────────────
async function getDashboardKPIs() {
  const w = weekBounds();
  const pw = prevWeekBounds();

  // Query 1: Todos os KPIs numéricos consolidados numa única query com CTEs.
  // Reduz de ~10 queries para 1, eliminando round-trips à DB.
  const kpiResult = await query(
    `
    WITH week_bounds AS (
      SELECT $1::date AS w_start, $2::date AS pw_start, $3::date AS pw_end
    ),
    stock_agg AS (
      SELECT
        COALESCE(SUM(COALESCE(im.quantity, 0) * CASE
          WHEN im.movement_type IN ${POSITIVE_MOVES} THEN 1
          WHEN im.movement_type IN ('fornecimento_org', 'consumo_saida', 'perda_saida') THEN -1
          WHEN im.movement_type = 'ajuste_manual' THEN 1
          ELSE 0
        END), 0)::int AS total_qty,
        COALESCE(SUM(COALESCE(im.quantity, 0) * CASE
          WHEN im.movement_type IN ${POSITIVE_MOVES} THEN 1
          WHEN im.movement_type IN ('fornecimento_org', 'consumo_saida', 'perda_saida') THEN -1
          WHEN im.movement_type = 'ajuste_manual' THEN 1
          ELSE 0
        END * COALESCE(i.estimated_value, 0)), 0)::numeric AS total_value
      FROM items i
      LEFT JOIN inventory_movements im ON im.item_id = i.id
      WHERE i.active = true
    ),
    week_mov AS (
      SELECT
        COALESCE(SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial') THEN quantity ELSE 0 END), 0)::int AS entradas,
        COALESCE(SUM(CASE WHEN movement_type IN ('venda_bairrista') THEN quantity ELSE 0 END), 0)::int AS vendas
      FROM inventory_movements
      WHERE created_at >= (SELECT w_start FROM week_bounds)
    ),
    prev_mov AS (
      SELECT
        COALESCE(SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial') THEN quantity ELSE 0 END), 0)::int AS entradas
      FROM inventory_movements
      WHERE created_at >= (SELECT pw_start FROM week_bounds)
        AND created_at < (SELECT pw_end FROM week_bounds)
    ),
    week_saidas AS (
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN result = 'vitoria' THEN 1 ELSE 0 END)::int AS wins,
        SUM(CASE WHEN result = 'derrota' THEN 1 ELSE 0 END)::int AS losses,
        SUM(COALESCE(our_kills, 0))::int AS kills,
        SUM(COALESCE(deaths, 0))::int AS deaths,
        SUM(COALESCE(net_value, 0))::numeric AS net,
        SUM(COALESCE(gross_value, 0))::numeric AS gross
      FROM operations
      WHERE date >= (SELECT w_start FROM week_bounds) AND status = 'concluida'
    ),
    prev_saidas AS (
      SELECT
        COUNT(*)::int AS total,
        SUM(COALESCE(net_value, 0))::numeric AS net,
        SUM(COALESCE(our_kills, 0))::int AS kills
      FROM operations
      WHERE date >= (SELECT pw_start FROM week_bounds)
        AND date < (SELECT pw_end FROM week_bounds)
        AND status = 'concluida'
    ),
    week_mat AS (
      SELECT
        COALESCE(SUM(CASE WHEN om.direction='fornecido' THEN om.quantity ELSE 0 END), 0)::int AS supplied_units,
        COALESCE(SUM(CASE WHEN om.direction='devolvido' THEN om.quantity ELSE 0 END), 0)::int AS returned_units,
        COALESCE(SUM(CASE WHEN om.direction='perdido'   THEN om.quantity ELSE 0 END), 0)::int AS lost_units,
        COALESCE(SUM(CASE WHEN om.direction='consumido' THEN om.quantity ELSE 0 END), 0)::int AS consumed_units
      FROM operation_materials om
      JOIN operations o ON o.id = om.operation_id
      WHERE o.date >= (SELECT w_start FROM week_bounds) AND o.status = 'concluida'
    ),
    week_part_types AS (
      SELECT
        COUNT(*) FILTER (WHERE op.participant_type = 'caracterizado')::int AS characterized,
        COUNT(*) FILTER (WHERE op.participant_type = 'trabalhador')::int AS workers
      FROM operation_participants op
      JOIN operations o ON o.id = op.operation_id
      WHERE o.date >= (SELECT w_start FROM week_bounds) AND o.status = 'concluida'
    ),
    member_counts AS (
      SELECT
        COALESCE(SUM(CASE WHEN role = 'bairrista'      AND status='ativo' THEN 1 ELSE 0 END), 0)::int AS bairristas,
        COALESCE(SUM(CASE WHEN role = 'patrao_di_zona' AND status='ativo' THEN 1 ELSE 0 END), 0)::int AS patroes,
        COALESCE(SUM(CASE WHEN role = 'oficial'        AND status='ativo' THEN 1 ELSE 0 END), 0)::int AS oficiais,
        COALESCE(SUM(CASE WHEN role = 'chefia'         AND status='ativo' THEN 1 ELSE 0 END), 0)::int AS chefia
      FROM members
    )
    SELECT
      s.total_qty, s.total_value,
      wm.entradas AS week_entradas, wm.vendas AS week_vendas,
      pm.entradas AS prev_entradas,
      ws.total AS saidas_total, ws.wins, ws.losses, ws.kills, ws.deaths, ws.net, ws.gross,
      ps.total AS prev_saidas_total, ps.net AS prev_net, ps.kills AS prev_kills,
      m.supplied_units, m.returned_units, m.lost_units, m.consumed_units,
      pt.characterized, pt.workers,
      mc.bairristas, mc.patroes, mc.oficiais, mc.chefia
    FROM stock_agg s
    CROSS JOIN week_mov wm
    CROSS JOIN prev_mov pm
    CROSS JOIN week_saidas ws
    CROSS JOIN prev_saidas ps
    CROSS JOIN week_mat m
    CROSS JOIN week_part_types pt
    CROSS JOIN member_counts mc`,
    [w.start, pw.start, pw.end]
  );

  const r = kpiResult.rows[0] || {};
  const totalWins = r.wins || 0;
  const totalOps = r.saidas_total || 0;
  const totalKills = r.kills || 0;
  const totalDeaths = r.deaths || 0;

  // Query 2: Tops (contribuidor, killer, spots) — mantida separada por legibilidade
  const [topContrib, topKiller, spotNet, spotDanger] = await Promise.all([
    query(
      `SELECT m.discord_id, ${DISPLAY_NAME_EXPR('m')} AS display_name, SUM(sm.quantity)::int AS value
       FROM inventory_movements sm
       JOIN members m ON m.id = sm.member_id
       WHERE sm.created_at >= $1::date AND sm.movement_type IN ('entrega_bairrista','entrega_oficial')
       GROUP BY m.discord_id, m.display_name, m.username
       ORDER BY value DESC NULLS LAST LIMIT 1`,
      [w.start]
    ),
    query(
      `SELECT m.discord_id, ${DISPLAY_NAME_EXPR('m')} AS display_name, COUNT(*)::int AS kills
       FROM kill_logs k
       JOIN members m ON m.id = k.killer_id
       WHERE k.created_at >= $1::date
       GROUP BY m.discord_id, m.display_name, m.username
       ORDER BY kills DESC LIMIT 1`,
      [w.start]
    ),
    query(
      'SELECT spot, total_net_value, total_saidas FROM spot_stats WHERE total_saidas > 0 ORDER BY total_net_value DESC LIMIT 1'
    ),
    query(
      'SELECT spot, our_deaths, total_saidas FROM spot_stats WHERE total_saidas > 0 ORDER BY our_deaths DESC LIMIT 1'
    ),
  ]);

  return {
    stockQty: Number(r.total_qty) || 0,
    stockValue: Number(r.total_value) || 0,
    weekEntradas: Number(r.week_entradas) || 0,
    weekVendas: Number(r.week_vendas) || 0,
    prevEntradas: Number(r.prev_entradas) || 0,
    saidasTotal: totalOps,
    saidasWins: totalWins,
    saidasLosses: r.losses || 0,
    winRate: totalOps > 0 ? totalWins / totalOps : 0,
    netWeek: Number(r.net) || 0,
    netPrevWeek: Number(r.prev_net) || 0,
    killsWeek: totalKills,
    killsPrevWeek: r.prev_kills || 0,
    deathsWeek: totalDeaths,
    kdOrg: totalDeaths > 0 ? totalKills / totalDeaths : totalKills,
    lostUnitsWeek: Number(r.lost_units) || 0,
    returnedUnitsWeek: Number(r.returned_units) || 0,
    suppliedUnitsWeek: Number(r.supplied_units) || 0,
    consumedUnitsWeek: Number(r.consumed_units) || 0,
    bairristasAtivos: r.bairristas || 0,
    patroesAtivos: r.patroes || 0,
    oficiaisAtivos: r.oficiais || 0,
    chefiaAtivos: r.chefia || 0,
    topContributor: topContrib.rows[0] || null,
    topKiller: topKiller.rows[0] || null,
    topSpotProfit: spotNet.rows[0] || null,
    topSpotDanger: spotDanger.rows[0] || null,
    weekCharacterized: Number(r.characterized) || 0,
    weekWorkers: Number(r.workers) || 0,
    weekBounds: w,
    prevWeekBounds: pw,
  };
}

// ─── Resumo Semanal + comparativo ────────────────────────────────────────────
async function getWeeklySummary() {
  const w = weekBounds();
  const pw = prevWeekBounds();

  const sql = (start, end) =>
    query(
      `
    SELECT
      COUNT(DISTINCT o.id)::int AS ops,
      COALESCE(SUM(CASE WHEN o.result='vitoria' THEN 1 ELSE 0 END), 0)::int AS wins,
      COALESCE(SUM(CASE WHEN o.result='derrota' THEN 1 ELSE 0 END), 0)::int AS losses,
      COALESCE(SUM(CASE WHEN o.result='empate' THEN 1 ELSE 0 END), 0)::int AS draws,
      COALESCE(SUM(COALESCE(o.our_kills,0)), 0)::int AS kills,
      COALESCE(SUM(COALESCE(o.deaths,0)), 0)::int AS deaths,
      COALESCE(SUM(COALESCE(o.gross_value,0)), 0)::numeric AS gross,
      COALESCE(SUM(COALESCE(o.net_value,0)), 0)::numeric AS net,
      COALESCE(SUM(COALESCE(o.returned_value,0)), 0)::numeric AS returned,
      COALESCE(SUM(COALESCE(o.supplied_value,0)), 0)::numeric AS supplied
    FROM operations o
    WHERE o.date >= $1::date ${end ? 'AND o.date < $2::date' : ''} AND o.status = 'concluida'`,
      end ? [start, end] : [start]
    );

  const cur = (await sql(w.start)).rows[0] || {};
  const prev = (await sql(pw.start, pw.end)).rows[0] || {};

  const deliveries = await query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN sm.movement_type IN ('entrega_bairrista','entrega_oficial') THEN quantity ELSE 0 END), 0)::int AS entregas,
      COALESCE(SUM(CASE WHEN sm.movement_type IN ('venda_bairrista') THEN quantity ELSE 0 END), 0)::int AS vendas,
      COALESCE(SUM(CASE WHEN sm.movement_type IN ('entrega_bairrista','venda_bairrista','entrega_oficial')
          THEN quantity ELSE 0 END), 0)::int AS weighted
    FROM inventory_movements sm
    WHERE sm.created_at >= $1::date`,
    [w.start]
  );

  return { current: { ...cur, ...deliveries.rows[0] }, previous: prev, bounds: { current: w, previous: pw } };
}

// ─── Resumo Diário (últimos 14 dias) ─────────────────────────────────────────
async function getDailyBreakdown(days = 14) {
  const since = daysAgoISO(days);
  const r = await query(
    `
    SELECT
      d::date AS day,
      COALESCE(ops.total, 0)::int AS ops,
      COALESCE(ops.kills, 0)::int AS kills,
      COALESCE(ops.deaths, 0)::int AS deaths,
      COALESCE(ops.net, 0)::numeric AS net,
      COALESCE(mov.entradas, 0)::numeric AS entradas,
      COALESCE(mov.vendas, 0)::numeric AS vendas
    FROM generate_series($1::date, CURRENT_DATE, '1 day'::interval) AS d
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total,
        SUM(COALESCE(our_kills,0))::int AS kills,
        SUM(COALESCE(deaths,0))::int AS deaths,
        SUM(COALESCE(net_value,0))::numeric AS net
      FROM operations
      WHERE date = d::date AND status = 'concluida'
    ) ops ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN sm.movement_type IN ('entrega_bairrista','entrega_oficial') THEN quantity ELSE 0 END)::int AS entradas,
        SUM(CASE WHEN sm.movement_type IN ('venda_bairrista') THEN quantity ELSE 0 END)::int AS vendas
      FROM inventory_movements sm
      WHERE DATE(sm.created_at) = d::date
    ) mov ON true
    ORDER BY d DESC`,
    [since]
  );
  return r.rows;
}

// ─── Membros (1 query com todos os agregados) ────────────────────────────────
async function getMembersFull() {
  // Otimizado: elimina subquery correlacionada (N+1) para last_saida.
  // Substitui por LEFT JOIN com CTE pré-agregada por member_id.
  const r = await query(`
    WITH member_last_saida AS (
      SELECT op.member_id, MAX(o.date) AS last_saida_date
      FROM operation_participants op
      JOIN operations o ON o.id = op.operation_id
      GROUP BY op.member_id
    )
    SELECT
      m.id,
      m.discord_id,
      ${DISPLAY_NAME_EXPR('m')} AS display_name,
      m.username,
      m.role,
      m.tier,
      m.status,
      m.joined_at,
      m.promoted_at,
      m.channel_id,
      COALESCE(mv.entregas, 0)::int AS entregas,
      COALESCE(mv.weighted_entregas, 0)::numeric AS weighted_entregas,
      COALESCE(mv.vendas, 0)::int AS vendas,
      COALESCE(mss.saidas_total, 0)::int AS saidas_total,
      COALESCE(mss.wins, 0)::int AS wins,
      COALESCE(mss.losses, 0)::int AS losses,
      COALESCE(mss.kills_total, 0)::int AS kills,
      COALESCE(mss.deaths_total, 0)::int AS deaths,
      COALESCE(mss.kd_ratio, 0)::numeric AS kd,
      COALESCE(mss.survival_rate, 0)::numeric AS survival_rate,
      COALESCE(mss.material_return_rate, 0)::numeric AS return_rate,
      COALESCE(mss.profit_generated, 0)::numeric AS profit,
      COALESCE(mss.mvp_count, 0)::int AS mvps,
      mls.last_saida_date AS last_saida
    FROM members m
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial') THEN quantity ELSE 0 END)::int AS entregas,
        SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial') THEN quantity * COALESCE(sm.unit_price, i.estimated_value, 0) ELSE 0 END)::numeric AS weighted_entregas,
        SUM(CASE WHEN movement_type IN ('venda_bairrista') THEN quantity ELSE 0 END)::int AS vendas
      FROM inventory_movements sm
      LEFT JOIN items i ON i.id = sm.item_id
      WHERE sm.member_id = m.id
    ) mv ON true
    LEFT JOIN member_saida_stats mss ON mss.member_id = m.id
    LEFT JOIN member_last_saida mls ON mls.member_id = m.id
    ORDER BY m.display_name`);
  return r.rows;
}

// ─── Saídas full ─────────────────────────────────────────────────────────────
// Material é medido em UNIDADES (ok.supplied_units/returned_units/lost_units/
// consumed_units) e também disponibilizado em € (gross/net para bottom-line
// económico). A contabilização de material deve usar sempre unidades.
async function getSaidasFull(limit = 500) {
  // Otimizado: elimina 3 subqueries correlacionadas de contagem de
  // participantes. Usa LEFT JOIN com agregação prévia por operation_id.
  const r = await query(
    `
    WITH participant_counts AS (
      SELECT
        operation_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE participant_type = 'caracterizado')::int AS caracterizados,
        COUNT(*) FILTER (WHERE participant_type = 'trabalhador')::int AS trabalhadores
      FROM operation_participants
      GROUP BY operation_id
    )
    SELECT
      o.id, o.date, o.scheduled_time AS hora,
      o.spot, o.operation_type AS tipo,
      m.display_name AS leader_name,
      o.group_number, o.status, o.result,
      o.enemy_name, o.enemy_faction,
      COALESCE(pc.total, 0) AS participantes,
      COALESCE(o.characterized_count, pc.caracterizados, 0) AS caracterizados,
      COALESCE(o.workers_count, pc.trabalhadores, 0) AS trabalhadores,
      COALESCE(o.our_kills, 0)::int AS kills,
      COALESCE(o.deaths, 0)::int AS deaths,
      COALESCE(o.survivors, 0)::int AS survivors,
      COALESCE(o.returned_to_bairro_count, 0)::int AS returned_bairro,
      COALESCE(omu.supplied_units, 0)::int AS supplied_units,
      COALESCE(omu.returned_units, 0)::int AS returned_units,
      COALESCE(omu.lost_units,     0)::int AS lost_units,
      COALESCE(omu.consumed_units, 0)::int AS consumed_units,
      COALESCE(o.gross_value, 0)::numeric AS gross,
      COALESCE(o.net_value, 0)::numeric AS net,
      o.was_profitable, o.result_notes
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
    LEFT JOIN participant_counts pc ON pc.operation_id = o.id
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN direction='fornecido' THEN quantity ELSE 0 END)::int AS supplied_units,
        SUM(CASE WHEN direction='devolvido' THEN quantity ELSE 0 END)::int AS returned_units,
        SUM(CASE WHEN direction='perdido'   THEN quantity ELSE 0 END)::int AS lost_units,
        SUM(CASE WHEN direction='consumido' THEN quantity ELSE 0 END)::int AS consumed_units
      FROM operation_materials
      WHERE operation_id = o.id
    ) omu ON TRUE
    ORDER BY o.date DESC, o.id DESC
    LIMIT $1`,
    [limit]
  );
  return r.rows;
}

// ─── Participantes full ──────────────────────────────────────────────────────
// Material por participação em UNIDADES (issued_units, returned_units,
// lost_units, consumed_units) via JOIN operation_materials agregado por
// (operation_id, member_id).
async function getParticipantsFull(limit = 2000) {
  const r = await query(
    `
    SELECT
      op.operation_id AS saida_id,
      o.date, o.spot,
      m.display_name,
      COALESCE(op.participant_type, 'caracterizado') AS participant_type,
      op.own_weapon,
      op.role_in_op AS role,
      op.brought_own_material,
      op.received_org_material,
      COALESCE(pmu.issued_units,   0)::int AS issued_units,
      COALESCE(pmu.returned_units, 0)::int AS returned_units,
      COALESCE(pmu.lost_units,     0)::int AS lost_units,
      COALESCE(pmu.consumed_units, 0)::int AS consumed_units,
      COALESCE(op.kills, 0)::int AS kills,
      COALESCE(op.deaths_count, 0)::int AS deaths,
      op.survived, op.returned AS returned_bairro,
      op.mvp_flag,
      COALESCE(op.performance_score, 0)::numeric AS perf,
      COALESCE(op.discipline_score, 0)::numeric AS disc,
      op.notes
    FROM operation_participants op
    JOIN operations o ON o.id = op.operation_id
    JOIN members m ON m.id = op.member_id
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN direction='fornecido' THEN quantity ELSE 0 END)::int AS issued_units,
        SUM(CASE WHEN direction='devolvido' THEN quantity ELSE 0 END)::int AS returned_units,
        SUM(CASE WHEN direction='perdido'   THEN quantity ELSE 0 END)::int AS lost_units,
        SUM(CASE WHEN direction='consumido' THEN quantity ELSE 0 END)::int AS consumed_units
      FROM operation_materials
      WHERE operation_id = op.operation_id AND member_id = op.member_id
    ) pmu ON TRUE
    ORDER BY o.date DESC, op.operation_id DESC, m.display_name
    LIMIT $1`,
    [limit]
  );
  return r.rows;
}

// ─── Kills full ──────────────────────────────────────────────────────────────
async function getKillsFull(limit = 1000) {
  const r = await query(
    `
    SELECT
      k.id, k.created_at, k.date,
      km.display_name AS killer_name,
      k.victim_name, k.victim_faction,
      k.spot, k.saida_id, k.context, k.notes,
      cm.display_name AS confirmed_by_name
    FROM kill_logs k
    JOIN members km ON km.id = k.killer_id
    LEFT JOIN members cm ON cm.discord_id = k.confirmed_by
    ORDER BY k.created_at DESC
    LIMIT $1`,
    [limit]
  );
  return r.rows;
}

async function getKillsKPIs() {
  const total = await query('SELECT COUNT(*)::int AS n FROM kill_logs');
  const week = await query("SELECT COUNT(*)::int AS n FROM kill_logs WHERE created_at >= NOW() - INTERVAL '7 days'");
  const topKiller = await query(`
    SELECT COALESCE(m.display_name, '—') AS display_name, COUNT(*)::int AS kills
    FROM kill_logs k JOIN members m ON m.id = k.killer_id
    GROUP BY m.display_name ORDER BY kills DESC LIMIT 1`);
  const topFaction = await query(`
    SELECT victim_faction, COUNT(*)::int AS n
    FROM kill_logs WHERE victim_faction IS NOT NULL AND victim_faction <> ''
    GROUP BY victim_faction ORDER BY n DESC LIMIT 1`);
  const topSpot = await query(`
    SELECT spot, COUNT(*)::int AS n
    FROM kill_logs WHERE spot IS NOT NULL AND spot <> ''
    GROUP BY spot ORDER BY n DESC LIMIT 1`);
  return {
    total: total.rows[0]?.n || 0,
    week: week.rows[0]?.n || 0,
    topKiller: topKiller.rows[0] || null,
    topFaction: topFaction.rows[0] || null,
    topSpot: topSpot.rows[0] || null,
  };
}

// ─── Spots ───────────────────────────────────────────────────────────────────
async function getSpotsFull() {
  // Otimizado: elimina subquery correlacionada N+1 para last_saida_date.
  const r = await query(`
    WITH last_saida_per_spot AS (
      SELECT spot, MAX(date) AS last_saida_date
      FROM operations
      WHERE spot IS NOT NULL AND spot <> ''
      GROUP BY spot
    )
    SELECT
      s.*,
      m.display_name AS best_member_name,
      CASE WHEN s.total_saidas > 0 THEN s.wins::numeric / s.total_saidas ELSE 0 END AS win_rate,
      CASE WHEN s.our_deaths > 0 THEN s.our_kills::numeric / s.our_deaths ELSE s.our_kills END AS kd,
      lsp.last_saida_date
    FROM spot_stats s
    LEFT JOIN members m ON m.id = s.best_member_id
    LEFT JOIN last_saida_per_spot lsp ON lsp.spot = s.spot
    ORDER BY s.total_net_value DESC NULLS LAST`);
  return r.rows;
}

// ─── Rankings (multi-eixos) ──────────────────────────────────────────────────
async function getRankings() {
  // Query 1: entregas (única fonte diferente: inventory_movements)
  const topEntregas = await query(`
    SELECT m.discord_id, m.display_name, m.tier,
           SUM(sm.quantity)::int AS qty,
           SUM(sm.quantity * COALESCE(i.estimated_value,0))::numeric AS weighted
    FROM inventory_movements sm
    JOIN items i ON i.id = sm.item_id
    JOIN members m ON m.id = sm.member_id
    WHERE sm.movement_type IN ('entrega_bairrista','entrega_oficial')
    GROUP BY m.discord_id, m.display_name, m.tier
    ORDER BY weighted DESC NULLS LAST LIMIT 25`);

  // Query 2: todos os tops de member_saida_stats numa só query com CTEs.
  // Reduz de 6 queries para 1, eliminando 5 round-trips à DB.
  const mssRankings = await query(`
    WITH ranked AS (
      SELECT
        m.discord_id, m.display_name,
        mss.kills_total, mss.kd_ratio, mss.profit_generated,
        mss.mvp_count, mss.saidas_total, mss.survival_rate,
        mss.material_return_rate, mss.deaths_total,
        ROW_NUMBER() OVER (ORDER BY mss.kills_total DESC) AS rn_kills,
        ROW_NUMBER() OVER (ORDER BY mss.profit_generated DESC) AS rn_profit,
        ROW_NUMBER() OVER (ORDER BY mss.mvp_count DESC) AS rn_mvp,
        ROW_NUMBER() OVER (ORDER BY mss.survival_rate DESC) AS rn_survival,
        ROW_NUMBER() OVER (ORDER BY mss.material_return_rate DESC) AS rn_discipline,
        ROW_NUMBER() OVER (ORDER BY mss.kd_ratio DESC) AS rn_kd
      FROM member_saida_stats mss
      JOIN members m ON m.id = mss.member_id
    )
    SELECT
      discord_id, display_name,
      kills_total, kd_ratio, profit_generated,
      mvp_count, saidas_total, survival_rate,
      material_return_rate, deaths_total,
      rn_kills, rn_profit, rn_mvp, rn_survival, rn_discipline, rn_kd
    FROM ranked
    WHERE rn_kills <= 25
       OR rn_profit <= 25
       OR (rn_mvp <= 25 AND mvp_count > 0)
       OR (rn_survival <= 25 AND saidas_total >= 3)
       OR (rn_discipline <= 25 AND material_return_rate > 0)
       OR (rn_kd <= 25 AND kills_total + deaths_total >= 3)`);

  // Particionar no JS — mais eficiente que 6 queries separadas.
  const rows = mssRankings.rows;
  return {
    topEntregas: topEntregas.rows,
    topKills: rows.filter(r => r.rn_kills <= 25).sort((a, b) => a.rn_kills - b.rn_kills),
    topProfit: rows.filter(r => r.rn_profit <= 25).sort((a, b) => a.rn_profit - b.rn_profit),
    topMVP: rows.filter(r => r.rn_mvp <= 25 && r.mvp_count > 0).sort((a, b) => a.rn_mvp - b.rn_mvp),
    topSurvival: rows
      .filter(r => r.rn_survival <= 25 && r.saidas_total >= 3)
      .sort((a, b) => a.rn_survival - b.rn_survival),
    topDiscipline: rows
      .filter(r => r.rn_discipline <= 25 && r.material_return_rate > 0)
      .sort((a, b) => a.rn_discipline - b.rn_discipline),
    topKD: rows.filter(r => r.rn_kd <= 25 && r.kills_total + r.deaths_total >= 3).sort((a, b) => a.rn_kd - b.rn_kd),
  };
}

// ─── Inventário / movimentos ─────────────────────────────────────────────────
async function getInventoryFull() {
  // Otimizado: elimina 3 subqueries correlacionadas (N+1) substituindo por
  // LEFT JOINs com agregações pré-computadas. Escalabilidade: O(n) em vez
  // de O(n²) para N items.
  const r = await query(`
    WITH stock_balances AS (
      SELECT i.id,
        COALESCE(SUM(${STOCK_BALANCE_CASE}),     0)::int AS balance,
        COALESCE(SUM(${STOCK_BALANCE_ARMAZEM}),  0)::int AS balance_armazem,
        COALESCE(SUM(${STOCK_BALANCE_GRUPO}),    0)::int AS balance_grupo
      FROM items i
      LEFT JOIN inventory_movements im ON im.item_id = i.id
      WHERE i.active = true
      GROUP BY i.id
    ),
    movement_stats AS (
      SELECT
        item_id,
        MAX(created_at) AS last_movement,
        SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial') THEN quantity ELSE 0 END)::int AS total_in,
        SUM(CASE WHEN movement_type NOT IN ('entrega_bairrista','entrega_oficial') THEN quantity ELSE 0 END)::int AS total_out
      FROM inventory_movements
      GROUP BY item_id
    )
    SELECT
      i.id, i.name, i.category, i.unit,
      sb.balance, sb.balance_armazem, sb.balance_grupo,
      i.estimated_value, i.alert_enabled, i.alert_threshold,
      (COALESCE(sb.balance,0) * COALESCE(i.estimated_value,0))::numeric AS value_total,
      (COALESCE(sb.balance_armazem,0) * COALESCE(i.estimated_value,0))::numeric AS value_armazem,
      (COALESCE(sb.balance_grupo,0)   * COALESCE(i.estimated_value,0))::numeric AS value_grupo,
      ms.last_movement,
      ms.total_in,
      ms.total_out
    FROM items i
    JOIN stock_balances sb ON sb.id = i.id
    LEFT JOIN movement_stats ms ON ms.item_id = i.id
    WHERE i.active = true
    ORDER BY value_total DESC NULLS LAST, i.name`);
  return r.rows;
}

async function getMovementsFull(limit = 2000) {
  const r = await query(
    `
    SELECT
      sm.created_at, sm.movement_type, sm.location,
      i.name AS item, i.category AS categoria,
      sm.quantity,
      COALESCE(i.estimated_value, 0)::numeric AS unit_value,
      (sm.quantity * COALESCE(i.estimated_value,0))::numeric AS total_value,
      sm.created_by AS actor_id,
      m.display_name AS member_name, m.role AS member_role, m.tier AS member_tier,
      sm.context,
      sm.saida_id,
      o.spot AS saida_spot,
      sm.notes
    FROM inventory_movements sm
    JOIN items i ON i.id = sm.item_id
    LEFT JOIN members m ON m.id = sm.member_id
    LEFT JOIN operations o ON o.id = sm.saida_id
    ORDER BY sm.created_at DESC
    LIMIT $1`,
    [limit]
  );
  return r.rows;
}

// Lista compacta de items para autocomplete dos slash commands.
async function getActiveItemsList() {
  const r = await query('SELECT id, name FROM items WHERE active = true ORDER BY name');
  return r.rows;
}

// ─── Top movers (top 3 por eixo, para o Dashboard) ───────────────────────────
async function getTopMovers() {
  const w = weekBounds();

  const topEntregas = await query(
    `
    SELECT COALESCE(m.display_name, '—') AS display_name, SUM(sm.quantity)::int AS value
    FROM inventory_movements sm
    JOIN members m ON m.id = sm.member_id
    WHERE sm.created_at >= $1::date
      AND sm.movement_type IN ('entrega_bairrista','entrega_oficial')
    GROUP BY m.display_name
    ORDER BY value DESC NULLS LAST LIMIT 3`,
    [w.start]
  );

  const topKills = await query(
    `
    SELECT COALESCE(m.display_name, '—') AS display_name, COUNT(*)::int AS value
    FROM kill_logs k
    JOIN members m ON m.id = k.killer_id
    WHERE k.created_at >= $1::date
    GROUP BY m.display_name
    ORDER BY value DESC NULLS LAST LIMIT 3`,
    [w.start]
  );

  const topProfit = await query(
    `
    SELECT COALESCE(m.display_name, '—') AS display_name, SUM(COALESCE(o.net_value,0))::numeric AS value
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
    WHERE o.date >= $1::date AND o.status = 'concluida' AND o.leader_id IS NOT NULL
    GROUP BY m.display_name
    ORDER BY value DESC NULLS LAST LIMIT 3`,
    [w.start]
  );

  return { topEntregas: topEntregas.rows, topKills: topKills.rows, topProfit: topProfit.rows };
}

// ─── Tendências semanais (para a secção "TENDÊNCIA" do Dashboard) ────────────
async function getTrending() {
  const w = weekBounds();
  const pw = prevWeekBounds();

  const sqlSaidas = (s, e) =>
    query(
      `
    SELECT
      COUNT(*)::int AS saidas,
      SUM(CASE WHEN result = 'vitoria' THEN 1 ELSE 0 END)::int AS wins,
      SUM(COALESCE(our_kills,0))::int AS kills,
      SUM(COALESCE(deaths,0))::int AS deaths,
      SUM(COALESCE(net_value,0))::numeric AS net,
      SUM(COALESCE(gross_value,0))::numeric AS gross
    FROM operations
    WHERE date >= $1::date AND date < $2::date AND status = 'concluida'`,
      [s, e]
    );

  // Material em UNIDADES (fornecido/devolvido/perdido/consumido)
  const sqlMatUnits = (s, e) =>
    query(
      `
    SELECT
      SUM(CASE WHEN om.direction='fornecido' THEN om.quantity ELSE 0 END)::int AS supplied,
      SUM(CASE WHEN om.direction='devolvido' THEN om.quantity ELSE 0 END)::int AS returned,
      SUM(CASE WHEN om.direction='perdido'   THEN om.quantity ELSE 0 END)::int AS lost,
      SUM(CASE WHEN om.direction='consumido' THEN om.quantity ELSE 0 END)::int AS consumed
    FROM operation_materials om
    JOIN operations o ON o.id = om.operation_id
    WHERE o.date >= $1::date AND o.date < $2::date AND o.status = 'concluida'`,
      [s, e]
    );

  const sqlMov = (s, e) =>
    query(
      `
    SELECT
      SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial') THEN quantity ELSE 0 END)::int AS entregas,
      SUM(CASE WHEN movement_type IN ('venda_bairrista') THEN quantity ELSE 0 END)::int AS vendas
    FROM inventory_movements
    WHERE created_at >= $1::date AND created_at < $2::date`,
      [s, e]
    );

  const nextDay = d => {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + 1);
    return x.toISOString().split('T')[0];
  };
  const curEndExcl = nextDay(w.end);

  const [cs, ps, cm, pm, cMat, pMat] = await Promise.all([
    sqlSaidas(w.start, curEndExcl),
    sqlSaidas(pw.start, pw.end),
    sqlMov(w.start, curEndExcl),
    sqlMov(pw.start, pw.end),
    sqlMatUnits(w.start, curEndExcl),
    sqlMatUnits(pw.start, pw.end),
  ]);

  const C = cs.rows[0] || {};
  const P = ps.rows[0] || {};
  const CM = cm.rows[0] || {};
  const PM = pm.rows[0] || {};
  const CT = cMat.rows[0] || {};
  const PT = pMat.rows[0] || {};

  return {
    saidas: { current: Number(C.saidas) || 0, previous: Number(P.saidas) || 0 },
    wins: { current: Number(C.wins) || 0, previous: Number(P.wins) || 0 },
    kills: { current: Number(C.kills) || 0, previous: Number(P.kills) || 0 },
    deaths: { current: Number(C.deaths) || 0, previous: Number(P.deaths) || 0 },
    net: { current: Number(C.net) || 0, previous: Number(P.net) || 0 },
    gross: { current: Number(C.gross) || 0, previous: Number(P.gross) || 0 },
    // Material em UNIDADES (não €)
    supplied_units: { current: Number(CT.supplied) || 0, previous: Number(PT.supplied) || 0 },
    returned_units: { current: Number(CT.returned) || 0, previous: Number(PT.returned) || 0 },
    lost_units: { current: Number(CT.lost) || 0, previous: Number(PT.lost) || 0 },
    consumed_units: { current: Number(CT.consumed) || 0, previous: Number(PT.consumed) || 0 },
    entregas: { current: Number(CM.entregas) || 0, previous: Number(PM.entregas) || 0 },
    vendas: { current: Number(CM.vendas) || 0, previous: Number(PM.vendas) || 0 },
  };
}

// ─── Alertas automáticos para o Dashboard ────────────────────────────────────
// Produz uma lista de {kind:'warn'|'danger'|'info', message:string}.
async function getAlerts() {
  const alerts = [];

  // 1) Stock crítico (balance <= 3 e active)
  const criticalStock = await query(`
    WITH stock_balances AS (
      SELECT i.id, i.name, i.category,
        COALESCE(SUM(${STOCK_BALANCE_CASE}), 0) AS balance
      FROM items i
      LEFT JOIN inventory_movements im ON im.item_id = i.id
      WHERE i.active = true
      GROUP BY i.id, i.name, i.category
    )
    SELECT name, category, balance FROM stock_balances
    WHERE balance <= 3
    ORDER BY balance ASC, name
    LIMIT 5`);
  for (const r of criticalStock.rows) {
    alerts.push({
      kind: r.balance <= 0 ? 'danger' : 'warn',
      message: `Stock crítico: ${r.name} (${r.category}) — ${r.balance} restantes`,
    });
  }

  // 2) Spots com queda brusca (last saida perdida + >1 morte)
  const badSpots = await query(`
    SELECT spot, our_deaths, total_saidas
    FROM spot_stats
    WHERE total_saidas >= 3 AND our_deaths >= our_kills AND our_deaths > 0
    ORDER BY our_deaths DESC LIMIT 3`);
  for (const r of badSpots.rows) {
    alerts.push({
      kind: 'warn',
      message: `Spot ${r.spot} acumula ${r.our_deaths} mortes em ${r.total_saidas} saídas — reavaliar.`,
    });
  }

  // 3) Semana sem saídas concluídas
  const w = weekBounds();
  const weekOps = await query(
    `
    SELECT COUNT(*)::int AS n FROM operations
    WHERE date >= $1::date AND status = 'concluida'`,
    [w.start]
  );
  if ((weekOps.rows[0]?.n || 0) === 0) {
    alerts.push({ kind: 'info', message: 'Nenhuma saída concluída esta semana ainda.' });
  }

  return alerts;
}

// ─── Stock agrupado por categoria (para secção de breakdown) ─────────────────
async function getStockByCategory() {
  const r = await query(`
    WITH stock_balances AS (
      SELECT i.id, i.category, i.estimated_value,
        COALESCE(SUM(${STOCK_BALANCE_CASE}),    0) AS balance,
        COALESCE(SUM(${STOCK_BALANCE_ARMAZEM}), 0) AS balance_armazem,
        COALESCE(SUM(${STOCK_BALANCE_GRUPO}),   0) AS balance_grupo
      FROM items i
      LEFT JOIN inventory_movements im ON im.item_id = i.id
      WHERE i.active = true
      GROUP BY i.id, i.category, i.estimated_value
    )
    SELECT category,
      COUNT(*)::int AS items_count,
      SUM(balance)::int          AS total_qty,
      SUM(balance_armazem)::int  AS qty_armazem,
      SUM(balance_grupo)::int    AS qty_grupo,
      SUM(balance         * COALESCE(estimated_value, 0))::numeric AS total_value,
      SUM(balance_armazem * COALESCE(estimated_value, 0))::numeric AS value_armazem,
      SUM(balance_grupo   * COALESCE(estimated_value, 0))::numeric AS value_grupo
    FROM stock_balances
    GROUP BY category
    ORDER BY total_value DESC NULLS LAST`);
  return r.rows;
}

// ─── Streaks (wins consecutivas em saídas recentes) ──────────────────────────
async function getMemberStreaks(limit = 5) {
  const r = await query(
    `
    WITH recent AS (
      SELECT op.member_id, o.date, o.result,
        ROW_NUMBER() OVER (PARTITION BY op.member_id ORDER BY o.date DESC, o.id DESC) AS rn
      FROM operation_participants op
      JOIN operations o ON o.id = op.operation_id
      WHERE o.status = 'concluida'
    ),
    last5 AS (
      SELECT member_id,
        SUM(CASE WHEN result = 'vitoria' THEN 1 ELSE 0 END)::int AS wins,
        COUNT(*)::int AS total
      FROM recent WHERE rn <= 5
      GROUP BY member_id
    )
    SELECT m.display_name, l.wins, l.total
    FROM last5 l
    JOIN members m ON m.id = l.member_id
    WHERE l.total >= 3
    ORDER BY l.wins DESC, l.total DESC LIMIT $1`,
    [limit]
  );
  return r.rows;
}

// ── Bairristas Analytics (para tab Resumo — secção Bairristas) ──────────
async function getBairristaRankings() {
  const w = weekBounds();
  const d = new Date();
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().split('T')[0];
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().split('T')[0];

  // Top 10 Bairristas semanal
  const weekly = await query(
    `
    SELECT wr.*, m.discord_id, ${DISPLAY_NAME_EXPR('m')} AS display_name, m.tier,
           ROW_NUMBER() OVER (ORDER BY GREATEST(wr.hybrid_score, wr.weighted_value) DESC) AS pos
    FROM weekly_rankings wr
    JOIN members m ON m.id = wr.member_id
    WHERE wr.week_start = $1 AND m.role = 'bairrista'
    ORDER BY GREATEST(wr.hybrid_score, wr.weighted_value) DESC
    LIMIT 10
  `,
    [w.start]
  );

  // Top 10 Bairristas mensal
  const monthly = await query(
    `
    SELECT mr.*, m.discord_id, ${DISPLAY_NAME_EXPR('m')} AS display_name, m.tier,
           ROW_NUMBER() OVER (ORDER BY GREATEST(mr.hybrid_score, mr.weighted_value) DESC) AS pos
    FROM monthly_rankings mr
    JOIN members m ON m.id = mr.member_id
    WHERE mr.month_start = $1 AND m.role = 'bairrista'
    ORDER BY GREATEST(mr.hybrid_score, mr.weighted_value) DESC
    LIMIT 10
  `,
    [monthStart]
  );

  // Top 10 Bairristas all-time
  const allTime = await query(`
    SELECT ats.*, m.discord_id, ats.saidas_total AS operations_count,
           ${DISPLAY_NAME_EXPR('m')} AS display_name, m.tier,
           ROW_NUMBER() OVER (ORDER BY GREATEST(ats.hybrid_score, ats.weighted_value) DESC) AS pos
    FROM all_time_stats ats
    JOIN members m ON m.id = ats.member_id
    WHERE m.role = 'bairrista'
    ORDER BY GREATEST(ats.hybrid_score, ats.weighted_value) DESC
    LIMIT 10
  `);

  // Streaks (semanas consecutivas com material) — top 5
  const streaks = await query(`
    WITH active_weeks AS (
      SELECT member_id, week_start
      FROM weekly_rankings
      WHERE deliveries > 0 OR sales > 0
      ORDER BY member_id, week_start DESC
    ),
    streaks AS (
      SELECT member_id, COUNT(*) AS streak_len
      FROM (
        SELECT member_id, week_start,
               ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY week_start DESC) AS rn,
               week_start - (ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY week_start DESC) * INTERVAL '7 days') AS grp
        FROM active_weeks
      ) sub
      WHERE grp = (
        SELECT week_start - (ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY week_start DESC) * INTERVAL '7 days')
        FROM active_weeks aw WHERE aw.member_id = sub.member_id
        ORDER BY week_start DESC LIMIT 1
      )
      GROUP BY member_id
    )
    SELECT m.discord_id, s.streak_len, ${DISPLAY_NAME_EXPR('m')} AS display_name
    FROM streaks s
    JOIN members m ON m.id = s.member_id
    ORDER BY s.streak_len DESC
    LIMIT 5
  `);

  return {
    weekly: weekly.rows,
    monthly: monthly.rows,
    allTime: allTime.rows,
    streaks: streaks.rows,
    weekBounds: w,
    monthBounds: { start: monthStart, end: monthEnd },
  };
}

module.exports = {
  weekBounds,
  prevWeekBounds,
  daysAgoISO,
  getDashboardKPIs,
  getWeeklySummary,
  getDailyBreakdown,
  getMembersFull,
  getSaidasFull,
  getParticipantsFull,
  getKillsFull,
  getKillsKPIs,
  getSpotsFull,
  getRankings,
  getInventoryFull,
  getMovementsFull,
  // Novos — Dashboard premium
  getTopMovers,
  getTrending,
  getAlerts,
  getStockByCategory,
  getMemberStreaks,
  // Stock per-casa
  getActiveItemsList,
  // Bairristas analytics
  getBairristaRankings,
};
