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

// ─── Helpers de datas ────────────────────────────────────────────────────────
function weekBounds(ref = new Date()) {
  const d = new Date(ref);
  const day = d.getUTCDay(); // 0=Dom..6=Sáb
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + mondayOffset));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    start: start.toISOString().split('T')[0],
    end:   end.toISOString().split('T')[0],
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
const STOCK_BALANCE_CASE = `
  CASE
    WHEN im.movement_type IN (
      'saldo_inicial', 'entrega_morador', 'venda_morador', 'entrega_oficial',
      'devolucao_operacao', 'apreendido', 'craftado'
    ) THEN im.quantity
    WHEN im.movement_type IN ('fornecimento_org', 'consumo_operacao', 'perda_operacao')
      THEN -im.quantity
    WHEN im.movement_type = 'ajuste_manual'
      THEN im.quantity
    ELSE 0
  END`;

// ─── KPIs do Dashboard ───────────────────────────────────────────────────────
async function getDashboardKPIs() {
  const w = weekBounds();
  const pw = prevWeekBounds();

  // 1) Stock total (qtd + valor estimado) — balance calculado a partir de movimentos
  const stock = await query(`
    WITH stock_balances AS (
      SELECT i.id, i.estimated_value,
        COALESCE(SUM(${STOCK_BALANCE_CASE}), 0) AS balance
      FROM items i
      LEFT JOIN inventory_movements im ON im.item_id = i.id
      WHERE i.active = true
      GROUP BY i.id, i.estimated_value
    )
    SELECT
      COALESCE(SUM(balance), 0)::int AS total_qty,
      COALESCE(SUM(balance * COALESCE(estimated_value, 0)), 0)::numeric AS total_value
    FROM stock_balances`);

  // 2) Movimentos da semana (entradas/vendas em UNIDADES, não €)
  const weekMov = await query(`
    SELECT
      SUM(CASE WHEN movement_type IN ('entrega_morador','entrega_oficial') THEN quantity ELSE 0 END)::int AS entradas,
      SUM(CASE WHEN movement_type = 'venda_morador' THEN quantity ELSE 0 END)::int AS vendas
    FROM inventory_movements sm
    WHERE sm.created_at >= $1::date`,
    [w.start]);

  const prevMov = await query(`
    SELECT
      SUM(CASE WHEN movement_type IN ('entrega_morador','entrega_oficial') THEN quantity ELSE 0 END)::int AS entradas
    FROM inventory_movements sm
    WHERE sm.created_at >= $1::date AND sm.created_at < $2::date`,
    [pw.start, pw.end]);

  // 3) Saídas da semana
  const saidas = await query(`
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN result = 'vitoria' THEN 1 ELSE 0 END)::int AS wins,
      SUM(CASE WHEN result = 'derrota' THEN 1 ELSE 0 END)::int AS losses,
      SUM(COALESCE(our_kills, 0))::int AS kills,
      SUM(COALESCE(deaths, 0))::int AS deaths,
      SUM(COALESCE(net_value, 0))::numeric AS net,
      SUM(COALESCE(gross_value, 0))::numeric AS gross,
      SUM(COALESCE(lost_value, 0))::numeric AS lost,
      SUM(COALESCE(returned_value, 0))::numeric AS returned,
      SUM(COALESCE(supplied_value, 0))::numeric AS supplied
    FROM operations
    WHERE date >= $1::date AND status = 'concluida'`,
    [w.start]);

  const prevSaidas = await query(`
    SELECT
      COUNT(*)::int AS total,
      SUM(COALESCE(net_value, 0))::numeric AS net,
      SUM(COALESCE(our_kills, 0))::int AS kills
    FROM operations
    WHERE date >= $1::date AND date < $2::date AND status = 'concluida'`,
    [pw.start, pw.end]);

  // 4) Members ativos por role
  const members = await query(`
    SELECT
      SUM(CASE WHEN role IN ('morador','chefe_moradores') AND status='ativo' THEN 1 ELSE 0 END)::int AS moradores,
      SUM(CASE WHEN role IN ('oficial','chefia') AND status='ativo' THEN 1 ELSE 0 END)::int AS oficiais
    FROM members`);

  // 5) Top contributor (week) — em UNIDADES de material entregue
  const topContrib = await query(`
    SELECT m.discord_id, m.display_name, SUM(sm.quantity)::int AS value
    FROM inventory_movements sm
    JOIN members m ON m.id = sm.member_id
    WHERE sm.created_at >= $1::date AND sm.movement_type IN ('entrega_morador','entrega_oficial')
    GROUP BY m.discord_id, m.display_name
    ORDER BY value DESC NULLS LAST LIMIT 1`,
    [w.start]);

  const topKiller = await query(`
    SELECT m.discord_id, m.display_name, COUNT(*)::int AS kills
    FROM kill_logs k
    JOIN members m ON m.id = k.killer_id
    WHERE k.created_at >= $1::date
    GROUP BY m.discord_id, m.display_name
    ORDER BY kills DESC LIMIT 1`,
    [w.start]);

  // 6) Spot mais rentável / mais perigoso
  const spotNet = await query(`
    SELECT spot, total_net_value, total_saidas
    FROM spot_stats WHERE total_saidas > 0
    ORDER BY total_net_value DESC LIMIT 1`);
  const spotDanger = await query(`
    SELECT spot, our_deaths, total_saidas
    FROM spot_stats WHERE total_saidas > 0
    ORDER BY our_deaths DESC LIMIT 1`);

  const totalWins = saidas.rows[0]?.wins || 0;
  const totalOps = saidas.rows[0]?.total || 0;
  const totalKills = saidas.rows[0]?.kills || 0;
  const totalDeaths = saidas.rows[0]?.deaths || 0;

  return {
    stockQty:        Number(stock.rows[0]?.total_qty) || 0,
    stockValue:      Number(stock.rows[0]?.total_value) || 0,
    weekEntradas:    Number(weekMov.rows[0]?.entradas) || 0,
    weekVendas:      Number(weekMov.rows[0]?.vendas) || 0,
    prevEntradas:    Number(prevMov.rows[0]?.entradas) || 0,
    saidasTotal:     totalOps,
    saidasWins:      totalWins,
    saidasLosses:    saidas.rows[0]?.losses || 0,
    winRate:         totalOps > 0 ? totalWins / totalOps : 0,
    netWeek:         Number(saidas.rows[0]?.net) || 0,
    netPrevWeek:     Number(prevSaidas.rows[0]?.net) || 0,
    killsWeek:       totalKills,
    killsPrevWeek:   prevSaidas.rows[0]?.kills || 0,
    deathsWeek:      totalDeaths,
    kdOrg:           totalDeaths > 0 ? totalKills / totalDeaths : totalKills,
    lostMaterial:    Number(saidas.rows[0]?.lost) || 0,
    returnedMaterial:Number(saidas.rows[0]?.returned) || 0,
    moradoresAtivos: members.rows[0]?.moradores || 0,
    oficiaisAtivos:  members.rows[0]?.oficiais || 0,
    topContributor:  topContrib.rows[0] || null,
    topKiller:       topKiller.rows[0] || null,
    topSpotProfit:   spotNet.rows[0] || null,
    topSpotDanger:   spotDanger.rows[0] || null,
    weekBounds:      w,
    prevWeekBounds:  pw,
  };
}

