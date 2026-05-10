ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS instance_id TEXT;
ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE job_runs DROP CONSTRAINT IF EXISTS job_runs_status_check;
ALTER TABLE job_runs ADD CONSTRAINT job_runs_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed'));
CREATE INDEX idx_job_runs_stuck ON job_runs(status, lease_expires_at) WHERE status = 'running';
