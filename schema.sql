-- ============================================================
-- TeZo — Database Schema
-- Chạy: psql -U postgres -d tezo -f schema.sql
-- An toàn để chạy nhiều lần — không xóa dữ liệu,
-- bỏ qua những gì đã tồn tại.
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

-- Seed tài khoản admin mặc định (password: Admin@123)
INSERT INTO employees (username, password_hash) VALUES
  ('admin', '$2b$10$eImiTXuWVxfM37uY4JANjQ==.placeholder')
ON CONFLICT (username) DO NOTHING;

-- ── 2. API Keys AI ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  employee_id  INTEGER      PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  gemini_key   TEXT,
  openai_key   TEXT,
  ai_priority  VARCHAR(10)  NOT NULL DEFAULT 'gemini',
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 3. Session ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_post_group (
  sid         VARCHAR      NOT NULL PRIMARY KEY,
  sess        JSON         NOT NULL,
  expire      TIMESTAMP(6) NOT NULL,
  employee_id INTEGER      REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_session_expire      ON session_post_group (expire);
CREATE INDEX IF NOT EXISTS idx_session_employee_id ON session_post_group (employee_id);

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

DROP TRIGGER IF EXISTS trg_session_employee_id ON session_post_group;
CREATE TRIGGER trg_session_employee_id
  BEFORE INSERT OR UPDATE ON session_post_group
  FOR EACH ROW EXECUTE FUNCTION sync_session_employee_id();

-- ── 4. Agent heartbeats ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  user_id   INTEGER      PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  last_seen TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 5. Agent tasks ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_tasks (
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

CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_status ON agent_tasks (user_id, status);

-- ── Phân quyền ──────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin') THEN
    -- Quyền trên tất cả table/sequence hiện tại
    GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO admin;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin;
    -- Tự động cấp quyền cho table/sequence tạo mới trong tương lai
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO admin';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO admin';
  END IF;
END
$$;
