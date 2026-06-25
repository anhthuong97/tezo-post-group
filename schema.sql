-- ============================================================
-- FB Auto Poster — Database Schema
-- Chạy: psql -U postgres -d post_group -f schema.sql
-- ============================================================

-- ── 1. Bảng nhân viên ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL       PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100),
  email         VARCHAR(100),
  phone         VARCHAR(20),
  role          VARCHAR(20)  NOT NULL DEFAULT 'staff', -- 'admin' | 'staff'
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  start_date    DATE,                                  -- ngày vào làm
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),   -- ngày tạo tài khoản
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()    -- ngày chỉnh sửa gần nhất
);

-- Tự cập nhật updated_at mỗi khi UPDATE
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

-- ── 2. Bảng session ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_post_group (
  sid         VARCHAR      NOT NULL PRIMARY KEY,  -- session ID (cookie)
  sess        JSON         NOT NULL,              -- dữ liệu session (chứa userId, ...)
  expire      TIMESTAMP(6) NOT NULL,              -- thời điểm hết hạn
  employee_id INTEGER      REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_post_group_expire      ON session_post_group (expire);
CREATE INDEX IF NOT EXISTS idx_session_post_group_employee_id ON session_post_group (employee_id);

-- Tự đồng bộ employee_id từ JSON sess mỗi khi insert/update
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
