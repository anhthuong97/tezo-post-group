-- ============================================================
-- TeZo — Đổi tên tables cũ sang prefix pg_
-- Chạy MỘT LẦN: sudo -u postgres psql -d tezo -f rename_tables.sql
-- Idempotent: bỏ qua nếu table đích đã tồn tại.
-- ============================================================

DO $$
BEGIN

  -- api_keys → pg_api_keys
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='api_keys')
     AND NOT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='pg_api_keys') THEN
    ALTER TABLE api_keys RENAME TO pg_api_keys;
    RAISE NOTICE 'Renamed api_keys → pg_api_keys';
  END IF;

  -- session_post_group → pg_sessions
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='session_post_group')
     AND NOT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='pg_sessions') THEN
    ALTER TABLE session_post_group RENAME TO pg_sessions;
    RAISE NOTICE 'Renamed session_post_group → pg_sessions';
  END IF;

  -- agent_heartbeats → pg_agent_heartbeats
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='agent_heartbeats')
     AND NOT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='pg_agent_heartbeats') THEN
    ALTER TABLE agent_heartbeats RENAME TO pg_agent_heartbeats;
    RAISE NOTICE 'Renamed agent_heartbeats → pg_agent_heartbeats';
  END IF;

  -- agent_tasks → pg_agent_tasks
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='agent_tasks')
     AND NOT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='pg_agent_tasks') THEN
    ALTER TABLE agent_tasks RENAME TO pg_agent_tasks;
    RAISE NOTICE 'Renamed agent_tasks → pg_agent_tasks';
  END IF;

END
$$;

-- Đổi tên indexes cũ nếu còn tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_indexes WHERE schemaname='public' AND indexname='idx_session_expire') THEN
    ALTER INDEX idx_session_expire RENAME TO idx_pg_sessions_expire;
  END IF;
  IF EXISTS (SELECT FROM pg_indexes WHERE schemaname='public' AND indexname='idx_session_employee_id') THEN
    ALTER INDEX idx_session_employee_id RENAME TO idx_pg_sessions_employee_id;
  END IF;
  IF EXISTS (SELECT FROM pg_indexes WHERE schemaname='public' AND indexname='idx_agent_tasks_user_status') THEN
    ALTER INDEX idx_agent_tasks_user_status RENAME TO idx_pg_agent_tasks_user_status;
  END IF;
END
$$;

-- Đổi tên trigger nếu còn
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_trigger WHERE tgname='trg_session_employee_id'
             AND tgrelid = (SELECT oid FROM pg_class WHERE relname='pg_sessions')) THEN
    -- trigger đã đúng table, không cần làm gì
    NULL;
  END IF;
END
$$;

SELECT 'rename_tables.sql hoàn tất.' AS status;