// ─── Resumo Semanal + comparativo ────────────────────────────────────────────
async function getWeeklySummary() {
  const w = weekBounds();
  const pw = prevWeekBounds();

  const sql = (start, end) => query(`
    SELECT
      COUNT(DISTINCT o.id)::int AS ops,
      SUM(CASE WHEN o.result='vitoria' THEN 1 ELSE 0 END)::int AS wins,
      SUM(CASE WHEN o.result='derrota' THEN 1 ELSE 0 END)::int AS losses,
      SUM(CASE WHEN o.result='empate' THEN 1 ELSE 0 END)::int AS draws,
      SUM(COALESCE(o.our_kills,0))::int AS kills,
      SUM(COALESCE(o.deaths,0))::int AS deaths,
      SUM(COALESCE(o.gross_value,0))::numeric AS gross,
      SUM(COALESCE(o.net_value,0))::numeric AS net,
      SUM(COALESCE(o.returned_value,0))::numeric AS returned,
      SUM(COALESCE(o.supplied_value,0))::numeric AS supplied
    FROM operations o
    WHERE o.date >= $1::date ${end ? 'AND o.date < $2::date' : ''} AND o.status = 'concluida'`,
    end ? [start, end] : [start]);

  const cur = (await sql(w.start)).rows[0] || {};
  const prev = (await sql(pw.start, pw.end)).rows[0] || {};

  const deliveries = await query(`
    SELECT
      SUM(CASE WHEN sm.movement_type IN ('entrega_morador','entrega_oficial') THEN quantity ELSE 0 END)::int AS entregas,
      SUM(CASE WHEN sm.movement_type = 'venda_morador' THEN quantity ELSE 0 END)::int AS vendas,
      SUM(CASE WHEN sm.movement_type IN ('entrega_morador','entrega_oficial','venda_morador')
          THEN quantity ELSE 0 END)::int AS weighted
    FROM inventory_movements sm
    WHERE sm.created_at >= $1::date`,
    [w.start]);

  return { current: { ...cur, ...deliveries.rows[0] }, previous: prev, bounds: { current: w, previous: pw } };
}

