CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_updated
  ON agent_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  provider_id TEXT,
  model_id TEXT,
  trace_json TEXT NOT NULL DEFAULT '[]',
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation_created
  ON agent_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS agent_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('preference', 'profile', 'instruction', 'project')),
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_user_importance
  ON agent_memories(user_id, importance DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'chat',
  models_json TEXT NOT NULL DEFAULT '[]',
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('once', 'interval', 'cron')),
  scheduled_at INTEGER,
  interval_minutes INTEGER,
  cron_expression TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'running', 'completed', 'failed', 'cancelled')),
  result TEXT,
  error TEXT,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_due
  ON agent_tasks(status, next_run_at);

CREATE TABLE IF NOT EXISTS agent_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, message_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES agent_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_model_stats (
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  total_latency_ms INTEGER NOT NULL DEFAULT 0,
  quality_score INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_id, model_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
