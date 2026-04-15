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
//
// Importante sobre 2 casas:
//   - Movimentos têm coluna `location` ('armazem' | 'grupo' | NULL).
//   - 'transferencia' aparece como par de movimentos: ajuste_manual -X numa casa
//     + ajuste_manual +X na outra casa, mantendo total global inalterado.
// Movement types considerados "entrada de stock" (+quantity no balance).
// Aceita tanto os nomes novos (bairrista) como os legacy (morador).
const POSITIVE_MOVES = `(
  'saldo_inicial',
  'entrega_bairrista', 'venda_bairrista', 'entrega_oficial',
  'entrega_morador', 'venda_morador',
  'devolucao_operacao', 'apreendido', 'craftado'
)`;
// Movement types agregados como "entregas" (in-flow para stock, tipicamente
// moradores/bairristas e oficiais). Também aceita legacy.
const ENTREGA_MOVES = `(
  'entrega_bairrista', 'entrega_oficial', 'entrega_morador'
)`;
// Movement types de venda (sobrepõem a entrega_bairrista no sentido oposto).
const VENDA_MOVES = `('venda_bairrista', 'venda_morador')`;

const STOCK_BALANCE_CASE = `
  CASE
    WHEN im.movement_type IN ${POSITIVE_MOVES} THEN im.quantity
    WHEN im.movement_type IN ('fornecimento_org', 'consumo_operacao', 'perda_operacao')
      THEN -im.quantity
    WHEN im.movement_type = 'ajuste_manual'
      THEN im.quantity
    ELSE 0
  END`;

