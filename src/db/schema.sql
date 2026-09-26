CREATE TABLE IF NOT EXISTS entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,                     -- Discord user ID (snowflake as string)
  amount      INTEGER NOT NULL CHECK (amount > 0),  -- NTD, integer
  note        TEXT    NOT NULL DEFAULT '',
  category    TEXT,                                 -- reserved, unused in MVP
  source      TEXT    NOT NULL,                     -- 'text' | 'slash'
  created_at  TEXT    NOT NULL,                     -- UTC ISO 8601
  deleted_at  TEXT                                  -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_entries_user_created
  ON entries (user_id, created_at);
