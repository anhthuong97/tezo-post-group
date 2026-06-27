-- Run once to set up the database

CREATE TABLE IF NOT EXISTS employees (
  id              SERIAL PRIMARY KEY,
  username        VARCHAR(50)  UNIQUE NOT NULL,
  password_hash   TEXT         NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMP    WITH TIME ZONE,
  created_at      TIMESTAMP    WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_post_group (
  sid         VARCHAR      NOT NULL PRIMARY KEY,
  sess        JSON         NOT NULL,
  expire      TIMESTAMP(6) NOT NULL,
  employee_id INTEGER      REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS session_post_group_expire_idx ON session_post_group (expire);

CREATE OR REPLACE FUNCTION update_session_employee()
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

DROP TRIGGER IF EXISTS trg_update_session_employee ON session_post_group;
CREATE TRIGGER trg_update_session_employee
  BEFORE INSERT OR UPDATE ON session_post_group
  FOR EACH ROW EXECUTE FUNCTION update_session_employee();

CREATE TABLE IF NOT EXISTS api_keys (
  employee_id  INTEGER      PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  gemini_key   TEXT,
  openai_key   TEXT,
  ai_priority  VARCHAR(10)  NOT NULL DEFAULT 'gemini',
  updated_at   TIMESTAMP    WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Seed default admin (password: admin123)
INSERT INTO employees (username, password_hash) VALUES
  ('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
ON CONFLICT (username) DO NOTHING;