// ─── Resumo Diário (últimos 14 dias) ─────────────────────────────────────────
async function getDailyBreakdown(days = 14) {
  const since = daysAgoISO(days);
  const r = await query(`
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
        SUM(CASE WHEN sm.movement_type IN ('entrega_morador','entrega_oficial') THEN quantity ELSE 0 END)::int AS entradas,
        SUM(CASE WHEN sm.movement_type = 'venda_morador' THEN quantity ELSE 0 END)::int AS vendas
      FROM inventory_movements sm
      WHERE DATE(sm.created_at) = d::date
    ) mov ON true
    ORDER BY d DESC`,
    [since]);
  return r.rows;
}

// ─── Membros (1 query com todos os agregados) ────────────────────────────────
async function getMembersFull() {
  const r = await query(`
    SELECT
      m.id,
      m.discord_id,
      m.display_name,
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
      (SELECT MAX(date) FROM operations o
        JOIN operation_participants op ON op.operation_id = o.id
        WHERE op.member_id = m.id) AS last_saida
    FROM members m
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN movement_type IN ('entrega_morador','entrega_oficial') THEN quantity ELSE 0 END)::int AS entregas,
        -- Material total em UNIDADES (não valor €). O preço estimado do item
        -- é usado só em cálculos económicos de saídas, não aqui.
        SUM(CASE WHEN movement_type IN ('entrega_morador','entrega_oficial') THEN quantity ELSE 0 END)::int AS weighted_entregas,
        SUM(CASE WHEN movement_type = 'venda_morador' THEN quantity ELSE 0 END)::int AS vendas
      FROM inventory_movements sm
      WHERE sm.member_id = m.id
    ) mv ON true
    LEFT JOIN member_saida_stats mss ON mss.member_id = m.id
    WHERE m.status = 'ativo' OR m.status IS NULL
    ORDER BY m.display_name`);
  return r.rows;
}

