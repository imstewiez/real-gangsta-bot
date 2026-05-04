'use strict';
/**
 * Panel Repository — queries consolidadas para painéis.
 *
 * Cada função retorna TODAS as métricas de um painel numa única query
 * (usando CTEs), minimizando round-trips à DB.
 */

const { query } = require('../db');

// ═══════════════════════════════════════════════════════════════════════════════
// CHEFIA
// ═══════════════════════════════════════════════════════════════════════════════

async function getChefiaMetrics() {
  const sql = `
    WITH
      saidas AS (
        SELECT
          COUNT(*) FILTER (WHERE status IN ('aberta', 'em_curso'))::int AS activas,
          COUNT(*) FILTER (WHERE status = 'concluida')::int AS concluidas
        FROM operations
      ),
      membros AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'ativo')::int AS activos,
          COUNT(*) FILTER (WHERE status = 'inativo')::int AS inactivos
        FROM members
      ),
      top_semana AS (
        SELECT m.display_name, SUM(im.quantity)::int AS total_qty
        FROM inventory_movements im
        JOIN members m ON m.id = im.member_id
        WHERE im.movement_type IN ('entrega_morador', 'entrega_oficial')
          AND im.created_at >= date_trunc('week', NOW())
        GROUP BY m.display_name
        ORDER BY total_qty DESC
        LIMIT 1
      ),
      pvp AS (
        SELECT COUNT(*)::int AS kills
        FROM kill_logs
        WHERE created_at >= date_trunc('week', NOW())
      ),
      movimento AS (
        SELECT
          COUNT(*) FILTER (WHERE movement_type IN ('entrega_morador','entrega_oficial'))::int AS entregas,
          COUNT(*) FILTER (WHERE movement_type = 'venda_morador')::int AS vendas,
          COALESCE(SUM(quantity) FILTER (WHERE movement_type IN ('entrega_morador','entrega_oficial')), 0)::int AS entregas_qty
        FROM inventory_movements
        WHERE created_at >= date_trunc('week', NOW())
      ),
      ausencias AS (
        SELECT COUNT(*)::int AS activas
        FROM member_absences
        WHERE status = 'approved' AND CURRENT_DATE BETWEEN start_date AND end_date
      ),
      encomendas AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pendentes,
          COUNT(*) FILTER (WHERE status = 'approved')::int AS aprovadas,
          COUNT(*) FILTER (WHERE status = 'fulfilled')::int AS entregues
        FROM orders
      ),
      stock_critico AS (
        SELECT COUNT(*)::int AS cnt
        FROM (
          SELECT item_key,
            COALESCE(SUM(quantity) FILTER (WHERE movement_type = 'entrada'), 0) -
            COALESCE(SUM(quantity) FILTER (WHERE movement_type IN ('venda','entrega')), 0) AS balance
          FROM stock_v3_movements
          GROUP BY item_key
          HAVING COALESCE(SUM(quantity) FILTER (WHERE movement_type = 'entrada'), 0) -
                 COALESCE(SUM(quantity) FILTER (WHERE movement_type IN ('venda','entrega')), 0) <= 5
        ) t
      )
    SELECT
      s.activas AS saidas_activas,
      s.concluidas AS saidas_concluidas,
      m.activos AS membros_activos,
      m.inactivos AS membros_inactivos,
      COALESCE(ts.display_name, '—') AS top_nome,
      COALESCE(ts.total_qty, 0) AS top_qty,
      p.kills AS kills_semana,
      mv.entregas AS entregas_count,
      mv.vendas AS vendas_count,
      mv.entregas_qty AS entregas_qty,
      a.activas AS ausencias_activas,
      e.pendentes AS enc_pendentes,
      e.aprovadas AS enc_aprovadas,
      e.entregues AS enc_entregues,
      sc.cnt AS stock_critico
    FROM saidas s
    CROSS JOIN membros m
    CROSS JOIN pvp p
    CROSS JOIN movimento mv
    CROSS JOIN ausencias a
    CROSS JOIN encomendas e
    CROSS JOIN stock_critico sc
    LEFT JOIN top_semana ts ON true
  `;
  const res = await query(sql);
  return res.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// OFICIAL
// ═══════════════════════════════════════════════════════════════════════════════

async function getOficialMetrics() {
  const sql = `
    WITH
      saidas AS (
        SELECT
          COUNT(*) FILTER (WHERE status IN ('aberta', 'em_curso'))::int AS activas,
          COUNT(*) FILTER (WHERE status = 'concluida')::int AS concluidas
        FROM operations
      ),
      movimento AS (
        SELECT
          COUNT(*) FILTER (WHERE movement_type IN ('entrega_morador','entrega_oficial'))::int AS entregas,
          COUNT(*) FILTER (WHERE movement_type = 'venda_morador')::int AS vendas,
          COALESCE(SUM(quantity) FILTER (WHERE movement_type IN ('entrega_morador','entrega_oficial')), 0)::int AS entregas_qty,
          COALESCE(SUM(quantity) FILTER (WHERE movement_type = 'venda_morador'), 0)::int AS vendas_qty
        FROM inventory_movements
        WHERE created_at >= date_trunc('week', NOW())
      ),
      pvp AS (
        SELECT COUNT(*)::int AS kills
        FROM kill_logs
        WHERE created_at >= date_trunc('week', NOW())
      ),
      membros AS (
        SELECT COUNT(*)::int AS activos
        FROM members
        WHERE status = 'ativo'
      )
    SELECT
      s.activas AS saidas_activas,
      s.concluidas AS saidas_concluidas,
      mv.entregas AS entregas_count,
      mv.vendas AS vendas_count,
      mv.entregas_qty AS entregas_qty,
      mv.vendas_qty AS vendas_qty,
      p.kills AS kills_semana,
      m.activos AS membros_activos
    FROM saidas s, movimento mv, pvp p, membros m
  `;
  const res = await query(sql);
  return res.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BAIRRISTA (inclui dados pessoais do viewer)
// ═══════════════════════════════════════════════════════════════════════════════

async function getBairristaMetrics(discordId) {
  const sql = `
    WITH viewer AS (
      SELECT id FROM members WHERE discord_id = $1
    ),
    meu_movimento AS (
      SELECT
        COUNT(*) FILTER (WHERE movement_type IN ('entrega_morador','entrega_oficial'))::int AS entregas,
        COUNT(*) FILTER (WHERE movement_type = 'venda_morador')::int AS vendas,
        COALESCE(SUM(quantity) FILTER (WHERE movement_type IN ('entrega_morador','entrega_oficial')), 0)::int AS entregas_qty
      FROM inventory_movements
      WHERE member_id = (SELECT id FROM viewer)
        AND created_at >= date_trunc('week', NOW())
    ),
    minhas_encomendas AS (
      SELECT COUNT(*)::int AS pendentes
      FROM orders
      WHERE member_id = (SELECT id FROM viewer)
        AND status = 'pending'
    ),
    top3 AS (
      SELECT m.display_name, SUM(im.quantity)::int AS total_qty
      FROM inventory_movements im
      JOIN members m ON m.id = im.member_id
      WHERE im.movement_type IN ('entrega_morador','entrega_oficial')
        AND im.created_at >= date_trunc('week', NOW())
      GROUP BY m.display_name
      ORDER BY total_qty DESC
      LIMIT 3
    ),
    saidas AS (
      SELECT COUNT(*)::int AS activas
      FROM operations
      WHERE status IN ('aberta', 'em_curso')
    ),
    membros AS (
      SELECT COUNT(*)::int AS activos
      FROM members
      WHERE status = 'ativo'
    ),
    meu_rank AS (
      SELECT rank_position
      FROM weekly_rankings
      WHERE member_id = (SELECT id FROM viewer)
        AND week_start = date_trunc('week', NOW())::date
      ORDER BY created_at DESC
      LIMIT 1
    )
    SELECT
      mm.entregas AS minhas_entregas,
      mm.vendas AS minhas_vendas,
      mm.entregas_qty AS minhas_qty,
      me.pendentes AS minhas_enc_pendentes,
      s.activas AS saidas_activas,
      m.activos AS membros_activos,
      COALESCE(mr.rank_position, 0) AS meu_rank,
      COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('nome', t.display_name, 'qty', t.total_qty)) FROM top3 t),
      '[]'::jsonb
    ) AS top3
    FROM meu_movimento mm, minhas_encomendas me, saidas s, membros m
    LEFT JOIN meu_rank mr ON true
  `;
  const res = await query(sql, [discordId]);
  return res.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATRÃO DI ZONA
// ═══════════════════════════════════════════════════════════════════════════════

async function getPatraoMetrics() {
  const sql = `
    WITH
      membros AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'ativo')::int AS activos,
          COUNT(*) FILTER (WHERE status = 'inativo')::int AS inactivos
        FROM members
      ),
      movimento AS (
        SELECT
          COALESCE(SUM(quantity) FILTER (WHERE movement_type IN ('entrega_morador','entrega_oficial')), 0)::int AS entregas_qty,
          COALESCE(SUM(quantity) FILTER (WHERE movement_type = 'venda_morador'), 0)::int AS vendas_qty
        FROM inventory_movements
        WHERE created_at >= date_trunc('week', NOW())
      ),
      top_zona AS (
        SELECT m.display_name, SUM(im.quantity)::int AS total_qty
        FROM inventory_movements im
        JOIN members m ON m.id = im.member_id
        WHERE im.movement_type IN ('entrega_morador','entrega_oficial')
          AND im.created_at >= date_trunc('week', NOW())
        GROUP BY m.display_name
        ORDER BY total_qty DESC
        LIMIT 1
      ),
      inactivos_semana AS (
        SELECT m.display_name
        FROM members m
        WHERE m.status = 'ativo'
          AND NOT EXISTS (
            SELECT 1 FROM inventory_movements im
            WHERE im.member_id = m.id
              AND im.movement_type IN ('entrega_morador','entrega_oficial')
              AND im.created_at >= date_trunc('week', NOW())
          )
        ORDER BY m.display_name
        LIMIT 5
      )
    SELECT
      mb.activos AS bairristas_activos,
      mb.inactivos AS bairristas_inactivos,
      mv.entregas_qty AS entregas_qty,
      mv.vendas_qty AS vendas_qty,
      COALESCE(tz.display_name, '—') AS top_nome,
      COALESCE(tz.total_qty, 0) AS top_qty,
      COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('nome', i.display_name)) FROM inactivos_semana i),
      '[]'::jsonb
    ) AS inactivos_semana
    FROM membros mb
    CROSS JOIN movimento mv
    LEFT JOIN top_zona tz ON true
  `;
  const res = await query(sql);
  return res.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRADA
// ═══════════════════════════════════════════════════════════════════════════════

async function getEntradaMetrics() {
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE status = 'ativo')::int AS membros_activos,
      COUNT(*) FILTER (WHERE status = 'ativo' AND joined_at >= date_trunc('week', NOW()))::int AS novos_semana
    FROM members
  `;
  const res = await query(sql);
  return res.rows[0];
}

module.exports = {
  getChefiaMetrics,
  getOficialMetrics,
  getBairristaMetrics,
  getPatraoMetrics,
  getEntradaMetrics,
};
