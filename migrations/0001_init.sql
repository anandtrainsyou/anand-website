-- Posting studio: uploaded files, posts, and one row per platform a post goes to.

CREATE TABLE media (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('video', 'image')),
  r2_key        TEXT NOT NULL UNIQUE,
  filename      TEXT,
  content_type  TEXT,
  size_bytes    INTEGER,
  -- Read in the browser at upload time (videos only).
  duration_s    REAL,
  width         INTEGER,
  height        INTEGER,
  fps           REAL,
  video_codec   TEXT,
  audio_codec   TEXT,
  status        TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready')),
  upload_id     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE posts (
  id            TEXT PRIMARY KEY,
  media_id      TEXT REFERENCES media(id),
  base_caption  TEXT NOT NULL DEFAULT '',
  base_hashtags TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Blank caption/hashtags mean "use the post's base ones".
-- media_id set means this platform gets its own cut instead of the post's main video.
CREATE TABLE post_targets (
  id                  TEXT PRIMARY KEY,
  post_id             TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('youtube', 'instagram', 'facebook', 'tiktok', 'x', 'linkedin')),
  media_id            TEXT REFERENCES media(id),
  title               TEXT NOT NULL DEFAULT '',
  caption             TEXT NOT NULL DEFAULT '',
  hashtags            TEXT NOT NULL DEFAULT '',
  thumbnail_media_id  TEXT REFERENCES media(id),
  thumbnail_offset_ms INTEGER,
  options             TEXT NOT NULL DEFAULT '{}',
  scheduled_at        TEXT,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  attempts            INTEGER NOT NULL DEFAULT 0,
  remote_id           TEXT,
  remote_url          TEXT,
  error               TEXT,
  published_at        TEXT,
  UNIQUE (post_id, platform)
);
CREATE INDEX post_targets_due ON post_targets (status, scheduled_at);

-- One connected account per platform. Tokens are AES-GCM encrypted before they land here.
CREATE TABLE accounts (
  platform           TEXT PRIMARY KEY,
  display_name       TEXT,
  remote_account_id  TEXT,
  access_token_enc   TEXT,
  refresh_token_enc  TEXT,
  expires_at         TEXT,
  scopes             TEXT,
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE hashtag_sets (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  tags  TEXT NOT NULL
);