// ─── Saídas full ─────────────────────────────────────────────────────────────
async function getSaidasFull(limit = 500) {
  const r = await query(`
    SELECT
      o.id, o.date, o.scheduled_time AS hora,
      o.spot, o.operation_type AS tipo,
      m.display_name AS leader_name,
      o.group_number, o.status, o.result,
      o.enemy_name, o.enemy_faction,
      (SELECT COUNT(*) FROM operation_participants op WHERE op.operation_id = o.id)::int AS participantes,
      COALESCE(o.our_kills, 0)::int AS kills,
      COALESCE(o.deaths, 0)::int AS deaths,
      COALESCE(o.survivors, 0)::int AS survivors,
      COALESCE(o.returned_to_bairro_count, 0)::int AS returned_bairro,
      COALESCE(o.supplied_value, 0)::numeric AS supplied,
      COALESCE(o.returned_value, 0)::numeric AS returned,
      COALESCE(o.lost_value, 0)::numeric AS lost,
      COALESCE(o.consumed_value, 0)::numeric AS consumed,
      COALESCE(o.gross_value, 0)::numeric AS gross,
      COALESCE(o.net_value, 0)::numeric AS net,
      o.was_profitable, o.result_notes
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
    ORDER BY o.date DESC, o.id DESC
    LIMIT $1`,
    [limit]);
  return r.rows;
}

// ─── Participantes full ──────────────────────────────────────────────────────
async function getParticipantsFull(limit = 2000) {
  const r = await query(`
    SELECT
      op.operation_id AS saida_id,
      o.date, o.spot,
      m.display_name,
      op.role_in_op AS role,
      op.brought_own_material,
      op.received_org_material,
      COALESCE(op.issued_value, 0)::numeric AS issued,
      COALESCE(op.returned_value, 0)::numeric AS returned,
      COALESCE(op.lost_value, 0)::numeric AS lost,
      COALESCE(op.consumed_value, 0)::numeric AS consumed,
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
    ORDER BY o.date DESC, op.operation_id DESC, m.display_name
    LIMIT $1`,
    [limit]);
  return r.rows;
}