// Variantes filtradas por casa — usar em queries que querem balance por casa.
const STOCK_BALANCE_ARMAZEM = `(CASE WHEN im.location = 'armazem' THEN ${STOCK_BALANCE_CASE} ELSE 0 END)`;
const STOCK_BALANCE_GRUPO   = `(CASE WHEN im.location = 'grupo'   THEN ${STOCK_BALANCE_CASE} ELSE 0 END)`;

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
      SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador') THEN quantity ELSE 0 END)::int AS entradas,
      SUM(CASE WHEN movement_type IN ('venda_bairrista','venda_morador') THEN quantity ELSE 0 END)::int AS vendas
    FROM inventory_movements sm
    WHERE sm.created_at >= $1::date`,
    [w.start]);

  const prevMov = await query(`
    SELECT
      SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador') THEN quantity ELSE 0 END)::int AS entradas
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
      SUM(COALESCE(gross_value, 0))::numeric AS gross
    FROM operations
    WHERE date >= $1::date AND status = 'concluida'`,
    [w.start]);

  // Material desta semana em UNIDADES
  const matWeek = await query(`
    SELECT
      SUM(CASE WHEN om.direction='fornecido' THEN om.quantity ELSE 0 END)::int AS supplied_units,
      SUM(CASE WHEN om.direction='devolvido' THEN om.quantity ELSE 0 END)::int AS returned_units,
      SUM(CASE WHEN om.direction='perdido'   THEN om.quantity ELSE 0 END)::int AS lost_units,
      SUM(CASE WHEN om.direction='consumido' THEN om.quantity ELSE 0 END)::int AS consumed_units
    FROM operation_materials om
    JOIN operations o ON o.id = om.operation_id
    WHERE o.date >= $1::date AND o.status = 'concluida'`,
    [w.start]);

  const prevSaidas = await query(`
    SELECT
      COUNT(*)::int AS total,
      SUM(COALESCE(net_value, 0))::numeric AS net,
      SUM(COALESCE(our_kills, 0))::int AS kills
    FROM operations
    WHERE date >= $1::date AND date < $2::date AND status = 'concluida'`,
    [pw.start, pw.end]);

  // 4) Members ativos por role (contagens separadas para UI premium).
  //    'moradores' retornado como agregado legacy; UI nova usa os campos
  //    separados `bairristas`, `patroes`, `oficiais`, `chefia`.
  const members = await query(`
    SELECT
      SUM(CASE WHEN role IN ('bairrista','morador') AND status='ativo' THEN 1 ELSE 0 END)::int AS bairristas,
      SUM(CASE WHEN role IN ('patrao_di_zona','chefe_moradores') AND status='ativo' THEN 1 ELSE 0 END)::int AS patroes,
      SUM(CASE WHEN role = 'oficial' AND status='ativo' THEN 1 ELSE 0 END)::int AS oficiais,
      SUM(CASE WHEN role = 'chefia' AND status='ativo' THEN 1 ELSE 0 END)::int AS chefia,
      SUM(CASE WHEN role IN ('bairrista','patrao_di_zona','morador','chefe_moradores') AND status='ativo' THEN 1 ELSE 0 END)::int AS moradores
    FROM members`);

  // 5) Top contributor (week) — em UNIDADES de material entregue
  const topContrib = await query(`
    SELECT m.discord_id, m.display_name, SUM(sm.quantity)::int AS value
    FROM inventory_movements sm
    JOIN members m ON m.id = sm.member_id
    WHERE sm.created_at >= $1::date AND sm.movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador')
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
    // Material em UNIDADES (fonte de verdade: operation_materials)
    lostUnitsWeek:    Number(matWeek.rows[0]?.lost_units) || 0,
    returnedUnitsWeek:Number(matWeek.rows[0]?.returned_units) || 0,
    suppliedUnitsWeek:Number(matWeek.rows[0]?.supplied_units) || 0,
    consumedUnitsWeek:Number(matWeek.rows[0]?.consumed_units) || 0,
    bairristasAtivos: members.rows[0]?.bairristas || 0,
    patroesAtivos:    members.rows[0]?.patroes    || 0,
    oficiaisAtivos:   members.rows[0]?.oficiais   || 0,
    chefiaAtivos:     members.rows[0]?.chefia     || 0,
    // Legacy alias — soma bairristas + patroes
    moradoresAtivos:  members.rows[0]?.moradores  || 0,
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
      SUM(CASE WHEN sm.movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador') THEN quantity ELSE 0 END)::int AS entregas,
      SUM(CASE WHEN sm.movement_type IN ('venda_bairrista','venda_morador') THEN quantity ELSE 0 END)::int AS vendas,
      SUM(CASE WHEN sm.movement_type IN ('entrega_bairrista','venda_bairrista','entrega_oficial','entrega_morador','venda_morador')
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
        SUM(CASE WHEN sm.movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador') THEN quantity ELSE 0 END)::int AS entradas,
        SUM(CASE WHEN sm.movement_type IN ('venda_bairrista','venda_morador') THEN quantity ELSE 0 END)::int AS vendas
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
        SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador') THEN quantity ELSE 0 END)::int AS entregas,
        -- Material total em UNIDADES (não valor €). O preço estimado do item
        -- é usado só em cálculos económicos de saídas, não aqui.
        SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador') THEN quantity ELSE 0 END)::int AS weighted_entregas,
        SUM(CASE WHEN movement_type IN ('venda_bairrista','venda_morador') THEN quantity ELSE 0 END)::int AS vendas
      FROM inventory_movements sm
      WHERE sm.member_id = m.id
    ) mv ON true
    LEFT JOIN member_saida_stats mss ON mss.member_id = m.id
    WHERE m.status = 'ativo' OR m.status IS NULL
    ORDER BY m.display_name`);
  return r.rows;
}

// ─── Saídas full ─────────────────────────────────────────────────────────────
// Material é medido em UNIDADES (ok.supplied_units/returned_units/lost_units/
// consumed_units) e também disponibilizado em € (gross/net para bottom-line
// económico). A contabilização de material deve usar sempre unidades.
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
      COALESCE(omu.supplied_units, 0)::int AS supplied_units,
      COALESCE(omu.returned_units, 0)::int AS returned_units,
      COALESCE(omu.lost_units,     0)::int AS lost_units,
      COALESCE(omu.consumed_units, 0)::int AS consumed_units,
      COALESCE(o.gross_value, 0)::numeric AS gross,
      COALESCE(o.net_value, 0)::numeric AS net,
      o.was_profitable, o.result_notes
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
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
    [limit]);
  return r.rows;
}

// ─── Participantes full ──────────────────────────────────────────────────────
// Material por participação em UNIDADES (issued_units, returned_units,
// lost_units, consumed_units) via JOIN operation_materials agregado por
// (operation_id, member_id).
async function getParticipantsFull(limit = 2000) {
  const r = await query(`
    SELECT
      op.operation_id AS saida_id,
      o.date, o.spot,
      m.display_name,
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
    WHERE sm.movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador')
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
      SELECT i.id,
        COALESCE(SUM(${STOCK_BALANCE_CASE}),     0)::int AS balance,
        COALESCE(SUM(${STOCK_BALANCE_ARMAZEM}),  0)::int AS balance_armazem,
        COALESCE(SUM(${STOCK_BALANCE_GRUPO}),    0)::int AS balance_grupo
      FROM items i
      LEFT JOIN inventory_movements im ON im.item_id = i.id
      WHERE i.active = true
      GROUP BY i.id
    )
    SELECT
      i.id, i.name, i.category, i.unit,
      sb.balance, sb.balance_armazem, sb.balance_grupo,
      i.estimated_value, i.alert_enabled, i.alert_threshold,
      (COALESCE(sb.balance,0) * COALESCE(i.estimated_value,0))::numeric AS value_total,
      (COALESCE(sb.balance_armazem,0) * COALESCE(i.estimated_value,0))::numeric AS value_armazem,
      (COALESCE(sb.balance_grupo,0)   * COALESCE(i.estimated_value,0))::numeric AS value_grupo,
      (SELECT MAX(created_at) FROM inventory_movements WHERE item_id = i.id) AS last_movement,
      (SELECT SUM(quantity)::int FROM inventory_movements WHERE item_id = i.id AND movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador')) AS total_in,
      (SELECT SUM(quantity)::int FROM inventory_movements WHERE item_id = i.id AND movement_type NOT IN ('entrega_bairrista','entrega_oficial','entrega_morador')) AS total_out
    FROM items i
    JOIN stock_balances sb ON sb.id = i.id
    WHERE i.active = true
    ORDER BY value_total DESC NULLS LAST, i.name`);
  return r.rows;
}

async function getMovementsFull(limit = 2000) {
  const r = await query(`
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
    [limit]);
  return r.rows;
}

