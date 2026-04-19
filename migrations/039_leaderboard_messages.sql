-- Migration 39: leaderboard_messages (persist live panel message id)
--
-- Uma row por channel — identifica a mensagem "viva" do leaderboard para
-- que o publisher possa edit em vez de criar nova entre reboots. Sem isto,
-- cada boot criava um post novo e o canal enchia de leaderboards órfãos.
--
-- last_refreshed_at = última vez que o embed foi actualizado; usado pelo
-- footer "atualizado há N min" e pelo rate-limit do refresh manual.

CREATE TABLE IF NOT EXISTS leaderboard_messages (
  channel_id        TEXT PRIMARY KEY,
  message_id        TEXT NOT NULL,
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
