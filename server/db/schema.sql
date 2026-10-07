CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  idle_timeout_minutes integer NOT NULL DEFAULT 5 CHECK (idle_timeout_minutes BETWEEN 1 AND 240),
  screenshot_interval_seconds integer NOT NULL DEFAULT 3 CHECK (screenshot_interval_seconds BETWEEN 3 AND 300),
  welcome_message text NOT NULL DEFAULT 'Bienvenido al centro de cómputo',
  background_url text,
  lock_mode text NOT NULL DEFAULT 'STANDARD',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS computers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), uuid uuid NOT NULL UNIQUE,
  name text NOT NULL, room_id uuid NOT NULL REFERENCES rooms(id), ip_address inet,
  mac_address text, status text NOT NULL DEFAULT 'LOCKED' CHECK(status IN ('OFFLINE','LOCKED','IN_SESSION','IDLE','ERROR','UPDATING','UPDATE_FAILED')),
  current_student text, client_version text NOT NULL, registration_token_hash text NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT now(), last_seen timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, name)
);
CREATE INDEX IF NOT EXISTS computers_room_idx ON computers(room_id);
CREATE INDEX IF NOT EXISTS computers_last_seen_idx ON computers(last_seen);
CREATE TABLE IF NOT EXISTS students (student_number text PRIMARY KEY CHECK(student_number ~ '^[0-9-]+$'), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_number text NOT NULL REFERENCES students(student_number), computer_id uuid NOT NULL REFERENCES computers(id), room_id uuid NOT NULL REFERENCES rooms(id),
  login_time timestamptz NOT NULL, logout_time timestamptz, duration_seconds integer, session_status text NOT NULL DEFAULT 'ACTIVE', offline_mode boolean NOT NULL DEFAULT false,
  client_event_id uuid UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_student_idx ON sessions(student_number, login_time DESC);
CREATE TABLE IF NOT EXISTS computer_status (id bigserial PRIMARY KEY, computer_id uuid NOT NULL REFERENCES computers(id), status text NOT NULL, student_number text, observed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS screenshots (id bigserial PRIMARY KEY, computer_id uuid NOT NULL REFERENCES computers(id), capture_time timestamptz NOT NULL, storage_reference text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS commands (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), computer_id uuid NOT NULL REFERENCES computers(id), type text NOT NULL CHECK(type IN ('LOCK','UNLOCK','BLOCK_INPUT','RESTORE_INPUT','CHANGE_BACKGROUND','REQUEST_SCREENSHOT','UPDATE_CLIENT','REFRESH_CONFIG')), payload jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'PENDING', created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz, completed_at timestamptz, result text);
CREATE TABLE IF NOT EXISTS client_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version text NOT NULL UNIQUE, file_url text NOT NULL, sha256 char(64) NOT NULL, signature text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS admin_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE, password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('SUPER_ADMIN','ADMIN','VIEWER')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_logs (id bigserial PRIMARY KEY, admin_username text NOT NULL, action text NOT NULL, computer_id uuid, room_id uuid, timestamp timestamptz NOT NULL DEFAULT now(), result text NOT NULL, details jsonb NOT NULL DEFAULT '{}');
