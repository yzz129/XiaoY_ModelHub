PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_workflows (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  current_stage TEXT NOT NULL DEFAULT 'moodboard',
  auto_approve INTEGER NOT NULL DEFAULT 0,
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  visual_style TEXT NOT NULL DEFAULT '',
  models_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_workflows_user_updated
  ON agent_workflows(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_workflow_steps (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  parent_step_id TEXT,
  status TEXT NOT NULL,
  skill_ids_json TEXT NOT NULL DEFAULT '[]',
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  review_json TEXT NOT NULL DEFAULT '{}',
  command_json TEXT NOT NULL DEFAULT '{}',
  attempt INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workflow_id) REFERENCES agent_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_workflow_steps_workflow
  ON agent_workflow_steps(workflow_id, created_at ASC);

CREATE TABLE IF NOT EXISTS agent_workflow_events (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  step_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (workflow_id) REFERENCES agent_workflows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_workflow_events_workflow
  ON agent_workflow_events(workflow_id, created_at DESC);
