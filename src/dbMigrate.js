'use strict';
const { pool } = require('./db');

const MIGRATIONS = [
  {
    id: 1,
    name: 'initial_schema',
    up: `
      -- ── Bot state (key-value) ───────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS bot_state (
        key   TEXT PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Members ─────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS members (
        id              SERIAL PRIMARY KEY,
        discord_id      TEXT NOT NULL UNIQUE,
        username        TEXT NOT NULL DEFAULT '',
        display_name    TEXT NOT NULL DEFAULT '',
        role            TEXT NOT NULL DEFAULT 'morador' CHECK (role IN ('morador', 'oficial', 'chefia', 'chefe_moradores', 'inativo')),
        status          TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
        channel_id      TEXT,
        joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        promoted_at     TIMESTAMPTZ,
        notes           TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_members_discord_id ON members(discord_id);
      CREATE INDEX IF NOT EXISTS idx_members_role ON members(role);
      CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

      -- ── Member role history ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS member_role_history (
        id          SERIAL PRIMARY KEY,
        member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        old_role    TEXT,
        new_role    TEXT NOT NULL,
        changed_by  TEXT NOT NULL,
        reason      TEXT DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_mrh_member ON member_role_history(member_id);

      -- ── Resident channels ───────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS resident_channels (
        id              SERIAL PRIMARY KEY,
        member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        discord_id      TEXT NOT NULL,
        channel_id      TEXT NOT NULL UNIQUE,
        channel_name    TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
        category_id     TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        archived_at     TIMESTAMPTZ,
        deleted_at      TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_rc_member ON resident_channels(member_id);
      CREATE INDEX IF NOT EXISTS idx_rc_discord ON resident_channels(discord_id);
      CREATE INDEX IF NOT EXISTS idx_rc_status ON resident_channels(status);

      -- ── Items catalog ───────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS items (
        id              SERIAL PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        category        TEXT NOT NULL DEFAULT 'outros',
        unit            TEXT NOT NULL DEFAULT 'unidade',
        estimated_value NUMERIC(12,2),
        active          BOOLEAN NOT NULL DEFAULT TRUE,
        notes           TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
      CREATE INDEX IF NOT EXISTS idx_items_active ON items(active);

      -- ── Inventory movements ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id              SERIAL PRIMARY KEY,
        movement_type   TEXT NOT NULL CHECK (movement_type IN (
          'entrega_morador', 'venda_morador', 'entrega_oficial',
          'fornecimento_org', 'consumo_operacao', 'devolucao_operacao',
          'ajuste_manual', 'perda_operacao', 'apreendido', 'craftado'
        )),
        item_id         INTEGER NOT NULL REFERENCES items(id),
        quantity        INTEGER NOT NULL,
        member_id       INTEGER REFERENCES members(id),
        member_role     TEXT,
        origin          TEXT DEFAULT '',
        destination     TEXT DEFAULT '',
        context         TEXT DEFAULT '',
        notes           TEXT DEFAULT '',
        operation_id    INTEGER,
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_im_item ON inventory_movements(item_id);
      CREATE INDEX IF NOT EXISTS idx_im_member ON inventory_movements(member_id);
      CREATE INDEX IF NOT EXISTS idx_im_type ON inventory_movements(movement_type);
      CREATE INDEX IF NOT EXISTS idx_im_operation ON inventory_movements(operation_id);
      CREATE INDEX IF NOT EXISTS idx_im_created ON inventory_movements(created_at);

      -- ── Operations (saídas) ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS operations (
        id              SERIAL PRIMARY KEY,
        date            DATE NOT NULL DEFAULT CURRENT_DATE,
        scheduled_time  TIME,
        start_time      TIMESTAMPTZ,
        end_time        TIMESTAMPTZ,
        spot            TEXT DEFAULT '',
        operation_type  TEXT NOT NULL DEFAULT 'outra' CHECK (operation_type IN (
          'craft', 'dominio', 'ataque', 'defesa', 'recolha', 'outra'
        )),
        status          TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN (
          'aberta', 'em_preparacao', 'em_curso', 'concluida', 'cancelada'
        )),
        leader_id       INTEGER REFERENCES members(id),
        group_number    INTEGER DEFAULT 1,
        max_participants INTEGER DEFAULT 12,
        notes           TEXT DEFAULT '',
        -- Result fields
        had_fight       BOOLEAN DEFAULT FALSE,
        enemy_name      TEXT DEFAULT '',
        enemy_count     INTEGER DEFAULT 0,
        survivors       INTEGER DEFAULT 0,
        deaths          INTEGER DEFAULT 0,
        returned_count  INTEGER DEFAULT 0,
        result_notes    TEXT DEFAULT '',
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ops_date ON operations(date);
      CREATE INDEX IF NOT EXISTS idx_ops_status ON operations(status);

      -- ── Operation participants ──────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS operation_participants (
        id              SERIAL PRIMARY KEY,
        operation_id    INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
        member_id       INTEGER NOT NULL REFERENCES members(id),
        role_in_op      TEXT DEFAULT 'membro',
        brought_own_material BOOLEAN DEFAULT FALSE,
        received_org_material BOOLEAN DEFAULT FALSE,
        died            BOOLEAN DEFAULT FALSE,
        survived        BOOLEAN DEFAULT TRUE,
        returned        BOOLEAN DEFAULT TRUE,
        returned_material BOOLEAN DEFAULT FALSE,
        notes           TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(operation_id, member_id)
      );
      CREATE INDEX IF NOT EXISTS idx_op_part_op ON operation_participants(operation_id);
      CREATE INDEX IF NOT EXISTS idx_op_part_member ON operation_participants(member_id);

      -- ── Operation materials ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS operation_materials (
        id              SERIAL PRIMARY KEY,
        operation_id    INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
        item_id         INTEGER NOT NULL REFERENCES items(id),
        direction       TEXT NOT NULL CHECK (direction IN ('fornecido', 'devolvido', 'perdido', 'consumido')),
        quantity        INTEGER NOT NULL,
        member_id       INTEGER REFERENCES members(id),
        notes           TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_om_op ON operation_materials(operation_id);
      CREATE INDEX IF NOT EXISTS idx_om_item ON operation_materials(item_id);

      -- ── Weekly rankings ─────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS weekly_rankings (
        id              SERIAL PRIMARY KEY,
        member_id       INTEGER NOT NULL REFERENCES members(id),
        week_start      DATE NOT NULL,
        week_end        DATE NOT NULL,
        deliveries      INTEGER NOT NULL DEFAULT 0,
        sales           INTEGER NOT NULL DEFAULT 0,
        operations_count INTEGER NOT NULL DEFAULT 0,
        weighted_value  NUMERIC(12,2) NOT NULL DEFAULT 0,
        return_rate     NUMERIC(5,2) DEFAULT 0,
        rank_position   INTEGER,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(member_id, week_start)
      );
      CREATE INDEX IF NOT EXISTS idx_wr_week ON weekly_rankings(week_start);
      CREATE INDEX IF NOT EXISTS idx_wr_member ON weekly_rankings(member_id);

      -- ── Audit logs ──────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS audit_logs (
        id              SERIAL PRIMARY KEY,
        action          TEXT NOT NULL,
        entity_type     TEXT NOT NULL,
        entity_id       TEXT,
        actor_id        TEXT NOT NULL,
        actor_name      TEXT DEFAULT '',
        before_state    JSONB,
        after_state     JSONB,
        context         TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_al_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_al_entity ON audit_logs(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_al_actor ON audit_logs(actor_id);
      CREATE INDEX IF NOT EXISTS idx_al_created ON audit_logs(created_at);

      -- ── Settings ────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS settings (
        key         TEXT PRIMARY KEY,
        value       JSONB NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Job runs ────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS job_runs (
        id          SERIAL PRIMARY KEY,
        job_name    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
        result      JSONB,
        error       TEXT,
        started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_jr_name ON job_runs(job_name);
      CREATE INDEX IF NOT EXISTS idx_jr_started ON job_runs(started_at);

      -- ── Idempotency operations ──────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS idempotency_ops (
        id              TEXT PRIMARY KEY,
        dedupe_key      TEXT NOT NULL,
        entity_type     TEXT NOT NULL DEFAULT '',
        entity_id       TEXT NOT NULL DEFAULT '',
        source          TEXT DEFAULT '',
        status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
        data            JSONB DEFAULT '{}',
        error           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at    TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_idemp_dedupe ON idempotency_ops(dedupe_key) WHERE status IN ('running', 'completed');
    `
  },
  {
    id: 2,
    name: 'add_member_tier',
    up: `
      ALTER TABLE members ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'young_blood';
      CREATE INDEX IF NOT EXISTS idx_members_tier ON members(tier);
    `
  },
  {
    id: 4,
    name: 'inventory_saldo_inicial_and_cemetery',
    up: `
      -- ── Allow saldo_inicial movement type ──────────────────────────────────
      ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
      ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
        CHECK (movement_type IN (
          'saldo_inicial',
          'entrega_morador', 'venda_morador', 'entrega_oficial',
          'fornecimento_org', 'consumo_operacao', 'devolucao_operacao',
          'ajuste_manual', 'perda_operacao', 'apreendido', 'craftado'
        ));

      -- ── Track bootstrap state (one-shot per seed source) ───────────────────
      CREATE TABLE IF NOT EXISTS inventory_bootstrap (
        id          SERIAL PRIMARY KEY,
        source      TEXT NOT NULL,
        applied_by  TEXT NOT NULL,
        items_count INTEGER NOT NULL DEFAULT 0,
        total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
        notes       TEXT DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Cemetery (kills registadas) ────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS cemetery_kills (
        id              SERIAL PRIMARY KEY,
        killer_id       INTEGER NOT NULL REFERENCES members(id),
        victim_name     TEXT NOT NULL,
        victim_discord_id TEXT,
        context         TEXT DEFAULT '',
        operation_id    INTEGER REFERENCES operations(id),
        date            DATE NOT NULL DEFAULT CURRENT_DATE,
        notes           TEXT DEFAULT '',
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_kills_killer ON cemetery_kills(killer_id);
      CREATE INDEX IF NOT EXISTS idx_kills_date ON cemetery_kills(date);
      CREATE INDEX IF NOT EXISTS idx_kills_operation ON cemetery_kills(operation_id);
    `
  },
  {
    id: 3,
    name: 'tag_requests_and_orders',
    up: `
      -- ── Tag requests (onboarding approval) ─────────────────────────────────
      CREATE TABLE IF NOT EXISTS tag_requests (
        id              SERIAL PRIMARY KEY,
        discord_id      TEXT NOT NULL,
        username        TEXT NOT NULL DEFAULT '',
        full_name       TEXT NOT NULL,
        nickname        TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
        approved_by     TEXT,
        denied_by       TEXT,
        deny_reason     TEXT DEFAULT '',
        message_id      TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_tr_discord ON tag_requests(discord_id);
      CREATE INDEX IF NOT EXISTS idx_tr_status ON tag_requests(status);

      -- ── Orders (encomendas de moradores) ───────────────────────────────────
      CREATE TABLE IF NOT EXISTS orders (
        id              SERIAL PRIMARY KEY,
        member_id       INTEGER NOT NULL REFERENCES members(id),
        item_id         INTEGER NOT NULL REFERENCES items(id),
        quantity        INTEGER NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'fulfilled', 'denied', 'cancelled')),
        notes           TEXT DEFAULT '',
        approved_by     TEXT,
        fulfilled_by    TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_orders_member ON orders(member_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      -- ── Add material_source to operation_participants ──────────────────────
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS material_source TEXT DEFAULT 'proprio' CHECK (material_source IN ('proprio', 'org'));
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS material_returned_qty INTEGER DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS material_lost_qty INTEGER DEFAULT 0;

      -- ── Add nickname to members ────────────────────────────────────────────
      ALTER TABLE members ADD COLUMN IF NOT EXISTS nickname TEXT DEFAULT '';
      ALTER TABLE members ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';
    `
  },
  {
    id: 5,
    name: 'bot_instances',
    up: `
      CREATE TABLE IF NOT EXISTS bot_instances (
        instance_id     UUID PRIMARY KEY,
        version         TEXT NOT NULL DEFAULT '',
        git_sha         TEXT NOT NULL DEFAULT '',
        pid             INTEGER,
        hostname        TEXT NOT NULL DEFAULT '',
        started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        shutdown_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_bot_instances_started_at ON bot_instances(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bot_instances_heartbeat ON bot_instances(last_heartbeat DESC);
    `
  },
  {
    id: 6,
    name: 'tier_default_o_gunao',
    // A hierarquia foi corrigida: O Gunão é o tier de entrada, não Young Blood.
    // Só altera o DEFAULT da coluna — dados existentes ficam intactos e são
    // migrados controladamente via /rg-fix-tiers.
    up: `
      ALTER TABLE members ALTER COLUMN tier SET DEFAULT 'o_gunao';
    `
  },
  {
    id: 7,
    name: 'availability',
    up: `
      -- ── Sessões de disponibilidade diária ───────────────────────────────────
      CREATE TABLE IF NOT EXISTS availability_sessions (
        id              SERIAL PRIMARY KEY,
        session_date    DATE NOT NULL,
        channel_id      TEXT NOT NULL,
        message_id      TEXT,
        created_by      TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        header_text     TEXT NOT NULL DEFAULT '',
        mention_role_ids TEXT NOT NULL DEFAULT '',
        slots_json      JSONB NOT NULL DEFAULT '[]',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at       TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_av_sess_date ON availability_sessions(session_date);
      CREATE INDEX IF NOT EXISTS idx_av_sess_channel ON availability_sessions(channel_id);
      CREATE INDEX IF NOT EXISTS idx_av_sess_status ON availability_sessions(status);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_av_sess_channel_date_open
        ON availability_sessions(channel_id, session_date) WHERE status = 'open';

      -- ── Slots/horários de cada sessão ───────────────────────────────────────
      CREATE TABLE IF NOT EXISTS availability_slots (
        id              SERIAL PRIMARY KEY,
        session_id      INTEGER NOT NULL REFERENCES availability_sessions(id) ON DELETE CASCADE,
        slot_label      TEXT NOT NULL,
        position        INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session_id, slot_label)
      );
      CREATE INDEX IF NOT EXISTS idx_av_slots_session ON availability_slots(session_id);

      -- ── Votos por (slot, user) ─────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS availability_votes (
        id              SERIAL PRIMARY KEY,
        session_id      INTEGER NOT NULL REFERENCES availability_sessions(id) ON DELETE CASCADE,
        slot_id         INTEGER NOT NULL REFERENCES availability_slots(id) ON DELETE CASCADE,
        discord_user_id TEXT NOT NULL,
        vote_state      TEXT NOT NULL CHECK (vote_state IN ('disponivel', 'indisponivel', 'talvez')),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(slot_id, discord_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_av_votes_session ON availability_votes(session_id);
      CREATE INDEX IF NOT EXISTS idx_av_votes_slot ON availability_votes(slot_id);
      CREATE INDEX IF NOT EXISTS idx_av_votes_user ON availability_votes(discord_user_id);
    `
  },
  {
    id: 8,
    name: 'radio',
    up: `
      -- ── Estado actual da rádio (1 linha por tipo) ───────────────────────────
      CREATE TABLE IF NOT EXISTS radio_state (
        radio_type      TEXT PRIMARY KEY CHECK (radio_type IN ('principal', 'parceria')),
        value           TEXT NOT NULL DEFAULT '',
        previous_value  TEXT NOT NULL DEFAULT '',
        mode            TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'random')),
        updated_by      TEXT NOT NULL DEFAULT '',
        note            TEXT NOT NULL DEFAULT '',
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Histórico de alterações ─────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS radio_history (
        id              SERIAL PRIMARY KEY,
        radio_type      TEXT NOT NULL CHECK (radio_type IN ('principal', 'parceria')),
        old_value       TEXT NOT NULL DEFAULT '',
        new_value       TEXT NOT NULL,
        mode            TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'random')),
        actor_id        TEXT NOT NULL,
        note            TEXT NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_radio_hist_type ON radio_history(radio_type);
      CREATE INDEX IF NOT EXISTS idx_radio_hist_created ON radio_history(created_at DESC);
    `
  },
  {
    id: 12,
    name: 'saidas_craft_amount_and_settled_flag',
    // Suporte para:
    //   - craft_amount (quando had_craft=true, quantos items craftados)
    //   - operation_participants.settled (marcador usado pelo wizard de fecho)
    up: `
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS craft_amount INTEGER DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS settled BOOLEAN DEFAULT FALSE;
    `
  },
  {
    id: 14,
    name: 'rankings_monthly_and_alltime',
    // Projecções de ranking para períodos mais longos (mensal + all-time).
    // Mantém a mesma shape que weekly_rankings para consistency.
    up: `
      CREATE TABLE IF NOT EXISTS monthly_rankings (
        id                   SERIAL PRIMARY KEY,
        member_id            INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        month_start          DATE NOT NULL,
        month_end            DATE NOT NULL,
        deliveries           INTEGER NOT NULL DEFAULT 0,
        sales                INTEGER NOT NULL DEFAULT 0,
        operations_count     INTEGER NOT NULL DEFAULT 0,
        weighted_value       NUMERIC(14,2) NOT NULL DEFAULT 0,
        return_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
        kills_count          INTEGER NOT NULL DEFAULT 0,
        wins_count           INTEGER NOT NULL DEFAULT 0,
        loss_count           INTEGER NOT NULL DEFAULT 0,
        net_profit_generated NUMERIC(14,2) NOT NULL DEFAULT 0,
        survival_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
        performance_score    NUMERIC(8,2) NOT NULL DEFAULT 0,
        hybrid_score         NUMERIC(10,2) NOT NULL DEFAULT 0,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_monthly_member_month UNIQUE (member_id, month_start)
      );
      CREATE INDEX IF NOT EXISTS idx_monthly_rankings_month ON monthly_rankings(month_start);
      CREATE INDEX IF NOT EXISTS idx_monthly_rankings_hybrid ON monthly_rankings(hybrid_score DESC);

      -- All-time snapshots por membro (actualizados a cada recálculo mensal).
      CREATE TABLE IF NOT EXISTS all_time_stats (
        member_id            INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        deliveries           INTEGER NOT NULL DEFAULT 0,
        sales                INTEGER NOT NULL DEFAULT 0,
        saidas_total         INTEGER NOT NULL DEFAULT 0,
        wins                 INTEGER NOT NULL DEFAULT 0,
        losses               INTEGER NOT NULL DEFAULT 0,
        kills_total          INTEGER NOT NULL DEFAULT 0,
        deaths_total         INTEGER NOT NULL DEFAULT 0,
        mvp_count            INTEGER NOT NULL DEFAULT 0,
        profit_generated     NUMERIC(14,2) NOT NULL DEFAULT 0,
        weighted_value       NUMERIC(14,2) NOT NULL DEFAULT 0,
        hybrid_score         NUMERIC(10,2) NOT NULL DEFAULT 0,
        first_activity       DATE,
        last_activity        DATE,
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_all_time_hybrid ON all_time_stats(hybrid_score DESC);
      CREATE INDEX IF NOT EXISTS idx_all_time_kills ON all_time_stats(kills_total DESC);
      CREATE INDEX IF NOT EXISTS idx_all_time_weighted ON all_time_stats(weighted_value DESC);
    `
  },
  {
    id: 13,
    name: 'hardening_integrity_constraints',
    // Sprint 1 hardening:
    //   - CHECK quantity > 0 em inventory_movements (evita stock negativo)
    //   - CHECK estimated_value >= 0 em items
    //   - CHECK kill_logs.date não futuro
    //   - UNIQUE em tag_requests pendentes por discord_id (impede dedup)
    //
    // Nota: drops constraints com mesmo nome antes de criar, para permitir
    // re-runs durante desenvolvimento.
    up: `
      ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS chk_qty_positive;
      ALTER TABLE inventory_movements ADD CONSTRAINT chk_qty_positive CHECK (quantity > 0);

      ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_value_nonneg;
      ALTER TABLE items ADD CONSTRAINT chk_value_nonneg CHECK (estimated_value IS NULL OR estimated_value >= 0);

      -- Garante que cada user só tem 1 pedido pendente em paralelo
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_requests_pending_per_user
        ON tag_requests(discord_id) WHERE status = 'pending';
    `
  },
  {
    id: 11,
    name: 'saidas_domain_evolution',
    // Evolução profunda do domínio de saídas (antes "operations"):
    //   1. Renomeia movement_types de inventário (*_operacao → *_saida)
    //   2. Renomeia inventory_movements.operation_id → saida_id
    //   3. Enriquece operations com result, spot_type, enemy_faction, valores
    //      económicos, returned_to_bairro_count, our_kills, was_profitable
    //   4. Enriquece operation_participants com kills/deaths/downs, valores
    //      per-participante, performance_score, discipline_score, mvp_flag
    //   5. cemetery_kills → kill_logs (rename) + victim_faction, spot,
    //      confirmed_by; operation_id → saida_id
    //   6. Novas tabelas spot_stats e member_saida_stats
    //   7. weekly_rankings ganha kills_count, wins/loss, net_profit_generated,
    //      survival_rate, performance_score, hybrid_score
    up: `
      -- ── 1. Rename movement types ─────────────────────────────────────────
      UPDATE inventory_movements SET movement_type = 'consumo_saida'   WHERE movement_type = 'consumo_operacao';
      UPDATE inventory_movements SET movement_type = 'perda_saida'     WHERE movement_type = 'perda_operacao';
      UPDATE inventory_movements SET movement_type = 'devolucao_saida' WHERE movement_type = 'devolucao_operacao';

      ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
      ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
        CHECK (movement_type IN (
          'saldo_inicial',
          'entrega_morador', 'venda_morador', 'entrega_oficial',
          'fornecimento_org', 'consumo_saida', 'devolucao_saida',
          'ajuste_manual', 'perda_saida', 'apreendido', 'craftado'
        ));

      -- 2. Rename FK column operation_id → saida_id (index é recriado a seguir)
      ALTER INDEX IF EXISTS idx_im_operation RENAME TO idx_im_saida;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='inventory_movements' AND column_name='operation_id') THEN
          ALTER TABLE inventory_movements RENAME COLUMN operation_id TO saida_id;
        END IF;
      END $$;

      -- ── 3. Enrich operations (saídas) ────────────────────────────────────
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS result TEXT DEFAULT 'sem_conflito'
        CHECK (result IN ('vitoria', 'derrota', 'empate', 'sem_conflito', 'abortada'));
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS spot_type TEXT DEFAULT '';
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS had_craft BOOLEAN DEFAULT FALSE;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS had_domination BOOLEAN DEFAULT FALSE;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS enemy_faction TEXT DEFAULT '';
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS returned_to_bairro_count INTEGER DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS our_kills INTEGER DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS supplied_value NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS returned_value NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS lost_value     NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS consumed_value NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS gross_value    NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS net_value      NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS was_profitable BOOLEAN;

      -- ── 4. Enrich operation_participants ─────────────────────────────────
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS kills INTEGER DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS deaths_count INTEGER DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS downs INTEGER DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS issued_value   NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS returned_value NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS lost_value     NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS consumed_value NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS net_material_delta NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS performance_score NUMERIC(6,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS discipline_score  NUMERIC(6,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS mvp_flag BOOLEAN DEFAULT FALSE;

      -- ── 5. cemetery_kills → kill_logs ────────────────────────────────────
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cemetery_kills')
           AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='kill_logs') THEN
          ALTER TABLE cemetery_kills RENAME TO kill_logs;
        END IF;
      END $$;
      ALTER TABLE kill_logs ADD COLUMN IF NOT EXISTS victim_faction TEXT DEFAULT '';
      ALTER TABLE kill_logs ADD COLUMN IF NOT EXISTS spot TEXT DEFAULT '';
      ALTER TABLE kill_logs ADD COLUMN IF NOT EXISTS confirmed_by TEXT;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='kill_logs' AND column_name='operation_id') THEN
          ALTER TABLE kill_logs RENAME COLUMN operation_id TO saida_id;
        END IF;
      END $$;
      ALTER INDEX IF EXISTS idx_kills_killer    RENAME TO idx_kill_logs_killer;
      ALTER INDEX IF EXISTS idx_kills_date      RENAME TO idx_kill_logs_date;
      ALTER INDEX IF EXISTS idx_kills_operation RENAME TO idx_kill_logs_saida;

      -- ── 6. Spot stats (auto-actualizada no fecho de saída) ───────────────
      CREATE TABLE IF NOT EXISTS spot_stats (
        spot                  TEXT PRIMARY KEY,
        total_saidas          INTEGER NOT NULL DEFAULT 0,
        wins                  INTEGER NOT NULL DEFAULT 0,
        losses                INTEGER NOT NULL DEFAULT 0,
        draws                 INTEGER NOT NULL DEFAULT 0,
        no_conflict_runs      INTEGER NOT NULL DEFAULT 0,
        total_supplied_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_returned_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_lost_value      NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_gross_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_net_value       NUMERIC(14,2) NOT NULL DEFAULT 0,
        our_kills             INTEGER NOT NULL DEFAULT 0,
        our_deaths            INTEGER NOT NULL DEFAULT 0,
        best_member_id        INTEGER REFERENCES members(id),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_spot_stats_net ON spot_stats(total_net_value DESC);

      -- ── 7. Member saida stats ────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS member_saida_stats (
        member_id             INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        saidas_total          INTEGER NOT NULL DEFAULT 0,
        wins                  INTEGER NOT NULL DEFAULT 0,
        losses                INTEGER NOT NULL DEFAULT 0,
        draws                 INTEGER NOT NULL DEFAULT 0,
        kills_total           INTEGER NOT NULL DEFAULT 0,
        deaths_total          INTEGER NOT NULL DEFAULT 0,
        kd_ratio              NUMERIC(8,2) NOT NULL DEFAULT 0,
        profit_generated      NUMERIC(14,2) NOT NULL DEFAULT 0,
        material_return_rate  NUMERIC(5,2) NOT NULL DEFAULT 0,
        survival_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,
        mvp_count             INTEGER NOT NULL DEFAULT 0,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_mss_kills ON member_saida_stats(kills_total DESC);
      CREATE INDEX IF NOT EXISTS idx_mss_profit ON member_saida_stats(profit_generated DESC);

      -- ── 8. Weekly rankings enriched ──────────────────────────────────────
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS kills_count       INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS wins_count        INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS loss_count        INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS net_profit_generated NUMERIC(14,2) NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS survival_rate     NUMERIC(5,2)  NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS performance_score NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS hybrid_score      NUMERIC(10,2) NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_wr_hybrid ON weekly_rankings(hybrid_score DESC);
    `
  },
  {
    id: 10,
    name: 'tier_default_young_blood_restore',
    // Restaurar ordem natural após feedback do utilizador na Fase 13:
    // YB=entry (tier 1) → O Gunão (tier 2, 25k€) → Gangster Fodido (tier 3, 50k€).
    // A migração #6 tinha mudado o default para 'o_gunao'; reverte-se aqui.
    // Dados existentes não são tocados (/rg-fix-tiers sync existe para alinhar).
    up: `
      ALTER TABLE members ALTER COLUMN tier SET DEFAULT 'young_blood';
    `
  },
  {
    id: 9,
    name: 'sticky_messages',
    up: `
      CREATE TABLE IF NOT EXISTS sticky_messages (
        id                   SERIAL PRIMARY KEY,
        channel_id           TEXT NOT NULL,
        source_key           TEXT NOT NULL,
        mode                 TEXT NOT NULL DEFAULT 'update' CHECK (mode IN ('update', 'repost')),
        payload              JSONB NOT NULL DEFAULT '{}',
        threshold_msgs       INTEGER NOT NULL DEFAULT 0,
        threshold_minutes    INTEGER NOT NULL DEFAULT 0,
        last_message_id      TEXT,
        msgs_since_post      INTEGER NOT NULL DEFAULT 0,
        last_posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by           TEXT NOT NULL,
        active               BOOLEAN NOT NULL DEFAULT TRUE,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(channel_id, source_key)
      );
      CREATE INDEX IF NOT EXISTS idx_sticky_channel ON sticky_messages(channel_id) WHERE active;
      CREATE INDEX IF NOT EXISTS idx_sticky_source ON sticky_messages(source_key) WHERE active;
    `
  },
  {
    id: 15,
    name: 'inventory_location_per_house',
    up: `
      -- ── Stock por localização (CASA 1 = armazém só chefes;
      --     CASA 2 = casa do grupo, oficiais)
      ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS location TEXT
        CHECK (location IS NULL OR location IN ('armazem', 'grupo'));
      CREATE INDEX IF NOT EXISTS idx_im_location ON inventory_movements(location);

      -- Items: novas categorias adicionadas (acessorios, droga, comida, pesca,
      -- electronica, municoes, utilidade, armas). Sem CHECK constraint para
      -- permitir flexibilidade.
    `
  },
  {
    id: 16,
    name: 'lifecycle_metadata_foundation',
    up: `
      -- ── Soft-delete + versioning em tabelas mutáveis principais.
      --    Colunas puramente aditivas — nenhum código actual é partido,
      --    mas abre a porta para reconcile/audit/retention uniformes.
      --
      --    Convenção:
      --      deleted_at   — NULL = activo; timestamp = soft-deleted
      --      deleted_by   — actor (discord:id ou 'system:<jobname>')
      --      record_version — bump em cada mutation (optimistic locking)

      ALTER TABLE members              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE members              ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      ALTER TABLE members              ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE members              ADD COLUMN IF NOT EXISTS last_discord_reconciled_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_members_deleted_at ON members(deleted_at) WHERE deleted_at IS NOT NULL;

      ALTER TABLE operations           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE operations           ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      ALTER TABLE operations           ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
      CREATE INDEX IF NOT EXISTS idx_operations_deleted_at ON operations(deleted_at) WHERE deleted_at IS NOT NULL;

      ALTER TABLE items                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE items                ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      ALTER TABLE items                ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
      CREATE INDEX IF NOT EXISTS idx_items_deleted_at ON items(deleted_at) WHERE deleted_at IS NOT NULL;

      ALTER TABLE resident_channels    ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
      -- resident_channels já tinha deleted_at/archived_at nativos.

      ALTER TABLE availability_sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE availability_sessions ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      ALTER TABLE availability_sessions ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE availability_sessions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

      ALTER TABLE sticky_messages      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE sticky_messages      ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      ALTER TABLE sticky_messages      ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;

      -- Sheet sync state — estado global por tab (não per-record).
      CREATE TABLE IF NOT EXISTS sheet_sync_state (
        tab_key         TEXT PRIMARY KEY,
        last_synced_at  TIMESTAMPTZ,
        last_result     TEXT NOT NULL DEFAULT 'unknown' CHECK (last_result IN ('ok','error','skipped','unknown')),
        last_ops        INTEGER,
        last_ms         INTEGER,
        last_error      TEXT,
        last_data_hash  TEXT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    id: 19,
    name: 'stock_alerts',
    up: `
      -- Sistema de alertas de stock crítico. Nem todos os items precisam
      -- de alerta (ex: jóias, diamantes, sucata artes e armas estragadas).
      --
      -- alert_enabled: se false → sem state badge na tab Stock, sem alerta.
      -- alert_threshold: quando balance global < threshold → dispara alerta.
      -- last_alert_at: throttle de 24h para não spammar o canal.
      ALTER TABLE items ADD COLUMN IF NOT EXISTS alert_enabled  BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE items ADD COLUMN IF NOT EXISTS alert_threshold INTEGER;
      ALTER TABLE items ADD COLUMN IF NOT EXISTS last_alert_at   TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_items_alert_enabled ON items(alert_enabled) WHERE alert_enabled = true;
    `
  },
  {
    id: 18,
    name: 'archival_log_and_retention',
    up: `
      -- Log imutável de acções de retenção/archive/purge. Permite responder
      -- à pergunta "quando e porque é que este registo desapareceu?" sem
      -- depender de audit_logs (que pode ele próprio ter sido purgado).
      CREATE TABLE IF NOT EXISTS archival_log (
        id           SERIAL PRIMARY KEY,
        domain       TEXT NOT NULL,                    -- ex: 'audit_logs', 'job_runs'
        action       TEXT NOT NULL CHECK (action IN ('archive','soft_delete','hard_delete','purge')),
        entity_ref   TEXT,                             -- id serializado ou WHERE snippet
        row_count    INTEGER NOT NULL DEFAULT 0,
        actor        TEXT NOT NULL,                    -- 'system:retention' ou discord:id
        reason       TEXT DEFAULT '',
        payload      JSONB,                            -- contexto extra (bounds, counts, etc)
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_archival_log_domain ON archival_log(domain);
      CREATE INDEX IF NOT EXISTS idx_archival_log_created ON archival_log(created_at DESC);
    `
  },
  {
    id: 17,
    name: 'lifecycle_check_constraints',
    up: `
      -- ── CHECK constraints em tier + category para impedir lixo.
      --    NOT VALID = aplica-se só a novas inserções; legacy rows não são
      --    revalidadas (evita fail se houver alguma row com valor estranho).

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_tier_valid') THEN
          ALTER TABLE members ADD CONSTRAINT members_tier_valid
            CHECK (tier IS NULL OR tier IN (
              'young_blood', 'o_gunao', 'gangster_fodido', 'patrao_di_zona',
              'real_gangster', 'og', 'kingpin', 'manda_chuva'
            )) NOT VALID;
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_category_valid') THEN
          ALTER TABLE items ADD CONSTRAINT items_category_valid
            CHECK (category IN (
              'armas', 'acessorios', 'municoes',
              'metais', 'reciclagem', 'componentes', 'madeiras',
              'quimicos', 'electronica', 'droga', 'comida', 'pesca',
              'texteis', 'utilidade', 'outros'
            )) NOT VALID;
        END IF;
      END $$;
    `
  },
  {
    id: 20,
    name: 'domain_rename_bairrista',
    up: `
      -- ══════════════════════════════════════════════════════════════════════
      -- Renomeação de domínio: "morador(es)" → "bairrista(s)",
      --                       "chefe_moradores" → "patrao_di_zona" (role).
      --
      -- Estratégia: estende CHECK constraints para aceitar os novos valores
      -- e MIGRA todas as rows existentes. Os valores antigos permanecem
      -- aceites pela CHECK durante a transição (próxima release remove-os).
      -- ══════════════════════════════════════════════════════════════════════

      -- 1) Drop + recria CHECK do members.role com os novos valores + legacy.
      ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;
      ALTER TABLE members ADD CONSTRAINT members_role_check
        CHECK (role IN (
          'bairrista', 'patrao_di_zona', 'oficial', 'chefia', 'inativo',
          'morador', 'chefe_moradores'
        ));

      -- 2) Migra dados: morador → bairrista, chefe_moradores → patrao_di_zona.
      UPDATE members SET role = 'bairrista'      WHERE role = 'morador';
      UPDATE members SET role = 'patrao_di_zona' WHERE role = 'chefe_moradores';

      -- 3) Drop + recria CHECK do inventory_movements.movement_type.
      ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
      ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
        CHECK (movement_type IN (
          'saldo_inicial',
          'entrega_bairrista', 'venda_bairrista', 'entrega_oficial',
          'fornecimento_org', 'consumo_operacao', 'devolucao_operacao',
          'ajuste_manual', 'perda_operacao', 'apreendido', 'craftado',
          -- Legacy (lidos; escrita nova é só nos nomes novos):
          'entrega_morador', 'venda_morador'
        ));

      -- 4) Migra movimentos históricos para os novos nomes.
      UPDATE inventory_movements SET movement_type = 'entrega_bairrista' WHERE movement_type = 'entrega_morador';
      UPDATE inventory_movements SET movement_type = 'venda_bairrista'   WHERE movement_type = 'venda_morador';

      -- 5) Default da coluna members.role passa para 'bairrista'.
      ALTER TABLE members ALTER COLUMN role SET DEFAULT 'bairrista';
    `
  },
  {
    id: 21,
    name: 'saidas_participant_types_and_session',
    // Reformulação do domínio de saídas:
    //   - participant_type: distinguir caracterizado (combate, 12 max) de trabalhador (apoio, ilimitado)
    //   - own_weapon: arma própria vs material da org
    //   - characterized_count / workers_count: contagem na saída
    //   - crafted_value: valor do material craftado
    //   - allow_workers: flag para permitir trabalhadores
    //   - session_message_id / session_channel_id: embed de sessão com registo interactivo
    up: `
      -- ── Participant types ───────────────────────────────────────────────
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS participant_type TEXT
        DEFAULT 'caracterizado' CHECK (participant_type IN ('caracterizado', 'trabalhador'));
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS own_weapon BOOLEAN DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_op_part_type ON operation_participants(participant_type);

      -- ── Saída session + counts ──────────────────────────────────────────
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS characterized_count INTEGER DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS workers_count INTEGER DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS crafted_value NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS allow_workers BOOLEAN DEFAULT TRUE;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS session_message_id TEXT;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS session_channel_id TEXT;
    `
  },
  {
    id: 22,
    name: 'participant_individual_result_and_weapon_return',
    // Resultado individual self-service + confirmação explícita de devolução
    // de arma por staff OG+.
    //   - individual_result_submitted: flag (o participante já preencheu?)
    //   - individual_result_at: quando preencheu
    //   - weapon_return_status: lifecycle da devolução de arma
    //       none                      — participante não declarou
    //       declared_returned         — diz que devolveu, pendente confirmação
    //       confirmed_returned        — OG+ confirmou devolução
    //       confirmed_not_returned    — OG+ rejeitou (não devolveu)
    //       inconclusive              — OG+ marcou como inconclusivo
    //       not_applicable            — trabalhador / sem arma fornecida
    //   - weapon_return_confirmed_by / _at: auditoria
    up: `
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS individual_result_submitted BOOLEAN DEFAULT FALSE;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS individual_result_at TIMESTAMPTZ;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS weapon_return_status TEXT
        DEFAULT 'none'
        CHECK (weapon_return_status IN ('none','declared_returned','confirmed_returned','confirmed_not_returned','inconclusive','not_applicable'));
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS weapon_return_confirmed_by TEXT;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS weapon_return_confirmed_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_op_part_weapon_return ON operation_participants(weapon_return_status);
      CREATE INDEX IF NOT EXISTS idx_op_part_result_submitted ON operation_participants(individual_result_submitted);
    `
  },
  {
    id: 23,
    name: 'participant_weapon_item',
    // Participante escolhe a arma que leva (própria ou da org) no registo,
    // em vez de staff atribuir depois. FK opcional — trabalhadores e quem
    // não especificar ficam com NULL.
    up: `
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS weapon_item_id INT REFERENCES items(id);
      CREATE INDEX IF NOT EXISTS idx_op_part_weapon_item ON operation_participants(weapon_item_id);
    `
  },
  {
    id: 25,
    name: 'saidas_em_liquidacao_state',
    // Novo estado intermédio 'em_liquidacao' entre em_curso e concluida.
    // Quando staff fecha a saída, vai para em_liquidacao (participantes
    // preenchem resultados individuais). Só quando staff finaliza é que
    // passa a concluida (scoring + publicação com dados reais).
    up: `
      ALTER TABLE operations DROP CONSTRAINT IF EXISTS operations_status_check;
      ALTER TABLE operations ADD CONSTRAINT operations_status_check
        CHECK (status IN (
          'aberta', 'em_preparacao', 'em_curso', 'em_liquidacao', 'concluida', 'cancelada'
        ));
    `
  },
  {
    id: 24,
    name: 'items_category_align_with_catalog',
    // Migration #19 criou o CHECK com naming antigo (armas, acessorios,
    // componentes, etc). O catálogo (config/full-inventory.json) usa
    // naming diferente (armas_fogo, armas_brancas, dinheiro,
    // sucata_industria, quimicos_droga, comida_pesca, equipamento).
    // O seed dá violação de CHECK. Migração: dropa o constraint antigo
    // e cria novo com a união das duas listas para tolerar histórico.
    up: `
      ALTER TABLE items DROP CONSTRAINT IF EXISTS items_category_valid;
      ALTER TABLE items ADD CONSTRAINT items_category_valid
        CHECK (category IN (
          -- Catálogo actual (config/full-inventory.json)
          'dinheiro', 'metais', 'sucata_industria', 'quimicos_droga',
          'comida_pesca', 'equipamento', 'municoes', 'armas_fogo', 'armas_brancas',
          -- Legacy (migração #19) — mantidos para não partir rows antigas
          'armas', 'acessorios', 'reciclagem', 'componentes', 'madeiras',
          'quimicos', 'electronica', 'droga', 'comida', 'pesca',
          'texteis', 'utilidade', 'outros'
        )) NOT VALID;
    `
  }
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query('SELECT id FROM schema_migrations ORDER BY id');
    const appliedIds = new Set(applied.rows.map(r => r.id));

    // Apply migrations in ascending id order (tolerate out-of-order in array)
    const ordered = [...MIGRATIONS].sort((a, b) => a.id - b.id);
    for (const migration of ordered) {
      if (appliedIds.has(migration.id)) continue;
      console.log(`[DB:Migrate] Applying migration ${migration.id}: ${migration.name}...`);
      await client.query('BEGIN');
      try {
        await client.query(migration.up);
        await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [migration.id, migration.name]);
        await client.query('COMMIT');
        console.log(`[DB:Migrate] Migration ${migration.id} applied.`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('[DB:Migrate] All migrations up to date.');
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
