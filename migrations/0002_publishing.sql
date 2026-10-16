-- Publishing: each platform's progress is saved between publisher runs, so a run never waits on Meta.

ALTER TABLE post_targets ADD COLUMN progress TEXT;           -- adapter state (JSON), e.g. container / video id
ALTER TABLE post_targets ADD COLUMN next_attempt_at TEXT;    -- don't touch before this time
ALTER TABLE post_targets ADD COLUMN locked_until TEXT;       -- a publisher run is working on it

ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'connected'
  CHECK (status IN ('connected', 'pending', 'needs_reconnect'));
ALTER TABLE accounts ADD COLUMN error TEXT;
ALTER TABLE accounts ADD COLUMN pending_enc TEXT;            -- e.g. Facebook user token while you pick a Page
ALTER TABLE accounts ADD COLUMN pending_pages TEXT;          -- JSON [{ id, name }] to pick from (no tokens)
