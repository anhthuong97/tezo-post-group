-- ============================================================
-- FB Auto Poster — Database Schema
-- Chạy: psql -U admin -d tezo -f schema.sql
-- An toàn để chạy nhiều lần — bỏ qua những gì đã tồn tại.
-- ============================================================

-- ── 1. Bảng nhân viên ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL       PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100),
  email         VARCHAR(100),
  phone         VARCHAR(20),
  role          VARCHAR(20)  NOT NULL DEFAULT 'staff',
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  start_date    DATE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. Bảng API keys ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER      NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  provider    VARCHAR(20)  NOT NULL,  -- 'gemini' | 'openai'
  api_key     VARCHAR(255) NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, provider)
);

CREATE OR REPLACE TRIGGER trg_api_keys_updated_at
BEFORE UPDATE ON api_keys
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. Bảng session ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_post_group (
  sid         VARCHAR      NOT NULL PRIMARY KEY,
  sess        JSON         NOT NULL,
  expire      TIMESTAMP(6) NOT NULL,
  employee_id INTEGER      REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_post_group_expire      ON session_post_group (expire);
CREATE INDEX IF NOT EXISTS idx_session_post_group_employee_id ON session_post_group (employee_id);

CREATE OR REPLACE FUNCTION sync_session_employee_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.employee_id = (NEW.sess->>'userId')::INTEGER;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_session_employee_id
BEFORE INSERT OR UPDATE ON session_post_group
FOR EACH ROW EXECUTE FUNCTION sync_session_employee_id();
