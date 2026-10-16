// Validates a post from the composer and writes it (create or full replace).

import { HttpError, newId, nowIso } from '../_lib.js';
import { PLATFORMS, finalText, textLength, countHashtags, checkVideo } from '../../../dashboard/platforms.js';

const str = (v, max = 70000) => String(v ?? '').slice(0, max);

async function loadMedia(env, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { results } = await env.DB.prepare(
    `SELECT * FROM media WHERE status = 'ready' AND id IN (${unique.map(() => '?').join(',')})`
  ).bind(...unique).all();
  return new Map(results.map(m => [m.id, m]));
}

const metaOf = m => ({
  durationS: m.duration_s, width: m.width, height: m.height, fps: m.fps,
  sizeBytes: m.size_bytes, videoCodec: m.video_codec, audioCodec: m.audio_codec,
});

/** body: { mediaId, baseCaption, baseHashtags, schedule: boolean, targets: [...] }. Returns the post id. */
export async function savePost(env, body, existingId) {
  const schedule = body.schedule === true;
  const base = { caption: str(body.baseCaption), hashtags: str(body.baseHashtags, 2000) };
  const targets = Array.isArray(body.targets) ? body.targets : [];
  if (!targets.length) throw new HttpError(400, 'Pick at least one platform');

  const seen = new Set();
  for (const t of targets) {
    if (!PLATFORMS[t.platform]) throw new HttpError(400, `Unknown platform: ${t.platform}`);
    if (seen.has(t.platform)) throw new HttpError(400, `${t.platform} is listed twice`);
    seen.add(t.platform);
  }

  const media = await loadMedia(env, [body.mediaId, ...targets.flatMap(t => [t.mediaId, t.thumbnailMediaId])]);
  if (body.mediaId && media.get(body.mediaId)?.kind !== 'video') throw new HttpError(400, 'Main video is missing or still uploading');

  const problems = [];
  const rows = targets.map(t => {
    const p = PLATFORMS[t.platform];
    const videoId = t.mediaId || body.mediaId || null;
    const video = videoId && media.get(videoId);
    if (t.mediaId && video?.kind !== 'video') throw new HttpError(400, `${p.name}: its video is missing or still uploading`);
    if (t.thumbnailMediaId && media.get(t.thumbnailMediaId)?.kind !== 'image') throw new HttpError(400, `${p.name}: thumbnail is missing or still uploading`);

    const row = {
      platform: t.platform,
      media_id: t.mediaId || null,
      title: str(t.title, 500),
      caption: str(t.caption),
      hashtags: str(t.hashtags, 2000),
      thumbnail_media_id: p.thumbnail === 'image' ? (t.thumbnailMediaId || null) : null,
      thumbnail_offset_ms: Number.isInteger(t.thumbnailOffsetMs) && t.thumbnailOffsetMs >= 0 ? t.thumbnailOffsetMs : null,
      options: JSON.stringify(t.options && typeof t.options === 'object' ? t.options : {}),
      scheduled_at: null,
    };

    // Limits that would make the platform reject the post. Drafts may break them; scheduled posts may not.
    const text = finalText(row, base);
    const len = textLength(t.platform, text);
    if (len > p.caption.max) problems.push(`${p.name}: text is ${len}/${p.caption.max}`);
    if (p.maxHashtags && countHashtags(text) > p.maxHashtags) problems.push(`${p.name}: more than ${p.maxHashtags} hashtags`);
    if (p.title && [...row.title].length > p.title.max) problems.push(`${p.name}: title is over ${p.title.max}`);
    if (schedule) {
      if (!video) problems.push(`${p.name}: no video`);
      else {
        const check = checkVideo(t.platform, metaOf(video));
        if (check.level === 'block') problems.push(`${p.name}: ${check.reasons.join(', ')}`);
      }
      if (p.title?.required && !row.title.trim()) problems.push(`${p.name}: needs a title`);
      if (t.platform === 'tiktok' && !(t.options?.privacy)) problems.push('TikTok: choose who can view it');

      const at = t.scheduledAt ? new Date(t.scheduledAt) : new Date();
      if (Number.isNaN(at.getTime())) problems.push(`${p.name}: bad schedule time`);
      else row.scheduled_at = at.toISOString().replace(/\.\d{3}Z$/, 'Z');
    } else if (t.scheduledAt && !Number.isNaN(new Date(t.scheduledAt).getTime())) {
      row.scheduled_at = new Date(t.scheduledAt).toISOString().replace(/\.\d{3}Z$/, 'Z'); // remembered for later
    }
    return row;
  });
  if (problems.length) throw new HttpError(422, problems.join('\n'));

  const id = existingId || newId();
  const stmts = [];
  if (existingId) {
    const busy = await env.DB.prepare(`SELECT COUNT(*) AS n FROM post_targets WHERE post_id = ? AND status IN ('publishing', 'published')`)
      .bind(id).first('n');
    if (busy) throw new HttpError(409, 'This post has already started publishing and can no longer be edited');
    stmts.push(
      env.DB.prepare(`UPDATE posts SET media_id = ?, base_caption = ?, base_hashtags = ?, updated_at = ? WHERE id = ?`)
        .bind(body.mediaId || null, base.caption, base.hashtags, nowIso(), id),
      env.DB.prepare(`DELETE FROM post_targets WHERE post_id = ?`).bind(id),
    );
  } else {
    stmts.push(env.DB.prepare(`INSERT INTO posts (id, media_id, base_caption, base_hashtags) VALUES (?, ?, ?, ?)`)
      .bind(id, body.mediaId || null, base.caption, base.hashtags));
  }
  for (const r of rows) {
    stmts.push(env.DB.prepare(
      `INSERT INTO post_targets (id, post_id, platform, media_id, title, caption, hashtags, thumbnail_media_id, thumbnail_offset_ms, options, scheduled_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(newId(), id, r.platform, r.media_id, r.title, r.caption, r.hashtags, r.thumbnail_media_id,
      r.thumbnail_offset_ms, r.options, r.scheduled_at, schedule ? 'scheduled' : 'draft'));
  }
  await env.DB.batch(stmts);
  return id;
}

const order = p => Object.keys(PLATFORMS).indexOf(p);

/** Posts with their targets and the media rows they reference, newest first. */
export async function loadPosts(env, postId) {
  const posts = postId
    ? (await env.DB.prepare(`SELECT * FROM posts WHERE id = ?`).bind(postId).all()).results
    : (await env.DB.prepare(`SELECT * FROM posts ORDER BY created_at DESC LIMIT 100`).all()).results;
  if (!posts.length) return [];
  const ids = posts.map(p => p.id);
  const { results: targets } = await env.DB.prepare(
    `SELECT * FROM post_targets WHERE post_id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids).all();
  const media = await loadMedia(env, [...posts.map(p => p.media_id), ...targets.flatMap(t => [t.media_id, t.thumbnail_media_id])]);
  const pub = m => m && { id: m.id, kind: m.kind, filename: m.filename, meta: metaOf(m) };
  return posts.map(p => ({
    id: p.id, createdAt: p.created_at, updatedAt: p.updated_at,
    baseCaption: p.base_caption, baseHashtags: p.base_hashtags,
    media: pub(media.get(p.media_id)),
    targets: targets.filter(t => t.post_id === p.id).sort((a, b) => order(a.platform) - order(b.platform)).map(t => ({
      platform: t.platform, status: t.status, scheduledAt: t.scheduled_at,
      title: t.title, caption: t.caption, hashtags: t.hashtags, options: JSON.parse(t.options || '{}'),
      media: pub(media.get(t.media_id)), thumbnail: pub(media.get(t.thumbnail_media_id)), thumbnailOffsetMs: t.thumbnail_offset_ms,
      remoteUrl: t.remote_url, error: t.error, publishedAt: t.published_at,
    })),
  }));
}
