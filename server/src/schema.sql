CREATE TABLE IF NOT EXISTS pastes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  max_views INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  discoverable BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS pastes_discoverable_created_idx
  ON pastes (created_at DESC, id DESC) WHERE discoverable = TRUE;
CREATE INDEX IF NOT EXISTS pastes_expires_at_idx
  ON pastes (expires_at) WHERE expires_at IS NOT NULL;
