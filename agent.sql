-- Chạy file này trên PostgreSQL VPS
-- psql -U postgres -d tezo -f agent.sql

CREATE TABLE IF NOT EXISTS agent_heartbeats (
  user_id    INT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  last_seen  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  result       JSONB,
  logs         JSONB,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMP,
  finished_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_status ON agent_tasks(user_id, status);
