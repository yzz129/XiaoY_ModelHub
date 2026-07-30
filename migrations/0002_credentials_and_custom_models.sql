CREATE TABLE IF NOT EXISTS user_provider_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_user_provider_credentials_user
  ON user_provider_credentials(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS global_provider_credentials (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS custom_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  api_model TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  pricing TEXT NOT NULL,
  description TEXT,
  docs_url TEXT,
  key_url TEXT,
  quota TEXT,
  quota_lookup TEXT,
  integration TEXT NOT NULL DEFAULT 'ready',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (provider_id, api_model)
);

CREATE INDEX IF NOT EXISTS idx_custom_models_enabled
  ON custom_models(enabled, updated_at DESC);
