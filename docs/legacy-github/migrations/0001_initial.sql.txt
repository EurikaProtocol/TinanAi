CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  record_json TEXT NOT NULL,
  repair_attempts INTEGER NOT NULL DEFAULT 0,
  latest_check_status TEXT,
  rollback_snapshot_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_owner_updated
  ON projects(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_tasks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  project_id TEXT,
  status TEXT NOT NULL,
  kind TEXT NOT NULL,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS project_tasks_owner_created
  ON project_tasks(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_tasks_running_checks
  ON project_tasks(owner_id, kind, status);

CREATE TABLE IF NOT EXISTS project_backups (
  project_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  files_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, owner_id, snapshot_id)
);

CREATE TABLE IF NOT EXISTS project_locks (
  project_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  token TEXT NOT NULL,
  lease_until INTEGER NOT NULL
);
