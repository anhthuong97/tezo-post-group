-- ============================================================
-- TeZo — Database Schema
-- Chạy: sudo -u postgres psql -d tezo -f schema.sql
-- An toàn để chạy nhiều lần — không xóa dữ liệu.
-- ============================================================

-- ── 1. Nhân viên ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL       PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 2. API Keys AI ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pg_api_keys (
  employee_id  INTEGER      NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  provider     VARCHAR(20)  NOT NULL,
  api_key      TEXT,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_id, provider)
);

-- ── 3. Sessions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pg_sessions (
  sid         VARCHAR      NOT NULL PRIMARY KEY,
  sess        JSON         NOT NULL,
  expire      TIMESTAMP(6) NOT NULL,
  employee_id INTEGER      REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pg_sessions_expire      ON pg_sessions (expire);
CREATE INDEX IF NOT EXISTS idx_pg_sessions_employee_id ON pg_sessions (employee_id);

CREATE OR REPLACE FUNCTION sync_session_employee_id()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    NEW.employee_id = (NEW.sess->>'userId')::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    NEW.employee_id = NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_employee_id ON pg_sessions;
CREATE TRIGGER trg_session_employee_id
  BEFORE INSERT OR UPDATE ON pg_sessions
  FOR EACH ROW EXECUTE FUNCTION sync_session_employee_id();

-- ── 4. Agent heartbeats ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS pg_agent_heartbeats (
  user_id   INTEGER      PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  last_seen TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 5. Agent tasks ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pg_agent_tasks (
  id          SERIAL       PRIMARY KEY,
  user_id     INTEGER      NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type        VARCHAR(50)  NOT NULL,
  payload     JSONB        NOT NULL DEFAULT '{}',
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending',
  result      JSONB,
  logs        JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pg_agent_tasks_user_status ON pg_agent_tasks (user_id, status);

-- ── 6. Groups (đồng bộ từ Agent) ───────────────────────────
CREATE TABLE IF NOT EXISTS pg_groups (
  id        SERIAL       PRIMARY KEY,
  user_id   INTEGER      NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  group_id  VARCHAR(200) NOT NULL,
  name      VARCHAR(500) NOT NULL,
  url       VARCHAR(500) NOT NULL,
  meta      VARCHAR(500),
  synced_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_pg_groups_user ON pg_groups (user_id);

-- ── Phân quyền ──────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin') THEN
    GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO admin;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin;
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO admin';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO admin';
  END IF;
END
$$;
