// Runs every minute (publisher worker cron). Picks up posts that are due and moves each one step forward.
// Progress is saved after every step, so a run never sits waiting for a platform to process a video.

import { ADAPTERS } from './adapters/index.js';
import { PublishError } from './graph.js';
import { loadAccount, markNeedsReconnect, nowIso } from './accounts.js';
import { signedMediaUrl } from './crypto.js';
import { refreshTokens } from './refresh.js';
import { PLATFORMS, finalText } from '../dashboard/platforms.js';

const MAX_ATTEMPTS = 5;
const GIVE_UP_AFTER_MS = 3 * 3600_000;
const LOCK_SECONDS = 300;
const BATCH = 8; // keeps a run well under Workers' per-run request limits

const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

export async function runPublisher(env) {
  try { await refreshTokens(env); } catch (err) { console.error('token refresh', err); }

  const platforms = Object.keys(ADAPTERS), now = nowIso();
  const { results } = await env.DB.prepare(
    `SELECT id FROM post_targets
     WHERE status IN ('scheduled', 'publishing') AND platform IN (${platforms.map(() => '?').join(',')})
       AND scheduled_at <= ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND (locked_until IS NULL OR locked_until < ?)
     ORDER BY scheduled_at LIMIT ${BATCH}`
  ).bind(...platforms, now, now, now).all();

  const out = [];
  for (const { id } of results) out.push(await processTarget(env, id));
  return out.filter(Boolean);
}

async function processTarget(env, id) {
  // Claim it, so an overlapping run leaves it alone.
  const claim = await env.DB.prepare(
    `UPDATE post_targets SET locked_until = ?, status = 'publishing'
     WHERE id = ? AND status IN ('scheduled', 'publishing') AND (locked_until IS NULL OR locked_until < ?)`
  ).bind(iso(Date.now() + LOCK_SECONDS * 1000), id, nowIso()).run();
  if (!claim.meta.changes) return null;

  const t = await env.DB.prepare(
    `SELECT t.*, p.media_id AS post_media_id, p.base_caption, p.base_hashtags
     FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE t.id = ?`
  ).bind(id).first();
  const name = PLATFORMS[t.platform].name;
  const progress = JSON.parse(t.progress || '{}');
  progress.startedAt ??= Date.now();

  try {
    if (Date.now() - progress.startedAt > GIVE_UP_AFTER_MS) throw new PublishError(`Gave up: ${name} was still processing after 3 hours.`);
    const account = await loadAccount(env, t.platform);
    if (!account) throw new PublishError(`${name} isn’t connected. Connect it in Accounts, then retry.`);
    const videoId = t.media_id || t.post_media_id;
    if (!videoId) throw new PublishError('This post has no video.');

    const result = await ADAPTERS[t.platform].step({
      env, account, progress,
      options: JSON.parse(t.options || '{}'),
      text: finalText(t, { caption: t.base_caption, hashtags: t.base_hashtags }),
      videoUrl: () => signedMediaUrl(env, videoId),
      coverUrl: async () => (t.thumbnail_media_id ? signedMediaUrl(env, t.thumbnail_media_id) : null),
      coverOffsetMs: t.thumbnail_offset_ms,
      coverFile: async () => {
        if (!t.thumbnail_media_id) return null;
        const m = await env.DB.prepare(`SELECT r2_key FROM media WHERE id = ?`).bind(t.thumbnail_media_id).first();
        const obj = m && await env.MEDIA.get(m.r2_key);
        return obj && { blob: new Blob([await obj.arrayBuffer()], { type: 'image/jpeg' }), name: 'cover.jpg' };
      },
    });

    if (result.done) {
      await env.DB.prepare(
        `UPDATE post_targets SET status = 'published', remote_id = ?, remote_url = ?, published_at = ?, error = ?,
           progress = ?, locked_until = NULL, next_attempt_at = NULL WHERE id = ?`
      ).bind(result.done.remoteId, result.done.remoteUrl, nowIso(), result.done.note || null, JSON.stringify(result.progress), id).run();
      return { id, platform: t.platform, status: 'published', url: result.done.remoteUrl };
    }
    await env.DB.prepare(`UPDATE post_targets SET progress = ?, next_attempt_at = ?, locked_until = NULL, error = NULL WHERE id = ?`)
      .bind(JSON.stringify(result.progress), iso(Date.now() + result.wait * 1000), id).run();
    return { id, platform: t.platform, status: 'publishing' };
  } catch (err) {
    if (!(err instanceof PublishError)) console.error(err);
    if (err.reconnect) await markNeedsReconnect(env, t.platform, err.message);
    const attempts = t.attempts + 1;
    // Unexpected errors (not from a platform) get retried too.
    const retry = (err instanceof PublishError ? err.retry : true) && attempts < MAX_ATTEMPTS;
    await env.DB.prepare(
      `UPDATE post_targets SET status = ?, attempts = ?, error = ?, progress = ?, next_attempt_at = ?, locked_until = NULL WHERE id = ?`
    ).bind(retry ? 'publishing' : 'failed', attempts, String(err.message).slice(0, 1000), JSON.stringify(progress),
      retry ? iso(Date.now() + 60_000 * 2 ** attempts) : null, id).run();
    return { id, platform: t.platform, status: retry ? 'retrying' : 'failed', error: err.message };
  }
}