// ─── Kills full ──────────────────────────────────────────────────────────────
async function getKillsFull(limit = 1000) {
  const r = await query(`
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
    [limit]);
  return r.rows;
}

async function getKillsKPIs() {
  const total = await query(`SELECT COUNT(*)::int AS n FROM kill_logs`);
  const week = await query(`SELECT COUNT(*)::int AS n FROM kill_logs WHERE created_at >= NOW() - INTERVAL '7 days'`);
  const topKiller = await query(`
    SELECT m.display_name, COUNT(*)::int AS kills
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
  const r = await query(`
    SELECT
      s.*,
      m.display_name AS best_member_name,
      CASE WHEN s.total_saidas > 0 THEN s.wins::numeric / s.total_saidas ELSE 0 END AS win_rate,
      CASE WHEN s.our_deaths > 0 THEN s.our_kills::numeric / s.our_deaths ELSE s.our_kills END AS kd,
      (SELECT MAX(date) FROM operations WHERE spot = s.spot) AS last_saida_date
    FROM spot_stats s
    LEFT JOIN members m ON m.id = s.best_member_id
    ORDER BY s.total_net_value DESC NULLS LAST`);
  return r.rows;
}

// ─── Rankings (multi-eixos) ──────────────────────────────────────────────────
async function getRankings() {
  const topEntregas = await query(`
    SELECT m.discord_id, m.display_name, m.tier,
           SUM(sm.quantity)::int AS qty,
           SUM(sm.quantity * COALESCE(i.estimated_value,0))::numeric AS weighted
    FROM inventory_movements sm
    JOIN items i ON i.id = sm.item_id
    JOIN members m ON m.id = sm.member_id
    WHERE sm.movement_type IN ('entrega_morador','entrega_oficial')
    GROUP BY m.discord_id, m.display_name, m.tier
    ORDER BY weighted DESC NULLS LAST LIMIT 25`);

  const topKills = await query(`
    SELECT m.discord_id, m.display_name, kills_total, kd_ratio
    FROM member_saida_stats mss
    JOIN members m ON m.id = mss.member_id
    ORDER BY kills_total DESC LIMIT 25`);

  const topProfit = await query(`
    SELECT m.discord_id, m.display_name, profit_generated
    FROM member_saida_stats mss
    JOIN members m ON m.id = mss.member_id
    ORDER BY profit_generated DESC LIMIT 25`);

  const topMVP = await query(`
    SELECT m.discord_id, m.display_name, mvp_count, saidas_total
    FROM member_saida_stats mss
    JOIN members m ON m.id = mss.member_id
    WHERE mvp_count > 0
    ORDER BY mvp_count DESC LIMIT 25`);

  const topSurvival = await query(`
    SELECT m.discord_id, m.display_name, survival_rate, saidas_total
    FROM member_saida_stats mss
    JOIN members m ON m.id = mss.member_id
    WHERE saidas_total >= 3
    ORDER BY survival_rate DESC LIMIT 25`);

  const topDiscipline = await query(`
    SELECT m.discord_id, m.display_name, material_return_rate
    FROM member_saida_stats mss
    JOIN members m ON m.id = mss.member_id
    WHERE material_return_rate > 0
    ORDER BY material_return_rate DESC LIMIT 25`);

  const topKD = await query(`
    SELECT m.discord_id, m.display_name, kd_ratio, kills_total, deaths_total
    FROM member_saida_stats mss
    JOIN members m ON m.id = mss.member_id
    WHERE kills_total + deaths_total >= 3
    ORDER BY kd_ratio DESC LIMIT 25`);

  return { topEntregas: topEntregas.rows, topKills: topKills.rows, topProfit: topProfit.rows,
           topMVP: topMVP.rows, topSurvival: topSurvival.rows, topDiscipline: topDiscipline.rows,
           topKD: topKD.rows };
}

// ─── Inventário / movimentos ─────────────────────────────────────────────────
async function getInventoryFull() {
  const r = await query(`
    WITH stock_balances AS (
      SELECT i.id, COALESCE(SUM(${STOCK_BALANCE_CASE}), 0) AS balance
      FROM items i
      LEFT JOIN inventory_movements im ON im.item_id = i.id
      WHERE i.active = true
      GROUP BY i.id
    )
    SELECT
      i.id, i.name, i.category, i.unit, sb.balance, i.estimated_value,
      (COALESCE(sb.balance,0) * COALESCE(i.estimated_value,0))::numeric AS value_total,
      (SELECT MAX(created_at) FROM inventory_movements WHERE item_id = i.id) AS last_movement,
      (SELECT SUM(quantity)::int FROM inventory_movements WHERE item_id = i.id AND movement_type IN ('entrega_morador','entrega_oficial')) AS total_in,
      (SELECT SUM(quantity)::int FROM inventory_movements WHERE item_id = i.id AND movement_type NOT IN ('entrega_morador','entrega_oficial')) AS total_out
    FROM items i
    JOIN stock_balances sb ON sb.id = i.id
    WHERE i.active = true
    ORDER BY i.category, i.name`);
  return r.rows;
}

async function getMovementsFull(limit = 2000) {
  const r = await query(`
    SELECT
      sm.created_at, sm.movement_type,
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
    [limit]);
  return r.rows;
}

async function getAuditFull(limit = 1000) {
  const r = await query(`
    SELECT a.id, a.action, a.entity_type, a.entity_id,
           a.actor_id, a.before_state, a.after_state, a.context, a.created_at,
           COALESCE(NULLIF(a.actor_name, ''), m.display_name) AS actor_name
    FROM audit_logs a
    LEFT JOIN members m ON m.discord_id = a.actor_id
    ORDER BY a.created_at DESC
    LIMIT $1`,
    [limit]);
  return r.rows;
}

module.exports = {
  weekBounds, prevWeekBounds, daysAgoISO,
  getDashboardKPIs,
  getWeeklySummary,
  getDailyBreakdown,
  getMembersFull,
  getSaidasFull,
  getParticipantsFull,
  getKillsFull, getKillsKPIs,
  getSpotsFull,
  getRankings,
  getInventoryFull,
  getMovementsFull,
  getAuditFull,
};
