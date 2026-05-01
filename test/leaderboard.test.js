'use strict';
/**
 * Unit tests do leaderboard:
 *
 *   - period bounds (daily / weekly / monthly)
 *   - formatLeaderLine com leader presente vs empty state
 *   - buildLeaderboardEmbed com 3 períodos mockados
 *   - buildDetailsEmbed com categoria empty
 *   - publisher: rate-limit do refresh manual
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolved(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

// Stub do DB (não usado pelos testes de panel/bounds, mas engine importa-o)
require.cache[resolved('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async fn => fn({ query: async () => ({ rows: [] }) }),
  },
};

const { dayBounds, monthBoundsUTC, periodBounds } = require('../src/leaderboard/leaderboardEngine');

const {
  formatLeaderLine,
  buildLeaderboardEmbed,
  buildLeaderboardComponents,
  buildDetailsEmbed,
  CATEGORY_ICON,
  PERIOD_LABEL,
} = require('../src/leaderboard/leaderboardPanel');

const { canUserRefresh, markUserRefresh, REFRESH_COOLDOWN_MS } = require('../src/leaderboard/leaderboardPublisher');

// ═══════════════════════════════════════════════════════════════════════════
// Period bounds
// ═══════════════════════════════════════════════════════════════════════════

describe('leaderboardEngine — period bounds', () => {
  it('dayBounds: start = 00:00, end = 23:59:59.999', () => {
    const ref = new Date('2026-04-19T15:30:00');
    const { start, end } = dayBounds(ref);
    assert.equal(start.getHours(), 0);
    assert.equal(start.getMinutes(), 0);
    assert.equal(start.getSeconds(), 0);
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMinutes(), 59);
    assert.equal(end.getSeconds(), 59);
    // Mesmo dia
    assert.equal(start.getDate(), end.getDate());
  });

  it('monthBoundsUTC: day 1 00:00 UTC → último milisegundo do mês', () => {
    const ref = new Date('2026-04-19T15:30:00Z');
    const { start, end } = monthBoundsUTC(ref);
    assert.equal(start.getUTCDate(), 1);
    assert.equal(start.getUTCHours(), 0);
    assert.equal(start.getUTCMonth(), 3); // April = 3
    // end é último ms de April (30 Apr 23:59:59.999 UTC)
    assert.equal(end.getUTCMonth(), 3);
    assert.equal(end.getUTCDate(), 30);
  });

  it('periodBounds("daily") devolve label "DD mês"', () => {
    const ref = new Date('2026-04-19T12:00:00');
    const { label } = periodBounds('daily', ref);
    assert.match(label, /\d{2}/);
  });

  it('periodBounds com período inválido atira', () => {
    assert.throws(() => periodBounds('yearly'), /Unknown period/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// formatLeaderLine
// ═══════════════════════════════════════════════════════════════════════════

describe('leaderboardPanel — formatLeaderLine', () => {
  it('empty state quando leader é null', () => {
    for (const cat of ['activity', 'mvp', 'kda', 'delivered', 'sold']) {
      const line = formatLeaderLine(cat, null);
      assert.match(line, /sem actividade ainda/);
      assert.ok(line.includes(CATEGORY_ICON[cat]));
    }
  });

  it('activity com leader: mostra score + breakdown', () => {
    const line = formatLeaderLine('activity', {
      discordId: '111',
      score: 42,
      saidas: 3,
      submissions: 5,
      kills: 8,
    });
    assert.match(line, /<@111>/);
    assert.match(line, /42/);
    assert.match(line, /3s/);
    assert.match(line, /5e/);
    assert.match(line, /8k/);
  });

  it('mvp com 1 MVP: "1 MVP" (singular)', () => {
    const line = formatLeaderLine('mvp', { discordId: '111', mvpCount: 1 });
    assert.match(line, /\*\*1\*\* MVP$/); // singular "MVP" no fim da linha
  });

  it('mvp com 3 MVPs: "3 MVPs" (plural)', () => {
    const line = formatLeaderLine('mvp', { discordId: '111', mvpCount: 3 });
    assert.match(line, /\*\*3\*\* MVPs$/);
  });

  it('kda com decimais: mostra 2 casas', () => {
    const line = formatLeaderLine('kda', {
      discordId: '111',
      kda: 3.25,
      kills: 13,
      deaths: 4,
      saidas: 6,
    });
    assert.match(line, /3\.25/);
    assert.match(line, /13k/);
    assert.match(line, /4d/);
  });

  it('delivered com valor: mostra qty + euros', () => {
    const line = formatLeaderLine('delivered', {
      discordId: '111',
      totalQty: 120,
      totalValue: 1500,
    });
    assert.match(line, /120/);
    assert.match(line, /1.500€|1500€/);
  });

  it('sold: mostra euros como principal', () => {
    const line = formatLeaderLine('sold', {
      discordId: '111',
      totalQty: 50,
      totalValue: 2500,
    });
    assert.match(line, /2.500€|2500€/);
    assert.match(line, /50/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildLeaderboardEmbed
// ═══════════════════════════════════════════════════════════════════════════

describe('leaderboardPanel — buildLeaderboardEmbed', () => {
  function _emptyPeriod(period) {
    return {
      period,
      label: 'x',
      start: new Date(),
      end: new Date(),
      categories: {
        activity: { top: [], leader: null },
        mvp: { top: [], leader: null },
        kda: { top: [], leader: null },
        delivered: { top: [], leader: null },
        sold: { top: [], leader: null },
      },
    };
  }

  it('empty data — 3 fields, todos com "sem actividade"', () => {
    const embed = buildLeaderboardEmbed({
      daily: _emptyPeriod('daily'),
      weekly: _emptyPeriod('weekly'),
      monthly: _emptyPeriod('monthly'),
      refreshedAt: new Date(),
    });
    assert.equal(embed.data.fields.length, 3);
    for (const f of embed.data.fields) {
      assert.match(f.value, /sem actividade/);
    }
    assert.match(embed.data.title, /Leaderboard/);
  });

  it('com leaders: valores presentes no embed', () => {
    const period = _emptyPeriod('weekly');
    period.categories.activity.leader = {
      discordId: '42',
      score: 99,
      saidas: 5,
      submissions: 10,
      kills: 20,
    };
    period.categories.mvp.leader = { discordId: '43', mvpCount: 2 };
    period.categories.kda.leader = { discordId: '44', kda: 4.5, kills: 9, deaths: 2, saidas: 3 };
    period.categories.delivered.leader = { discordId: '45', totalQty: 500, totalValue: 0 };
    period.categories.sold.leader = { discordId: '46', totalQty: 100, totalValue: 5000 };

    const embed = buildLeaderboardEmbed({
      daily: _emptyPeriod('daily'),
      weekly: period,
      monthly: _emptyPeriod('monthly'),
      refreshedAt: new Date(),
    });
    const weekField = embed.data.fields.find(f => f.value.includes('Esta semana'));
    assert.ok(weekField);
    assert.match(weekField.value, /<@42>/);
    assert.match(weekField.value, /<@46>/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildLeaderboardComponents
// ═══════════════════════════════════════════════════════════════════════════

describe('leaderboardPanel — buildLeaderboardComponents', () => {
  it('2 rows: 3 botões details + 1 refresh', () => {
    const rows = buildLeaderboardComponents();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].components.length, 3);
    assert.equal(rows[1].components.length, 1);

    // Custom IDs
    const detailIds = rows[0].components.map(c => c.data.custom_id);
    assert.deepEqual(detailIds, ['lb::details::daily', 'lb::details::weekly', 'lb::details::monthly']);
    assert.equal(rows[1].components[0].data.custom_id, 'lb::refresh');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildDetailsEmbed
// ═══════════════════════════════════════════════════════════════════════════

describe('leaderboardPanel — buildDetailsEmbed', () => {
  it('embed com 5 categories, todas mostram "sem actividade" se empty', () => {
    const embed = buildDetailsEmbed({
      period: 'daily',
      label: '19 de abril',
      categories: {
        activity: { top: [] },
        mvp: { top: [] },
        kda: { top: [] },
        delivered: { top: [] },
        sold: { top: [] },
      },
    });
    assert.equal(embed.data.fields.length, 5);
    for (const f of embed.data.fields) {
      assert.match(f.value, /sem actividade/);
    }
  });

  it('activity top 3 usa rank badges', () => {
    const embed = buildDetailsEmbed({
      period: 'weekly',
      label: 'x',
      categories: {
        activity: {
          top: [
            { discordId: '1', score: 50, saidas: 5, submissions: 10, kills: 35 },
            { discordId: '2', score: 30, saidas: 3, submissions: 8, kills: 19 },
            { discordId: '3', score: 20, saidas: 2, submissions: 5, kills: 13 },
          ],
        },
        mvp: { top: [] },
        kda: { top: [] },
        delivered: { top: [] },
        sold: { top: [] },
      },
    });
    const activityField = embed.data.fields.find(f => f.name.includes('Atividade'));
    assert.match(activityField.value, /<@1>/);
    assert.match(activityField.value, /<@2>/);
    assert.match(activityField.value, /<@3>/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// publisher — rate limit
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// publisher — global debounce
// ═══════════════════════════════════════════════════════════════════════════

describe('leaderboardPublisher — global debounce', () => {
  // Stub DB com state recente; publishOrRefresh deve skipar sem tocar no canal
  const CONFIG = require('../src/config');
  const originalChannelId = CONFIG.LEADERBOARD_CHANNEL_ID;

  it('salta se last_refreshed_at < 15s e force=false (não chama client)', async () => {
    // Re-cache o db para esta suite com state fresco
    require.cache[resolved('db.js')] = {
      exports: {
        pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
        query: async sql => {
          if (/SELECT channel_id, message_id, last_refreshed_at FROM leaderboard_messages/.test(sql)) {
            return { rows: [{ channel_id: 'ch', message_id: 'msg-123', last_refreshed_at: new Date() }] };
          }
          return { rows: [] };
        },
        queryWithTransaction: async fn => fn({ query: async () => ({ rows: [] }) }),
      },
    };
    // Força re-resolve do publisher com o novo db stub
    delete require.cache[resolved('leaderboard/leaderboardPublisher.js')];
    const { publishOrRefresh } = require('../src/leaderboard/leaderboardPublisher');
    let channelFetched = false;
    const fakeClient = {
      channels: {
        fetch: async () => {
          channelFetched = true;
          return null;
        },
      },
    };
    CONFIG.LEADERBOARD_CHANNEL_ID = 'ch';
    const r = await publishOrRefresh(fakeClient, { force: false });
    assert.equal(r.skipped, 'debounced');
    assert.equal(r.messageId, 'msg-123');
    assert.equal(channelFetched, false, 'debounce devia ter saltado antes de tocar no Discord');
    CONFIG.LEADERBOARD_CHANNEL_ID = originalChannelId;
  });
});

describe('leaderboardPublisher — rate limit', () => {
  it('1ª chamada permitida', () => {
    const r = canUserRefresh('U-fresh-1');
    assert.equal(r.ok, true);
  });

  it('após mark, 2ª chamada imediata bloqueia e devolve waitMs', () => {
    markUserRefresh('U-fresh-2');
    const r = canUserRefresh('U-fresh-2');
    assert.equal(r.ok, false);
    assert.ok(r.waitMs > 0 && r.waitMs <= REFRESH_COOLDOWN_MS);
  });

  it('REFRESH_COOLDOWN_MS = 30s', () => {
    assert.equal(REFRESH_COOLDOWN_MS, 30_000);
  });
});