// Lista compacta de items para autocomplete dos slash commands.
async function getActiveItemsList() {
  const r = await query('SELECT id, name FROM items WHERE active = true ORDER BY name');
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

// ─── Top movers (top 3 por eixo, para o Dashboard) ───────────────────────────
async function getTopMovers() {
  const w = weekBounds();

  const topEntregas = await query(`
    SELECT m.display_name, SUM(sm.quantity)::int AS value
    FROM inventory_movements sm
    JOIN members m ON m.id = sm.member_id
    WHERE sm.created_at >= $1::date
      AND sm.movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador')
    GROUP BY m.display_name
    ORDER BY value DESC NULLS LAST LIMIT 3`, [w.start]);

  const topKills = await query(`
    SELECT m.display_name, COUNT(*)::int AS value
    FROM kill_logs k
    JOIN members m ON m.id = k.killer_id
    WHERE k.created_at >= $1::date
    GROUP BY m.display_name
    ORDER BY value DESC NULLS LAST LIMIT 3`, [w.start]);

  const topProfit = await query(`
    SELECT m.display_name, SUM(COALESCE(o.net_value,0))::numeric AS value
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
    WHERE o.date >= $1::date AND o.status = 'concluida'
    GROUP BY m.display_name
    ORDER BY value DESC NULLS LAST LIMIT 3`, [w.start]);

  return { topEntregas: topEntregas.rows, topKills: topKills.rows, topProfit: topProfit.rows };
}

// ─── Tendências semanais (para a secção "TENDÊNCIA" do Dashboard) ────────────
async function getTrending() {
  const w = weekBounds();
  const pw = prevWeekBounds();

  const sqlSaidas = (s, e) => query(`
    SELECT
      COUNT(*)::int AS saidas,
      SUM(CASE WHEN result = 'vitoria' THEN 1 ELSE 0 END)::int AS wins,
      SUM(COALESCE(our_kills,0))::int AS kills,
      SUM(COALESCE(deaths,0))::int AS deaths,
      SUM(COALESCE(net_value,0))::numeric AS net,
      SUM(COALESCE(gross_value,0))::numeric AS gross
    FROM operations
    WHERE date >= $1::date AND date < $2::date AND status = 'concluida'`, [s, e]);

  // Material em UNIDADES (fornecido/devolvido/perdido/consumido)
  const sqlMatUnits = (s, e) => query(`
    SELECT
      SUM(CASE WHEN om.direction='fornecido' THEN om.quantity ELSE 0 END)::int AS supplied,
      SUM(CASE WHEN om.direction='devolvido' THEN om.quantity ELSE 0 END)::int AS returned,
      SUM(CASE WHEN om.direction='perdido'   THEN om.quantity ELSE 0 END)::int AS lost,
      SUM(CASE WHEN om.direction='consumido' THEN om.quantity ELSE 0 END)::int AS consumed
    FROM operation_materials om
    JOIN operations o ON o.id = om.operation_id
    WHERE o.date >= $1::date AND o.date < $2::date AND o.status = 'concluida'`, [s, e]);

  const sqlMov = (s, e) => query(`
    SELECT
      SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial','entrega_morador') THEN quantity ELSE 0 END)::int AS entregas,
      SUM(CASE WHEN movement_type IN ('venda_bairrista','venda_morador') THEN quantity ELSE 0 END)::int AS vendas
    FROM inventory_movements
    WHERE created_at >= $1::date AND created_at < $2::date`, [s, e]);

  const nextDay = d => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().split('T')[0]; };
  const curEndExcl = nextDay(w.end);

  const [cs, ps, cm, pm, cMat, pMat] = await Promise.all([
    sqlSaidas(w.start, curEndExcl),
    sqlSaidas(pw.start, pw.end),
    sqlMov(w.start, curEndExcl),
    sqlMov(pw.start, pw.end),
    sqlMatUnits(w.start, curEndExcl),
    sqlMatUnits(pw.start, pw.end),
  ]);

  const C = cs.rows[0] || {}; const P = ps.rows[0] || {};
  const CM = cm.rows[0] || {}; const PM = pm.rows[0] || {};
  const CT = cMat.rows[0] || {}; const PT = pMat.rows[0] || {};

  return {
    saidas:   { current: Number(C.saidas) || 0, previous: Number(P.saidas) || 0 },
    wins:     { current: Number(C.wins)   || 0, previous: Number(P.wins)   || 0 },
    kills:    { current: Number(C.kills)  || 0, previous: Number(P.kills)  || 0 },
    deaths:   { current: Number(C.deaths) || 0, previous: Number(P.deaths) || 0 },
    net:      { current: Number(C.net)    || 0, previous: Number(P.net)    || 0 },
    gross:    { current: Number(C.gross)  || 0, previous: Number(P.gross)  || 0 },
    // Material em UNIDADES (não €)
    supplied_units: { current: Number(CT.supplied) || 0, previous: Number(PT.supplied) || 0 },
    returned_units: { current: Number(CT.returned) || 0, previous: Number(PT.returned) || 0 },
    lost_units:     { current: Number(CT.lost)     || 0, previous: Number(PT.lost)     || 0 },
    consumed_units: { current: Number(CT.consumed) || 0, previous: Number(PT.consumed) || 0 },
    entregas: { current: Number(CM.entregas) || 0, previous: Number(PM.entregas) || 0 },
    vendas:   { current: Number(CM.vendas)   || 0, previous: Number(PM.vendas)   || 0 },
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
  const weekOps = await query(`
    SELECT COUNT(*)::int AS n FROM operations
    WHERE date >= $1::date AND status = 'concluida'`, [w.start]);
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
  const r = await query(`
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
    ORDER BY l.wins DESC, l.total DESC LIMIT $1`, [limit]);
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
  // Novos — Dashboard premium
  getTopMovers,
  getTrending,
  getAlerts,
  getStockByCategory,
  getMemberStreaks,
  // Stock per-casa
  getActiveItemsList,
};
